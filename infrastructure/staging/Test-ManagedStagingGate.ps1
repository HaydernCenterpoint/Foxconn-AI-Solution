[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [Uri]$BackendUrl,
    [Parameter(Mandatory = $true)]
    [Uri]$FrontendUrl,
    [Parameter(Mandatory = $true)]
    [string]$AttestationPath,
    [string]$ArtifactRoot = '',
    [string[]]$ArtifactHosts = @(),
    [string[]]$ManagedHosts = @(),
    [string]$OutputPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($ManagedHosts.Count -eq 0 -and -not [string]::IsNullOrWhiteSpace($env:FII_MANAGED_HOSTS)) {
    $ManagedHosts = @($env:FII_MANAGED_HOSTS.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}

function Assert-ManagedUri {
    param(
        [Parameter(Mandatory = $true)][Uri]$Uri,
        [Parameter(Mandatory = $true)][string]$Name
    )

    if ($Uri.Scheme -ne "https") { throw "$Name must use HTTPS." }
    if (-not [string]::IsNullOrEmpty($Uri.UserInfo) -or -not [string]::IsNullOrEmpty($Uri.Query) -or -not [string]::IsNullOrEmpty($Uri.Fragment)) {
        throw "$Name cannot contain credentials, query text, or fragments."
    }
    $hostName = $Uri.DnsSafeHost.TrimEnd('.').ToLowerInvariant()
    $literal = $null
    if ([Net.IPAddress]::TryParse($hostName, [ref]$literal)) { throw "$Name cannot use an IP-literal host." }
    if (-not $hostName.Contains('.') -or $hostName -match '(^|\.)(localhost|local|internal|example)$' -or
        $hostName -match '(^|\.)example\.(com|org|net)$') {
        throw "$Name must target an explicitly approved managed staging host."
    }
    $allowed = @($ManagedHosts | ForEach-Object { $_.Trim().TrimEnd('.').ToLowerInvariant() } | Where-Object { $_ })
    if ($allowed.Count -eq 0 -or $hostName -notin $allowed) { throw "$Name host is not in the explicit managed host allowlist." }
    try { $addresses = @([Net.Dns]::GetHostAddresses($hostName)) } catch { throw "$Name host resolution failed." }
    if ($addresses.Count -eq 0) { throw "$Name host resolution returned no addresses." }
    foreach ($address in $addresses) {
        if (-not (Test-PublicAddress $address)) { throw "$Name host resolved to a non-public address." }
    }
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

function Invoke-Probe {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][Uri]$Uri
    )

    $timer = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 20 -MaximumRedirection 0
        if ($response.StatusCode -ne 200) { throw "$Name returned HTTP $($response.StatusCode)." }
        return [pscustomobject]@{
            name = $Name
            statusCode = $response.StatusCode
            elapsedMs = [Math]::Round($timer.Elapsed.TotalMilliseconds, 2)
            passed = $true
        }
    }
    catch { throw "$Name probe failed." }
    finally {
        $timer.Stop()
    }
}

Assert-ManagedUri -Uri $BackendUrl -Name "BackendUrl"
Assert-ManagedUri -Uri $FrontendUrl -Name "FrontendUrl"

$evidenceVerifier = Join-Path $PSScriptRoot "Test-ManagedStagingEvidence.ps1"
$evidenceJson = & $evidenceVerifier -AttestationPath $AttestationPath -ArtifactRoot $ArtifactRoot -ArtifactHosts $ArtifactHosts
$evidenceResult = $evidenceJson | ConvertFrom-Json
if ($evidenceResult.passed -ne $true) { throw "Managed staging evidence verification did not pass." }

$backendHealthUri = [Uri]::new($BackendUrl, "api/health")
$probes = @(
    Invoke-Probe -Name "backend-health" -Uri $backendHealthUri
    Invoke-Probe -Name "frontend" -Uri $FrontendUrl
)

$result = [pscustomobject]@{
    schemaVersion = 2
    evaluatedAtUtc = $evidenceResult.evaluationTimeUtc
    environment = $evidenceResult.environment
    release = $evidenceResult.release
    reviewer = $evidenceResult.reviewer
    approvedAtUtc = $evidenceResult.approvedAtUtc
    managedChecks = @($evidenceResult.verifiedEvidence).Count
    evidenceManifests = @($evidenceResult.verifiedEvidence | ForEach-Object {
        [pscustomobject]@{ checkId = $_.checkId; evidenceId = $_.evidenceId; manifestSha256 = $_.manifestSha256 }
    })
    probes = $probes
    passed = $true
}

$json = $result | ConvertTo-Json -Depth 8
Write-Output $json
if (-not [string]::IsNullOrWhiteSpace($OutputPath)) {
    $json | Set-Content -LiteralPath $OutputPath -Encoding UTF8
}
