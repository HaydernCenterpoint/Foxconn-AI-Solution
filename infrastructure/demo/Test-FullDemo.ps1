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
    [int]$CepStagingPort = 58085,

    [string]$Username = '',

    [string]$Password = '',

    [string]$MachineId = '',

    [string]$MachineClientId = '',

    [string]$OperationsConnectionString = '',

    [string]$TimescaleConnectionString = '',

    [switch]$SkipOpenDataFusion,
    [switch]$SkipOdysseus,
    [switch]$SkipTimescale,
    [switch]$SkipCepStaging
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$backendUrl = "http://localhost:$BackendPort"
$frontendUrl = "http://localhost:$FrontendPort"
$odysseusUrl = "http://localhost:$OdysseusPort"
$odfApiUrl = "http://localhost:$OdfApiPort"
$odfWebUrl = "http://localhost:$OdfWebPort"
$cepStagingUrl = "http://localhost:$CepStagingPort"

if ([string]::IsNullOrWhiteSpace($Username)) { $Username = $env:FII_DEMO_USERNAME }
if ([string]::IsNullOrWhiteSpace($Password)) { $Password = $env:FII_DEMO_PASSWORD }
if ([string]::IsNullOrWhiteSpace($MachineId)) { $MachineId = $env:FII_DEMO_MACHINE_ID }
if ([string]::IsNullOrWhiteSpace($MachineClientId)) { $MachineClientId = $env:FII_DEMO_MACHINE_CLIENT_ID }
if ([string]::IsNullOrWhiteSpace($OperationsConnectionString)) { $OperationsConnectionString = $env:FII_OPERATIONS_CONNECTION_STRING }
if ([string]::IsNullOrWhiteSpace($TimescaleConnectionString)) { $TimescaleConnectionString = $env:FII_TIMESCALE_CONNECTION_STRING }
if ([string]::IsNullOrWhiteSpace($Username) -or [string]::IsNullOrWhiteSpace($Password)) {
    throw 'Supply real credentials with -Username/-Password or FII_DEMO_USERNAME/FII_DEMO_PASSWORD.'
}
if ([string]::IsNullOrWhiteSpace($MachineId) -and [string]::IsNullOrWhiteSpace($MachineClientId)) {
    throw 'Select an existing approved machine with -MachineId/-MachineClientId or the matching FII_DEMO environment variable.'
}
if ([string]::IsNullOrWhiteSpace($OperationsConnectionString)) {
    throw 'Supply FII_OPERATIONS_CONNECTION_STRING for raw telemetry and outbox verification.'
}
if (-not $SkipTimescale -and [string]::IsNullOrWhiteSpace($TimescaleConnectionString)) {
    throw 'Supply FII_TIMESCALE_CONNECTION_STRING for source-ID uniqueness verification.'
}

function Get-Psql {
    $command = Get-Command psql.exe -ErrorAction SilentlyContinue
    if ($null -ne $command) { return $command.Source }
    $installed = Get-ChildItem 'C:/Program Files/PostgreSQL' -Filter psql.exe -File -Recurse -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending | Select-Object -First 1
    if ($null -ne $installed) { return $installed.FullName }
    throw 'PostgreSQL psql is required for retained-database smoke verification.'
}

function Invoke-PsqlScalar {
    param(
        [Parameter(Mandatory)][string]$ConnectionString,
        [Parameter(Mandatory)][string]$Sql
    )

    $builder = [System.Data.Common.DbConnectionStringBuilder]::new()
    $builder.ConnectionString = $ConnectionString
    $values = @{}
    foreach ($key in $builder.Keys) { $values[[string]$key] = [string]$builder[$key] }
    $hostName = if ($values.ContainsKey('Host')) { $values.Host } else { $values.Server }
    $database = if ($values.ContainsKey('Database')) { $values.Database } else { $values.'Initial Catalog' }
    $user = if ($values.ContainsKey('Username')) { $values.Username } else { $values.'User ID' }
    if ([string]::IsNullOrWhiteSpace($hostName) -or [string]::IsNullOrWhiteSpace($database) -or [string]::IsNullOrWhiteSpace($user)) {
        throw 'The PostgreSQL connection string must include Host, Database, and Username.'
    }

    $psql = Get-Psql
    $environment = @{
        PGHOST = $hostName
        PGPORT = $(if ($values.ContainsKey('Port')) { $values.Port } else { '5432' })
        PGDATABASE = $database
        PGUSER = $user
        PGPASSWORD = $(if ($values.ContainsKey('Password')) { $values.Password } else { '' })
    }
    $previousEnvironment = @{}
    try {
        foreach ($entry in $environment.GetEnumerator()) {
            $previousEnvironment[$entry.Key] = [Environment]::GetEnvironmentVariable($entry.Key, 'Process')
            [Environment]::SetEnvironmentVariable($entry.Key, [string]$entry.Value, 'Process')
        }
        $output = $Sql | & $psql --no-psqlrc --tuples-only --no-align --set ON_ERROR_STOP=1
        if ($LASTEXITCODE -ne 0) { throw 'A retained-database verification query failed.' }
        return (@($output) -join "`n").Trim()
    }
    finally {
        foreach ($entry in $previousEnvironment.GetEnumerator()) {
            [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'Process')
        }
    }
}

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

function Assert-NoViteHmrClient {
    param([Parameter(Mandatory)][string]$Uri)

    $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 10
    if ($response.Content -match '/@vite/client') {
        throw "Operations UI at '$Uri' is running with the Vite HMR client enabled."
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

function Find-AssetInTree {
    param(
        [Parameter(Mandatory)][object[]]$Nodes,
        [Parameter(Mandatory)][string]$AssetId
    )

    foreach ($node in $Nodes) {
        if ([string]$node.id -eq $AssetId) {
            return $node
        }

        $children = @($node.children)
        if ($children.Count -gt 0) {
            $found = Find-AssetInTree -Nodes $children -AssetId $AssetId
            if ($null -ne $found) {
                return $found
            }
        }
    }

    return $null
}

function Wait-ForValue {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][scriptblock]$Probe,
        [ValidateRange(1, 120)][int]$TimeoutSeconds = 45
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $lastError = $null
    do {
        try {
            $candidate = & $Probe
            if ($null -ne $candidate) {
                return $candidate
            }
        }
        catch {
            $lastError = $_.Exception.Message
        }
        Start-Sleep -Seconds 1
    } while ((Get-Date) -lt $deadline)

    throw "$Name did not become available. Last error: $lastError"
}

function ConvertTo-MqttRemainingLength {
    param([Parameter(Mandatory)][int]$Value)

    $bytes = [System.Collections.Generic.List[byte]]::new()
    do {
        $encoded = $Value % 128
        $Value = [Math]::Floor($Value / 128)
        if ($Value -gt 0) { $encoded = $encoded -bor 128 }
        $bytes.Add([byte]$encoded)
    } while ($Value -gt 0)
    return ,$bytes.ToArray()
}

function Add-MqttString {
    param(
        [Parameter(Mandatory)]
        [AllowEmptyCollection()]
        [System.Collections.Generic.List[byte]]$Buffer,
        [Parameter(Mandatory)][string]$Value
    )

    $bytes = [Text.Encoding]::UTF8.GetBytes($Value)
    if ($bytes.Length -gt 65535) { throw 'MQTT string is too long.' }
    $Buffer.Add([byte]($bytes.Length -shr 8))
    $Buffer.Add([byte]($bytes.Length -band 255))
    $Buffer.AddRange($bytes)
}

function Send-MqttMessage {
    param(
        [Parameter(Mandatory)][string]$Topic,
        [Parameter(Mandatory)][string]$Payload
    )

    $client = [Net.Sockets.TcpClient]::new()
    $stream = $null
    try {
        $client.ReceiveTimeout = 5000
        $client.SendTimeout = 5000
        $client.Connect('127.0.0.1', 1883)
        $stream = $client.GetStream()

        $connectBody = [System.Collections.Generic.List[byte]]::new()
        Add-MqttString -Buffer $connectBody -Value 'MQTT'
        $connectBody.AddRange([byte[]](4, 2, 0, 30))
        Add-MqttString -Buffer $connectBody -Value "fii-demo-smoke-$PID"
        $connectPacket = [System.Collections.Generic.List[byte]]::new()
        $connectPacket.Add([byte]0x10)
        $connectPacket.AddRange([byte[]](ConvertTo-MqttRemainingLength -Value $connectBody.Count))
        $connectPacket.AddRange($connectBody)
        $connectBytes = $connectPacket.ToArray()
        $stream.Write($connectBytes, 0, $connectBytes.Length)

        $connAck = [byte[]]::new(4)
        $offset = 0
        while ($offset -lt $connAck.Length) {
            $read = $stream.Read($connAck, $offset, $connAck.Length - $offset)
            if ($read -eq 0) { throw 'MQTT broker closed the connection before CONNACK.' }
            $offset += $read
        }
        if ($connAck[0] -ne 0x20 -or $connAck[3] -ne 0) {
            throw "MQTT broker rejected the smoke client (code $($connAck[3]))."
        }

        $packetIdentifier = [byte[]](0, 1)
        $publishBody = [System.Collections.Generic.List[byte]]::new()
        Add-MqttString -Buffer $publishBody -Value $Topic
        $publishBody.AddRange($packetIdentifier)
        $publishBody.AddRange([Text.Encoding]::UTF8.GetBytes($Payload))
        $publishPacket = [System.Collections.Generic.List[byte]]::new()
        $publishPacket.Add([byte]0x32)
        $publishPacket.AddRange([byte[]](ConvertTo-MqttRemainingLength -Value $publishBody.Count))
        $publishPacket.AddRange($publishBody)
        $publishBytes = $publishPacket.ToArray()
        $stream.Write($publishBytes, 0, $publishBytes.Length)
        $stream.Flush()

        $pubAck = [byte[]]::new(4)
        $offset = 0
        while ($offset -lt $pubAck.Length) {
            $read = $stream.Read($pubAck, $offset, $pubAck.Length - $offset)
            if ($read -eq 0) { throw 'MQTT broker closed the connection before PUBACK.' }
            $offset += $read
        }
        if ($pubAck[0] -ne 0x40 -or $pubAck[1] -ne 2 -or $pubAck[2] -ne 0 -or $pubAck[3] -ne 1) {
            throw 'MQTT broker returned an invalid PUBACK.'
        }
    }
    finally {
        if ($null -ne $stream) { $stream.Dispose() }
        $client.Dispose()
    }
}

$backendHealth = Get-Json -Name 'Backend health' -Uri "$backendUrl/api/health"
if ([string]$backendHealth.status -ne 'Healthy') {
    throw "Backend reported '$($backendHealth.status)'."
}

Assert-Web -Name 'Operations UI' -Uri $frontendUrl
Assert-NoViteHmrClient -Uri $frontendUrl
Assert-Web -Name 'Asset Browser route' -Uri "$frontendUrl/assets"

$odysseusHealth = $null
if (-not $SkipOdysseus) {
    $odysseusHealth = Get-Json -Name 'Odysseus readiness' -Uri "$odysseusUrl/api/ready"
    if (-not $odysseusHealth.ready) {
        throw 'Odysseus reported not ready.'
    }
}

$odfReady = $null
if (-not $SkipOpenDataFusion) {
    $odfReady = Get-Json -Name 'Open Data Fusion readiness' -Uri "$odfApiUrl/ready"
    if ([string]$odfReady.readiness -ne 'ready') {
        throw "Open Data Fusion reported '$($odfReady.readiness)'."
    }
    $odfHealth = Get-Json -Name 'Open Data Fusion health' -Uri "$odfApiUrl/health"
    if ([string]$odfHealth.authMode -ne 'factory') {
        throw "Open Data Fusion authentication mode is '$($odfHealth.authMode)', expected 'factory'."
    }
    Assert-Web -Name 'Open Data Fusion Web' -Uri $odfWebUrl
}

$cepHealth = $null
if (-not $SkipCepStaging) {
    $cepHealth = Get-Json -Name 'CEP staging health' -Uri "$cepStagingUrl/health"
    if ([string]$cepHealth.status -ne 'healthy') {
        throw "CEP staging reported '$($cepHealth.status)'."
    }
}

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
if (-not $SkipOdysseus) {
    $odysseusSession = Invoke-RestMethod -Uri "$odysseusUrl/api/auth/status" -WebSession $browser -TimeoutSec 10
    if (-not $odysseusSession.authenticated -or [string]$odysseusSession.username -ne $Username.ToLowerInvariant()) {
        throw 'Odysseus did not accept the shared login.'
    }
}
if (-not $SkipOpenDataFusion) {
    $odfSession = Invoke-RestMethod -Uri "$odfWebUrl/api/v1/auth/session" -WebSession $browser -TimeoutSec 10
    if (-not $odfSession.authenticated -or [string]$odfSession.identity.userId -ne $Username.ToLowerInvariant()) {
        throw 'Open Data Fusion did not accept the shared login through its web proxy.'
    }
}

$machines = @(Invoke-RestMethod -Uri "$backendUrl/api/machines" -WebSession $browser -TimeoutSec 10 | ForEach-Object { $_ })
$smokeMachine = if (-not [string]::IsNullOrWhiteSpace($MachineId)) {
    $machines | Where-Object { [string]$_.id -eq $MachineId } | Select-Object -First 1
} else {
    $machines | Where-Object { [string]$_.clientId -eq $MachineClientId } | Select-Object -First 1
}
if ($null -eq $smokeMachine) { throw 'The selected machine does not exist.' }
if ([string]$smokeMachine.approvalStatus -ne 'APPROVED') { throw 'The selected machine is not already approved.' }
$machineId = [string]$smokeMachine.id
$smokeClientId = [string]$smokeMachine.clientId
if ([string]::IsNullOrWhiteSpace($smokeClientId)) { throw 'The selected machine has no MQTT client ID.' }
$machineAsset = Invoke-RestMethod -Uri "$backendUrl/api/assets/$machineId" -WebSession $browser -TimeoutSec 10
if ([string]$machineAsset.id -ne $machineId -or [string]$machineAsset.type -ne 'MACHINE') {
    throw 'The selected machine does not have the matching MACHINE asset UUID.'
}
$assetTree = Invoke-RestMethod -Uri "$backendUrl/api/assets/tree" -WebSession $browser -TimeoutSec 10
if ($null -eq (Find-AssetInTree -Nodes @($assetTree) -AssetId $machineId)) {
    throw 'The asset tree does not contain the selected machine.'
}

$telemetrySequence = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$messageId = [guid]::NewGuid().ToString('D')
$sentAt = [DateTimeOffset]::UtcNow.ToString('O')
$telemetryObject = @{
    protocolVersion = 1
    messageId = $messageId
    messageType = 'telemetry'
    clientId = $smokeClientId
    sentAt = $sentAt
    payload = @{
        machineId = $machineId
        machineName = [string]$smokeMachine.name
        sequence = $telemetrySequence
        status = 'RUNNING'
        plcConnected = $true
        production = @{ qty = 1; time = 1.0; uph = 60; oee = 92.0; yieldRate = 99.0 }
        alarm = @{ active = $false }
    }
}
$telemetry = $telemetryObject | ConvertTo-Json -Depth 6 -Compress
Send-MqttMessage -Topic "client/$smokeClientId/telemetry" -Payload $telemetry

$liveTelemetry = Wait-ForValue -Name 'Live telemetry snapshot' -Probe {
    $snapshots = @(Invoke-RestMethod -Uri "$backendUrl/api/telemetry/live" -WebSession $browser -TimeoutSec 10 | ForEach-Object { $_ })
    $snapshot = $snapshots | Where-Object {
        [string]$_.clientId -eq $smokeClientId -and [string]$_.payload.messageId -eq $messageId
    } | Select-Object -First 1
    if ($null -ne $snapshot) { return $snapshot }
    return $null
}

$escapedMessageId = $messageId.Replace("'", "''")
$expectedEventKey = "telemetry:$machineId`:$messageId"
$escapedEventKey = $expectedEventKey.Replace("'", "''")
$rawAndOutbox = Wait-ForValue -Name 'PostgreSQL raw telemetry and outbox' -Probe {
    $row = Invoke-PsqlScalar -ConnectionString $OperationsConnectionString -Sql @"
SELECT mt.id || '|' || fo.id || '|' || fo.status
FROM machine_telemetry mt
JOIN fusion_outbox fo ON fo.event_key = '$escapedEventKey'
WHERE mt.raw_json->>'messageId' = '$escapedMessageId'
  AND mt.machine_id = '$machineId'::uuid;
"@
    if (-not [string]::IsNullOrWhiteSpace($row)) { return $row }
    return $null
}
$rawParts = $rawAndOutbox.Split('|')
if ($rawParts.Count -ne 3) { throw 'Raw telemetry/outbox correlation returned an invalid result.' }
$sourceId = [Int64]$rawParts[0]
$outboxId = [string]$rawParts[1]

$outboxStatus = Wait-ForValue -Name 'Delivered fusion outbox event' -TimeoutSeconds 60 -Probe {
    $status = Invoke-PsqlScalar -ConnectionString $OperationsConnectionString -Sql @"
SELECT status
FROM fusion_outbox
WHERE id = '$outboxId'::uuid
  AND delivered_at IS NOT NULL
  AND last_error IS NULL;
"@
    if ($status -eq 'DELIVERED') { return $status }
    return $null
}

$timescalePoints = $null
$timescaleRollups = $null
if (-not $SkipTimescale) {
    $timescalePoints = Wait-ForValue -Name 'Timescale dual-write' -Probe {
        $points = @(Invoke-RestMethod -Uri "$backendUrl/api/telemetry/timescale/${machineId}?limit=10" -WebSession $browser -TimeoutSec 10 | ForEach-Object { $_ })
        $matching = @($points | Where-Object {
            [Int64]$_.sourceId -eq $sourceId -and
            [Int64]$_.sequence -eq $telemetrySequence -and
            [string]$_.rawJson -match [regex]::Escape($messageId)
        })
        if ($matching.Count -eq 1) { return $matching }
        return $null
    }
    $timescaleCount = Invoke-PsqlScalar -ConnectionString $TimescaleConnectionString -Sql "SELECT count(*) FROM telemetry_points WHERE source_id = $sourceId;"
    if ($timescaleCount -ne '1') { throw "Timescale source_id $sourceId is not unique." }

    $timescaleRollups = Wait-ForValue -Name 'Timescale hourly rollup' -Probe {
        $rollups = @(Invoke-RestMethod -Uri "$backendUrl/api/telemetry/timescale/$machineId/hourly?limit=4" -WebSession $browser -TimeoutSec 10 | ForEach-Object { $_ })
        if (@($rollups | Where-Object { [Int64]$_.pointCount -gt 0 }).Count -gt 0) { return $rollups }
        return $null
    }
}

$cepEvent = $null
if (-not $SkipCepStaging) {
    $cepEvent = Wait-ForValue -Name 'CEP staging telemetry event' -Probe {
        $events = @(Invoke-RestMethod -Uri "$cepStagingUrl/api/v1/events?asset_id=$machineId" -TimeoutSec 10 | ForEach-Object { $_ })
        $event = $events | Where-Object { [string]$_.source -eq 'backend_telemetry' } | Select-Object -First 1
        if ($null -ne $event) { return $event }
        return $null
    }
}

$fusionTelemetry = $null
if (-not $SkipOpenDataFusion) {
    $odfScopeHeaders = @{
        Authorization = "Bearer $($login.token)"
        'x-odf-tenant-id' = 'demo'
        'x-odf-project-id' = 'north-plant'
    }
    $assetExternalId = [uri]::EscapeDataString("mkz:machine:$machineId")
    $oeeSeriesId = [uri]::EscapeDataString("mkz:ts:$machineId`:oee")
    $from = [uri]::EscapeDataString(([DateTimeOffset]::Parse($sentAt).AddSeconds(-1)).ToString('O'))
    $to = [uri]::EscapeDataString(([DateTimeOffset]::Parse($sentAt).AddSeconds(1)).ToString('O'))
    $telemetryUri = "$odfApiUrl/api/v1/assets/$assetExternalId/telemetry?from=$from&to=$to&timeSeriesExternalId=$oeeSeriesId&limit=10"
    $fusionTelemetry = Wait-ForValue -Name 'Correlated Open Data Fusion telemetry' -TimeoutSeconds 60 -Probe {
        $candidate = Invoke-RestMethod -Uri $telemetryUri -Headers $odfScopeHeaders -TimeoutSec 10
        $points = @($candidate.series | ForEach-Object { @($_.points) })
        if (@($points | Where-Object { [double]$_.value -eq 92.0 }).Count -eq 1) { return $candidate }
        return $null
    }

    $rawLanding = Invoke-RestMethod -Uri "$odfApiUrl/api/v1/platform/ingestion/raw?limit=100" `
        -Headers $odfScopeHeaders -TimeoutSec 10
    $rawObject = @($rawLanding.items | Where-Object { [string]$_.runId -eq $outboxId }) | Select-Object -First 1
    if ($null -eq $rawObject) { throw 'Open Data Fusion raw landing did not correlate to the outbox event ID.' }
    $beforeReplayCount = @($fusionTelemetry.series | ForEach-Object { @($_.points) }).Count
    $replay = Invoke-RestMethod -Method Post -Uri "$odfApiUrl/api/v1/platform/ingestion/raw/$($rawObject.id)/replay" `
        -Headers $odfScopeHeaders -TimeoutSec 20
    if ([string]$replay.replayedFromRawObjectId -ne [string]$rawObject.id) { throw 'Open Data Fusion replay did not identify its source raw object.' }
    $afterReplay = Invoke-RestMethod -Uri $telemetryUri -Headers $odfScopeHeaders -TimeoutSec 10
    $afterReplayCount = @($afterReplay.series | ForEach-Object { @($_.points) }).Count
    if ($afterReplayCount -ne $beforeReplayCount) { throw 'Open Data Fusion replay created duplicate telemetry.' }
}

$ragExports = @()
if (-not $SkipOdysseus) {
    $odysseusPython = Join-Path $repositoryRoot 'Odysseus/venv/Scripts/python.exe'
    $syncScript = Join-Path $repositoryRoot 'Odysseus/scripts/sync_mkz_to_odysseus.py'
    $verifyRagScript = Join-Path $repositoryRoot 'Odysseus/scripts/verify_mkz_rag.py'
    if (-not (Test-Path -LiteralPath $odysseusPython)) { throw 'Odysseus virtual environment is missing.' }

    $previousEnvironment = @{}
    try {
        foreach ($entry in @{
            MKZ_BACKEND_URL = $backendUrl
            MKZ_BACKEND_TOKEN = [string]$login.token
            CHROMADB_HOST = '127.0.0.1'
            CHROMADB_PORT = '8100'
        }.GetEnumerator()) {
            $previousEnvironment[$entry.Key] = [Environment]::GetEnvironmentVariable($entry.Key, 'Process')
            [Environment]::SetEnvironmentVariable($entry.Key, [string]$entry.Value, 'Process')
        }
        & $odysseusPython $syncScript
        if ($LASTEXITCODE -ne 0) { throw 'Odysseus export and Chroma reindex failed.' }
        & $odysseusPython $verifyRagScript
        if ($LASTEXITCODE -ne 0) { throw 'The newest Odysseus export is not queryable from Chroma.' }
    }
    finally {
        foreach ($entry in $previousEnvironment.GetEnumerator()) {
            [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'Process')
        }
    }
    $ragExports = @(Get-ChildItem (Join-Path $repositoryRoot 'Odysseus/data/mkz_exports/rag') -Filter '*.md' -File)
}

Invoke-RestMethod -Method Post -Uri "$backendUrl/api/auth/logout" -WebSession $browser -TimeoutSec 10 | Out-Null
if ((Get-HttpStatus -Uri "$backendUrl/api/auth/session" -WebSession $browser) -ne 401) {
    throw 'Operations remained authenticated after global logout.'
}
if (-not $SkipOdysseus -and (Get-HttpStatus -Uri "$odysseusUrl/api/auth/status" -WebSession $browser) -ne 401) {
    throw 'Odysseus remained authenticated after global logout.'
}
if (-not $SkipOpenDataFusion -and (Get-HttpStatus -Uri "$odfWebUrl/api/v1/auth/session" -WebSession $browser) -ne 401) {
    throw 'Open Data Fusion remained authenticated after global logout.'
}

[pscustomobject]@{
    Backend = $backendHealth.status
    Frontend = 'Healthy'
    Odysseus = $(if ($SkipOdysseus) { 'Skipped' } else { 'Ready' })
    OpenDataFusion = $(if ($SkipOpenDataFusion) { 'Skipped' } else { $odfReady.readiness })
    SharedSso = 'Passed'
    ExistingApprovedMachine = $machineId
    LiveTelemetry = 'Passed'
    PostgreSqlRawAndOutbox = $outboxStatus
    TimescaleRawAndRollup = $(if ($SkipTimescale) { 'Skipped' } else { 'Passed' })
    CepStaging = $(if ($SkipCepStaging) { 'Skipped' } else { 'Passed' })
    FusionTelemetryAndReplay = $(if ($SkipOpenDataFusion) { 'Skipped' } else { 'Passed' })
    ChromaFreshness = $(if ($SkipOdysseus) { 'Skipped' } else { 'Passed' })
    FactoryRagDocuments = $ragExports.Count
}
