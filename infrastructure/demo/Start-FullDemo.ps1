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

    [ValidateRange(1, 65535)]
    [int]$OdfPostgresPort = 55432,

    [ValidateRange(1, 65535)]
    [int]$OdfRedisPort = 56379,

    [ValidateRange(10, 600)]
    [int]$WaitTimeoutSeconds = 180,

    [switch]$SkipOpenDataFusion,
    [switch]$SkipFusionAdapter,
    [switch]$SkipOdysseus,
    [switch]$WithClientPlc
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$runtimeLogs = Join-Path $repositoryRoot '.runtime-logs'
$backendUrl = "http://127.0.0.1:$BackendPort"
$frontendUrl = "http://127.0.0.1:$FrontendPort"
$odysseusUrl = "http://127.0.0.1:$OdysseusPort"
$odfApiUrl = "http://127.0.0.1:$OdfApiPort"
$odfWebUrl = "http://127.0.0.1:$OdfWebPort"

New-Item -ItemType Directory -Path $runtimeLogs -Force | Out-Null

function Test-HttpReady {
    param([Parameter(Mandatory)][string]$Uri)

    try {
        $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 3
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 400
    }
    catch {
        return $false
    }
}

function Wait-HttpReady {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$Uri
    )

    $deadline = [DateTime]::UtcNow.AddSeconds($WaitTimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        if (Test-HttpReady -Uri $Uri) {
            Write-Host "[ready] $Name -> $Uri" -ForegroundColor Green
            return
        }

        Start-Sleep -Seconds 1
    }

    throw "$Name did not become ready at '$Uri'. Check '$runtimeLogs'."
}

function Assert-PortAvailable {
    param(
        [Parameter(Mandatory)][int]$Port,
        [Parameter(Mandatory)][string]$Name
    )

    $listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($null -eq $listener) {
        return
    }

    $owner = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
    $ownerText = if ($null -eq $owner) { "PID $($listener.OwningProcess)" } else { "$($owner.ProcessName) (PID $($owner.Id))" }
    throw "$Name port $Port is already used by $ownerText, but its health endpoint is not ready."
}

function Start-LoggedProcess {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$FilePath,
        [Parameter(Mandatory)][string[]]$ArgumentList,
        [Parameter(Mandatory)][string]$WorkingDirectory,
        [hashtable]$Environment = @{}
    )

    $previousEnvironment = @{}
    try {
        foreach ($entry in $Environment.GetEnumerator()) {
            $previousEnvironment[$entry.Key] = [Environment]::GetEnvironmentVariable($entry.Key, 'Process')
            [Environment]::SetEnvironmentVariable($entry.Key, [string]$entry.Value, 'Process')
        }

        $stdoutPath = Join-Path $runtimeLogs "$Name.out.log"
        $stderrPath = Join-Path $runtimeLogs "$Name.err.log"
        $startParameters = @{
            FilePath = $FilePath
            ArgumentList = $ArgumentList
            WorkingDirectory = $WorkingDirectory
            RedirectStandardOutput = $stdoutPath
            RedirectStandardError = $stderrPath
            WindowStyle = 'Hidden'
            PassThru = $true
        }
        $process = Start-Process @startParameters
        Write-Host "[start] $Name (PID $($process.Id))" -ForegroundColor Cyan
        return $process
    }
    finally {
        foreach ($entry in $previousEnvironment.GetEnumerator()) {
            [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'Process')
        }
    }
}

function Test-RepositoryProcess {
    param([Parameter(Mandatory)][string]$ExecutableName)

    $rootPrefix = "$repositoryRoot\"
    return $null -ne (Get-CimInstance Win32_Process -Filter "Name = '$ExecutableName'" -ErrorAction SilentlyContinue |
        Where-Object {
            $_.ExecutablePath -and $_.ExecutablePath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)
        } |
        Select-Object -First 1)
}

Write-Host "Starting Foxconn AI Solution full demo" -ForegroundColor Cyan

if (Test-HttpReady -Uri "$backendUrl/api/health") {
    Write-Host "[reuse] Backend -> $backendUrl" -ForegroundColor DarkCyan
}
else {
    Assert-PortAvailable -Port $BackendPort -Name 'Backend'
    $dotnet = (Get-Command dotnet -ErrorAction Stop).Source
    $backendProject = Join-Path $repositoryRoot 'backend/backend.csproj'
    $backendProcess = @{
        Name = 'backend'
        FilePath = $dotnet
        ArgumentList = @('run', '--project', $backendProject, '--no-launch-profile')
        WorkingDirectory = $repositoryRoot
        Environment = @{
            ASPNETCORE_ENVIRONMENT = 'Development'
            ASPNETCORE_URLS = $backendUrl
            OpenDataFusion__CaptureEnabled = 'true'
            AllowedOrigins__0 = $frontendUrl
            AllowedOrigins__1 = "http://localhost:$FrontendPort"
        }
    }
    $null = Start-LoggedProcess @backendProcess
    Wait-HttpReady -Name 'Backend' -Uri "$backendUrl/api/health"
}

if (-not $SkipOpenDataFusion) {
    if ((Test-HttpReady -Uri "$odfApiUrl/ready") -and (Test-HttpReady -Uri $odfWebUrl)) {
        Write-Host "[reuse] Open Data Fusion -> $odfWebUrl" -ForegroundColor DarkCyan
    }
    else {
        $odfStart = Join-Path $repositoryRoot 'infrastructure/open-data-fusion/Start-OpenDataFusionPreview.ps1'
        $odfParameters = @{
            PostgresPort = $OdfPostgresPort
            RedisPort = $OdfRedisPort
            ApiPort = $OdfApiPort
            WebPort = $OdfWebPort
            WaitTimeoutSeconds = $WaitTimeoutSeconds
        }
        & $odfStart @odfParameters | Out-Host
        Wait-HttpReady -Name 'Open Data Fusion API' -Uri "$odfApiUrl/ready"
        Wait-HttpReady -Name 'Open Data Fusion Web' -Uri $odfWebUrl
    }
}

if (-not $SkipFusionAdapter) {
    if (Test-RepositoryProcess -ExecutableName 'Fusion.Adapter.exe') {
        Write-Host '[reuse] Fusion Adapter' -ForegroundColor DarkCyan
    }
    else {
        $dotnet = (Get-Command dotnet -ErrorAction Stop).Source
        $adapterProject = Join-Path $repositoryRoot 'fusion-adapter/Fusion.Adapter.csproj'
        $adapterProcess = @{
            Name = 'fusion-adapter'
            FilePath = $dotnet
            ArgumentList = @('run', '--project', $adapterProject)
            WorkingDirectory = $repositoryRoot
            Environment = @{
                DOTNET_ENVIRONMENT = 'Local'
                OpenDataFusion__BaseUrl = "$odfApiUrl/"
                OpenDataFusion__DispatchEnabled = 'false'
            }
        }
        $null = Start-LoggedProcess @adapterProcess
    }
}

if (-not $SkipOdysseus) {
    if (Test-HttpReady -Uri "$odysseusUrl/api/health") {
        Write-Host "[reuse] Odysseus -> $odysseusUrl" -ForegroundColor DarkCyan
    }
    else {
        Assert-PortAvailable -Port $OdysseusPort -Name 'Odysseus'
        $odysseusRoot = Join-Path $repositoryRoot 'Odysseus'
        $odysseusPython = Join-Path $odysseusRoot 'venv/Scripts/python.exe'
        if (-not (Test-Path -LiteralPath $odysseusPython)) {
            throw "Odysseus virtual environment is missing. Run 'Odysseus/launch-windows.ps1' once to install it."
        }

        $odysseusProcess = @{
            Name = 'odysseus'
            FilePath = $odysseusPython
            ArgumentList = @('-m', 'uvicorn', 'app:app', '--host', '127.0.0.1', '--port', [string]$OdysseusPort)
            WorkingDirectory = $odysseusRoot
            Environment = @{
                MKZ_BACKEND_URL = $backendUrl
                CHROMADB_HOST = '127.0.0.1'
                CHROMADB_PORT = '8100'
            }
        }
        $null = Start-LoggedProcess @odysseusProcess
        Wait-HttpReady -Name 'Odysseus' -Uri "$odysseusUrl/api/health"
    }
}

if (Test-HttpReady -Uri $frontendUrl) {
    Write-Host "[reuse] Operations UI -> $frontendUrl" -ForegroundColor DarkCyan
}
else {
    Assert-PortAvailable -Port $FrontendPort -Name 'Frontend'
    $npm = (Get-Command npm.cmd -ErrorAction Stop).Source
    $frontendRoot = Join-Path $repositoryRoot 'frontend'
    $vite = Join-Path $frontendRoot 'node_modules/.bin/vite.cmd'
    if (-not (Test-Path -LiteralPath $vite)) {
        & $npm --prefix $frontendRoot ci
        if ($LASTEXITCODE -ne 0) {
            throw 'Frontend dependency installation failed.'
        }
    }

    $frontendProcess = @{
        Name = 'frontend'
        FilePath = $npm
        ArgumentList = @('--prefix', $frontendRoot, 'run', 'dev', '--', '--mode', 'full', '--host', '127.0.0.1', '--port', [string]$FrontendPort, '--strictPort')
        WorkingDirectory = $repositoryRoot
        Environment = @{
            VITE_API_URL = "$backendUrl/api"
            VITE_ODYSSEUS_URL = $odysseusUrl
            VITE_FII_DATA_FUSION_URL = $odfWebUrl
        }
    }
    $null = Start-LoggedProcess @frontendProcess
    Wait-HttpReady -Name 'Operations UI' -Uri $frontendUrl
}

if ($WithClientPlc -and -not (Test-RepositoryProcess -ExecutableName 'ClientPLC.App.exe')) {
    $dotnet = (Get-Command dotnet -ErrorAction Stop).Source
    $clientProject = Join-Path $repositoryRoot 'ClientPLC/ClientPLC.App/ClientPLC.App.csproj'
    $clientProcess = @{
        Name = 'client-plc'
        FilePath = $dotnet
        ArgumentList = @('run', '--project', $clientProject)
        WorkingDirectory = $repositoryRoot
    }
    $null = Start-LoggedProcess @clientProcess
}

Write-Host ''
Write-Host "Operations UI : $frontendUrl" -ForegroundColor Green
Write-Host "Backend API   : $backendUrl" -ForegroundColor Green
if (-not $SkipOdysseus) { Write-Host "FII Assistant : $odysseusUrl" -ForegroundColor Green }
if (-not $SkipOpenDataFusion) { Write-Host "Data Fusion   : $odfWebUrl" -ForegroundColor Green }
Write-Host "Logs          : $runtimeLogs"
Write-Host "Validate      : .\infrastructure\demo\Test-FullDemo.ps1"
