[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $PSScriptRoot "Test-G0ScopeLock.ps1"
. $scriptPath -LibraryOnly

foreach ($invalid in @($null, "", " ", "TBD", "missing", "placeholder", "N/A", "x", "-")) {
    if (Test-Present $invalid) { throw "Expected placeholder '$invalid' to be rejected." }
}
foreach ($valid in @("Release Owner", "evidence://review/42", "plant-line-a")) {
    if (-not (Test-Present $valid)) { throw "Expected '$valid' to be present." }
}
foreach ($invalid in @($null, 0, -1, "NaN", "Infinity", "not-a-number")) {
    if (Test-PositiveNumber $invalid) { throw "Expected numeric value '$invalid' to be rejected." }
}
if (-not (Test-PositiveNumber 1) -or -not (Test-PositiveNumber "1.5")) {
    throw "Expected positive finite numbers to pass."
}
if (Test-Rfc3339 "yesterday" -or -not (Test-Rfc3339 "2026-08-02T04:26:05Z")) {
    throw "RFC3339 validation failed."
}
if (Test-IsoDate "02/08/2026" -or -not (Test-IsoDate "2026-08-02")) {
    throw "ISO date validation failed."
}
if (Test-SafeReference "http://localhost:8080" -or Test-SafeReference "https://example.com") {
    throw "Loopback/example references must be rejected."
}
if (-not (Test-SafeReference "evidence://managed/staging-42")) {
    throw "Immutable evidence references must be accepted."
}

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$evidencePath = Join-Path $repositoryRoot "docs/release-evidence/g0"
$outputPath = Join-Path ([System.IO.Path]::GetTempPath()) "fii-g0-$([guid]::NewGuid().ToString('N')).json"

try {
    & $scriptPath -RepositoryRoot $repositoryRoot -EvidenceDirectory $evidencePath -OutputPath $outputPath | Out-Null
    $validatorExitCode = $LASTEXITCODE
    $result = Get-Content -LiteralPath $outputPath -Raw -Encoding utf8 | ConvertFrom-Json
    $expectedExitCode = if ($result.passed) { 0 } else { 2 }
    if ($validatorExitCode -ne $expectedExitCode) {
        throw "Validator result/exit mismatch: passed=$($result.passed), exit=$validatorExitCode."
    }
    if ([string]$result.decision -ne $(if ($result.passed) { "GO" } else { "NO-GO" })) {
        throw "Validator decision is inconsistent with passed state."
    }
    if (-not (Test-Sha256 $result.validatorSha256)) { throw "Validator hash is missing or invalid." }
    foreach ($requiredCheck in @(
        "baseline-source", "release-source", "evidence-tracked", "odf-clean-pin",
        "odf-patch-disposition", "odf-single-deploy-tree", "schema-artifacts",
        "schema-approval", "component-manifest", "slo-workload", "slo-ratified",
        "external-pilot-plc", "external-erp-mes", "external-code-signing",
        "external-managed-staging", "external-independent-reviewer", "status-authority")) {
        if ($requiredCheck -notin @($result.checks.id)) { throw "Required check '$requiredCheck' is missing." }
    }

    # The current candidate deliberately remains NO-GO. These assertions are
    # conditional, so a legitimately ratified future fixture can pass without
    # the test permanently requiring a release failure.
    $slo = Get-Content -LiteralPath (Join-Path $evidencePath "pilot-slo.json") -Raw -Encoding utf8 | ConvertFrom-Json
    if ([string]$slo.status -ne "ratified") {
        $ratified = $result.checks | Where-Object id -eq "slo-ratified"
        if ($ratified.passed) { throw "Unratified SLO unexpectedly passed." }
    }

    Write-Output "G0 validator self-test passed (decision=$($result.decision), checks=$($result.checks.Count))."
}
finally {
    Remove-Item -LiteralPath $outputPath -ErrorAction SilentlyContinue
}

exit 0
