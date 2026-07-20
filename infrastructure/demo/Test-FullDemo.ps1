[CmdletBinding()]
param(
    [ValidateRange(1, 65535)]
    [int]$BackendPort = 5166,

    [ValidateRange(1, 65535)]
    [int]$FrontendPort = 3001,

    [ValidateRange(1, 65535)]
    [int]$OdysseusPort = 7000,

    [ValidateRange(1, 65535)]
    [int]$OdfApiPort = 54310,

    [ValidateRange(1, 65535)]
    [int]$OdfWebPort = 58088
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$backendUrl = "http://127.0.0.1:$BackendPort"
$frontendUrl = "http://127.0.0.1:$FrontendPort"
$odysseusUrl = "http://127.0.0.1:$OdysseusPort"
$odfApiUrl = "http://127.0.0.1:$OdfApiPort"
$odfWebUrl = "http://127.0.0.1:$OdfWebPort"

function Get-Json {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$Uri
    )

    try {
        return Invoke-RestMethod -Uri $Uri -TimeoutSec 10
    }
    catch {
        throw "$Name failed at '$Uri': $($_.Exception.Message)"
    }
}

function Assert-Web {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$Uri
    )

    try {
        $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 10
    }
    catch {
        throw "$Name failed at '$Uri': $($_.Exception.Message)"
    }

    if ($response.StatusCode -ne 200) {
        throw "$Name returned HTTP $($response.StatusCode)."
    }
}

$backendHealth = Get-Json -Name 'Backend health' -Uri "$backendUrl/api/health"
if ([string]$backendHealth.status -ne 'Healthy') {
    throw "Backend reported '$($backendHealth.status)'."
}

Assert-Web -Name 'Operations UI' -Uri $frontendUrl

$odysseusHealth = Get-Json -Name 'Odysseus health' -Uri "$odysseusUrl/api/health"
if ([string]$odysseusHealth.status -ne 'healthy') {
    throw "Odysseus reported '$($odysseusHealth.status)'."
}

$odfReady = Get-Json -Name 'Open Data Fusion readiness' -Uri "$odfApiUrl/ready"
if ([string]$odfReady.readiness -ne 'ready') {
    throw "Open Data Fusion reported '$($odfReady.readiness)'."
}
Assert-Web -Name 'Open Data Fusion Web' -Uri $odfWebUrl

$odysseusPython = Join-Path $repositoryRoot 'Odysseus/venv/Scripts/python.exe'
$syncScript = Join-Path $repositoryRoot 'Odysseus/scripts/sync_mkz_to_odysseus.py'
if (-not (Test-Path -LiteralPath $odysseusPython)) {
    throw 'Odysseus virtual environment is missing.'
}

$previousBackendUrl = [Environment]::GetEnvironmentVariable('MKZ_BACKEND_URL', 'Process')
try {
    [Environment]::SetEnvironmentVariable('MKZ_BACKEND_URL', $backendUrl, 'Process')
    & $odysseusPython $syncScript --export-only
    if ($LASTEXITCODE -ne 0) {
        throw "Odysseus factory-data export exited with code $LASTEXITCODE."
    }
}
finally {
    [Environment]::SetEnvironmentVariable('MKZ_BACKEND_URL', $previousBackendUrl, 'Process')
}

$ragExports = @(Get-ChildItem (Join-Path $repositoryRoot 'Odysseus/data/mkz_exports/rag') -Filter '*.md' -File)
if ($ragExports.Count -eq 0) {
    throw 'Odysseus did not produce any factory RAG summaries.'
}

[pscustomobject]@{
    Backend = $backendHealth.status
    Frontend = 'Healthy'
    Odysseus = $odysseusHealth.status
    OpenDataFusion = $odfReady.readiness
    FactoryRagDocuments = $ragExports.Count
}
