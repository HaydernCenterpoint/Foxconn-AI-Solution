[CmdletBinding()]
param(
    [string]$EvidenceDirectory = "docs/release-evidence/g0",
    [string]$OutputPath,
    [string]$RepositoryRoot,
    [switch]$LibraryOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-JsonProperty {
    param($Object, [Parameter(Mandatory)][string]$Name)

    if ($null -eq $Object) { return $null }
    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property) { return $null }
    return $property.Value
}

function Test-Present {
    param($Value)

    if ($null -eq $Value) { return $false }
    $text = ([string]$Value).Trim()
    if ([string]::IsNullOrWhiteSpace($text)) { return $false }
    return $text -notmatch '^(?i:tbd|todo|unknown|replace(?:[-_ ]?me)?|pending|missing|n/?a|none|null|placeholder|example|sample|dummy|fake|x+|-)$'
}

function Test-PositiveNumber {
    param($Value)

    if ($null -eq $Value -or $Value -is [bool]) { return $false }
    $number = 0.0
    return [double]::TryParse(
        ([string]$Value),
        [System.Globalization.NumberStyles]::Float,
        [System.Globalization.CultureInfo]::InvariantCulture,
        [ref]$number) -and -not [double]::IsNaN($number) -and -not [double]::IsInfinity($number) -and $number -gt 0
}

function Test-Sha256 {
    param($Value)

    return (Test-Present $Value) -and ([string]$Value -match '^[A-Fa-f0-9]{64}$')
}

function Test-GitSha {
    param($Value)

    return (Test-Present $Value) -and ([string]$Value -match '^[A-Fa-f0-9]{40}$')
}

function Test-Rfc3339 {
    param($Value)

    if (-not (Test-Present $Value)) { return $false }
    $text = [string]$Value
    if ($text -notmatch '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$') { return $false }
    $parsed = [DateTimeOffset]::MinValue
    return [DateTimeOffset]::TryParse(
        $text,
        [System.Globalization.CultureInfo]::InvariantCulture,
        [System.Globalization.DateTimeStyles]::RoundtripKind,
        [ref]$parsed)
}

function Test-IsoDate {
    param($Value)

    if (-not (Test-Present $Value)) { return $false }
    $parsed = [DateTime]::MinValue
    return [DateTime]::TryParseExact(
        [string]$Value,
        'yyyy-MM-dd',
        [System.Globalization.CultureInfo]::InvariantCulture,
        [System.Globalization.DateTimeStyles]::None,
        [ref]$parsed)
}

function Test-SafeReference {
    param($Value)

    if (-not (Test-Present $Value)) { return $false }
    $text = [string]$Value
    return $text -notmatch '(?i)(localhost|127\.0\.0\.1|0\.0\.0\.0|example\.(com|org|net)|192\.168\.1\.100|password\s*=|token\s*=|private[-_ ]?key)'
}

function Read-JsonFile {
    param([Parameter(Mandatory)][string]$Path)

    $resolved = (Resolve-Path -LiteralPath $Path).Path
    return Get-Content -LiteralPath $resolved -Raw -Encoding utf8 | ConvertFrom-Json
}

function Get-RelativeGitPath {
    param(
        [Parameter(Mandatory)][string]$Root,
        [Parameter(Mandatory)][string]$Path
    )

    $resolvedRoot = (Resolve-Path -LiteralPath $Root).Path.TrimEnd('\', '/')
    $resolvedPath = (Resolve-Path -LiteralPath $Path).Path
    $prefix = "$resolvedRoot\"
    if (-not $resolvedPath.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Path '$resolvedPath' is outside repository root '$resolvedRoot'."
    }
    return $resolvedPath.Substring($prefix.Length).Replace('\', '/')
}

function Invoke-GitText {
    param(
        [Parameter(Mandatory)][string]$Root,
        [Parameter(Mandatory)][string[]]$Arguments,
        [switch]$AllowFailure
    )

    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        $output = @(& git -C $Root @Arguments 2>&1)
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    if (-not $AllowFailure -and $exitCode -ne 0) {
        throw "git $($Arguments -join ' ') failed with exit code ${exitCode}: $($output -join [Environment]::NewLine)"
    }
    return [pscustomobject]@{ ExitCode = $exitCode; Text = ($output -join "`n").Trim() }
}

if ($LibraryOnly) { return }

if (-not (Test-Present $RepositoryRoot)) {
    $RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
}
else {
    $RepositoryRoot = (Resolve-Path -LiteralPath $RepositoryRoot).Path
}

if (-not [IO.Path]::IsPathRooted($EvidenceDirectory)) {
    $EvidenceDirectory = Join-Path $RepositoryRoot $EvidenceDirectory
}
$EvidenceDirectory = (Resolve-Path -LiteralPath $EvidenceDirectory).Path

$requiredEvidenceFiles = @(
    "release-manifest.json",
    "pilot-slo.json",
    "external-input-ledger.json",
    "schema-decision.json",
    "adr-002-operations-schema.md",
    "schema-inventory.md",
    "odf-authority.md",
    "README.md"
)

$manifest = Read-JsonFile (Join-Path $EvidenceDirectory "release-manifest.json")
$slo = Read-JsonFile (Join-Path $EvidenceDirectory "pilot-slo.json")
$ledger = Read-JsonFile (Join-Path $EvidenceDirectory "external-input-ledger.json")
$schema = Read-JsonFile (Join-Path $EvidenceDirectory "schema-decision.json")
$checks = [System.Collections.Generic.List[object]]::new()

function Add-Check {
    param(
        [Parameter(Mandatory)][string]$Id,
        [Parameter(Mandatory)][bool]$Passed,
        [Parameter(Mandatory)][AllowEmptyString()][string]$Detail
    )

    $script:checks.Add([pscustomobject]@{ id = $Id; passed = $Passed; detail = $Detail })
}

# Source/release identity. The baseline is historical evidence; release identifies
# the source state whose artifacts are to be built and may differ from the later
# evidence-containing commit.
$baseline = Get-JsonProperty $manifest "baseline"
$baselineCommit = [string](Get-JsonProperty $baseline "commit")
$baselineTree = [string](Get-JsonProperty $baseline "tree")
$baselineExists = Test-GitSha $baselineCommit
$actualBaselineTree = ""
if ($baselineExists) {
    $lookup = Invoke-GitText $RepositoryRoot @("rev-parse", "$baselineCommit^{tree}") -AllowFailure
    $baselineExists = $lookup.ExitCode -eq 0
    $actualBaselineTree = $lookup.Text
}
Add-Check "baseline-source" ($baselineExists -and $actualBaselineTree -eq $baselineTree) "commit=$baselineCommit; expectedTree=$baselineTree; actualTree=$actualBaselineTree"

$release = Get-JsonProperty $manifest "release"
$releaseCommit = [string](Get-JsonProperty $release "commit")
$releaseTree = [string](Get-JsonProperty $release "tree")
$releaseExists = Test-GitSha $releaseCommit
$actualReleaseTree = ""
if ($releaseExists) {
    $lookup = Invoke-GitText $RepositoryRoot @("rev-parse", "$releaseCommit^{tree}") -AllowFailure
    $releaseExists = $lookup.ExitCode -eq 0
    $actualReleaseTree = $lookup.Text
}
Add-Check "release-source" ($releaseExists -and $actualReleaseTree -eq $releaseTree) "commit=$releaseCommit; expectedTree=$releaseTree; actualTree=$actualReleaseTree"

$trackedEvidence = $true
$untracked = [System.Collections.Generic.List[string]]::new()
foreach ($file in $requiredEvidenceFiles) {
    $path = Join-Path $EvidenceDirectory $file
    $relative = Get-RelativeGitPath $RepositoryRoot $path
    $tracked = Invoke-GitText $RepositoryRoot @("ls-files", "--error-unmatch", "--", $relative) -AllowFailure
    if ($tracked.ExitCode -ne 0) {
        $trackedEvidence = $false
        $untracked.Add($relative)
    }
}
$validatorRelative = Get-RelativeGitPath $RepositoryRoot $PSCommandPath
$validatorTracked = (Invoke-GitText $RepositoryRoot @("ls-files", "--error-unmatch", "--", $validatorRelative) -AllowFailure).ExitCode -eq 0
Add-Check "evidence-tracked" ($trackedEvidence -and $validatorTracked) "untracked=$($untracked -join ','); validatorTracked=$validatorTracked"

$manifestStateValid = [string](Get-JsonProperty $manifest "releaseState") -eq "staging_candidate" -and
    [string](Get-JsonProperty $manifest "productionDecision") -eq "no_go"
Add-Check "release-status" $manifestStateValid "state=$($manifest.releaseState); productionDecision=$($manifest.productionDecision)"

# ODF authority: verify parent gitlink, child commit/tree, a clean reviewed pin,
# patch disposition, inventory hash, and retirement of the embedded deploy tree.
$odf = Get-JsonProperty $manifest "openDataFusion"
$odfPath = [string](Get-JsonProperty $odf "authorityPath")
$odfCommit = [string](Get-JsonProperty $odf "commit")
$odfTree = [string](Get-JsonProperty $odf "tree")
$expectedOdfPath = "third_party/open-data-fusion"
Add-Check "odf-authority-path" ($odfPath -eq $expectedOdfPath) $odfPath

$gitlink = Invoke-GitText $RepositoryRoot @("ls-files", "--stage", "--", $expectedOdfPath) -AllowFailure
$gitlinkMatch = [regex]::Match($gitlink.Text, '^160000\s+([0-9a-f]{40})\s+0\s+')
$gitlinkCommit = if ($gitlinkMatch.Success) { $gitlinkMatch.Groups[1].Value } else { "" }
Add-Check "odf-gitlink" ($gitlink.ExitCode -eq 0 -and $gitlinkMatch.Success -and $gitlinkCommit -eq $odfCommit) "manifest=$odfCommit; gitlink=$gitlinkCommit"

$odfDirectory = Join-Path $RepositoryRoot $expectedOdfPath
$odfHead = (Invoke-GitText $odfDirectory @("rev-parse", "HEAD") -AllowFailure).Text
$odfActualTree = (Invoke-GitText $odfDirectory @("rev-parse", "HEAD^{tree}") -AllowFailure).Text
$odfStatus = (Invoke-GitText $odfDirectory @("status", "--porcelain=v1", "--untracked-files=all") -AllowFailure).Text
Add-Check "odf-commit-tree" ($odfHead -eq $odfCommit -and $odfActualTree -eq $odfTree) "manifestCommit=$odfCommit; head=$odfHead; manifestTree=$odfTree; actualTree=$odfActualTree"
Add-Check "odf-clean-pin" ([string]::IsNullOrWhiteSpace($odfStatus)) "dirtyEntries=$(@($odfStatus -split "`n" | Where-Object { $_ }).Count)"

$odfInventoryPath = Join-Path $RepositoryRoot ([string](Get-JsonProperty $odf "uniquePatchInventory"))
$odfInventoryHash = if (Test-Path -LiteralPath $odfInventoryPath -PathType Leaf) { (Get-FileHash -LiteralPath $odfInventoryPath -Algorithm SHA256).Hash } else { "" }
$odfReviewValid = [string](Get-JsonProperty $odf "disposition") -eq "approved" -and
    (Test-Present (Get-JsonProperty $odf "reviewedBy")) -and
    (Test-Rfc3339 (Get-JsonProperty $odf "reviewedAtUtc")) -and
    (Test-SafeReference (Get-JsonProperty $odf "reviewReference")) -and
    (Test-Sha256 (Get-JsonProperty $odf "inventorySha256")) -and
    $odfInventoryHash -eq [string](Get-JsonProperty $odf "inventorySha256")
Add-Check "odf-patch-disposition" $odfReviewValid "disposition=$($odf.disposition); inventoryHashMatches=$($odfInventoryHash -eq [string]$odf.inventorySha256)"

$embeddedFiles = Invoke-GitText $RepositoryRoot @("ls-files", "--", "Open-Data-Fusion") -AllowFailure
$embeddedCount = @($embeddedFiles.Text -split "`n" | Where-Object { $_ }).Count
Add-Check "odf-single-deploy-tree" ($embeddedCount -eq 0) "trackedEmbeddedFiles=$embeddedCount"

$staleRefs = Invoke-GitText $RepositoryRoot @(
    "grep", "-n", "-I", "Open-Data-Fusion/", "--",
    "README.md", "README.en.md", "README.zh-CN.md", "infrastructure", ".github",
    "docs/roadmap.html", "docs/phase2-progress.md", "docs/phase2-final-report.md",
    ":(exclude)infrastructure/release/Test-G0ScopeLock.ps1") -AllowFailure
$staleRefCount = if ($staleRefs.ExitCode -eq 0) { @($staleRefs.Text -split "`n" | Where-Object { $_ }).Count } else { 0 }
Add-Check "odf-no-stale-release-reference" ($staleRefs.ExitCode -eq 1) "matches=$staleRefCount"

# Schema ADR/inventory binding and approval.
$schemaInventoryPath = Join-Path $RepositoryRoot ([string](Get-JsonProperty $schema "inventoryPath"))
$schemaAdrPath = Join-Path $RepositoryRoot ([string](Get-JsonProperty $schema "adrPath"))
$schemaInventoryHash = if (Test-Path -LiteralPath $schemaInventoryPath -PathType Leaf) { (Get-FileHash -LiteralPath $schemaInventoryPath -Algorithm SHA256).Hash } else { "" }
$schemaAdrHash = if (Test-Path -LiteralPath $schemaAdrPath -PathType Leaf) { (Get-FileHash -LiteralPath $schemaAdrPath -Algorithm SHA256).Hash } else { "" }
$schemaArtifactsValid = [string](Get-JsonProperty $schema "adrId") -eq "ADR-002" -and
    $schemaInventoryHash -eq [string](Get-JsonProperty $schema "inventorySha256") -and
    $schemaAdrHash -eq [string](Get-JsonProperty $schema "adrSha256") -and
    [string](Get-JsonProperty $schema "decision") -eq [string](Get-JsonProperty (Get-JsonProperty $manifest "operationsSchema") "decision") -and
    [string](Get-JsonProperty $schema "driftPolicy") -eq "fail_closed" -and
    [string](Get-JsonProperty $schema "rollbackPolicy") -eq "expand_contract_and_forward_recovery"
Add-Check "schema-artifacts" $schemaArtifactsValid "inventoryHashMatches=$($schemaInventoryHash -eq [string]$schema.inventorySha256); adrHashMatches=$($schemaAdrHash -eq [string]$schema.adrSha256)"

$schemaApprovers = @((Get-JsonProperty $schema "approvedBy")) | Where-Object { Test-Present $_ }
$schemaApprovalValid = [string](Get-JsonProperty $schema "status") -eq "approved_for_wp2" -and
    @($schemaApprovers | Select-Object -Unique).Count -ge 2 -and
    (Test-Rfc3339 (Get-JsonProperty $schema "approvedAtUtc")) -and
    (Test-SafeReference (Get-JsonProperty $schema "approvalReference"))
Add-Check "schema-approval" $schemaApprovalValid "status=$($schema.status); approvers=$(@($schemaApprovers | Select-Object -Unique).Count)"

# Component manifest completeness.
$requiredComponents = @(
    "operations-backend", "operations-frontend", "client-plc", "fusion-adapter",
    "open-data-fusion", "data-platform", "asset-service", "cep-service",
    "factory-ai-gateway", "document-service", "report-service", "antigravity-bridge", "odysseus"
)
$componentsById = @{}
$duplicateComponents = [System.Collections.Generic.List[string]]::new()
foreach ($component in @((Get-JsonProperty $manifest "components"))) {
    $id = [string](Get-JsonProperty $component "id")
    if ($componentsById.ContainsKey($id)) { $duplicateComponents.Add($id) } else { $componentsById[$id] = $component }
}
$invalidComponents = [System.Collections.Generic.List[string]]::new()
foreach ($id in $requiredComponents) {
    if (-not $componentsById.ContainsKey($id)) { $invalidComponents.Add("${id}:missing"); continue }
    $component = $componentsById[$id]
    $componentPath = [string](Get-JsonProperty $component "path")
    $valid = (Test-SafeReference $componentPath) -and
        (Test-Path -LiteralPath (Join-Path $RepositoryRoot $componentPath)) -and
        (Test-Present (Get-JsonProperty $component "owner")) -and
        (Test-Present (Get-JsonProperty $component "version")) -and
        (Test-Present (Get-JsonProperty $component "deploymentMode")) -and
        ([string](Get-JsonProperty $component "artifactDigest") -match '^sha256:[A-Fa-f0-9]{64}$') -and
        (Test-SafeReference (Get-JsonProperty $component "evidencePath"))
    if (-not $valid) { $invalidComponents.Add($id) }
}
$unexpectedComponents = @($componentsById.Keys | Where-Object { $_ -notin $requiredComponents })
Add-Check "component-manifest" ($invalidComponents.Count -eq 0 -and $duplicateComponents.Count -eq 0 -and $unexpectedComponents.Count -eq 0) "invalid=$($invalidComponents -join ','); duplicate=$($duplicateComponents -join ','); unexpected=$($unexpectedComponents -join ',')"

# Pilot workload and SLOs.
$requiredOwners = @("release", "sre", "controls", "data", "rollback")
foreach ($owner in $requiredOwners) {
    $ownerValue = Get-JsonProperty (Get-JsonProperty $slo "owners") $owner
    Add-Check "slo-owner-$owner" (Test-Present $ownerValue) ([string]$ownerValue)
}

$workload = Get-JsonProperty $slo "workload"
$payloadBytes = Get-JsonProperty $workload "payloadBytes"
$resourceLimits = Get-JsonProperty $slo "resourceLimits"
$workloadValid = (Test-Present (Get-JsonProperty $slo "businessImpact")) -and
    (Test-Present (Get-JsonProperty $slo "workloadJustification")) -and
    (Test-Present (Get-JsonProperty $workload "pilotSite")) -and
    (Test-Present (Get-JsonProperty $workload "pilotLine")) -and
    (Test-PositiveNumber (Get-JsonProperty $workload "machineCount")) -and
    (Test-PositiveNumber (Get-JsonProperty $workload "metricsPerMachine")) -and
    (Test-PositiveNumber (Get-JsonProperty $workload "samplesPerMetricPerMinute"))

$percentileNames = @("p50", "p95", "p99", "max")
$percentileValues = [System.Collections.Generic.List[double]]::new()
foreach ($name in $percentileNames) {
    $value = Get-JsonProperty $payloadBytes $name
    if (-not (Test-PositiveNumber $value)) { $workloadValid = $false } else { $percentileValues.Add([double]$value) }
}
if ($percentileValues.Count -eq 4 -and -not ($percentileValues[0] -le $percentileValues[1] -and $percentileValues[1] -le $percentileValues[2] -and $percentileValues[2] -le $percentileValues[3])) {
    $workloadValid = $false
}
foreach ($name in @("backendMemoryBytes", "backendCpuCores", "operationsDatabaseStorageBytes", "edgeDiskBytes")) {
    if (-not (Test-PositiveNumber (Get-JsonProperty $resourceLimits $name))) { $workloadValid = $false }
}
Add-Check "slo-workload" $workloadValid "payloadPercentiles=$($percentileValues -join ',')"

$requiredTargets = @(
    "maxPayloadBytes", "ingressBudgetBytes", "enqueueWaitTimeoutMs", "alertApiP95Ms",
    "predictionApiP95Ms", "timescaleQueryP95Ms", "uiFreshnessSeconds",
    "offlineSpoolMaxBytes", "offlineSpoolMaxDays", "rpoMinutes", "rtoMinutes",
    "stagingSoakHours", "canaryDays"
)
$targets = Get-JsonProperty $slo "targets"
$targetNames = @($targets.PSObject.Properties.Name)
$invalidTargets = [System.Collections.Generic.List[string]]::new()
foreach ($name in $requiredTargets) {
    $target = Get-JsonProperty $targets $name
    if ($null -eq $target -or
        -not (Test-PositiveNumber (Get-JsonProperty $target "value")) -or
        -not (Test-Present (Get-JsonProperty $target "unit")) -or
        -not (Test-Present (Get-JsonProperty $target "owner")) -or
        -not (Test-Present (Get-JsonProperty $target "justification")) -or
        -not (Test-Present (Get-JsonProperty $target "measurementCommand"))) {
        $invalidTargets.Add($name)
    }
}
$unexpectedTargets = @($targetNames | Where-Object { $_ -notin $requiredTargets })
$targetsValid = $invalidTargets.Count -eq 0 -and $unexpectedTargets.Count -eq 0 -and $targetNames.Count -eq $requiredTargets.Count
$sloRatified = [string](Get-JsonProperty $slo "status") -eq "ratified" -and
    (Test-Rfc3339 (Get-JsonProperty $slo "ratifiedAtUtc")) -and $workloadValid -and $targetsValid
Add-Check "slo-ratified" $sloRatified "status=$($slo.status); invalidTargets=$($invalidTargets -join ','); unexpectedTargets=$($unexpectedTargets -join ',')"

# Typed external commitments. G0 accepts committed or ready inputs; readiness is
# proven at the later owning gate.
$inputRequirements = @{
    "pilot-plc" = [pscustomobject]@{ Gate = "G2"; Fields = @("owner", "accessOwner", "protocol", "endpointReference", "identityReference", "committedAvailabilityDate", "evidenceReference") }
    "erp-mes" = [pscustomobject]@{ Gate = "G2"; Fields = @("owner", "dataOwner", "sourceSystem", "endpointReference", "identityReference", "committedAvailabilityDate", "evidenceReference") }
    "code-signing" = [pscustomobject]@{ Gate = "G2"; Fields = @("owner", "packagingOwner", "certificateIdentity", "trustChainReference", "keyVaultOrHsmReference", "keyAccessOwner", "timestampServiceUrl", "timestampServiceSla", "pilotWindowsImageReference", "installPrivilegeModel", "committedAvailabilityDate", "evidenceReference") }
    "managed-staging" = [pscustomobject]@{ Gate = "G4"; Fields = @("owner", "platformReference", "workloadIdentityReference", "secretManagerReference", "committedAvailabilityDate", "evidenceReference") }
    "independent-reviewer" = [pscustomobject]@{ Gate = "G4"; Fields = @("owner", "reviewerIdentityReference", "conflictCheckOwner", "assignedAtUtc", "reviewDueDate", "evidenceReference") }
}
$inputsById = @{}
$duplicateInputs = [System.Collections.Generic.List[string]]::new()
foreach ($input in @((Get-JsonProperty $ledger "inputs"))) {
    $id = [string](Get-JsonProperty $input "id")
    if ($inputsById.ContainsKey($id)) { $duplicateInputs.Add($id) } else { $inputsById[$id] = $input }
}
foreach ($id in $inputRequirements.Keys | Sort-Object) {
    $present = $inputsById.ContainsKey($id)
    $input = if ($present) { $inputsById[$id] } else { $null }
    $requirement = $inputRequirements[$id]
    $valid = $present -and [string](Get-JsonProperty $input "status") -in @("committed", "ready") -and
        [string](Get-JsonProperty $input "requiredByGate") -eq $requirement.Gate
    if ($valid) {
        foreach ($field in $requirement.Fields) {
            $value = Get-JsonProperty $input $field
            if ($field -eq "committedAvailabilityDate" -or $field -eq "reviewDueDate") {
                if (-not (Test-IsoDate $value)) { $valid = $false }
            }
            elseif ($field -eq "assignedAtUtc") {
                if (-not (Test-Rfc3339 $value)) { $valid = $false }
            }
            elseif (-not (Test-SafeReference $value)) {
                $valid = $false
            }
        }
    }
    if ($id -eq "pilot-plc" -and $valid) {
        $valid = @((Get-JsonProperty $input "assetIds") | Where-Object { Test-SafeReference $_ }).Count -gt 0
    }
    Add-Check "external-$id" $valid $(if ($present) { "status=$($input.status); gate=$($input.requiredByGate)" } else { "missing" })
}
Add-Check "external-input-uniqueness" ($duplicateInputs.Count -eq 0 -and $inputsById.Count -eq $inputRequirements.Count) "duplicates=$($duplicateInputs -join ','); count=$($inputsById.Count)"

# Current status authority must remain honest while production is NO-GO.
$releaseStatusPath = Join-Path $RepositoryRoot ([string](Get-JsonProperty (Get-JsonProperty $manifest "authorities") "releaseDecision"))
$historicalPath = Join-Path $RepositoryRoot ([string](Get-JsonProperty (Get-JsonProperty $manifest "authorities") "historicalReport"))
$statusText = if (Test-Path -LiteralPath $releaseStatusPath) { Get-Content -LiteralPath $releaseStatusPath -Raw -Encoding utf8 } else { "" }
$historicalText = if (Test-Path -LiteralPath $historicalPath) { Get-Content -LiteralPath $historicalPath -Raw -Encoding utf8 } else { "" }
Add-Check "status-authority" ($statusText -match '(?i)NO-GO' -and $historicalText -match '(?i)historical' -and $historicalText -match '(?i)superseded') "releaseNoGo=$($statusText -match '(?i)NO-GO'); historicalMarked=$($historicalText -match '(?i)historical')"

$failed = @($checks | Where-Object { -not $_.passed })
$passed = $failed.Count -eq 0
$evidenceHashes = [ordered]@{}
foreach ($file in $requiredEvidenceFiles) {
    $path = Join-Path $EvidenceDirectory $file
    $evidenceHashes[$file] = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
}
$result = [pscustomobject]@{
    schemaVersion = 2
    validatorSha256 = (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash
    evidenceSha256 = $evidenceHashes
    evaluatedAtUtc = [DateTimeOffset]::UtcNow.ToString("O")
    gate = "G0"
    passed = $passed
    decision = $(if ($passed) { "GO" } else { "NO-GO" })
    checks = $checks
}

$json = $result | ConvertTo-Json -Depth 10
if (Test-Present $OutputPath) {
    if (-not [IO.Path]::IsPathRooted($OutputPath)) { $OutputPath = Join-Path $RepositoryRoot $OutputPath }
    $json | Set-Content -LiteralPath $OutputPath -Encoding utf8
}
$json
if (-not $passed) { exit 2 }
