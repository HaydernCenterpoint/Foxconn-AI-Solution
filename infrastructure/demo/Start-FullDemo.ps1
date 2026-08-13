[CmdletBinding()]
param(
    [ValidateRange(1, 65535)]
    [int]$BackendPort = 5166,

    [ValidateRange(1, 65535)]
    [int]$FrontendPort = 3001,

    [ValidateRange(1, 65535)]
    [int]$MqttPort = 1883,

    [ValidateRange(1, 65535)]
    [int]$TimescalePort = 55433,

    [string]$TimescaleProjectName = 'mkz-timescale',

    [ValidateRange(1, 65535)]
    [int]$CepStagingPort = 58085,

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

    [ValidateRange(1, 65535)]
    [int]$ChromaPort = 8100,

    [ValidateRange(10, 600)]
    [int]$WaitTimeoutSeconds = 180,

    [switch]$SkipOpenDataFusion,
    [switch]$SkipFusionAdapter,
    [switch]$SkipOdysseus,
    [switch]$SkipTimescale,
    [switch]$SkipCepStaging,
    [switch]$SkipFrontendBuild,
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
$timescaleComposeFile = Join-Path $repositoryRoot 'infrastructure/timescaledb/docker-compose.yml'
$cepComposeFile = Join-Path $repositoryRoot 'infrastructure/cep-staging/docker-compose.yml'
$odysseusComposeFile = Join-Path $repositoryRoot 'Odysseus/docker-compose.yml'
$cepStagingUrl = "http://localhost:$CepStagingPort"

New-Item -ItemType Directory -Path $runtimeLogs -Force | Out-Null
$mkzOperationsConnectionString = [Environment]::GetEnvironmentVariable('FII_OPERATIONS_CONNECTION_STRING', 'Process')
if ([string]::IsNullOrWhiteSpace($mkzOperationsConnectionString)) {
    throw 'Set FII_OPERATIONS_CONNECTION_STRING to the retained PostgreSQL database.'
}
$timescalePassword = [Environment]::GetEnvironmentVariable('FII_TIMESCALE_PASSWORD', 'Process')
if (-not $SkipTimescale -and [string]::IsNullOrWhiteSpace($timescalePassword)) {
    throw 'Set FII_TIMESCALE_PASSWORD before starting TimescaleDB.'
}
$timescaleConnectionString = "Host=localhost;Port=$TimescalePort;Database=plc_timescale;Username=postgres;Password=$timescalePassword"

function Resolve-FiiJwtSecret {
    $secret = [Environment]::GetEnvironmentVariable('FII_JWT_SECRET', 'Process')
    if ([string]::IsNullOrWhiteSpace($secret)) {
        $secret = [Environment]::GetEnvironmentVariable('Jwt__Key', 'Process')
    }
    if ([string]::IsNullOrWhiteSpace($secret)) {
        throw 'Set FII_JWT_SECRET to a shared secret of at least 32 bytes.'
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
$demoMqttClientId = [Environment]::GetEnvironmentVariable('FII_DEMO_MACHINE_CLIENT_ID', 'Process')
$mqttDeviceToken = [Environment]::GetEnvironmentVariable('FII_MQTT_DEVICE_TOKEN', 'Process')
if ([string]::IsNullOrWhiteSpace($demoMqttClientId) -xor [string]::IsNullOrWhiteSpace($mqttDeviceToken)) {
    throw 'Set both FII_DEMO_MACHINE_CLIENT_ID and FII_MQTT_DEVICE_TOKEN for MQTT authentication.'
}
if ($WithClientPlc -and [string]::IsNullOrWhiteSpace($mqttDeviceToken)) {
    throw 'Client PLC requires FII_DEMO_MACHINE_CLIENT_ID and FII_MQTT_DEVICE_TOKEN.'
}

function Invoke-WithEnvironment {
    param(
        [Parameter(Mandatory)][hashtable]$Environment,
        [Parameter(Mandatory)][scriptblock]$Action
    )

    $previousEnvironment = @{}
    try {
        foreach ($entry in $Environment.GetEnumerator()) {
            $previousEnvironment[$entry.Key] = [Environment]::GetEnvironmentVariable($entry.Key, 'Process')
            [Environment]::SetEnvironmentVariable($entry.Key, [string]$entry.Value, 'Process')
        }
        & $Action
    }
    finally {
        foreach ($entry in $previousEnvironment.GetEnumerator()) {
            [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'Process')
        }
    }
}

function Resolve-Dotnet9 {
    $candidates = @()
    if ($env:ProgramFiles) { $candidates += (Join-Path $env:ProgramFiles 'dotnet/dotnet.exe') }
    $pathDotnet = Get-Command dotnet.exe -ErrorAction SilentlyContinue
    if ($null -ne $pathDotnet) { $candidates += $pathDotnet.Source }

    foreach ($candidate in ($candidates | Select-Object -Unique)) {
        if (-not (Test-Path -LiteralPath $candidate)) { continue }
        $sdks = & $candidate --list-sdks
        if ($LASTEXITCODE -eq 0 -and @($sdks | Where-Object { $_ -match '^9\.' }).Count -gt 0) {
            return $candidate
        }
    }

    throw 'A .NET 9 SDK is required.'
}

function Invoke-DatabasePreflight {
    param(
        [Parameter(Mandatory)][string]$Dotnet,
        [Parameter(Mandatory)][string]$BackendProject
    )

    Invoke-WithEnvironment -Environment @{
        ConnectionStrings__DefaultConnection = $mkzOperationsConnectionString
    } -Action {
        & $Dotnet run --project $BackendProject --no-launch-profile -- --database-preflight
        if ($LASTEXITCODE -ne 0) { throw 'Operational PostgreSQL preflight failed.' }
    }
}

function Invoke-TimescaleBackfill {
    param(
        [Parameter(Mandatory)][string]$Dotnet,
        [Parameter(Mandatory)][string]$BackendProject
    )

    Invoke-WithEnvironment -Environment @{
        ConnectionStrings__DefaultConnection = $mkzOperationsConnectionString
        ConnectionStrings__Timescale = $timescaleConnectionString
        Timescale__Enabled = 'true'
    } -Action {
        & $Dotnet run --project $BackendProject --no-launch-profile -- --timescale-backfill
        if ($LASTEXITCODE -ne 0) { throw 'Timescale authenticated backfill preflight failed.' }
    }
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

function Start-DockerCompose {
    param(
        [Parameter(Mandatory)][string]$ProjectName,
        [Parameter(Mandatory)][string]$ComposeFile,
        [Parameter(Mandatory)][string]$Name
    )

    if (-not (Test-Path -LiteralPath $ComposeFile)) {
        throw "$Name compose file is missing: $ComposeFile"
    }

    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $composeOutput = & docker compose -p $ProjectName -f $ComposeFile up -d 2>&1
        $composeExitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    $composeOutput | Out-Host
    if ($composeExitCode -ne 0) {
        throw "$Name failed to start through Docker Compose."
    }
}

function Wait-TimescaleReady {
    $deadline = [DateTime]::UtcNow.AddSeconds($WaitTimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        & docker compose -p $TimescaleProjectName -f $timescaleComposeFile exec -T timescaledb pg_isready -U postgres -d plc_timescale *> $null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "[ready] TimescaleDB -> localhost:$TimescalePort" -ForegroundColor Green
            return
        }

        Start-Sleep -Seconds 1
    }

    throw "TimescaleDB did not become ready. Check Docker Compose logs for $TimescaleProjectName."
}

function Wait-TimescaleExtensionReady {
    $deadline = [DateTime]::UtcNow.AddSeconds($WaitTimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        $previousErrorActionPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            $extensionReady = @(& docker compose -p $TimescaleProjectName -f $timescaleComposeFile exec -T timescaledb `
                psql --username postgres --dbname plc_timescale --tuples-only --no-align `
                --command "SELECT to_regclass('timescaledb_information.hypertables') IS NOT NULL;" 2>&1)
            $extensionExitCode = $LASTEXITCODE
        }
        finally {
            $ErrorActionPreference = $previousErrorActionPreference
        }
        if ($extensionExitCode -eq 0 -and ($extensionReady -join '').Trim() -eq 't') {
            Write-Host "[ready] TimescaleDB extension -> localhost:$TimescalePort" -ForegroundColor Green
            return
        }

        Start-Sleep -Seconds 1
    }

    throw "TimescaleDB extension did not become ready. Check Docker Compose logs for $TimescaleProjectName."
}

function Install-TimescaleMigrations {
    $stateCheck = @'
DO $$
DECLARE
    table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY['alerts', 'asset_metrics', 'asset_features', 'asset_predictions']
    LOOP
        IF to_regclass('public.' || table_name) IS NOT NULL
           AND NOT EXISTS (
               SELECT 1
               FROM timescaledb_information.hypertables
               WHERE hypertable_schema = 'public' AND hypertable_name = table_name
           ) THEN
            RAISE EXCEPTION 'Table % exists but is not a hypertable; repair the partial migration before retrying', table_name;
        END IF;
    END LOOP;
END $$;
'@
    $stateCheck | & docker compose -p $TimescaleProjectName -f $timescaleComposeFile exec -T timescaledb `
        psql --username postgres --dbname plc_timescale --set ON_ERROR_STOP=1
    if ($LASTEXITCODE -ne 0) {
        throw 'Timescale contains a partial migration. The volume was preserved for explicit operator repair.'
    }

    $migrationRoot = Join-Path $repositoryRoot 'infrastructure/timescaledb'
    foreach ($migrationName in @(
        '001_create_telemetry_points.sql',
        '002_a2_rollups_and_lifecycle.sql',
        '003_phase2_cep_alerts.sql',
        '004_phase2_health_predictions.sql'
    )) {
        $migrationPath = Join-Path $migrationRoot $migrationName
        Get-Content -LiteralPath $migrationPath -Raw |
            & docker compose -p $TimescaleProjectName -f $timescaleComposeFile exec -T timescaledb `
                psql --username postgres --dbname plc_timescale --set ON_ERROR_STOP=1 --single-transaction
        if ($LASTEXITCODE -ne 0) {
            throw "Timescale migration '$migrationName' failed. The volume was preserved; inspect the schema before retrying."
        }
        Write-Host "[migrate] $migrationName" -ForegroundColor DarkCyan
    }
}

function Start-Chroma {
    if ($ChromaPort -ne 8100) {
        throw 'The existing Chroma Compose service is fixed to port 8100.'
    }
    Invoke-WithEnvironment -Environment @{ JWT_SECRET = $fiiJwtSecret } -Action {
        & docker compose -p odysseus -f $odysseusComposeFile up -d --no-deps --wait --wait-timeout $WaitTimeoutSeconds chromadb
        if ($LASTEXITCODE -ne 0) { throw 'ChromaDB failed to start.' }
    }
    Write-Host "[ready] ChromaDB -> localhost:$ChromaPort" -ForegroundColor Green
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
        $quotedArgs = foreach ($arg in $ArgumentList) {
            $text = [string]$arg
            if ($text -notmatch '[\s"]') { $text }
            else { '"' + $text.Replace('"', '\"') + '"' }
        }
        $startParameters = @{
            FilePath = $FilePath
            ArgumentList = ($quotedArgs -join ' ')
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

Write-Host "Starting Foxconn customer demo" -ForegroundColor Cyan

$dotnet = Resolve-Dotnet9
$backendProject = Join-Path $repositoryRoot 'backend/backend.csproj'
Invoke-DatabasePreflight -Dotnet $dotnet -BackendProject $backendProject

if ($SkipOpenDataFusion -and -not $SkipFusionAdapter) {
    throw 'Use -SkipFusionAdapter when Open Data Fusion is skipped.'
}
$dockerRequired = (-not $SkipTimescale) -or (-not $SkipCepStaging) -or
    (-not $SkipOpenDataFusion) -or (-not $SkipOdysseus)
if ($dockerRequired) {
    $docker = Get-Command docker -ErrorAction SilentlyContinue
    if ($null -eq $docker) {
        throw 'Docker is required by the selected services. Install/start Docker or use all matching -Skip switches.'
    }

    & docker version *> $null
    if ($LASTEXITCODE -ne 0) {
        throw 'Docker is installed but its daemon is unavailable. Start Docker before running the full integration demo.'
    }
}

if (-not $SkipTimescale) {
    Invoke-WithEnvironment -Environment @{
        FII_TIMESCALE_PASSWORD = $timescalePassword
        FII_TIMESCALE_PORT = $TimescalePort
    } -Action {
        Start-DockerCompose -ProjectName $TimescaleProjectName -ComposeFile $timescaleComposeFile -Name 'TimescaleDB'
        Wait-TimescaleReady
        Wait-TimescaleExtensionReady
        Install-TimescaleMigrations
        Invoke-TimescaleBackfill -Dotnet $dotnet -BackendProject $backendProject
    }
}

if (-not $SkipCepStaging) {
    Invoke-WithEnvironment -Environment @{ FII_CEP_STAGING_PORT = $CepStagingPort } -Action {
        Start-DockerCompose -ProjectName "${TimescaleProjectName}-cep" -ComposeFile $cepComposeFile -Name 'CEP staging'
    }
    Wait-HttpReady -Name 'CEP staging' -Uri "$cepStagingUrl/health"
}

if (-not $SkipOdysseus) {
    Start-Chroma
}

Stop-RepositoryProcess -ExecutableName 'backend.exe'
Assert-PortAvailable -Port $BackendPort -Name 'Backend'
$backendProcess = @{
    Name = 'backend'
    FilePath = $dotnet
    ArgumentList = @('run', '--project', $backendProject, '--no-launch-profile')
    WorkingDirectory = $repositoryRoot
    Environment = @{
        ASPNETCORE_ENVIRONMENT = 'Development'
        ASPNETCORE_URLS = $backendBindUrl
        ConnectionStrings__DefaultConnection = $mkzOperationsConnectionString
        Jwt__Key = $fiiJwtSecret
                Jwt__Issuer = $fiiJwtIssuer
                Jwt__Audience = $fiiJwtAudience
                Jwt__TenantId = $(if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable('FII_TENANT_ID', 'Process'))) { 'local-demo' } else { [Environment]::GetEnvironmentVariable('FII_TENANT_ID', 'Process').Trim() })
                Mqtt__EncryptionKey = $mqttEncryptionKey
        MqttServer__Port = $MqttPort
        FiiSso__SecureCookie = 'false'
        OpenDataFusion__CaptureEnabled = 'true'
        Timescale__Enabled = (-not $SkipTimescale).ToString().ToLowerInvariant()
        ConnectionStrings__Timescale = $timescaleConnectionString
        CepStaging__Enabled = (-not $SkipCepStaging).ToString().ToLowerInvariant()
        CepStaging__BaseUrl = $cepStagingUrl
        AllowedOrigins__0 = $frontendUrl
        AllowedOrigins__1 = "http://127.0.0.1:$FrontendPort"
    }
}
if (-not [string]::IsNullOrWhiteSpace($mqttDeviceToken)) {
    $backendProcess.Environment["MqttServer__DeviceTokens__$demoMqttClientId"] = $mqttDeviceToken
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
        FII_MAIN_LOGOUT_URL = "$frontendUrl/logout"
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
            CHROMADB_PORT = [string]$ChromaPort
            AUTH_ENABLED = 'true'
            LOCALHOST_BYPASS = 'false'
            FII_SSO_ENABLED = 'true'
            FII_JWT_SECRET = $fiiJwtSecret
            FII_JWT_ISSUER = $fiiJwtIssuer
            FII_JWT_AUDIENCE = $fiiJwtAudience
            FII_MAIN_LOGIN_URL = "$frontendUrl/login"
            FII_MAIN_LOGOUT_URL = "$frontendUrl/logout"
        }
    }
    $null = Start-LoggedProcess @odysseusProcess
    Wait-HttpReady -Name 'Odysseus' -Uri "$odysseusUrl/api/ready"

    $syncUsername = [Environment]::GetEnvironmentVariable('FII_DEMO_USERNAME', 'Process')
    $syncPassword = [Environment]::GetEnvironmentVariable('FII_DEMO_PASSWORD', 'Process')
    if ([string]::IsNullOrWhiteSpace($syncUsername) -or [string]::IsNullOrWhiteSpace($syncPassword)) {
        throw 'Set FII_DEMO_USERNAME and FII_DEMO_PASSWORD to real Operations credentials for the initial Odysseus export.'
    }
    $syncSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $loginBody = @{ username = $syncUsername; password = $syncPassword } | ConvertTo-Json
    try {
        $loginResult = Invoke-RestMethod -Method Post -Uri "$backendUrl/api/auth/login" `
            -ContentType 'application/json' -Body $loginBody -WebSession $syncSession
    }
    catch {
        throw 'Operations login for the initial Odysseus export failed.'
    }
    $syncToken = [string]$loginResult.token
    if ([string]::IsNullOrWhiteSpace($syncToken)) { throw 'Operations login returned no bearer token.' }

    $syncScript = Join-Path $odysseusRoot 'scripts/sync_mkz_to_odysseus.py'
    $verifyRagScript = Join-Path $odysseusRoot 'scripts/verify_mkz_rag.py'
    try {
        Invoke-WithEnvironment -Environment @{
            MKZ_BACKEND_URL = $backendUrl
            MKZ_BACKEND_TOKEN = $syncToken
            CHROMADB_HOST = '127.0.0.1'
            CHROMADB_PORT = [string]$ChromaPort
        } -Action {
            & $odysseusPython $syncScript
            if ($LASTEXITCODE -ne 0) { throw 'Initial Odysseus export and Chroma reindex failed.' }
            & $odysseusPython $verifyRagScript
            if ($LASTEXITCODE -ne 0) { throw 'The newest Odysseus export is not queryable from Chroma.' }
        }
    }
    finally {
        try {
            Invoke-RestMethod -Method Post -Uri "$backendUrl/api/auth/logout" -WebSession $syncSession | Out-Null
        }
        catch { }
    }
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
    VITE_CEP_API_URL = "$backendUrl/api/v1"
    VITE_ASSET_API_URL = "$backendUrl/api/v1"
    VITE_ODYSSEUS_URL = $odysseusUrl
    VITE_FII_DATA_FUSION_URL = $odfWebUrl
}
$frontendProcess = @{
    Name = 'frontend'
    FilePath = $npm
    WorkingDirectory = $repositoryRoot
    Environment = $frontendEnvironment
}

$previousFrontendEnvironment = @{}
try {
    foreach ($entry in $frontendEnvironment.GetEnumerator()) {
        $previousFrontendEnvironment[$entry.Key] = [Environment]::GetEnvironmentVariable($entry.Key, 'Process')
        [Environment]::SetEnvironmentVariable($entry.Key, [string]$entry.Value, 'Process')
    }

    if ($SkipFrontendBuild) {
        Write-Host '[build] Operations UI vite bundle (skip tsc)' -ForegroundColor DarkCyan
        $viteJs = Join-Path $frontendRoot 'node_modules/vite/bin/vite.js'
        Push-Location $frontendRoot
        try {
            & node $viteJs build --mode full
        }
        finally {
            Pop-Location
        }
    }
    else {
        Write-Host '[build] Operations UI production bundle' -ForegroundColor DarkCyan
        & $npm --prefix $frontendRoot run build -- --mode full
    }
    if ($LASTEXITCODE -ne 0) {
        throw "Frontend production build exited with code $LASTEXITCODE."
    }
}
finally {
    foreach ($entry in $previousFrontendEnvironment.GetEnumerator()) {
        [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'Process')
    }
}

$frontendProcess.ArgumentList = @(
    '--prefix', $frontendRoot, 'run', 'preview', '--',
    '--host', '127.0.0.1', '--port', [string]$FrontendPort, '--strictPort'
)
$null = Start-LoggedProcess @frontendProcess
Wait-HttpReady -Name 'Operations UI' -Uri $frontendUrl

if ($WithClientPlc) {
    Stop-RepositoryProcess -ExecutableName 'ClientPLC.App.exe'
    $clientProject = Join-Path $repositoryRoot 'ClientPLC/ClientPLC.App/ClientPLC.App.csproj'
    $clientProcess = @{
        Name = 'client-plc'
        FilePath = $dotnet
        ArgumentList = @('run', '--project', $clientProject)
        WorkingDirectory = $repositoryRoot
        Environment = @{
            FII_MQTT_ENCRYPTION_KEY = $mqttEncryptionKey
            FII_MQTT_DEVICE_TOKEN = $mqttDeviceToken
        }
    }
    $null = Start-LoggedProcess @clientProcess
}

Write-Host ''
Write-Host "Foxconn UI     : $frontendUrl" -ForegroundColor Green
Write-Host "Backend API    : $backendUrl" -ForegroundColor Green
if (-not $SkipOdysseus) { Write-Host "Foxconn ODC    : $odysseusUrl" -ForegroundColor Green }
if (-not $SkipOpenDataFusion) { Write-Host "Foxconn Fusion : $odfWebUrl" -ForegroundColor Green }
if (-not $SkipTimescale) { Write-Host 'TimescaleDB  : localhost:55433' -ForegroundColor Green }
if (-not $SkipCepStaging) { Write-Host "CEP staging  : $cepStagingUrl" -ForegroundColor Green }
Write-Host "Logs          : $runtimeLogs"
Write-Host "Validate      : .\infrastructure\demo\Test-FullDemo.ps1"
