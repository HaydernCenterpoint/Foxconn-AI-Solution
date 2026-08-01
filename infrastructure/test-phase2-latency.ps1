param(
    [string]$BaseUrl = "http://127.0.0.1:5165",
    [Parameter(Mandatory = $true)]
    [Guid]$AssetId,
    [ValidateRange(5, 500)]
    [int]$Samples = 30,
    [ValidateRange(1, 100)]
    [int]$Concurrency = 8,
    [double]$AlertP95TargetMs = 1000,
    [double]$PredictionP95TargetMs = 200,
    [string]$OutputPath
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Net.Http

function Get-Percentile {
    param(
        [double[]]$Values,
        [ValidateRange(0, 1)]
        [double]$Percentile
    )

    $sorted = $Values | Sort-Object
    $index = [Math]::Max(0, [Math]::Ceiling($Percentile * $sorted.Count) - 1)
    return [Math]::Round($sorted[$index], 2)
}

function Measure-Endpoint {
    param(
        [System.Net.Http.HttpClient]$Client,
        [string]$Name,
        [string]$Path,
        [int]$Count,
        [double]$TargetMs
    )

    # Warm the application, connection pool, Timescale chunks, and query plan.
    for ($warmupIndex = 0; $warmupIndex -lt 5; $warmupIndex++) {
        $warmup = $Client.GetAsync($Path).GetAwaiter().GetResult()
        try {
            $warmup.EnsureSuccessStatusCode() | Out-Null
        }
        finally {
            $warmup.Dispose()
        }
    }

    $latencies = [System.Collections.Generic.List[double]]::new()
    for ($index = 0; $index -lt $Count; $index++) {
        $timer = [System.Diagnostics.Stopwatch]::StartNew()
        $response = $Client.GetAsync($Path).GetAwaiter().GetResult()
        try {
            $response.EnsureSuccessStatusCode() | Out-Null
        }
        finally {
            $timer.Stop()
            $response.Dispose()
        }
        $latencies.Add($timer.Elapsed.TotalMilliseconds)
    }

    $p50 = Get-Percentile -Values $latencies.ToArray() -Percentile 0.50
    $p95 = Get-Percentile -Values $latencies.ToArray() -Percentile 0.95
    return [pscustomobject]@{
        name = $Name
        samples = $Count
        p50Ms = $p50
        p95Ms = $p95
        maxMs = [Math]::Round(($latencies | Measure-Object -Maximum).Maximum, 2)
        targetP95Ms = $TargetMs
        passed = $p95 -lt $TargetMs
    }
}

function Test-BoundedLoad {
    param(
        [System.Net.Http.HttpClient]$Client,
        [string]$Path,
        [int]$ParallelRequests
    )

    $timer = [System.Diagnostics.Stopwatch]::StartNew()
    $tasks = [System.Collections.Generic.List[System.Threading.Tasks.Task[System.Net.Http.HttpResponseMessage]]]::new()
    for ($index = 0; $index -lt $ParallelRequests; $index++) {
        $tasks.Add($Client.GetAsync($Path))
    }

    $responses = [System.Collections.Generic.List[System.Net.Http.HttpResponseMessage]]::new()
    try {
        foreach ($task in $tasks) {
            $response = $task.GetAwaiter().GetResult()
            $responses.Add($response)
            $response.EnsureSuccessStatusCode() | Out-Null
        }
    }
    finally {
        $timer.Stop()
        foreach ($response in $responses) {
            $response.Dispose()
        }
    }

    return [pscustomobject]@{
        requests = $ParallelRequests
        elapsedMs = [Math]::Round($timer.Elapsed.TotalMilliseconds, 2)
        requestsPerSecond = [Math]::Round($ParallelRequests / $timer.Elapsed.TotalSeconds, 2)
        passed = $responses.Count -eq $ParallelRequests
    }
}

$client = [System.Net.Http.HttpClient]::new()
$client.BaseAddress = [Uri]::new($BaseUrl.TrimEnd("/") + "/")
$client.Timeout = [TimeSpan]::FromSeconds(10)

try {
    $alertPath = "api/v1/alerts?assetId=$AssetId&limit=10"
    $predictionPath = "api/v1/predictions/risk/$AssetId`?window=1h"

    $alert = Measure-Endpoint `
        -Client $client `
        -Name "alert-query" `
        -Path $alertPath `
        -Count $Samples `
        -TargetMs $AlertP95TargetMs
    $prediction = Measure-Endpoint `
        -Client $client `
        -Name "failure-risk" `
        -Path $predictionPath `
        -Count $Samples `
        -TargetMs $PredictionP95TargetMs
    $load = Test-BoundedLoad `
        -Client $client `
        -Path $alertPath `
        -ParallelRequests $Concurrency

    $result = [pscustomobject]@{
        measuredAtUtc = [DateTime]::UtcNow.ToString("O")
        baseUrl = $BaseUrl
        assetId = $AssetId
        alert = $alert
        prediction = $prediction
        boundedLoad = $load
        passed = $alert.passed -and $prediction.passed -and $load.passed
    }

    $json = $result | ConvertTo-Json -Depth 5
    Write-Output $json
    if ($OutputPath) {
        $json | Set-Content -LiteralPath $OutputPath -Encoding UTF8
    }

    if (-not $result.passed) {
        throw "Phase 2 latency/load gate failed."
    }
}
finally {
    $client.Dispose()
}
