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
    [int]$OdfWebPort = 58088,

    [ValidateNotNullOrEmpty()]
    [string]$Username = 'admin',

    [ValidateNotNullOrEmpty()]
    [string]$Password = 'admin123'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$backendUrl = "http://localhost:$BackendPort"
$frontendUrl = "http://localhost:$FrontendPort"
$odysseusUrl = "http://localhost:$OdysseusPort"
$odfApiUrl = "http://localhost:$OdfApiPort"
$odfWebUrl = "http://localhost:$OdfWebPort"

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

function Get-HttpStatus {
    param(
        [Parameter(Mandatory)][string]$Uri,
        [Parameter(Mandatory)][Microsoft.PowerShell.Commands.WebRequestSession]$WebSession
    )

    try {
        return (Invoke-WebRequest -Uri $Uri -WebSession $WebSession -UseBasicParsing -TimeoutSec 10).StatusCode
    }
    catch {
        $response = $_.Exception.Response
        if ($null -eq $response) { throw }
        return [int]$response.StatusCode
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
$odfHealth = Get-Json -Name 'Open Data Fusion health' -Uri "$odfApiUrl/health"
if ([string]$odfHealth.authMode -ne 'factory') {
    throw "Open Data Fusion authentication mode is '$($odfHealth.authMode)', expected 'factory'."
}
Assert-Web -Name 'Open Data Fusion Web' -Uri $odfWebUrl

$browser = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
$loginBody = @{ username = $Username; password = $Password } | ConvertTo-Json -Compress
$login = Invoke-RestMethod -Method Post -Uri "$backendUrl/api/auth/login" -ContentType 'application/json' `
    -Body $loginBody -WebSession $browser -TimeoutSec 10
if ([string]::IsNullOrWhiteSpace([string]$login.token)) {
    throw 'Main login did not return a token.'
}
$sharedCookie = $browser.Cookies.GetCookies([uri]$backendUrl) |
    Where-Object { $_.Name -eq 'fii_sso' } |
    Select-Object -First 1
if ($null -eq $sharedCookie -or [string]::IsNullOrWhiteSpace($sharedCookie.Value)) {
    throw 'Main login did not set the fii_sso cookie.'
}

$mainSession = Invoke-RestMethod -Uri "$backendUrl/api/auth/session" -WebSession $browser -TimeoutSec 10
if ([string]$mainSession.username -ne $Username.ToLowerInvariant()) {
    throw "Main session belongs to '$($mainSession.username)', expected '$Username'."
}
$odysseusSession = Invoke-RestMethod -Uri "$odysseusUrl/api/auth/status" -WebSession $browser -TimeoutSec 10
if (-not $odysseusSession.authenticated -or [string]$odysseusSession.username -ne $Username.ToLowerInvariant()) {
    throw 'Odysseus did not accept the shared login.'
}
$odfSession = Invoke-RestMethod -Uri "$odfWebUrl/api/v1/auth/session" -WebSession $browser -TimeoutSec 10
if (-not $odfSession.authenticated -or [string]$odfSession.identity.userId -ne $Username.ToLowerInvariant()) {
    throw 'Open Data Fusion did not accept the shared login through its web proxy.'
}

Invoke-RestMethod -Method Post -Uri "$backendUrl/api/auth/logout" -WebSession $browser -TimeoutSec 10 | Out-Null
if ((Get-HttpStatus -Uri "$odysseusUrl/api/auth/users" -WebSession $browser) -ne 401) {
    throw 'Odysseus remained authenticated after global logout.'
}
if ((Get-HttpStatus -Uri "$odfWebUrl/api/v1/auth/session" -WebSession $browser) -ne 401) {
    throw 'Open Data Fusion remained authenticated after global logout.'
}

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
    SharedSso = 'Passed'
    FactoryRagDocuments = $ragExports.Count
}
