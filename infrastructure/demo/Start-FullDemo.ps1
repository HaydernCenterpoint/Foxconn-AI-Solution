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
$backendUrl = "http://localhost:$BackendPort"
$backendBindUrl = "http://127.0.0.1:$BackendPort"
$frontendUrl = "http://localhost:$FrontendPort"
$odysseusUrl = "http://localhost:$OdysseusPort"
$odfApiUrl = "http://localhost:$OdfApiPort"
$odfWebUrl = "http://localhost:$OdfWebPort"

New-Item -ItemType Directory -Path $runtimeLogs -Force | Out-Null
$backendDevelopmentSettings = Get-Content (Join-Path $repositoryRoot 'backend/appsettings.Development.json') -Raw |
    ConvertFrom-Json
$mkzOperationsConnectionString = [string]$backendDevelopmentSettings.ConnectionStrings.DefaultConnection
if ([string]::IsNullOrWhiteSpace($mkzOperationsConnectionString)) {
    throw 'The backend development database connection string is missing.'
}

function Resolve-FiiJwtSecret {
    $secret = [Environment]::GetEnvironmentVariable('FII_JWT_SECRET', 'Process')
    if ([string]::IsNullOrWhiteSpace($secret)) {
        $secret = [Environment]::GetEnvironmentVariable('Jwt__Key', 'Process')
    }
    if ([string]::IsNullOrWhiteSpace($secret)) {
        $secret = [string]$backendDevelopmentSettings.Jwt.Key
    }
    $secret = $secret.Trim()
    if ([Text.Encoding]::UTF8.GetByteCount($secret) -lt 32) {
        throw 'The shared FII JWT secret must be at least 32 bytes.'
    }
    return $secret
}

$fiiJwtSecret = Resolve-FiiJwtSecret
$fiiJwtIssuer = [Environment]::GetEnvironmentVariable('FII_JWT_ISSUER', 'Process')
if ([string]::IsNullOrWhiteSpace($fiiJwtIssuer)) { $fiiJwtIssuer = 'MKZ_PLC_Server' }
$fiiJwtAudience = [Environment]::GetEnvironmentVariable('FII_JWT_AUDIENCE', 'Process')
if ([string]::IsNullOrWhiteSpace($fiiJwtAudience)) { $fiiJwtAudience = 'MKZ_PLC_Client' }
$mqttEncryptionKey = [Environment]::GetEnvironmentVariable('FII_MQTT_ENCRYPTION_KEY', 'Process')
if ([string]::IsNullOrWhiteSpace($mqttEncryptionKey)) {
    $mqttKeyBytes = New-Object byte[] 32
    $mqttKeyGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $mqttKeyGenerator.GetBytes($mqttKeyBytes)
        $mqttEncryptionKey = [Convert]::ToBase64String($mqttKeyBytes)
    }
    finally {
        $mqttKeyGenerator.Dispose()
    }
}
$mqttEncryptionKey = $mqttEncryptionKey.Trim()
if ([Text.Encoding]::UTF8.GetByteCount($mqttEncryptionKey) -lt 32) {
    throw 'The shared MQTT encryption key must be at least 32 bytes.'
}

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

function Stop-RepositoryProcess {
    param(
        [Parameter(Mandatory)][string]$ExecutableName,
        [string]$CommandLineContains = ''
    )

    $rootPrefix = "$repositoryRoot\"
    $processes = @(Get-CimInstance Win32_Process -Filter "Name = '$ExecutableName'" -ErrorAction SilentlyContinue |
        Where-Object {
            $belongsToRepository = ($_.ExecutablePath -and
                $_.ExecutablePath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) -or
                ($_.CommandLine -and $_.CommandLine.IndexOf($rootPrefix, [StringComparison]::OrdinalIgnoreCase) -ge 0)
            $matchesCommand = [string]::IsNullOrWhiteSpace($CommandLineContains) -or
                ($_.CommandLine -and $_.CommandLine.IndexOf($CommandLineContains, [StringComparison]::OrdinalIgnoreCase) -ge 0)
            $belongsToRepository -and $matchesCommand
        })
    foreach ($process in $processes) {
        Stop-Process -Id $process.ProcessId -Force
        Wait-Process -Id $process.ProcessId -Timeout 10 -ErrorAction SilentlyContinue
        Write-Host "[restart] stopped stale $ExecutableName (PID $($process.ProcessId))" -ForegroundColor DarkCyan
    }
}

Write-Host "Starting Foxconn AI Solution full demo" -ForegroundColor Cyan

Stop-RepositoryProcess -ExecutableName 'backend.exe'
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
        ASPNETCORE_URLS = $backendBindUrl
        Jwt__Key = $fiiJwtSecret
        Jwt__Issuer = $fiiJwtIssuer
        Jwt__Audience = $fiiJwtAudience
        Mqtt__EncryptionKey = $mqttEncryptionKey
        FiiSso__SecureCookie = 'false'
        OpenDataFusion__CaptureEnabled = 'true'
        AllowedOrigins__0 = $frontendUrl
    }
}
$null = Start-LoggedProcess @backendProcess
Wait-HttpReady -Name 'Backend' -Uri "$backendUrl/api/health"

if (-not $SkipOpenDataFusion) {
    $odfStart = Join-Path $repositoryRoot 'infrastructure/open-data-fusion/Start-OpenDataFusionPreview.ps1'
    $odfParameters = @{
        PostgresPort = $OdfPostgresPort
        RedisPort = $OdfRedisPort
        ApiPort = $OdfApiPort
        WebPort = $OdfWebPort
        WaitTimeoutSeconds = $WaitTimeoutSeconds
    }
    $odfEnvironment = [ordered]@{
        ODF_AUTH_MODE = 'factory'
        ODF_SEED = 'true'
        FII_JWT_SECRET = $fiiJwtSecret
        FII_JWT_ISSUER = $fiiJwtIssuer
        FII_JWT_AUDIENCE = $fiiJwtAudience
        VITE_FII_SSO = 'true'
        FII_MAIN_LOGIN_URL = "$frontendUrl/login"
    }
    $previousOdfEnvironment = @{}
    try {
        foreach ($entry in $odfEnvironment.GetEnumerator()) {
            $previousOdfEnvironment[$entry.Key] = [Environment]::GetEnvironmentVariable($entry.Key, 'Process')
            [Environment]::SetEnvironmentVariable($entry.Key, [string]$entry.Value, 'Process')
        }
        & $odfStart @odfParameters | Out-Host
    }
    finally {
        foreach ($entry in $previousOdfEnvironment.GetEnumerator()) {
            [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'Process')
        }
    }
    Wait-HttpReady -Name 'Open Data Fusion API' -Uri "$odfApiUrl/ready"
    Wait-HttpReady -Name 'Open Data Fusion Web' -Uri $odfWebUrl
}

if (-not $SkipFusionAdapter) {
    Stop-RepositoryProcess -ExecutableName 'Fusion.Adapter.exe'
    $dotnet = (Get-Command dotnet -ErrorAction Stop).Source
    $adapterProject = Join-Path $repositoryRoot 'fusion-adapter/Fusion.Adapter.csproj'
    $adapterProcess = @{
        Name = 'fusion-adapter'
        FilePath = $dotnet
        ArgumentList = @('run', '--project', $adapterProject)
        WorkingDirectory = $repositoryRoot
        Environment = @{
            DOTNET_ENVIRONMENT = 'Local'
            ConnectionStrings__MkzOperations = $mkzOperationsConnectionString
            OpenDataFusion__BaseUrl = "$odfApiUrl/"
            OpenDataFusion__DispatchEnabled = 'true'
            OpenDataFusion__TenantId = 'demo'
            OpenDataFusion__ProjectId = 'north-plant'
            OpenDataFusion__Authentication__Mode = 'factory'
            OpenDataFusion__Authentication__FactorySecret = $fiiJwtSecret
            OpenDataFusion__Authentication__FactoryIssuer = $fiiJwtIssuer
            OpenDataFusion__Authentication__FactoryAudience = $fiiJwtAudience
            OpenDataFusion__Authentication__FactorySubject = 'service-account-open-data-fusion-connector'
            OpenDataFusion__Authentication__FactoryRole = 'ENGINEER'
        }
    }
    $null = Start-LoggedProcess @adapterProcess
}

if (-not $SkipOdysseus) {
    Stop-RepositoryProcess -ExecutableName 'python.exe' -CommandLineContains 'uvicorn'
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
            AUTH_ENABLED = 'true'
            LOCALHOST_BYPASS = 'false'
            FII_SSO_ENABLED = 'true'
            FII_JWT_SECRET = $fiiJwtSecret
            FII_JWT_ISSUER = $fiiJwtIssuer
            FII_JWT_AUDIENCE = $fiiJwtAudience
            FII_MAIN_LOGIN_URL = "$frontendUrl/login"
        }
    }
    $null = Start-LoggedProcess @odysseusProcess
    Wait-HttpReady -Name 'Odysseus' -Uri "$odysseusUrl/api/health"
}

Stop-RepositoryProcess -ExecutableName 'node.exe' -CommandLineContains 'frontend'
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

$frontendEnvironment = @{
    VITE_API_URL = "$backendUrl/api"
    VITE_ODYSSEUS_URL = $odysseusUrl
    VITE_FII_DATA_FUSION_URL = $odfWebUrl
}
$previousFrontendEnvironment = @{}
try {
    foreach ($entry in $frontendEnvironment.GetEnumerator()) {
        $previousFrontendEnvironment[$entry.Key] = [Environment]::GetEnvironmentVariable($entry.Key, 'Process')
        [Environment]::SetEnvironmentVariable($entry.Key, [string]$entry.Value, 'Process')
    }

    Write-Host '[build] Operations UI production bundle' -ForegroundColor DarkCyan
    & $npm --prefix $frontendRoot run build -- --mode full
    if ($LASTEXITCODE -ne 0) {
        throw "Frontend production build exited with code $LASTEXITCODE."
    }
}
finally {
    foreach ($entry in $previousFrontendEnvironment.GetEnumerator()) {
        [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'Process')
    }
}

$frontendProcess = @{
    Name = 'frontend'
    FilePath = $npm
    ArgumentList = @('--prefix', $frontendRoot, 'run', 'preview', '--', '--host', '127.0.0.1', '--port', [string]$FrontendPort, '--strictPort')
    WorkingDirectory = $repositoryRoot
}
$null = Start-LoggedProcess @frontendProcess
Wait-HttpReady -Name 'Operations UI' -Uri $frontendUrl

if ($WithClientPlc) {
    Stop-RepositoryProcess -ExecutableName 'ClientPLC.App.exe'
    $dotnet = (Get-Command dotnet -ErrorAction Stop).Source
    $clientProject = Join-Path $repositoryRoot 'ClientPLC/ClientPLC.App/ClientPLC.App.csproj'
    $clientProcess = @{
        Name = 'client-plc'
        FilePath = $dotnet
        ArgumentList = @('run', '--project', $clientProject)
        WorkingDirectory = $repositoryRoot
        Environment = @{
            FII_MQTT_ENCRYPTION_KEY = $mqttEncryptionKey
        }
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
