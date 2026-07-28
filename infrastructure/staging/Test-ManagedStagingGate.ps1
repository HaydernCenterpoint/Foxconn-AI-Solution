[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [Uri]$BackendUrl,
    [Parameter(Mandatory = $true)]
    [Uri]$FrontendUrl,
    [Parameter(Mandatory = $true)]
    [string]$AttestationPath,
    [string]$OutputPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$requiredChecks = @(
    "backend-https-ingress",
    "frontend-https-ingress",
    "certificate-lifetime",
    "mqtt-tls",
    "mqtt-device-auth",
    "mqtt-topic-isolation",
    "secret-manager-delivery",
    "operations-db-tls",
    "timescale-db-tls",
    "managed-backup",
    "restore-drill",
    "retention-policies",
    "dual-write-validation",
    "dual-write-rollback",
    "live-erp-mes-connector",
    "independent-full-stack-smoke"
)

function Assert-ManagedUri {
    param(
        [Parameter(Mandatory = $true)]
        [Uri]$Uri,
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    if ($Uri.Scheme -ne "https") {
        throw "$Name must use HTTPS."
    }

    $hostName = $Uri.DnsSafeHost.ToLowerInvariant()
    if ($Uri.IsLoopback -or $hostName -in @("localhost", "127.0.0.1", "::1")) {
        throw "$Name must target managed staging, not loopback."
    }
}

function Invoke-Probe {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [Parameter(Mandatory = $true)]
        [Uri]$Uri
    )

    $timer = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 20
        if ($response.StatusCode -ne 200) {
            throw "$Name returned HTTP $($response.StatusCode)."
        }
        return [pscustomobject]@{
            name = $Name
            uri = $Uri.AbsoluteUri
            statusCode = $response.StatusCode
            elapsedMs = [Math]::Round($timer.Elapsed.TotalMilliseconds, 2)
            passed = $true
        }
    }
    finally {
        $timer.Stop()
    }
}

Assert-ManagedUri -Uri $BackendUrl -Name "BackendUrl"
Assert-ManagedUri -Uri $FrontendUrl -Name "FrontendUrl"

$resolvedAttestation = (Resolve-Path -LiteralPath $AttestationPath).Path
$attestation = Get-Content -LiteralPath $resolvedAttestation -Raw | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace([string]$attestation.environment)) {
    throw "Attestation must name the managed staging environment."
}
if ([string]::IsNullOrWhiteSpace([string]$attestation.reviewer)) {
    throw "Attestation must name an independent reviewer."
}

$approvedAt = [DateTimeOffset]::MinValue
if (-not [DateTimeOffset]::TryParse([string]$attestation.approvedAtUtc, [ref]$approvedAt)) {
    throw "Attestation approvedAtUtc is missing or invalid."
}
if ($approvedAt -gt [DateTimeOffset]::UtcNow.AddMinutes(5)) {
    throw "Attestation approvedAtUtc cannot be in the future."
}
if ($approvedAt -lt [DateTimeOffset]::UtcNow.AddDays(-30)) {
    throw "Attestation is older than 30 days."
}

$checksById = @{}
foreach ($check in @($attestation.checks)) {
    $id = [string]$check.id
    if ($checksById.ContainsKey($id)) {
        throw "Duplicate managed check '$id'."
    }
    $checksById[$id] = $check
}

foreach ($requiredCheck in $requiredChecks) {
    if (-not $checksById.ContainsKey($requiredCheck)) {
        throw "Missing managed check '$requiredCheck'."
    }
    $check = $checksById[$requiredCheck]
    if ([string]$check.status -ne "passed") {
        throw "Managed check '$requiredCheck' is not passed."
    }
    if ([string]::IsNullOrWhiteSpace([string]$check.evidence)) {
        throw "Managed check '$requiredCheck' has no evidence reference."
    }
}
if ($checksById.Count -ne $requiredChecks.Count) {
    throw "Attestation must contain exactly $($requiredChecks.Count) managed checks."
}

$backendHealthUri = [Uri]::new($BackendUrl, "api/health")
$probes = @(
    Invoke-Probe -Name "backend-health" -Uri $backendHealthUri
    Invoke-Probe -Name "frontend" -Uri $FrontendUrl
)

$result = [pscustomobject]@{
    evaluatedAtUtc = [DateTimeOffset]::UtcNow.ToString("O")
    environment = [string]$attestation.environment
    reviewer = [string]$attestation.reviewer
    approvedAtUtc = $approvedAt.ToUniversalTime().ToString("O")
    managedChecks = $requiredChecks.Count
    probes = $probes
    passed = $true
}

$json = $result | ConvertTo-Json -Depth 5
Write-Output $json
if (-not [string]::IsNullOrWhiteSpace($OutputPath)) {
    $json | Set-Content -LiteralPath $OutputPath -Encoding UTF8
}
