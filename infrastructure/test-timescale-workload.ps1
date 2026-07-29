param(
    [ValidateRange(1, 500)]
    [int]$Machines = 50,
    [ValidateRange(1, 10)]
    [int]$Metrics = 10,
    [ValidateRange(1, 30)]
    [int]$Days = 7,
    [ValidateRange(1, 60)]
    [int]$SampleIntervalMinutes = 5,
    [ValidateRange(1, 100)]
    [int]$Concurrency = 32,
    [ValidateRange(1, 32)]
    [int]$Threads = 8,
    [ValidateRange(5, 300)]
    [int]$DurationSeconds = 15,
    [double]$P95TargetMs = 500,
    [double]$QpsTarget = 100,
    [string]$ContainerName = "factory-timescaledb",
    [string]$Database = "factory_db",
    [string]$DatabaseUser = "factory_user",
    [string]$OutputPath
)

$ErrorActionPreference = "Stop"

if ($P95TargetMs -le 0 -or $QpsTarget -le 0) {
    throw "Benchmark targets must be positive."
}
if ($Threads -gt $Concurrency) {
    throw "Threads cannot exceed concurrency."
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$queryPath = Join-Path $repoRoot "factory-ai-platform/data-platform/scripts/telemetry_benchmark.pgbench.sql"
if (-not (Test-Path -LiteralPath $queryPath)) {
    throw "Missing pgbench workload: $queryPath"
}
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path $repoRoot "factory-ai-platform/data-platform/docs/benchmark_telemetry_local.json"
}
elseif (-not [IO.Path]::IsPathRooted($OutputPath)) {
    $OutputPath = Join-Path $repoRoot $OutputPath
}

$container = docker inspect $ContainerName 2>$null | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or $null -eq $container) {
    throw "Timescale container '$ContainerName' is not available."
}
if (-not [bool]$container[0].State.Running) {
    throw "Timescale container '$ContainerName' is not running."
}

function Invoke-Psql {
    param(
        [Parameter(Mandatory)]
        [string]$Sql,
        [switch]$TuplesOnly
    )

    $arguments = @(
        "exec",
        $ContainerName,
        "psql",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        $DatabaseUser,
        "-d",
        $Database
    )
    if ($TuplesOnly) {
        $arguments += @("-A", "-t")
    }
    $arguments += @("-c", $Sql)

    $output = & docker @arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Timescale SQL command failed."
    }
    return $output
}

function Get-Percentile {
    param(
        [Parameter(Mandatory)]
        [double[]]$Values,
        [Parameter(Mandatory)]
        [ValidateRange(0, 1)]
        [double]$Percentile
    )

    if ($Values.Count -eq 0) {
        throw "Cannot calculate a percentile without latency samples."
    }

    $sorted = @($Values | Sort-Object)
    $index = [Math]::Max(0, [Math]::Ceiling($Percentile * $sorted.Count) - 1)
    return [double]$sorted[$index]
}

$suite = "fii-timescale-workload-v1"
$runId = [Guid]::NewGuid().ToString("N")
$containerQueryPath = "/tmp/fii-timescale-$runId.sql"
$logPrefix = "/tmp/fii-timescale-$runId"
$metricsSql = @(
    "temperature",
    "vibration",
    "current_draw",
    "pressure",
    "flow_rate",
    "speed",
    "torque",
    "power",
    "oee",
    "yield_rate"
) | ForEach-Object { "'$_'" }
$metricsArray = $metricsSql -join ", "

$cleanupSql = @"
DELETE FROM telemetry
WHERE asset_id IN (
    SELECT id
    FROM assets
    WHERE metadata ->> 'benchmark_suite' = '$suite'
);
DELETE FROM assets
WHERE metadata ->> 'benchmark_suite' = '$suite';
"@

$seedSql = @"
BEGIN;
$cleanupSql
INSERT INTO assets (id, name, type, metadata)
SELECT
    md5('$suite-' || machine_no::text)::uuid,
    'FII-BENCH-' || lpad(machine_no::text, 3, '0'),
    'machine',
    jsonb_build_object('benchmark_suite', '$suite')
FROM generate_series(1, $Machines) AS machine_no;

WITH benchmark_assets AS (
    SELECT
        md5('$suite-' || machine_no::text)::uuid AS asset_id,
        machine_no
    FROM generate_series(1, $Machines) AS machine_no
),
benchmark_metrics AS (
    SELECT metric, metric_no
    FROM unnest(ARRAY[$metricsArray]::text[]) WITH ORDINALITY AS item(metric, metric_no)
    WHERE metric_no <= $Metrics
),
benchmark_window AS (
    SELECT
        NOW() - make_interval(days => $Days) AS starts_at,
        NOW() AS ends_at
)
INSERT INTO telemetry (time, asset_id, metric, value, tags)
SELECT
    sample_time,
    benchmark_assets.asset_id,
    benchmark_metrics.metric,
    benchmark_assets.machine_no
        + benchmark_metrics.metric_no
        + MOD(EXTRACT(EPOCH FROM sample_time)::bigint / 60, 100) / 10.0,
    jsonb_build_object('benchmark_suite', '$suite')
FROM benchmark_assets
CROSS JOIN benchmark_metrics
CROSS JOIN benchmark_window
CROSS JOIN LATERAL generate_series(
    benchmark_window.starts_at,
    benchmark_window.ends_at,
    make_interval(mins => $SampleIntervalMinutes)
) AS sample_time;
COMMIT;
ANALYZE telemetry;
"@

$benchmarkFailure = $null
try {
    Write-Host "Seeding $Machines machines x $Metrics metrics x $Days days..."
    Invoke-Psql -Sql $seedSql | Out-Null

    $expectedSamplesPerSeries = [Math]::Floor(($Days * 24 * 60) / $SampleIntervalMinutes) + 1
    $expectedRows = [int64]$Machines * $Metrics * $expectedSamplesPerSeries
    $seededRowsText = Invoke-Psql -TuplesOnly -Sql @"
SELECT count(*)
FROM telemetry
WHERE tags ->> 'benchmark_suite' = '$suite';
"@
    $seededRows = [int64]($seededRowsText | Select-Object -First 1).Trim()
    if ($seededRows -ne $expectedRows) {
        throw "Expected $expectedRows benchmark rows but found $seededRows."
    }

    docker cp $queryPath "${ContainerName}:$containerQueryPath" | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Could not copy the pgbench workload into '$ContainerName'."
    }

    Write-Host "Running pgbench with $Concurrency clients for $DurationSeconds seconds..."
    $pgbenchOutput = @(
        & docker exec $ContainerName pgbench `
            -n `
            -c $Concurrency `
            -j $Threads `
            -T $DurationSeconds `
            -r `
            -l `
            "--log-prefix=$logPrefix" `
            -D "machines=$Machines" `
            -D "metrics=$Metrics" `
            -D "days=$Days" `
            -f $containerQueryPath `
            -U $DatabaseUser `
            $Database 2>&1
    )
    $pgbenchExitCode = $LASTEXITCODE
    $pgbenchOutput | ForEach-Object { Write-Host $_ }
    if ($pgbenchExitCode -ne 0) {
        throw "pgbench failed with exit code $pgbenchExitCode."
    }

    $tpsLine = $pgbenchOutput | Where-Object { $_ -match "^tps = ([0-9.]+)" } | Select-Object -Last 1
    if ($null -eq $tpsLine -or $tpsLine -notmatch "^tps = ([0-9.]+)") {
        throw "pgbench did not report throughput."
    }
    $throughputQps = [double]::Parse(
        $Matches[1],
        [Globalization.CultureInfo]::InvariantCulture
    )

    $failedLine = $pgbenchOutput |
        Where-Object { $_ -match "^number of failed transactions: ([0-9]+)" } |
        Select-Object -Last 1
    $failedTransactions = 0
    if ($null -ne $failedLine -and $failedLine -match "^number of failed transactions: ([0-9]+)") {
        $failedTransactions = [int]$Matches[1]
    }

    $logFiles = @(
        docker exec $ContainerName sh -lc "ls -1 '$logPrefix'.* 2>/dev/null"
    ) | Where-Object { $_ -notlike "*.sql" }
    if ($LASTEXITCODE -ne 0 -or $logFiles.Count -eq 0) {
        throw "pgbench transaction logs were not created."
    }

    $latenciesUs = [Collections.Generic.List[double]]::new()
    foreach ($logFile in $logFiles) {
        $lines = @(docker exec $ContainerName cat $logFile)
        if ($LASTEXITCODE -ne 0) {
            throw "Could not read pgbench log '$logFile'."
        }
        foreach ($line in $lines) {
            $fields = $line.Trim() -split "\s+"
            if ($fields.Count -lt 3) {
                continue
            }
            $latencyUs = 0.0
            if ([double]::TryParse(
                $fields[2],
                [Globalization.NumberStyles]::Float,
                [Globalization.CultureInfo]::InvariantCulture,
                [ref]$latencyUs
            )) {
                $latenciesUs.Add($latencyUs)
            }
        }
    }
    if ($latenciesUs.Count -eq 0) {
        throw "No transaction latency samples were found."
    }

    $latenciesMs = @($latenciesUs | ForEach-Object { $_ / 1000.0 })
    $p50Ms = Get-Percentile -Values $latenciesMs -Percentile 0.50
    $p95Ms = Get-Percentile -Values $latenciesMs -Percentile 0.95
    $p99Ms = Get-Percentile -Values $latenciesMs -Percentile 0.99
    $databaseVersion = (
        Invoke-Psql -TuplesOnly -Sql @"
SELECT current_setting('server_version')
    || ' / TimescaleDB '
    || (SELECT extversion FROM pg_extension WHERE extname = 'timescaledb');
"@ |
        Select-Object -First 1
    ).Trim()
    $logicalProcessors = (
        Get-CimInstance Win32_ComputerSystem -ErrorAction SilentlyContinue
    ).NumberOfLogicalProcessors
    $totalMemoryBytes = (
        Get-CimInstance Win32_ComputerSystem -ErrorAction SilentlyContinue
    ).TotalPhysicalMemory

    $passed = (
        $failedTransactions -eq 0 -and
        $p95Ms -lt $P95TargetMs -and
        $throughputQps -gt $QpsTarget
    )
    $report = [ordered]@{
        generatedAt = [DateTimeOffset]::UtcNow.ToString("o")
        environment = [ordered]@{
            container = $ContainerName
            databaseVersion = $databaseVersion
            logicalProcessors = $logicalProcessors
            totalMemoryGb = if ($totalMemoryBytes) {
                [Math]::Round($totalMemoryBytes / 1GB, 2)
            } else {
                $null
            }
        }
        workload = [ordered]@{
            query = "one-week hourly average for one random machine/metric pair"
            machines = $Machines
            metrics = $Metrics
            days = $Days
            sampleIntervalMinutes = $SampleIntervalMinutes
            seededRows = $seededRows
            concurrency = $Concurrency
            threads = $Threads
            durationSeconds = $DurationSeconds
            samples = $latenciesMs.Count
        }
        results = [ordered]@{
            failedTransactions = $failedTransactions
            throughputQps = [Math]::Round($throughputQps, 2)
            p50Ms = [Math]::Round($p50Ms, 2)
            p95Ms = [Math]::Round($p95Ms, 2)
            p99Ms = [Math]::Round($p99Ms, 2)
        }
        targets = [ordered]@{
            p95MsLessThan = $P95TargetMs
            throughputQpsGreaterThan = $QpsTarget
        }
        passed = $passed
        boundary = "Database query-path benchmark; it does not measure HTTP or MQTT ingestion."
    }

    $outputDirectory = Split-Path -Parent $OutputPath
    if (-not [string]::IsNullOrWhiteSpace($outputDirectory)) {
        New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
    }
    $report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $OutputPath -Encoding utf8

    Write-Host (
        "Timescale workload: p95={0:N2}ms, throughput={1:N2} qps, rows={2}, pass={3}" -f
        $p95Ms,
        $throughputQps,
        $seededRows,
        $passed
    )
    Write-Host "Report: $OutputPath"

    if (-not $passed) {
        $benchmarkFailure = "Telemetry benchmark missed one or more targets."
    }
}
catch {
    $benchmarkFailure = $_.Exception.Message
}
finally {
    try {
        Write-Host "Removing synthetic benchmark data..."
        Invoke-Psql -Sql $cleanupSql | Out-Null
    }
    catch {
        if ($null -eq $benchmarkFailure) {
            $benchmarkFailure = "Benchmark cleanup failed: $($_.Exception.Message)"
        }
        else {
            Write-Warning "Benchmark cleanup also failed: $($_.Exception.Message)"
        }
    }

    docker exec $ContainerName sh -lc "rm -f '$containerQueryPath' '$logPrefix'.*" 2>$null | Out-Null
}

if ($null -ne $benchmarkFailure) {
    throw $benchmarkFailure
}
