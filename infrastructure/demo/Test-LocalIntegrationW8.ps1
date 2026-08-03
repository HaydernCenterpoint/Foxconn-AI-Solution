[CmdletBinding()]
param(
    [ValidateRange(1, 65535)]
    [int]$OperationsPort = 55434,

    [ValidateRange(1, 65535)]
    [int]$TimescalePort = 55435,

    [ValidateRange(1, 65535)]
    [int]$BackendPort = 5266,

    [ValidateRange(1, 65535)]
    [int]$FrontendPort = 3101,

    [ValidateRange(1, 65535)]
    [int]$MqttPort = 18884,

    [ValidateRange(1, 65535)]
    [int]$CepStagingPort = 58086,

    [ValidateRange(30, 600)]
    [int]$WaitTimeoutSeconds = 240
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$runtimeLogs = Join-Path $repositoryRoot '.runtime-logs'
$evidenceRoot = Join-Path $repositoryRoot 'docs/release-evidence'
$startScript = Join-Path $repositoryRoot 'infrastructure/demo/Start-FullDemo.ps1'
$testScript = Join-Path $repositoryRoot 'infrastructure/demo/Test-FullDemo.ps1'
$timescaleComposeFile = Join-Path $repositoryRoot 'infrastructure/timescaledb/docker-compose.yml'
$cepComposeFile = Join-Path $repositoryRoot 'infrastructure/cep-staging/docker-compose.yml'
$runId = [guid]::NewGuid().ToString('N').Substring(0, 10)
$timescaleProjectName = "fii-w8-$runId"
$cepProjectName = "$timescaleProjectName-cep"
$operationsContainer = "fii-w8-db-$runId"
$operationsDatabase = "fii_w8"
$operationsPassword = $null
$adminPassword = $null
$machineId = [guid]::NewGuid()
$clientId = $machineId.ToString('D')
$startLog = Join-Path $runtimeLogs "w8-$runId-start.log"
$testLog = Join-Path $runtimeLogs "w8-$runId-test.log"
$browserLog = Join-Path $runtimeLogs "w8-$runId-browser.log"
$reportPath = Join-Path $evidenceRoot '2026-08-01-integration-w8-local.md'
$runStatus = 'failed'
$failureMessage = $null
$testOutput = @()
$timescalePassword = $null

New-Item -ItemType Directory -Path $runtimeLogs -Force | Out-Null
New-Item -ItemType Directory -Path $evidenceRoot -Force | Out-Null

function New-RandomHex {
    param([ValidateRange(16, 64)][int]$ByteCount = 32)

    $bytes = New-Object byte[] $ByteCount
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $generator.GetBytes($bytes)
        return [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
    }
    finally {
        $generator.Dispose()
    }
}

function Get-Sha256Hex {
    param([Parameter(Mandatory)][string]$Value)

    $hasher = [Security.Cryptography.SHA256]::Create()
    try {
        return [BitConverter]::ToString(
            $hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($Value))).Replace('-', '').ToLowerInvariant()
    }
    finally {
        $hasher.Dispose()
    }
}

function Assert-PortFree {
    param([Parameter(Mandatory)][int]$Port)

    if ($null -ne (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1)) {
        throw "Requested W8 port $Port is already in use."
    }
}

function ConvertTo-ProcessArgumentString {
    param([Parameter(Mandatory)][string[]]$ArgumentList)
    $parts = foreach ($arg in $ArgumentList) {
        $text = [string]$arg
        if ($text -notmatch '[\s"]') { $text }
        else { '"' + ($text.Replace('"', '\"')) + '"' }
    }
    return ($parts -join ' ')
}

function Invoke-LoggedProcess {
    param(
        [Parameter(Mandatory)][string]$FilePath,
        [Parameter(Mandatory)][string[]]$ArgumentList,
        [Parameter(Mandatory)][string]$LogPath,
        [int]$ReadyTimeoutSeconds = 0,
        [string[]]$ReadyUrls = @()
    )

    $argString = ConvertTo-ProcessArgumentString -ArgumentList $ArgumentList

    # Starter path: no stream redirect + HTTP ready gate (detached kids inherit pipes and stall).
    if ($ReadyTimeoutSeconds -gt 0 -and $ReadyUrls.Count -gt 0) {
        $psi = [System.Diagnostics.ProcessStartInfo]::new()
        $psi.FileName = $FilePath
        $psi.Arguments = $argString
        $psi.UseShellExecute = $false
        $psi.CreateNoWindow = $true
        $psi.WorkingDirectory = $repositoryRoot
        $process = [System.Diagnostics.Process]::new()
        $process.StartInfo = $psi
        if (-not $process.Start()) { throw "Failed to start $FilePath" }
        Add-Content -LiteralPath $LogPath -Encoding utf8 -Value ("[start-pid {0}] {1} {2}" -f $process.Id, $FilePath, $argString)

        $deadline = (Get-Date).AddSeconds($ReadyTimeoutSeconds)
        while ((Get-Date) -lt $deadline) {
            $allReady = $true
            foreach ($url in $ReadyUrls) {
                try {
                    $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
                    if ($resp.StatusCode -lt 200 -or $resp.StatusCode -ge 300) { $allReady = $false; break }
                }
                catch { $allReady = $false; break }
            }
            if ($allReady) {
                Add-Content -LiteralPath $LogPath -Encoding utf8 -Value "[ready-urls] $($ReadyUrls -join ', ')"
                $process.WaitForExit(15000) | Out-Null
                if (-not $process.HasExited) {
                    Add-Content -LiteralPath $LogPath -Encoding utf8 -Value '[starter still running after ready — continuing]'
                    return 0
                }
                return [int]$process.ExitCode
            }
            if ($process.HasExited) { return [int]$process.ExitCode }
            Start-Sleep -Seconds 2
        }
        if (-not $process.HasExited) {
            try { $process.Kill() } catch { }
            throw "Ready URLs not available within ${ReadyTimeoutSeconds}s: $($ReadyUrls -join ', ')"
        }
        return [int]$process.ExitCode
    }

    # Short-lived path: Start-Process argv array + file redirect (cmd quoting breaks -Command).
        $stdoutPath = "$LogPath.stdout.tmp"
        $stderrPath = "$LogPath.stderr.tmp"
        Remove-Item -LiteralPath $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue
        Add-Content -LiteralPath $LogPath -Encoding utf8 -Value ("[start] {0} {1}" -f $FilePath, $argString)
        $process = Start-Process -FilePath $FilePath -ArgumentList $ArgumentList `
            -WorkingDirectory $repositoryRoot -NoNewWindow -Wait -PassThru `
            -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
        foreach ($path in @($stdoutPath, $stderrPath)) {
            if (Test-Path -LiteralPath $path) {
                Get-Content -LiteralPath $path -ErrorAction SilentlyContinue |
                    Add-Content -LiteralPath $LogPath -Encoding utf8
                Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
            }
        }
        $code = [int]$process.ExitCode
        Add-Content -LiteralPath $LogPath -Encoding utf8 -Value ("[exit {0}]" -f $code)
        return $code
    }
function Stop-PortOwner {
    param([Parameter(Mandatory)][int]$Port)

    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
    foreach ($listener in $listeners) {
        $process = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
        if ($null -ne $process) {
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
            Wait-Process -Id $process.Id -Timeout 10 -ErrorAction SilentlyContinue
        }
    }
}

function Write-Report {
    param([string]$Status, [string]$ErrorMessage)

    $sha = (& git -C $repositoryRoot rev-parse HEAD 2>$null).Trim()
    $startLogLink = $startLog.Replace('\', '/')
    $testLogLink = $testLog.Replace('\', '/')
    $browserLogLink = $browserLog.Replace('\', '/')
    $lines = @(
        '# Integration W8 — local no-fixture evidence',
        '',
        "- Status: **$Status**",
        "- Generated: $([DateTimeOffset]::UtcNow.ToString('O'))",
        "- Commit: $sha",
        "- Environment: disposable local Docker + local .NET/Playwright",
        "- Run: $runId",
        "- Operations DB: 127.0.0.1:$OperationsPort/$operationsDatabase (ephemeral container $operationsContainer)",
        "- Timescale project/port: $timescaleProjectName / 127.0.0.1:$TimescalePort",
        "- CEP project/port: $cepProjectName / 127.0.0.1:$CepStagingPort",
        "- Backend/frontend/MQTT: $BackendPort / $FrontendPort / $MqttPort",
        "- Machine/client correlation: $machineId / $clientId",
        '',
        '## Exact verification commands',
        '',
        "1. Start-FullDemo.ps1 -BackendPort $BackendPort -FrontendPort $FrontendPort -MqttPort $MqttPort -TimescalePort $TimescalePort -TimescaleProjectName $timescaleProjectName -CepStagingPort $CepStagingPort -SkipOpenDataFusion -SkipFusionAdapter -SkipOdysseus; see [$startLog](/$startLogLink).",
        "2. Test-FullDemo.ps1 -TriggerPhase2Alerts -BackendPort $BackendPort -FrontendPort $FrontendPort -MqttPort $MqttPort -CepStagingPort $CepStagingPort -SkipOpenDataFusion -SkipOdysseus; see [$testLog](/$testLogLink).",
        "3. npm --prefix frontend run e2e:live with FII_LIVE_E2E=1, real local cookie login, machine ID, and alert title; see [$browserLog](/$browserLogLink).",
        '',
        '## Acceptance boundary',
        '',
        '- Correlation is a disposable synthetic PLC/MQTT message carried through backend live telemetry, PostgreSQL raw/outbox, Timescale, CEP, durable alert/health, and authenticated browser UI.',
        '- No `page.route` or API fixtures are used by the live browser test.',
        '- Production remains **NO-GO pending W10 managed staging, security ingress/pentest, backup/restore, and rollback evidence**.',
        ''
    )
    if (-not [string]::IsNullOrWhiteSpace($ErrorMessage)) {
        $lines += @('', "Failure: $ErrorMessage")
    }
    $lines | Set-Content -LiteralPath $reportPath -Encoding UTF8
}

try {
    foreach ($port in @($OperationsPort, $TimescalePort, $BackendPort, $FrontendPort, $MqttPort, $CepStagingPort)) {
        Assert-PortFree -Port $port
    }

    $operationsPassword = New-RandomHex -ByteCount 24
    $adminPassword = 'W8-' + (New-RandomHex -ByteCount 18)
    $jwtSecret = New-RandomHex -ByteCount 32
        $mqttEncryptionKey = New-RandomHex -ByteCount 32
        $mqttDeviceToken = New-RandomHex -ByteCount 24
        $adminHash = Get-Sha256Hex -Value $adminPassword
        $operationsConnectionString = "Host=127.0.0.1;Port=$OperationsPort;Database=$operationsDatabase;Username=postgres;Password=$operationsPassword;Include Error Detail=true"
    $timescalePassword = New-RandomHex -ByteCount 24
    $timescaleConnectionString = "Host=127.0.0.1;Port=$TimescalePort;Database=plc_timescale;Username=postgres;Password=$timescalePassword"

        & docker run --detach --name $operationsContainer --tmpfs /var/lib/postgresql/data `
        --publish "127.0.0.1:${OperationsPort}:5432" `
        --env POSTGRES_DB=$operationsDatabase `
        --env POSTGRES_USER=postgres `
        --env POSTGRES_PASSWORD=$operationsPassword `
        postgres:17-alpine
    if ($LASTEXITCODE -ne 0) { throw 'Ephemeral PostgreSQL container failed to start.' }

    $deadline = [DateTime]::UtcNow.AddSeconds($WaitTimeoutSeconds)
    do {
        & docker exec $operationsContainer pg_isready -U postgres -d $operationsDatabase *> $null
        if ($LASTEXITCODE -eq 0) { break }
        Start-Sleep -Seconds 1
    } while ([DateTime]::UtcNow -lt $deadline)
    if ($LASTEXITCODE -ne 0) { throw 'Ephemeral PostgreSQL did not become ready.' }

    $environment = @{
        FII_OPERATIONS_CONNECTION_STRING = $operationsConnectionString
        FII_TIMESCALE_PASSWORD = $timescalePassword
        FII_TIMESCALE_CONNECTION_STRING = $timescaleConnectionString
        FII_JWT_SECRET = $jwtSecret
        FII_MQTT_ENCRYPTION_KEY = $mqttEncryptionKey
        FII_DEMO_MACHINE_CLIENT_ID = $clientId
        FII_MQTT_DEVICE_TOKEN = $mqttDeviceToken
        FII_DEMO_USERNAME = 'w8admin'
        FII_DEMO_PASSWORD = $adminPassword
        FII_LIVE_E2E = '1'
        FII_LIVE_FRONTEND_URL = "http://localhost:$FrontendPort"
        FII_LIVE_MACHINE_ID = $machineId.ToString('D')
        FII_LIVE_ALERT_TITLE = 'Yield Rate Critical Drop'
    }
    $previousEnvironment = @{}
    foreach ($entry in $environment.GetEnumerator()) {
        $previousEnvironment[$entry.Key] = [Environment]::GetEnvironmentVariable($entry.Key, 'Process')
        [Environment]::SetEnvironmentVariable($entry.Key, [string]$entry.Value, 'Process')
    }

    try {
        $powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
        $migrateArguments = @(
            '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
            "`$env:ConnectionStrings__DefaultConnection = '$operationsConnectionString'; & dotnet run --project '$repositoryRoot\backend\backend.csproj' --no-launch-profile -- --database-migrate; exit `$LASTEXITCODE"
        )
        $migrationExit = Invoke-LoggedProcess -FilePath $powershell -ArgumentList $migrateArguments -LogPath $startLog
        if ($migrationExit -ne 0) { throw "Operational database migration exited with code $migrationExit." }

        $seedSql = @"
INSERT INTO production_lines (id, name) VALUES ('$([guid]::NewGuid())', 'W8 Line');
INSERT INTO machines (id, name, machine_code, client_id, ip, status, approval_status)
VALUES ('$machineId', 'W8 Integration Machine', 'W8-$runId', '$clientId', '127.0.0.1', 'offline', 'APPROVED');
INSERT INTO line_machines (line_id, machine_id, sequence_order)
SELECT id, '$machineId', 1 FROM production_lines LIMIT 1;
INSERT INTO users (username, password, role) VALUES ('w8admin', '$adminHash', 'ADMIN');
"@
        $seedSql | & docker exec -i $operationsContainer psql -U postgres -d $operationsDatabase -v ON_ERROR_STOP=1
        if ($LASTEXITCODE -ne 0) { throw 'Ephemeral PostgreSQL seed failed.' }

        $startArguments = @(
            '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $startScript,
            '-BackendPort', [string]$BackendPort,
            '-FrontendPort', [string]$FrontendPort,
            '-MqttPort', [string]$MqttPort,
            '-TimescalePort', [string]$TimescalePort,
            '-TimescaleProjectName', $timescaleProjectName,
            '-CepStagingPort', [string]$CepStagingPort,
            '-WaitTimeoutSeconds', [string]$WaitTimeoutSeconds,
            '-SkipOpenDataFusion', '-SkipFusionAdapter', '-SkipOdysseus'
        )
        $startExit = Invoke-LoggedProcess -FilePath $powershell -ArgumentList $startArguments -LogPath $startLog `
                    -ReadyTimeoutSeconds $WaitTimeoutSeconds `
                    -ReadyUrls @(
                        "http://127.0.0.1:$BackendPort/api/health",
                        "http://127.0.0.1:$FrontendPort/"
                    )
                if ($startExit -ne 0) { throw "Start-FullDemo exited with code $startExit." }

        $testArguments = @(
            '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $testScript,
            '-BackendPort', [string]$BackendPort,
            '-FrontendPort', [string]$FrontendPort,
            '-CepStagingPort', [string]$CepStagingPort,
            '-MqttPort', [string]$MqttPort,
            '-MachineId', $machineId.ToString('D'),
            '-SkipOpenDataFusion', '-SkipOdysseus', '-TriggerPhase2Alerts'
        )
        $testExit = Invoke-LoggedProcess -FilePath $powershell -ArgumentList $testArguments -LogPath $testLog
        if ($testExit -ne 0) { throw "Test-FullDemo exited with code $testExit." }

        $npm = (Get-Command npm.cmd -ErrorAction Stop).Source
        $browserExit = Invoke-LoggedProcess -FilePath $npm -ArgumentList @('--prefix', (Join-Path $repositoryRoot 'frontend'), 'run', 'e2e:live') -LogPath $browserLog
        if ($browserExit -ne 0) { throw "Live Playwright exited with code $browserExit." }

        $runStatus = 'passed'
    }
    finally {
        foreach ($entry in $previousEnvironment.GetEnumerator()) {
            [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'Process')
        }
    }
}
catch {
    $failureMessage = $_.Exception.Message
    Write-Error $failureMessage
}
finally {
    Stop-PortOwner -Port $FrontendPort
    Stop-PortOwner -Port $BackendPort
    Stop-PortOwner -Port $MqttPort
    try { & docker compose -p $cepProjectName -f $cepComposeFile down --volumes --remove-orphans 2>$null | Out-Null } catch { }
    if (-not [string]::IsNullOrWhiteSpace($timescalePassword)) {
        $previousTimescalePassword = [Environment]::GetEnvironmentVariable('FII_TIMESCALE_PASSWORD', 'Process')
        $previousTimescalePort = [Environment]::GetEnvironmentVariable('FII_TIMESCALE_PORT', 'Process')
        [Environment]::SetEnvironmentVariable('FII_TIMESCALE_PASSWORD', $timescalePassword, 'Process')
        [Environment]::SetEnvironmentVariable('FII_TIMESCALE_PORT', [string]$TimescalePort, 'Process')
        try { & docker compose -p $timescaleProjectName -f $timescaleComposeFile down --volumes --remove-orphans 2>$null | Out-Null } catch { }
        [Environment]::SetEnvironmentVariable('FII_TIMESCALE_PASSWORD', $previousTimescalePassword, 'Process')
        [Environment]::SetEnvironmentVariable('FII_TIMESCALE_PORT', $previousTimescalePort, 'Process')
    }
    try { & docker rm --force $operationsContainer 2>$null | Out-Null } catch { }
    Write-Report -Status $runStatus -ErrorMessage $failureMessage
}

if ($runStatus -ne 'passed') { exit 1 }
Write-Host "Integration W8 local pass. Evidence: $reportPath" -ForegroundColor Green
