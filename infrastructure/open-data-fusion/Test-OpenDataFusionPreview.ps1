[CmdletBinding()]
param(
    [uri]$ApiBaseUrl = 'http://127.0.0.1:54310/',

    [uri]$WebBaseUrl = 'http://127.0.0.1:58088/',

    [ValidateNotNullOrEmpty()]
    [string]$DevelopmentUser = 'local-user'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-LoopbackUri {
    param(
        [Parameter(Mandatory)]
        [uri]$Uri,

        [Parameter(Mandatory)]
        [string]$Name
    )

    if (-not $Uri.IsLoopback) {
        throw "$Name must be a loopback URL. This preview smoke test will not write to staging or production."
    }
}

function Invoke-OdfApi {
    param(
        [Parameter(Mandatory)]
        [ValidateSet('GET', 'POST')]
        [string]$Method,

        [Parameter(Mandatory)]
        [string]$Path,

        [hashtable]$Headers = @{},

        [object]$Body
    )

    $parameters = @{
        Uri = "$script:ApiRoot$Path"
        Method = $Method
        Headers = $Headers
    }

    if ($PSBoundParameters.ContainsKey('Body')) {
        $parameters.ContentType = 'application/json'
        $parameters.Body = $Body | ConvertTo-Json -Depth 12 -Compress
    }

    return Invoke-RestMethod @parameters
}

Assert-LoopbackUri -Uri $ApiBaseUrl -Name 'ApiBaseUrl'
Assert-LoopbackUri -Uri $WebBaseUrl -Name 'WebBaseUrl'

$script:ApiRoot = $ApiBaseUrl.AbsoluteUri.TrimEnd('/')
$ready = Invoke-OdfApi -Method GET -Path '/ready'
if ($ready.readiness -ne 'ready') {
    throw "ODF API is not ready. Received readiness '$($ready.readiness)'."
}

$web = Invoke-WebRequest -Uri $WebBaseUrl.AbsoluteUri -UseBasicParsing
if ($web.StatusCode -ne 200) {
    throw "ODF Web returned HTTP $($web.StatusCode)."
}

$tenantId = [guid]::NewGuid().ToString()
$projectId = [guid]::NewGuid().ToString()
$machineId = [guid]::NewGuid().ToString()
$runId = [guid]::NewGuid().ToString()

$identityHeaders = @{ 'x-odf-user' = $DevelopmentUser }
$null = Invoke-OdfApi -Method POST -Path '/api/v1/platform/tenants' -Headers $identityHeaders -Body @{
    id = $tenantId
    name = 'MKZ Local Preview Validation Tenant'
}

$null = Invoke-OdfApi -Method POST -Path "/api/v1/platform/tenants/$tenantId/projects" -Headers $identityHeaders -Body @{
    id = $projectId
    slug = 'mkz-local-preview-validation'
    name = 'MKZ Local Preview Validation'
    description = 'Synthetic local-only Open Data Fusion validation scope'
}

$scopeHeaders = @{
    'x-odf-user' = $DevelopmentUser
    'x-odf-tenant-id' = $tenantId
    'x-odf-project-id' = $projectId
}
$plantExternalId = 'mkz:plant:local-preview'
$machineExternalId = "mkz:machine:$($machineId)"
$timeSeriesExternalId = "mkz:ts:$($machineId):production_qty"
$timestamp = [DateTimeOffset]::UtcNow.ToString('O')

$bundle = [ordered]@{
    source = [ordered]@{
        system = 'mkz-odf-local-smoke'
        runId = $runId
        actor = 'mkz-validation'
    }
    assets = @(
        [ordered]@{
            externalId = $plantExternalId
            name = 'MKZ Local Preview Plant'
            type = 'Plant'
            parentExternalId = $null
            metadata = @{ sourceSystem = 'mkz-odf-local-smoke' }
        },
        [ordered]@{
            externalId = $machineExternalId
            name = 'MKZ Local Preview Machine'
            type = 'Machine'
            parentExternalId = $plantExternalId
            metadata = @{
                sourceSystem = 'mkz-odf-local-smoke'
                machineId = $machineId
            }
        }
    )
    timeSeries = @(
        [ordered]@{
            externalId = $timeSeriesExternalId
            assetExternalId = $machineExternalId
            name = 'Production quantity'
            unit = $null
        }
    )
    dataPoints = @(
        [ordered]@{
            timeSeriesExternalId = $timeSeriesExternalId
            timestamp = $timestamp
            value = 42
            quality = 'good'
        }
    )
    documents = @()
    relations = @()
}

$ingest = Invoke-OdfApi -Method POST -Path '/api/v1/ingest/bundle' -Headers $scopeHeaders -Body $bundle
if ($ingest.status -ne 'completed') {
    throw "ODF ingest did not complete. Received status '$($ingest.status)'."
}

if ($ingest.counts.assets -ne 2 -or $ingest.counts.timeSeries -ne 1 -or $ingest.counts.dataPoints -ne 1) {
    throw 'ODF ingest returned unexpected entity counts.'
}

$encodedMachineId = [uri]::EscapeDataString($machineExternalId)
$encodedTimeSeriesId = [uri]::EscapeDataString($timeSeriesExternalId)
$latest = Invoke-OdfApi -Method GET -Path "/api/v1/assets/$encodedMachineId/telemetry/latest?timeSeriesExternalId=$encodedTimeSeriesId" -Headers $scopeHeaders
$series = @($latest.series | Where-Object { $_.externalId -eq $timeSeriesExternalId })

if ($series.Count -ne 1) {
    throw "Expected exactly one time series '$timeSeriesExternalId' in the latest telemetry response."
}

$point = $series[0].point
if ($null -eq $point -or [double]$point.value -ne 42 -or $point.quality -ne 'good') {
    throw 'ODF latest telemetry did not round-trip the expected 42/good point.'
}

[pscustomobject]@{
    ApiUrl = $script:ApiRoot
    WebUrl = $WebBaseUrl.AbsoluteUri
    TenantId = $tenantId
    ProjectId = $projectId
    MachineExternalId = $machineExternalId
    TimeSeriesExternalId = $timeSeriesExternalId
    IngestStatus = $ingest.status
    IngestCounts = $ingest.counts
    LatestPoint = $point
}
