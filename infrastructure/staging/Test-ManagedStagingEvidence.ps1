[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$AttestationPath,
    [string]$ArtifactRoot = '',
    [string[]]$ArtifactHosts = @(),
    [long]$MaxArtifactBytes = 10485760,
    [long]$MaxAggregateBytes = 104857600,
    [int]$DeadlineSeconds = 120
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$evaluationTime = [DateTimeOffset]::UtcNow
$clockSkew = [TimeSpan]::FromMinutes(5)
$maximumAge = [TimeSpan]::FromDays(30)
$deadline = [System.Diagnostics.Stopwatch]::StartNew()
$aggregateBytes = [long]0

if ([string]::IsNullOrWhiteSpace($ArtifactRoot)) { $ArtifactRoot = $env:FII_MANAGED_ARTIFACT_ROOT }
if ($ArtifactHosts.Count -eq 0 -and -not [string]::IsNullOrWhiteSpace($env:FII_MANAGED_ARTIFACT_HOSTS)) {
    $ArtifactHosts = @($env:FII_MANAGED_ARTIFACT_HOSTS.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}
if ($MaxArtifactBytes -le 0 -or $MaxAggregateBytes -le 0 -or $DeadlineSeconds -le 0) {
    throw "Artifact byte limits and deadline must be positive."
}

$requiredChecks = @(
    "backend-https-ingress", "frontend-https-ingress", "certificate-lifetime", "mqtt-tls",
    "mqtt-device-auth", "mqtt-topic-isolation", "secret-manager-delivery", "operations-db-tls",
    "timescale-db-tls", "managed-backup", "restore-drill", "retention-policies",
    "dual-write-validation", "dual-write-rollback", "live-erp-mes-connector", "independent-full-stack-smoke"
)

function Get-PropertyValue {
    param($Object, [Parameter(Mandatory = $true)][string]$Name)
    if ($null -eq $Object) { return $null }
    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property) { return $null }
    return $property.Value
}

function Test-Present {
    param($Value)
    if ($null -eq $Value) { return $false }
    $text = ([string]$Value).Trim()
    return -not [string]::IsNullOrWhiteSpace($text) -and
        $text -notmatch '^(?i:tbd|todo|unknown|replace(?:[-_ ]?with.*)?|pending|missing|n/?a|none|null|placeholder|example|sample|dummy|fake|x+|-)$'
}

function Assert-Present {
    param($Value, [Parameter(Mandatory = $true)][string]$Name)
    if (-not (Test-Present $Value)) { throw "$Name is missing or is a placeholder." }
}

function Assert-Sha256 {
    param($Value, [Parameter(Mandatory = $true)][string]$Name)
    if (-not (Test-Present $Value) -or [string]$Value -notmatch '^[A-Fa-f0-9]{64}$') {
        throw "$Name must be a SHA-256 hex digest."
    }
}

function Read-Rfc3339 {
    param($Value, [Parameter(Mandatory = $true)][string]$Name)
    Assert-Present $Value $Name
    $text = [string]$Value
    if ($text -notmatch '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$') {
        throw "$Name must be an RFC3339 timestamp with an explicit offset."
    }
    $parsed = [DateTimeOffset]::MinValue
    if (-not [DateTimeOffset]::TryParse($text, [Globalization.CultureInfo]::InvariantCulture,
        [Globalization.DateTimeStyles]::RoundtripKind, [ref]$parsed)) { throw "$Name is invalid." }
    return $parsed.ToUniversalTime()
}

function Get-PathComparison {
    if ([Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([Runtime.InteropServices.OSPlatform]::Windows)) {
        return [StringComparison]::OrdinalIgnoreCase
    }
    return [StringComparison]::Ordinal
}

function Test-UncPath {
    param([Parameter(Mandatory = $true)][string]$Path)
    return $Path.StartsWith('\\') -or $Path.StartsWith('//')
}

function Test-NetworkDrivePath {
    param([Parameter(Mandatory = $true)][string]$Path)
    if (-not [Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([Runtime.InteropServices.OSPlatform]::Windows)) { return $false }
    try { return ([IO.DriveInfo]::new([IO.Path]::GetPathRoot([IO.Path]::GetFullPath($Path)))).DriveType -eq [IO.DriveType]::Network }
    catch { return $true }
}

function Assert-NoReparsePoint {
    param(
        [Parameter(Mandatory = $true)][string]$RootPath,
        [Parameter(Mandatory = $true)][string]$CandidatePath,
        [Parameter(Mandatory = $true)][string]$Name
    )
    $current = Get-Item -LiteralPath $RootPath -Force
    if (($current.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "$Name approved root cannot be a reparse point." }
    $relative = $CandidatePath.Substring($RootPath.Length).TrimStart([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
    foreach ($component in $relative.Split([char[]]@([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar), [StringSplitOptions]::RemoveEmptyEntries)) {
        $current = Get-Item -LiteralPath (Join-Path $current.FullName $component) -Force
        if (($current.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "$Name cannot traverse a symlink or junction." }
    }
}

function Resolve-ApprovedLocalFile {
    param(
        [Parameter(Mandatory = $true)][Uri]$Uri,
        [string]$ApprovedRoot,
        [Parameter(Mandatory = $true)][string]$Name
    )
    if ([string]::IsNullOrWhiteSpace($ApprovedRoot)) { throw "$Name uses file:// and requires an approved artifact root." }
    if ((Test-UncPath $ApprovedRoot) -or (Test-NetworkDrivePath $ApprovedRoot)) { throw "$Name approved artifact root must be local, not UNC." }
    if (-not [IO.Path]::IsPathRooted($ApprovedRoot) -or -not (Test-Path -LiteralPath $ApprovedRoot -PathType Container)) {
        throw "$Name approved artifact root must be an existing absolute directory."
    }
    $rootFull = [IO.Path]::GetFullPath($ApprovedRoot).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
    $rootItem = Get-Item -LiteralPath $rootFull -Force
    if (($rootItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "$Name approved root cannot be a reparse point." }
    if ($Uri.IsUnc -or -not [string]::IsNullOrEmpty($Uri.Host) -or (Test-UncPath $Uri.LocalPath)) {
        throw "$Name must use a local file URI with no UNC authority."
    }

    $comparison = Get-PathComparison
    $candidateFull = [IO.Path]::GetFullPath($Uri.LocalPath)
    $prefix = $rootFull + [IO.Path]::DirectorySeparatorChar
    if ($candidateFull.Equals($rootFull, $comparison) -or -not $candidateFull.StartsWith($prefix, $comparison)) {
        throw "$Name file artifact is outside the approved artifact root."
    }
    if (-not (Test-Path -LiteralPath $candidateFull -PathType Leaf)) { throw "$Name file artifact was not found." }
    Assert-NoReparsePoint -RootPath $rootFull -CandidatePath $candidateFull -Name $Name

    $resolvedRoot = (Resolve-Path -LiteralPath $rootFull).Path.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
    $resolvedArtifact = (Resolve-Path -LiteralPath $candidateFull).Path
    $resolvedPrefix = $resolvedRoot + [IO.Path]::DirectorySeparatorChar
    if (-not $resolvedArtifact.StartsWith($resolvedPrefix, $comparison)) { throw "$Name final path escapes the approved artifact root." }
    return $resolvedArtifact
}

function Test-PublicAddress {
    param([Parameter(Mandatory = $true)][Net.IPAddress]$Address)
    if ([Net.IPAddress]::IsLoopback($Address) -or $Address.Equals([Net.IPAddress]::Any) -or $Address.Equals([Net.IPAddress]::IPv6Any)) { return $false }
    if ($Address.IsIPv4MappedToIPv6) { return Test-PublicAddress $Address.MapToIPv4() }
    $bytes = $Address.GetAddressBytes()
    if ($Address.AddressFamily -eq [Net.Sockets.AddressFamily]::InterNetwork) {
        $a = $bytes[0]; $b = $bytes[1]; $c = $bytes[2]
        if ($a -in @(0, 10, 127) -or $a -ge 224) { return $false }
        if ($a -eq 100 -and $b -ge 64 -and $b -le 127) { return $false }
        if ($a -eq 169 -and $b -eq 254) { return $false }
        if ($a -eq 172 -and $b -ge 16 -and $b -le 31) { return $false }
        if ($a -eq 192 -and (($b -eq 168) -or ($b -eq 0 -and $c -in @(0, 2)))) { return $false }
        if ($a -eq 198 -and (($b -in @(18, 19)) -or ($b -eq 51 -and $c -eq 100))) { return $false }
        if ($a -eq 203 -and $b -eq 0 -and $c -eq 113) { return $false }
        return $true
    }
    if ($bytes[0] -eq 0xFF -or (($bytes[0] -band 0xFE) -eq 0xFC) -or ($bytes[0] -eq 0xFE -and ($bytes[1] -band 0xC0) -eq 0x80)) { return $false }
    if ($bytes[0] -eq 0x20 -and $bytes[1] -eq 0x01 -and $bytes[2] -eq 0x0D -and $bytes[3] -eq 0xB8) { return $false }
    return $true
}

function Assert-ApprovedHttpsUri {
    param($Value, [Parameter(Mandatory = $true)][string]$Name)
    Assert-Present $Value $Name
    $uri = $null
    if (-not [Uri]::TryCreate([string]$Value, [UriKind]::Absolute, [ref]$uri) -or $uri.Scheme -ne 'https') {
        throw "$Name must be an absolute HTTPS URI."
    }
    if (-not [string]::IsNullOrEmpty($uri.UserInfo) -or -not [string]::IsNullOrEmpty($uri.Query) -or -not [string]::IsNullOrEmpty($uri.Fragment)) {
        throw "$Name cannot contain credentials, query text, or fragments."
    }
    $hostName = $uri.DnsSafeHost.TrimEnd('.').ToLowerInvariant()
    $literal = $null
    if ([Net.IPAddress]::TryParse($hostName, [ref]$literal)) { throw "$Name cannot use an IP-literal host." }
    if (-not $hostName.Contains('.') -or $hostName -match '(^|\.)(localhost|local|internal|example)$' -or $hostName -match '(^|\.)example\.(com|org|net)$') {
        throw "$Name cannot use loopback, reserved, example, or single-label internal hosts."
    }
    $allowed = @($ArtifactHosts | ForEach-Object { $_.Trim().TrimEnd('.').ToLowerInvariant() } | Where-Object { $_ })
    if ($allowed.Count -eq 0 -or $hostName -notin $allowed) { throw "$Name host is not in the explicit artifact host allowlist." }
    try { $addresses = @([Net.Dns]::GetHostAddresses($hostName)) } catch { throw "$Name host resolution failed." }
    if ($addresses.Count -eq 0) { throw "$Name host resolution returned no addresses." }
    foreach ($address in $addresses) {
        if (-not (Test-PublicAddress $address)) { throw "$Name host resolved to a non-public address." }
    }
    return $uri
}

function Assert-WithinBudget {
    param([long]$BytesRead, [Parameter(Mandatory = $true)][string]$Name)
    if ($deadline.Elapsed.TotalSeconds -gt $DeadlineSeconds) { throw "Managed evidence verification exceeded its deadline." }
    if ($BytesRead -gt $MaxArtifactBytes) { throw "$Name exceeds the per-artifact byte limit." }
    if ($aggregateBytes + $BytesRead -gt $MaxAggregateBytes) { throw "Managed evidence exceeds the aggregate byte limit." }
}

function Read-HashedStream {
    param(
        [Parameter(Mandatory = $true)][IO.Stream]$Stream,
        [Parameter(Mandatory = $true)][string]$Name,
        [switch]$CaptureContent
    )
    $sha = [Security.Cryptography.SHA256]::Create()
    $memory = if ($CaptureContent) { [IO.MemoryStream]::new() } else { $null }
    $buffer = [byte[]]::new(65536)
    $readTotal = [long]0
    try {
        while (($read = $Stream.Read($buffer, 0, $buffer.Length)) -gt 0) {
            $readTotal += $read
            Assert-WithinBudget -BytesRead $readTotal -Name $Name
            [void]$sha.TransformBlock($buffer, 0, $read, $null, 0)
            if ($CaptureContent) { $memory.Write($buffer, 0, $read) }
        }
        [void]$sha.TransformFinalBlock([byte[]]::new(0), 0, 0)
        $script:aggregateBytes += $readTotal
        return [pscustomobject]@{
            Sha256 = ([BitConverter]::ToString($sha.Hash)).Replace('-', '')
            Content = if ($CaptureContent) { [Text.Encoding]::UTF8.GetString($memory.ToArray()) } else { $null }
        }
    }
    finally {
        $sha.Dispose()
        if ($null -ne $memory) { $memory.Dispose() }
    }
}

function Get-Artifact {
    param(
        [Parameter(Mandatory = $true)][Uri]$Uri,
        [Parameter(Mandatory = $true)][string]$Name,
        [switch]$CaptureContent
    )
    if ($Uri.Scheme -eq 'file') {
        if (-not [string]::IsNullOrEmpty($Uri.UserInfo) -or -not [string]::IsNullOrEmpty($Uri.Query) -or -not [string]::IsNullOrEmpty($Uri.Fragment)) {
            throw "$Name file URI cannot contain credentials, query text, or fragments."
        }
        try {
            $path = Resolve-ApprovedLocalFile -Uri $Uri -ApprovedRoot $ArtifactRoot -Name $Name
            $stream = [IO.File]::Open($path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
            try { return Read-HashedStream -Stream $stream -Name $Name -CaptureContent:$CaptureContent } finally { $stream.Dispose() }
        }
        catch {
            if ($_.Exception.Message.StartsWith($Name) -or $_.Exception.Message.StartsWith('Managed evidence')) { throw $_.Exception.Message }
            throw "$Name local artifact read failed."
        }
    }

    $handler = [Net.Http.HttpClientHandler]::new()
    $handler.AllowAutoRedirect = $false
    $client = [Net.Http.HttpClient]::new($handler)
    $client.Timeout = [TimeSpan]::FromSeconds([Math]::Max(1, $DeadlineSeconds - [int]$deadline.Elapsed.TotalSeconds))
    try {
        $response = $client.GetAsync($Uri, [Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
        try {
            if ([int]$response.StatusCode -ge 300 -and [int]$response.StatusCode -lt 400) { throw "$Name HTTPS redirects are disabled." }
            if (-not $response.IsSuccessStatusCode) { throw "$Name HTTPS retrieval returned a non-success status." }
            if ($response.Content.Headers.ContentLength -gt $MaxArtifactBytes) { throw "$Name exceeds the per-artifact byte limit." }
            $stream = $response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
            try { return Read-HashedStream -Stream $stream -Name $Name -CaptureContent:$CaptureContent } finally { $stream.Dispose() }
        }
        finally { $response.Dispose() }
    }
    catch {
        if ($_.Exception.Message -match '^Managed evidence|^[A-Za-z0-9_.\[\]-]+ (HTTPS|exceeds)') { throw $_.Exception.Message }
        throw "$Name HTTPS artifact retrieval failed."
    }
    finally { $client.Dispose(); $handler.Dispose() }
}

function Read-JsonArtifact {
    param([Parameter(Mandatory = $true)]$Artifact, [Parameter(Mandatory = $true)][string]$Name)
    try { return ([string]$Artifact.Content).TrimStart([char]0xFEFF) | ConvertFrom-Json } catch { throw "$Name content must be valid JSON." }
}

function Resolve-PackageManifestPath {
    param([string]$PackageRoot, [string]$ManifestPath)
    Assert-Present $ManifestPath "check.evidenceManifest"
    if ([IO.Path]::IsPathRooted($ManifestPath) -or (Test-UncPath $ManifestPath)) { throw "Evidence manifest must be a relative local package path." }
    $candidate = [IO.Path]::GetFullPath((Join-Path $PackageRoot $ManifestPath))
    $root = [IO.Path]::GetFullPath($PackageRoot).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
    $comparison = Get-PathComparison
    if (-not $candidate.StartsWith($root + [IO.Path]::DirectorySeparatorChar, $comparison)) { throw "Evidence manifest escapes the attestation package." }
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { throw "Evidence manifest was not found." }
    Assert-NoReparsePoint -RootPath $root -CandidatePath $candidate -Name "Evidence manifest"
    return (Resolve-Path -LiteralPath $candidate).Path
}

if ((Test-UncPath $AttestationPath) -or (Test-NetworkDrivePath $AttestationPath)) { throw "Attestation path must be local, not UNC." }
try { $resolvedAttestation = (Resolve-Path -LiteralPath $AttestationPath).Path } catch { throw "Attestation file was not found." }
if ((Test-UncPath $resolvedAttestation) -or (Test-NetworkDrivePath $resolvedAttestation)) { throw "Attestation path must resolve to local storage." }
$attestationDirectory = Split-Path -Parent $resolvedAttestation
try { $attestation = Get-Content -LiteralPath $resolvedAttestation -Raw -Encoding utf8 | ConvertFrom-Json } catch { throw "Attestation must be valid JSON." }
if ([int](Get-PropertyValue $attestation "schemaVersion") -ne 2) { throw "Managed attestation schemaVersion must be 2." }

$environment = Get-PropertyValue $attestation "environment"
$environmentId = [string](Get-PropertyValue $environment "id")
$environmentName = [string](Get-PropertyValue $environment "name")
Assert-Present $environmentId "environment.id"; Assert-Present $environmentName "environment.name"
if ($environmentId -match '(?i)(localhost|loopback|example)') { throw "environment.id must identify managed staging." }

$release = Get-PropertyValue $attestation "release"
$releaseCommit = [string](Get-PropertyValue $release "sourceCommit")
$releaseManifestSha256 = [string](Get-PropertyValue $release "manifestSha256")
if ($releaseCommit -notmatch '^[A-Fa-f0-9]{40}$') { throw "release.sourceCommit must be a full Git commit SHA." }
Assert-Sha256 $releaseManifestSha256 "release.manifestSha256"
$releaseUriValue = Get-PropertyValue $release "manifestUri"
$releaseUri = $null
if ([Uri]::TryCreate([string]$releaseUriValue, [UriKind]::Absolute, [ref]$releaseUri) -and $releaseUri.Scheme -eq 'file') {
    if (-not [string]::IsNullOrEmpty($releaseUri.Query) -or -not [string]::IsNullOrEmpty($releaseUri.Fragment)) { throw "release.manifestUri cannot contain query text or fragments." }
} else { $releaseUri = Assert-ApprovedHttpsUri $releaseUriValue "release.manifestUri" }
$releaseArtifact = Get-Artifact -Uri $releaseUri -Name "release.manifest" -CaptureContent
if ($releaseArtifact.Sha256 -ne $releaseManifestSha256) { throw "Release manifest hash mismatch." }
$releaseContent = Read-JsonArtifact $releaseArtifact "release.manifest"
if ([int](Get-PropertyValue $releaseContent "schemaVersion") -ne 1 -or
    [string](Get-PropertyValue $releaseContent "sourceCommit") -ne $releaseCommit -or
    [string](Get-PropertyValue $releaseContent "environmentId") -ne $environmentId) {
    throw "Release manifest content binding mismatch."
}

$reviewer = Get-PropertyValue $attestation "reviewer"
$reviewerId = [string](Get-PropertyValue $reviewer "id")
$reviewerOrganization = [string](Get-PropertyValue $reviewer "organization")
Assert-Present $reviewerId "reviewer.id"; Assert-Present $reviewerOrganization "reviewer.organization"
$conflictCheck = Get-PropertyValue $reviewer "conflictCheck"
if ([string](Get-PropertyValue $conflictCheck "status") -ne "passed") { throw "reviewer.conflictCheck.status must be passed." }
$conflictSha256 = [string](Get-PropertyValue $conflictCheck "sha256")
Assert-Sha256 $conflictSha256 "reviewer.conflictCheck.sha256"
$conflictUriValue = Get-PropertyValue $conflictCheck "reference"
$conflictUri = $null
if ([Uri]::TryCreate([string]$conflictUriValue, [UriKind]::Absolute, [ref]$conflictUri) -and $conflictUri.Scheme -eq 'file') { }
else { $conflictUri = Assert-ApprovedHttpsUri $conflictUriValue "reviewer.conflictCheck.reference" }
$conflictArtifact = Get-Artifact -Uri $conflictUri -Name "reviewer.conflictCheck" -CaptureContent
if ($conflictArtifact.Sha256 -ne $conflictSha256) { throw "Reviewer conflict artifact hash mismatch." }
$conflictContent = Read-JsonArtifact $conflictArtifact "reviewer.conflictCheck"
$conflictCheckedBy = [string](Get-PropertyValue $conflictCheck "checkedBy")
Assert-Present $conflictCheckedBy "reviewer.conflictCheck.checkedBy"
$conflictCheckedAt = Read-Rfc3339 (Get-PropertyValue $conflictCheck "checkedAtUtc") "reviewer.conflictCheck.checkedAtUtc"
if ([int](Get-PropertyValue $conflictContent "schemaVersion") -ne 1 -or
    [string](Get-PropertyValue $conflictContent "status") -ne 'passed' -or
    [string](Get-PropertyValue $conflictContent "reviewerId") -ne $reviewerId -or
    [string](Get-PropertyValue $conflictContent "reviewerOrganization") -ne $reviewerOrganization -or
    [string](Get-PropertyValue $conflictContent "environmentId") -ne $environmentId -or
    [string](Get-PropertyValue $conflictContent "sourceCommit") -ne $releaseCommit -or
    [string](Get-PropertyValue $conflictContent "checkedBy") -ne $conflictCheckedBy -or
    (Read-Rfc3339 (Get-PropertyValue $conflictContent "checkedAtUtc") "reviewer.conflictCheck.content.checkedAtUtc") -ne $conflictCheckedAt) {
    throw "Reviewer conflict artifact content binding mismatch."
}

$approvedAt = Read-Rfc3339 (Get-PropertyValue $attestation "approvedAtUtc") "approvedAtUtc"
if ($approvedAt -gt $evaluationTime.Add($clockSkew)) { throw "approvedAtUtc exceeds the documented five-minute clock skew." }
if ($evaluationTime - $approvedAt -gt $maximumAge) { throw "Managed attestation exceeds the 30-day maximum age." }
if ($conflictCheckedAt -ge $approvedAt) { throw "Reviewer conflict check must strictly precede attestation approval." }
if ($evaluationTime - $conflictCheckedAt -gt $maximumAge) { throw "Reviewer conflict check exceeds the 30-day maximum age." }

$contributors = @((Get-PropertyValue $attestation "contributors"))
if ($contributors.Count -eq 0) { throw "Attestation must list release/evidence contributors." }
$contributorsById = @{}
foreach ($contributor in $contributors) {
    $id = [string](Get-PropertyValue $contributor "id"); $org = [string](Get-PropertyValue $contributor "organization")
    Assert-Present $id "contributors[].id"; Assert-Present $org "contributors[$id].organization"; Assert-Present (Get-PropertyValue $contributor "role") "contributors[$id].role"
    if ($contributorsById.ContainsKey($id)) { throw "Duplicate contributor '$id'." }
    if ($id -eq $reviewerId -or $org -eq $reviewerOrganization) { throw "Reviewer identity and organization must be independent from contributors." }
    $contributorsById[$id] = $contributor
}
if ($conflictCheckedBy -eq $reviewerId) { throw "Reviewer cannot perform their own conflict check." }

$checksById = @{}
foreach ($check in @((Get-PropertyValue $attestation "checks"))) {
    $id = [string](Get-PropertyValue $check "id"); Assert-Present $id "checks[].id"
    if ($checksById.ContainsKey($id)) { throw "Duplicate managed check '$id'." }
    $checksById[$id] = $check
}
if ($checksById.Count -ne $requiredChecks.Count) { throw "Attestation must contain exactly $($requiredChecks.Count) managed checks." }

$evidenceIds = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$verifiedEvidence = [Collections.Generic.List[object]]::new()
foreach ($requiredCheck in $requiredChecks) {
    if (-not $checksById.ContainsKey($requiredCheck)) { throw "Missing managed check '$requiredCheck'." }
    $check = $checksById[$requiredCheck]
    if ([string](Get-PropertyValue $check "status") -ne "passed") { throw "Managed check '$requiredCheck' is not passed." }
    $expectedManifestSha256 = [string](Get-PropertyValue $check "evidenceManifestSha256")
    Assert-Sha256 $expectedManifestSha256 "checks[$requiredCheck].evidenceManifestSha256"
    $manifestPath = Resolve-PackageManifestPath -PackageRoot $attestationDirectory -ManifestPath ([string](Get-PropertyValue $check "evidenceManifest"))
    $manifestStream = [IO.File]::Open($manifestPath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
    try { $manifestArtifact = Read-HashedStream -Stream $manifestStream -Name "evidence[$requiredCheck].manifest" -CaptureContent } finally { $manifestStream.Dispose() }
    if ($manifestArtifact.Sha256 -ne $expectedManifestSha256) { throw "Evidence manifest hash mismatch for '$requiredCheck'." }
    $manifest = Read-JsonArtifact $manifestArtifact "evidence[$requiredCheck].manifest"
    if ([int](Get-PropertyValue $manifest "schemaVersion") -ne 1) { throw "Evidence manifest '$requiredCheck' schemaVersion must be 1." }
    $evidenceId = [string](Get-PropertyValue $manifest "evidenceId"); Assert-Present $evidenceId "evidence[$requiredCheck].evidenceId"
    if (-not $evidenceIds.Add($evidenceId)) { throw "Duplicate evidenceId '$evidenceId'." }
    if ([string](Get-PropertyValue $manifest "checkId") -ne $requiredCheck) { throw "Evidence manifest check binding mismatch for '$requiredCheck'." }
    if ([string](Get-PropertyValue $manifest "environmentId") -ne $environmentId -or
        [string](Get-PropertyValue $manifest "sourceCommit") -ne $releaseCommit -or
        [string](Get-PropertyValue $manifest "releaseManifestSha256") -ne $releaseManifestSha256) {
        throw "Evidence manifest release/environment binding mismatch for '$requiredCheck'."
    }

    $capturedAt = Read-Rfc3339 (Get-PropertyValue $manifest "capturedAtUtc") "evidence[$requiredCheck].capturedAtUtc"
    $producer = Get-PropertyValue $manifest "producer"; $producerId = [string](Get-PropertyValue $producer "id"); $producerOrg = [string](Get-PropertyValue $producer "organization")
    Assert-Present $producerId "evidence[$requiredCheck].producer.id"; Assert-Present $producerOrg "evidence[$requiredCheck].producer.organization"
    $disposition = Get-PropertyValue $manifest "reviewerDisposition"
    if ([string](Get-PropertyValue $disposition "status") -ne "approved" -or [string](Get-PropertyValue $disposition "reviewerId") -ne $reviewerId) {
        throw "Evidence '$requiredCheck' lacks approval by the attestation reviewer."
    }
    $reviewedAt = Read-Rfc3339 (Get-PropertyValue $disposition "reviewedAtUtc") "evidence[$requiredCheck].reviewerDisposition.reviewedAtUtc"
    if ($capturedAt -ge $reviewedAt -or $reviewedAt -ge $approvedAt) { throw "Evidence '$requiredCheck' must follow strict capture-to-review-to-approval order." }
    if ($evaluationTime - $capturedAt -gt $maximumAge -or $evaluationTime - $reviewedAt -gt $maximumAge) { throw "Evidence '$requiredCheck' exceeds the 30-day maximum age." }
    if ($capturedAt -gt $evaluationTime.Add($clockSkew) -or $reviewedAt -gt $evaluationTime.Add($clockSkew)) { throw "Evidence '$requiredCheck' exceeds the documented five-minute clock skew." }

    $witnessMode = [string](Get-PropertyValue $manifest "witnessMode")
    if ($requiredCheck -eq "independent-full-stack-smoke" -and $witnessMode -eq "reviewer_executed") {
        if ($producerId -ne $reviewerId -or $producerOrg -ne $reviewerOrganization) { throw "reviewer_executed smoke evidence must name the reviewer as producer." }
    } else {
        if ($requiredCheck -eq "independent-full-stack-smoke" -and $witnessMode -ne "reviewer_witnessed") { throw "Independent smoke evidence must be reviewer_executed or reviewer_witnessed." }
        $producerContributor = if ($contributorsById.ContainsKey($producerId)) { $contributorsById[$producerId] } else { $null }
        $producerRole = [string](Get-PropertyValue $producerContributor "role")
        if ($null -eq $producerContributor -or [string](Get-PropertyValue $producerContributor "organization") -ne $producerOrg -or
            $producerRole -notin @('evidence-producer', 'release-producer', 'release-and-evidence-producer')) {
            throw "Evidence producer for '$requiredCheck' is not bound to a matching contributor."
        }
    }

    $artifact = Get-PropertyValue $manifest "artifact"; $artifactUriValue = Get-PropertyValue $artifact "immutableUri"; $artifactUri = $null
    if ([Uri]::TryCreate([string]$artifactUriValue, [UriKind]::Absolute, [ref]$artifactUri) -and $artifactUri.Scheme -eq 'file') { }
    else { $artifactUri = Assert-ApprovedHttpsUri $artifactUriValue "evidence[$requiredCheck].artifact.immutableUri" }
    $expectedArtifactSha256 = [string](Get-PropertyValue $artifact "sha256"); Assert-Sha256 $expectedArtifactSha256 "evidence[$requiredCheck].artifact.sha256"
    $actualArtifact = Get-Artifact -Uri $artifactUri -Name "evidence[$requiredCheck].artifact"
    if ($actualArtifact.Sha256 -ne $expectedArtifactSha256) { throw "Artifact hash mismatch for '$requiredCheck'." }
    if ($requiredCheck -eq "independent-full-stack-smoke") {
        Assert-Sha256 (Get-PropertyValue $manifest "rawArtifactSha256") "evidence[$requiredCheck].rawArtifactSha256"
        if ([string](Get-PropertyValue $manifest "rawArtifactSha256") -ne $actualArtifact.Sha256) { throw "Independent smoke raw artifact hash mismatch." }
    }

    $verifiedEvidence.Add([pscustomobject]@{
        checkId = $requiredCheck; evidenceId = $evidenceId; manifestSha256 = $manifestArtifact.Sha256
        artifactSha256 = $actualArtifact.Sha256; capturedAtUtc = $capturedAt.ToString("O"); producerId = $producerId
    })
}

[pscustomobject]@{
    schemaVersion = 2
    evaluationTimeUtc = $evaluationTime.ToString("O")
    policy = [pscustomobject]@{ clockSkewMinutes = 5; maximumAgeDays = 30; maxArtifactBytes = $MaxArtifactBytes; maxAggregateBytes = $MaxAggregateBytes; deadlineSeconds = $DeadlineSeconds }
    environment = [pscustomobject]@{ id = $environmentId; name = $environmentName }
    release = [pscustomobject]@{ sourceCommit = $releaseCommit; manifestSha256 = $releaseManifestSha256 }
    reviewer = [pscustomobject]@{ id = $reviewerId; organization = $reviewerOrganization }
    approvedAtUtc = $approvedAt.ToString("O")
    verifiedEvidence = $verifiedEvidence
    passed = $true
} | ConvertTo-Json -Depth 8
