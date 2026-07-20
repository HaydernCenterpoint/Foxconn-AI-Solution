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

        $publishBody = [System.Collections.Generic.List[byte]]::new()
        Add-MqttString -Buffer $publishBody -Value $Topic
        $publishBody.AddRange([Text.Encoding]::UTF8.GetBytes($Payload))
        $publishPacket = [System.Collections.Generic.List[byte]]::new()
        $publishPacket.Add([byte]0x30)
        $publishPacket.AddRange([byte[]](ConvertTo-MqttRemainingLength -Value $publishBody.Count))
        $publishPacket.AddRange($publishBody)
        $publishBytes = $publishPacket.ToArray()
        $stream.Write($publishBytes, 0, $publishBytes.Length)
        $stream.Flush()
        Start-Sleep -Milliseconds 100
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

$authHeaders = @{ Authorization = "Bearer $($login.token)" }
$smokeClientId = 'fii-demo-smoke-client'
$machines = Invoke-RestMethod -Uri "$backendUrl/api/machines" -WebSession $browser -TimeoutSec 10
$smokeMachine = $machines | Where-Object { [string]$_.clientId -eq $smokeClientId } | Select-Object -First 1
if ($null -eq $smokeMachine) {
    $machineBody = @{
        name = 'FII Demo Smoke Machine'
        machineCode = 'FII-SMOKE-01'
        ip = '127.0.0.1'
        clientId = $smokeClientId
    } | ConvertTo-Json -Compress
    $smokeMachine = Invoke-RestMethod -Method Post -Uri "$backendUrl/api/machines" -Headers $authHeaders `
        -ContentType 'application/json' -Body $machineBody -TimeoutSec 10
}
$machineId = [string]$smokeMachine.id
if ([string]$smokeMachine.approvalStatus -ne 'APPROVED') {
    Invoke-RestMethod -Method Post -Uri "$backendUrl/api/machines/$machineId/approve" -Headers $authHeaders `
        -WebSession $browser -TimeoutSec 10 | Out-Null
}
$telemetry = @{
    protocolVersion = 1
    messageId = [guid]::NewGuid().ToString()
    messageType = 'telemetry'
    clientId = $smokeClientId
    sentAt = [DateTimeOffset]::UtcNow.ToString('O')
    payload = @{
        machineId = $machineId
        machineName = 'FII Demo Smoke Machine'
        sequence = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        status = 'RUNNING'
        plcConnected = $true
        production = @{ qty = 42; time = 1.5; uph = 480; oee = 91.2; yieldRate = 98.7 }
    }
} | ConvertTo-Json -Depth 6 -Compress
Send-MqttMessage -Topic "client/$smokeClientId/telemetry" -Payload $telemetry

$odfScopeHeaders = @{ 'x-odf-tenant-id' = 'demo'; 'x-odf-project-id' = 'north-plant' }
$assetExternalId = [uri]::EscapeDataString("mkz:machine:$machineId")
$fusionTelemetry = $null
$lastFusionError = $null
$fusionDeadline = (Get-Date).AddSeconds(45)
do {
    try {
        $candidate = Invoke-RestMethod -Uri "$odfWebUrl/api/v1/assets/$assetExternalId/telemetry/latest" `
            -Headers $odfScopeHeaders -WebSession $browser -TimeoutSec 10
        if (@($candidate.series | Where-Object { $null -ne $_.point }).Count -gt 0) {
            $fusionTelemetry = $candidate
            break
        }
    }
    catch {
        $lastFusionError = $_.Exception.Message
    }
    Start-Sleep -Seconds 1
} while ((Get-Date) -lt $fusionDeadline)
if ($null -eq $fusionTelemetry) {
    throw "Telemetry did not traverse Backend -> Fusion Adapter -> Open Data Fusion. Last error: $lastFusionError"
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
    FusionTelemetry = 'Passed'
    FactoryRagDocuments = $ragExports.Count
}
