[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptPath = Join-Path $PSScriptRoot 'Test-FullDemo.ps1'
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($scriptPath, [ref]$tokens, [ref]$parseErrors)
if (@($parseErrors).Count -ne 0) {
    throw "Test-FullDemo.ps1 has parser errors: $(@($parseErrors).Message -join '; ')"
}

$withClientPlc = $ast.ParamBlock.Parameters | Where-Object { $_.Name.VariablePath.UserPath -eq 'WithClientPlc' }
if ($null -eq $withClientPlc -or $withClientPlc.StaticType -ne [System.Management.Automation.SwitchParameter]) {
    throw 'Test-FullDemo.ps1 must expose [switch]$WithClientPlc.'
}

foreach ($parameterName in @('ClientPlcEvidencePath', 'ClientPlcEvidenceSha256', 'ClientPlcEvidenceMaxAgeMinutes')) {
    if ($null -eq ($ast.ParamBlock.Parameters | Where-Object { $_.Name.VariablePath.UserPath -eq $parameterName })) {
        throw "Test-FullDemo.ps1 must expose `$${parameterName}."
    }
}

$mqttCalls = @($ast.FindAll({
    param($node)
    $node -is [System.Management.Automation.Language.CommandAst] -and
        $node.GetCommandName() -eq 'Send-MqttMessage'
}, $true))
if ($mqttCalls.Count -ne 1) {
    throw "Expected exactly one direct Send-MqttMessage call, found $($mqttCalls.Count)."
}

$text = Get-Content -LiteralPath $scriptPath -Raw -Encoding utf8
foreach ($required in @(
    'if ($WithClientPlc)',
    "'fii.clientplc.telemetry-evidence/v1'",
    "'ClientPLC'",
    'FII_CLIENTPLC_EVIDENCE_SHA256',
    'Get-FileHash -LiteralPath $ClientPlcEvidencePath -Algorithm SHA256',
    "'ClientPLC artifact (hash-verified)'",
    '$sentAtTimestamp -gt $evidenceNow.AddMinutes(2)',
    '$sentAtTimestamp -lt $evidenceNow.AddMinutes(-$ClientPlcEvidenceMaxAgeMinutes)',
    'correlation_id -eq $messageId',
    'JOIN telemetry_receipts tr'
)) {
    if (-not $text.Contains($required)) { throw "Missing ClientPLC validation assertion: $required" }
}


foreach ($forbidden in @(
    "TelemetrySource = `$(if (`$WithClientPlc) { 'ClientPLC evidence' }",
    "TelemetrySource = `$(if (`$WithClientPlc) { 'ClientPLC' }"
)) {
    if ($text.Contains($forbidden)) { throw "ClientPLC provenance must not self-prove through source label: $forbidden" }
}

if ($mqttCalls[0].Extent.StartOffset -lt $text.IndexOf('else {', $text.IndexOf('if ($WithClientPlc)'))) {
    throw 'Direct Send-MqttMessage must remain exclusively in the non-ClientPLC branch.'
}

$triggerPhase2Alerts = $ast.ParamBlock.Parameters |
    Where-Object { $_.Name.VariablePath.UserPath -eq 'TriggerPhase2Alerts' }
if ($null -eq $triggerPhase2Alerts -or $triggerPhase2Alerts.StaticType -ne [System.Management.Automation.SwitchParameter]) {
    throw 'Test-FullDemo.ps1 must expose [switch]$TriggerPhase2Alerts for the W8 live alert workflow.'
}

$w8HarnessPath = Join-Path $PSScriptRoot 'Test-LocalIntegrationW8.ps1'
if (-not (Test-Path -LiteralPath $w8HarnessPath -PathType Leaf)) {
    throw "Expected W8 integration harness at '$w8HarnessPath'."
}

$w8Harness = Get-Content -LiteralPath $w8HarnessPath -Raw -Encoding utf8
foreach ($required in @(
    "'-TriggerPhase2Alerts'"
)) {
    if (-not $w8Harness.Contains($required)) {
        throw "Missing W8 live-alert contract assertion: $required"
    }
}
foreach ($required in @(
    'if ($TriggerPhase2Alerts)',
    'yieldRate = $expectedYieldRate',
    'Phase2AlertAcknowledge',
    "'Pending fusion outbox event with dispatch disabled'",
    "ruleId -eq 'rule-yield-critical'",
    "title -eq 'Yield Rate Critical Drop'"
)) {
    if (-not $text.Contains($required)) {
        throw "Missing Test-FullDemo live-alert assertion: $required"
    }
}

[pscustomobject]@{
    Parsed = $true
    WithClientPlcSwitch = $true
    DirectMqttCallCount = $mqttCalls.Count
    ClientPlcEvidenceContract = $true
    ExternalArtifactHashRequired = $true
    FreshnessBoundsRequired = $true
    TriggerPhase2AlertsSwitch = $true
    W8LiveAlertContract = $true
}
