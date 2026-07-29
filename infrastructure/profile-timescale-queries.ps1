param(
    [ValidateRange(1, 500)]
    [int]$Machines = 50,
    [ValidateRange(1, 10)]
    [int]$Metrics = 10,
    [ValidateRange(1, 30)]
    [int]$Days = 7,
    [ValidateRange(1, 60)]
    [int]$SampleIntervalMinutes = 5,
    [ValidateRange(1, 10000)]
    [int]$Limit = 10000,
    [string]$ContainerName = "factory-timescaledb",
    [string]$DatabaseUser = "factory_user",
    [string]$OutputPath
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false
$repoRoot = Split-Path -Parent $PSScriptRoot
$migrationPath = Join-Path $repoRoot "factory-ai-platform/data-platform/migrations/001_timescale_setup.sql"
if (-not (Test-Path -LiteralPath $migrationPath)) {
    throw "Missing TimescaleDB migration: $migrationPath"
}
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path $repoRoot "factory-ai-platform/data-platform/docs/profile_telemetry_queries_local.json"
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
        [string]$Database,
        [Parameter(Mandatory)]
        [string]$Sql,
        [switch]$TuplesOnly
    )

    $arguments = @(
        "exec",
        $ContainerName,
        "env",
        "PGOPTIONS=-c client_min_messages=error",
        "psql",
        "-q",
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

    $output = @(& docker @arguments 2>&1)
    if ($LASTEXITCODE -ne 0) {
        throw "Timescale SQL command failed: $($output -join [Environment]::NewLine)"
    }
    return $output
}

function Invoke-Explain {
    param(
        [Parameter(Mandatory)]
        [string]$Database,
        [Parameter(Mandatory)]
        [string]$Sql
    )

    $json = (
        Invoke-Psql `
            -Database $Database `
            -TuplesOnly `
            -Sql "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) $Sql" |
        Out-String
    ).Trim()
    if ([string]::IsNullOrWhiteSpace($json)) {
        throw "EXPLAIN returned no plan."
    }
    return @($json | ConvertFrom-Json)[0]
}

function Get-PlanSummary {
    param(
        [Parameter(Mandatory)]
        [object]$Explain
    )

    $plan = $Explain.Plan
    return [ordered]@{
        planningTimeMs = [Math]::Round([double]$Explain.'Planning Time', 3)
        executionTimeMs = [Math]::Round([double]$Explain.'Execution Time', 3)
        nodeType = [string]$plan.'Node Type'
        actualRows = [int64]$plan.'Actual Rows'
        sharedHitBlocks = [int64]$plan.'Shared Hit Blocks'
        sharedReadBlocks = [int64]$plan.'Shared Read Blocks'
        tempReadBlocks = [int64]$plan.'Temp Read Blocks'
        tempWrittenBlocks = [int64]$plan.'Temp Written Blocks'
    }
}

$profileId = [Guid]::NewGuid().ToString("N")
$profileDatabase = "fii_profile_$($profileId.Substring(0, 12))"
$containerMigrationPath = "/tmp/fii-timescale-profile-$profileId.sql"
$suite = "fii-timescale-query-profile-v1"
$metricNames = @(
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
)[0..($Metrics - 1)]
$metricsArray = ($metricNames | ForEach-Object { "'$_'" }) -join ", "
$endTime = [DateTime]::UtcNow.Date
$startTime = $endTime.AddDays(-$Days)
$startSql = $startTime.ToString(
    "yyyy-MM-ddTHH:mm:ss'Z'",
    [Globalization.CultureInfo]::InvariantCulture
)
$endSql = $endTime.ToString(
    "yyyy-MM-ddTHH:mm:ss'Z'",
    [Globalization.CultureInfo]::InvariantCulture
)
$samplesPerSeries = [int][Math]::Ceiling(($Days * 24 * 60) / $SampleIntervalMinutes)
$expectedRows = [int64]$Machines * $Metrics * $samplesPerSeries
$report = $null
$failure = $null
$databaseCreated = $false

try {
    $existing = (
        Invoke-Psql `
            -Database "postgres" `
            -TuplesOnly `
            -Sql "SELECT 1 FROM pg_database WHERE datname = '$profileDatabase';" |
        Out-String
    ).Trim()
    if ($existing) {
        throw "Refusing to overwrite existing database '$profileDatabase'."
    }

    docker cp $migrationPath "${ContainerName}:$containerMigrationPath" | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Could not copy the TimescaleDB migration into '$ContainerName'."
    }

    docker exec $ContainerName createdb -U $DatabaseUser $profileDatabase
    if ($LASTEXITCODE -ne 0) {
        throw "Could not create isolated profile database '$profileDatabase'."
    }
    $databaseCreated = $true

    Write-Host "Applying TimescaleDB schema in isolated database..."
    $migrationOutput = @(
        docker exec $ContainerName env `
            "PGOPTIONS=-c client_min_messages=error" `
            psql `
            -q `
            -v ON_ERROR_STOP=1 `
            -U $DatabaseUser `
            -d $profileDatabase `
            -f $containerMigrationPath 2>&1
    )
    if ($LASTEXITCODE -ne 0) {
        throw "TimescaleDB migration failed: $($migrationOutput -join [Environment]::NewLine)"
    }
    Invoke-Psql -Database $profileDatabase -Sql @"
SELECT remove_continuous_aggregate_policy(
    'telemetry_hourly',
    if_exists => TRUE
);
SELECT remove_continuous_aggregate_policy(
    'telemetry_daily',
    if_exists => TRUE
);
"@ | Out-Null

    Write-Host "Seeding $Machines machines x $Metrics metrics x $Days days..."
    Invoke-Psql -Database $profileDatabase -Sql @"
INSERT INTO assets (id, name, type, metadata)
SELECT
    md5('$suite-' || machine_no::text)::uuid,
    'FII-PROFILE-' || lpad(machine_no::text, 3, '0'),
    'machine',
    jsonb_build_object('benchmark_suite', '$suite')
FROM generate_series(1, $Machines) AS machine_no;

WITH profile_assets AS (
    SELECT
        md5('$suite-' || machine_no::text)::uuid AS asset_id,
        machine_no
    FROM generate_series(1, $Machines) AS machine_no
),
profile_metrics AS (
    SELECT metric, metric_no
    FROM unnest(ARRAY[$metricsArray]::text[]) WITH ORDINALITY AS item(metric, metric_no)
)
INSERT INTO telemetry (time, asset_id, metric, value, tags)
SELECT
    sample_time,
    profile_assets.asset_id,
    profile_metrics.metric,
    profile_assets.machine_no
        + profile_metrics.metric_no
        + MOD(EXTRACT(EPOCH FROM sample_time)::bigint / 60, 100) / 10.0,
    jsonb_build_object('benchmark_suite', '$suite')
FROM profile_assets
CROSS JOIN profile_metrics
CROSS JOIN generate_series(
    '$startSql'::timestamptz,
    '$endSql'::timestamptz - make_interval(mins => $SampleIntervalMinutes),
    make_interval(mins => $SampleIntervalMinutes)
) AS sample_time;

ANALYZE telemetry;
"@ | Out-Null
    Invoke-Psql -Database $profileDatabase -Sql @"
CALL refresh_continuous_aggregate(
    'telemetry_hourly',
    '$startSql'::timestamptz,
    '$endSql'::timestamptz
);
"@ | Out-Null
    Invoke-Psql -Database $profileDatabase -Sql @"
CALL refresh_continuous_aggregate(
    'telemetry_daily',
    '$startSql'::timestamptz,
    '$endSql'::timestamptz
);
"@ | Out-Null

    $seededRows = [int64]((
        Invoke-Psql `
            -Database $profileDatabase `
            -TuplesOnly `
            -Sql "SELECT count(*) FROM telemetry;" |
        Select-Object -First 1
    ).Trim())
    if ($seededRows -ne $expectedRows) {
        throw "Expected $expectedRows telemetry rows but found $seededRows."
    }

    $hourlyRows = [int64]((
        Invoke-Psql `
            -Database $profileDatabase `
            -TuplesOnly `
            -Sql "SELECT count(*) FROM telemetry_hourly WHERE bucket >= '$startSql' AND bucket < '$endSql';" |
        Select-Object -First 1
    ).Trim())
    $dailyRows = [int64]((
        Invoke-Psql `
            -Database $profileDatabase `
            -TuplesOnly `
            -Sql "SELECT count(*) FROM telemetry_daily WHERE bucket >= '$startSql' AND bucket < '$endSql';" |
        Select-Object -First 1
    ).Trim())

    $profiles = @(
        [ordered]@{
            id = "hourly_avg"
            description = "Unbounded fleet-wide hourly average over the isolated seven-day dataset"
            bucket = "1 hour"
            rawExpression = "AVG(value)"
            rollupColumn = "avg_value"
            rollupTable = "telemetry_hourly"
        },
        [ordered]@{
            id = "hourly_min"
            description = "Unbounded fleet-wide hourly minimum over the isolated seven-day dataset"
            bucket = "1 hour"
            rawExpression = "MIN(value)"
            rollupColumn = "min_value"
            rollupTable = "telemetry_hourly"
        },
        [ordered]@{
            id = "daily_max"
            description = "Unbounded fleet-wide daily maximum over the isolated seven-day dataset"
            bucket = "1 day"
            rawExpression = "MAX(value)"
            rollupColumn = "max_value"
            rollupTable = "telemetry_daily"
        }
    )

    $queryReports = @()
    foreach ($profile in $profiles) {
        $beforeSql = @"
SELECT
    time_bucket('$($profile.bucket)', time) AS time,
    asset_id,
    metric,
    $($profile.rawExpression) AS value
FROM telemetry
GROUP BY 1, 2, 3
ORDER BY time DESC
LIMIT $Limit
"@
        $afterSql = @"
SELECT
    bucket AS time,
    asset_id,
    metric,
    $($profile.rollupColumn) AS value
FROM $($profile.rollupTable)
ORDER BY bucket DESC
LIMIT $Limit
"@
        $paritySql = @"
WITH raw AS (
    SELECT
        time_bucket('$($profile.bucket)', time) AS time,
        asset_id,
        metric,
        $($profile.rawExpression) AS value
    FROM telemetry
    GROUP BY 1, 2, 3
),
rollup AS (
    SELECT
        bucket AS time,
        asset_id,
        metric,
        $($profile.rollupColumn) AS value
    FROM $($profile.rollupTable)
)
SELECT json_build_object(
    'comparedRows', count(*),
    'mismatchedRows', count(*) FILTER (
        WHERE raw.time IS NULL
           OR rollup.time IS NULL
           OR (
               raw.value IS DISTINCT FROM rollup.value
               AND (
                   raw.value IS NULL
                   OR rollup.value IS NULL
                   OR abs(raw.value - rollup.value) > 0.000000001
               )
           )
    ),
    'maxAbsoluteDelta', COALESCE(max(abs(raw.value - rollup.value)), 0)
)
FROM raw
FULL JOIN rollup USING (time, asset_id, metric)
"@

        Write-Host "Profiling $($profile.id)..."
        Invoke-Explain -Database $profileDatabase -Sql $beforeSql | Out-Null
        Invoke-Explain -Database $profileDatabase -Sql $afterSql | Out-Null
        $beforeExplain = Invoke-Explain -Database $profileDatabase -Sql $beforeSql
        $afterExplain = Invoke-Explain -Database $profileDatabase -Sql $afterSql
        $beforeSummary = Get-PlanSummary -Explain $beforeExplain
        $afterSummary = Get-PlanSummary -Explain $afterExplain
        $parity = (
            (
                Invoke-Psql `
                    -Database $profileDatabase `
                    -TuplesOnly `
                    -Sql $paritySql |
                Out-String
            ).Trim() |
            ConvertFrom-Json
        )
        $speedup = if ($afterSummary.executionTimeMs -gt 0) {
            [Math]::Round(
                $beforeSummary.executionTimeMs / $afterSummary.executionTimeMs,
                2
            )
        }
        else {
            $null
        }

        $queryReports += [ordered]@{
            id = $profile.id
            description = $profile.description
            before = [ordered]@{
                sql = $beforeSql.Trim()
                summary = $beforeSummary
                explain = $beforeExplain
            }
            after = [ordered]@{
                sql = $afterSql.Trim()
                summary = $afterSummary
                explain = $afterExplain
            }
            speedup = $speedup
            parity = [ordered]@{
                comparedRows = [int64]$parity.comparedRows
                mismatchedRows = [int64]$parity.mismatchedRows
                maxAbsoluteDelta = [double]$parity.maxAbsoluteDelta
            }
            passed = (
                [int64]$parity.mismatchedRows -eq 0 -and
                $afterSummary.executionTimeMs -lt $beforeSummary.executionTimeMs -and
                $afterSummary.executionTimeMs -lt 500
            )
        }
    }

    $historyAssetId = "99999999-9999-9999-9999-999999999999"
    $historyTime = $startTime.AddDays(-40).AddHours(2)
    $historyStart = $historyTime.Date
    $historyEnd = $historyStart.AddDays(1)
    $historyTimeSql = $historyTime.ToString(
        "yyyy-MM-ddTHH:mm:ss'Z'",
        [Globalization.CultureInfo]::InvariantCulture
    )
    $historyStartSql = $historyStart.ToString(
        "yyyy-MM-ddTHH:mm:ss'Z'",
        [Globalization.CultureInfo]::InvariantCulture
    )
    $historyEndSql = $historyEnd.ToString(
        "yyyy-MM-ddTHH:mm:ss'Z'",
        [Globalization.CultureInfo]::InvariantCulture
    )

    Write-Host "Checking migration replay preserves retained aggregate history..."
    Invoke-Psql -Database $profileDatabase -Sql @"
INSERT INTO assets (id, name, type, metadata)
VALUES (
    '$historyAssetId'::uuid,
    'FII-PROFILE-RETAINED-HISTORY',
    'machine',
    jsonb_build_object('benchmark_suite', '$suite')
);
INSERT INTO telemetry (time, asset_id, metric, value, tags)
VALUES (
    '$historyTimeSql'::timestamptz,
    '$historyAssetId'::uuid,
    'temperature',
    42,
    jsonb_build_object('benchmark_suite', '$suite')
);
"@ | Out-Null
    Invoke-Psql -Database $profileDatabase -Sql @"
CALL refresh_continuous_aggregate(
    'telemetry_hourly',
    '$historyStartSql'::timestamptz,
    '$historyEndSql'::timestamptz
);
"@ | Out-Null
    Invoke-Psql -Database $profileDatabase -Sql @"
CALL refresh_continuous_aggregate(
    'telemetry_daily',
    '$historyStartSql'::timestamptz,
    '$historyEndSql'::timestamptz
);
"@ | Out-Null

    $historyBeforeReplay = (
        (
            Invoke-Psql -Database $profileDatabase -TuplesOnly -Sql @"
SELECT json_build_object(
    'hourlyRows',
    (SELECT count(*) FROM telemetry_hourly WHERE asset_id = '$historyAssetId'::uuid),
    'dailyRows',
    (SELECT count(*) FROM telemetry_daily WHERE asset_id = '$historyAssetId'::uuid)
);
"@ |
            Out-String
        ).Trim() |
        ConvertFrom-Json
    )
    Invoke-Psql -Database $profileDatabase -Sql @"
SELECT drop_chunks(
    'telemetry',
    older_than => NOW() - INTERVAL '30 days'
);
"@ | Out-Null

    $migrationReplayOutput = @(
        docker exec $ContainerName env `
            "PGOPTIONS=-c client_min_messages=error" `
            psql `
            -q `
            -v ON_ERROR_STOP=1 `
            -U $DatabaseUser `
            -d $profileDatabase `
            -f $containerMigrationPath 2>&1
    )
    if ($LASTEXITCODE -ne 0) {
        throw "TimescaleDB migration replay failed: $($migrationReplayOutput -join [Environment]::NewLine)"
    }

    $historyAfterReplay = (
        (
            Invoke-Psql -Database $profileDatabase -TuplesOnly -Sql @"
SELECT json_build_object(
    'rawRows',
    (SELECT count(*) FROM telemetry WHERE asset_id = '$historyAssetId'::uuid),
    'hourlyRows',
    (SELECT count(*) FROM telemetry_hourly WHERE asset_id = '$historyAssetId'::uuid),
    'dailyRows',
    (SELECT count(*) FROM telemetry_daily WHERE asset_id = '$historyAssetId'::uuid)
);
"@ |
            Out-String
        ).Trim() |
        ConvertFrom-Json
    )
    $retentionReplayPassed = (
        [int64]$historyBeforeReplay.hourlyRows -eq 1 -and
        [int64]$historyBeforeReplay.dailyRows -eq 1 -and
        [int64]$historyAfterReplay.rawRows -eq 0 -and
        [int64]$historyAfterReplay.hourlyRows -eq 1 -and
        [int64]$historyAfterReplay.dailyRows -eq 1
    )

    $databaseVersion = (
        Invoke-Psql -Database $profileDatabase -TuplesOnly -Sql @"
SELECT current_setting('server_version')
    || ' / TimescaleDB '
    || (SELECT extversion FROM pg_extension WHERE extname = 'timescaledb');
"@ |
        Select-Object -First 1
    ).Trim()
    $continuousAggregateMode = @(
        Invoke-Psql -Database $profileDatabase -TuplesOnly -Sql @"
SELECT view_name || ':' || materialized_only
FROM timescaledb_information.continuous_aggregates
WHERE view_name IN ('telemetry_hourly', 'telemetry_daily')
ORDER BY view_name;
"@
    )

    $report = [ordered]@{
        generatedAt = [DateTimeOffset]::UtcNow.ToString("o")
        environment = [ordered]@{
            container = $ContainerName
            databaseVersion = $databaseVersion
            isolation = "Disposable database created for this run and dropped in finally."
        }
        workload = [ordered]@{
            machines = $Machines
            metrics = $Metrics
            days = $Days
            sampleIntervalMinutes = $SampleIntervalMinutes
            seededRows = $seededRows
            hourlyRollupRows = $hourlyRows
            dailyRollupRows = $dailyRows
            queryLimit = $Limit
            startTime = $startSql
            endTimeExclusive = $endSql
        }
        continuousAggregates = $continuousAggregateMode
        queries = $queryReports
        target = [ordered]@{
            executionTimeMsLessThan = 500
            resultParityRequired = $true
        }
        migrationReplayRetention = [ordered]@{
            historicalPointAgeDays = 40 + $Days
            rawRowsAfterDrop = [int64]$historyAfterReplay.rawRows
            hourlyRowsBeforeReplay = [int64]$historyBeforeReplay.hourlyRows
            hourlyRowsAfterReplay = [int64]$historyAfterReplay.hourlyRows
            dailyRowsBeforeReplay = [int64]$historyBeforeReplay.dailyRows
            dailyRowsAfterReplay = [int64]$historyAfterReplay.dailyRows
            passed = $retentionReplayPassed
        }
        apiRouting = "Rollups are used only when start_time and end_time are omitted; bounded requests stay on raw rows to preserve partial-bucket semantics."
        passed = (
            @($queryReports | Where-Object { -not $_.passed }).Count -eq 0 -and
            $retentionReplayPassed
        )
        boundary = "Database-only EXPLAIN (ANALYZE, BUFFERS); HTTP and MQTT latency are not measured."
    }

    $outputDirectory = Split-Path -Parent $OutputPath
    if (-not [string]::IsNullOrWhiteSpace($outputDirectory)) {
        New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
    }
    $report | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $OutputPath -Encoding utf8

    $markdownPath = [IO.Path]::ChangeExtension($OutputPath, ".md")
    $markdownLines = @(
        "# TimescaleDB telemetry query profile",
        "",
        "- Generated: $($report.generatedAt)",
        "- Workload: $Machines machines x $Metrics metrics x $Days days x $SampleIntervalMinutes-minute samples ($seededRows rows)",
        "- Isolation: disposable database; source data was not modified",
        "- Target: optimized execution <500 ms and exact result parity",
        "- API boundary: bounded time ranges remain on raw rows so partial buckets keep their original semantics",
        "- Migration replay retention: $retentionReplayPassed (historical rollup survives after raw chunk removal)",
        "",
        "| Query | Before (ms) | After (ms) | Speedup | Shared blocks before -> after | Parity |",
        "|---|---:|---:|---:|---:|---|"
    )
    foreach ($queryReport in $queryReports) {
        $beforeBlocks = (
            $queryReport.before.summary.sharedHitBlocks +
            $queryReport.before.summary.sharedReadBlocks
        )
        $afterBlocks = (
            $queryReport.after.summary.sharedHitBlocks +
            $queryReport.after.summary.sharedReadBlocks
        )
        $markdownLines += (
            "| {0} | {1:N3} | {2:N3} | {3:N2}x | {4} -> {5} | {6} mismatches |" -f
            $queryReport.id,
            $queryReport.before.summary.executionTimeMs,
            $queryReport.after.summary.executionTimeMs,
            $queryReport.speedup,
            $beforeBlocks,
            $afterBlocks,
            $queryReport.parity.mismatchedRows
        )
    }
    $markdownLines += @(
        "",
        (
            "Full SQL and raw `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` plans are in " +
            "[$([IO.Path]::GetFileName($OutputPath))]($([IO.Path]::GetFileName($OutputPath)))."
        ),
        "",
        "> Boundary: $($report.boundary)"
    )
    $markdownLines | Set-Content -LiteralPath $markdownPath -Encoding utf8

    Write-Host "Profile pass=$($report.passed)"
    foreach ($queryReport in $queryReports) {
        Write-Host (
            "{0}: {1:N3}ms -> {2:N3}ms ({3:N2}x), mismatches={4}" -f
            $queryReport.id,
            $queryReport.before.summary.executionTimeMs,
            $queryReport.after.summary.executionTimeMs,
            $queryReport.speedup,
            $queryReport.parity.mismatchedRows
        )
    }
    Write-Host "Report: $OutputPath"

    if (-not $report.passed) {
        $failure = "One or more TimescaleDB query profiles missed the target."
    }
}
catch {
    $failure = $_.Exception.Message
}
finally {
    if ($databaseCreated) {
        Write-Host "Dropping isolated profile database '$profileDatabase'..."
        docker exec $ContainerName dropdb --if-exists --force -U $DatabaseUser $profileDatabase 2>$null | Out-Null
        if ($LASTEXITCODE -ne 0) {
            $cleanupFailure = "Could not drop isolated profile database '$profileDatabase'."
            $failure = if ($null -eq $failure) {
                $cleanupFailure
            }
            else {
                "$failure Cleanup also failed: $cleanupFailure"
            }
        }
    }
    docker exec $ContainerName rm -f -- $containerMigrationPath 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        $cleanupFailure = "Could not remove container file '$containerMigrationPath'."
        $failure = if ($null -eq $failure) {
            $cleanupFailure
        }
        else {
            "$failure Cleanup also failed: $cleanupFailure"
        }
    }
}

if ($null -ne $failure) {
    throw $failure
}
