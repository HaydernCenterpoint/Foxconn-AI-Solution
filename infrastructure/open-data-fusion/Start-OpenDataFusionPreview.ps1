[CmdletBinding()]
param(
    [ValidateRange(1, 65535)]
    [int]$PostgresPort = 55432,

    [ValidateRange(1, 65535)]
    [int]$RedisPort = 56379,

    [ValidateRange(1, 65535)]
    [int]$ApiPort = 54310,

    [ValidateRange(1, 65535)]
    [int]$WebPort = 58088,

    [ValidateRange(1, 3600)]
    [int]$WaitTimeoutSeconds = 300
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-AvailablePort {
    param(
        [Parameter(Mandatory)]
        [int]$Port,

        [Parameter(Mandatory)]
        [string]$Name
    )

    $listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
        Select-Object -First 1

    if ($null -eq $listener) {
        return
    }

    $process = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
    $owner = if ($null -eq $process) {
        "PID $($listener.OwningProcess)"
    }
    else {
        "$($process.ProcessName) (PID $($listener.OwningProcess))"
    }

    throw "$Name port $Port is already in use by $owner. Choose a different -$($Name)Port value."
}

function Get-PreviewContainers {
    $rows = @(
        & docker compose --env-file $script:PreviewEnvFile --profile application-preview ps --all --format json
    )

    if ($LASTEXITCODE -ne 0) {
        throw 'Unable to inspect the existing Open Data Fusion preview stack.'
    }

    return @(
        $rows |
            Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
            ForEach-Object { $_ | ConvertFrom-Json }
    )
}

function Test-PreviewServiceOwnsPort {
    param(
        [Parameter(Mandatory)]
        [object[]]$Containers,

        [Parameter(Mandatory)]
        [string]$Service,

        [Parameter(Mandatory)]
        [int]$TargetPort,

        [Parameter(Mandatory)]
        [int]$PublishedPort
    )

    $container = $Containers |
        Where-Object { $_.Service -eq $Service -and $_.State -eq 'running' } |
        Select-Object -First 1

    if ($null -eq $container) {
        return $false
    }

    return @(
        $container.Publishers |
            Where-Object {
                $_.TargetPort -eq $TargetPort -and $_.PublishedPort -eq $PublishedPort
            }
    ).Count -gt 0
}

function Invoke-PreviewCompose {
    param(
        [Parameter(Mandatory)]
        [string[]]$Arguments
    )

    & docker compose --env-file $script:PreviewEnvFile --profile application-preview @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Docker Compose failed: $($Arguments -join ' ')"
    }
}

$repositoryRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$composeDirectory = Join-Path $repositoryRoot 'third_party/open-data-fusion'
$script:PreviewEnvFile = Join-Path $PSScriptRoot '.env.example'

if (-not (Test-Path -LiteralPath $composeDirectory)) {
    throw "Open Data Fusion submodule was not found at '$composeDirectory'. Run 'git submodule update --init --recursive' first."
}

if (-not (Test-Path -LiteralPath $script:PreviewEnvFile)) {
    throw "Preview environment template was not found at '$script:PreviewEnvFile'."
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker Desktop is required to start the Open Data Fusion preview.'
}

& docker version --format '{{.Server.Version}}' | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw 'Docker Desktop is not running or is not reachable.'
}

$overrides = [ordered]@{
    ODF_POSTGRES_PORT = $PostgresPort
    ODF_REDIS_PORT = $RedisPort
    ODF_API_PORT = $ApiPort
    ODF_WEB_PORT = $WebPort
}
$previousEnvironment = @{}
$locationPushed = $false

try {
    foreach ($override in $overrides.GetEnumerator()) {
        $previousEnvironment[$override.Key] = [Environment]::GetEnvironmentVariable($override.Key, 'Process')
        [Environment]::SetEnvironmentVariable($override.Key, [string]$override.Value, 'Process')
    }

    Push-Location $composeDirectory
    $locationPushed = $true

    $containers = Get-PreviewContainers
    $ports = @(
        [pscustomobject]@{ Name = 'Postgres'; Port = $PostgresPort; Service = 'odf-postgres'; TargetPort = 5432 },
        [pscustomobject]@{ Name = 'Redis'; Port = $RedisPort; Service = 'odf-redis'; TargetPort = 6379 },
        [pscustomobject]@{ Name = 'Api'; Port = $ApiPort; Service = 'api'; TargetPort = 4310 },
        [pscustomobject]@{ Name = 'Web'; Port = $WebPort; Service = 'web'; TargetPort = 8080 }
    )

    foreach ($port in $ports) {
        if (-not (Test-PreviewServiceOwnsPort -Containers $containers -Service $port.Service -TargetPort $port.TargetPort -PublishedPort $port.Port)) {
            Assert-AvailablePort -Port $port.Port -Name $port.Name
        }
    }

    Invoke-PreviewCompose -Arguments @('config', '--quiet')
    Invoke-PreviewCompose -Arguments @('up', '-d', '--build', '--wait', '--wait-timeout', [string]$WaitTimeoutSeconds)
    Invoke-PreviewCompose -Arguments @('ps')

    [pscustomobject]@{
        ApiUrl = "http://127.0.0.1:$ApiPort"
        WebUrl = "http://127.0.0.1:$WebPort"
        PostgresPort = $PostgresPort
        RedisPort = $RedisPort
    }
}
finally {
    if ($locationPushed) {
        Pop-Location
    }

    foreach ($previous in $previousEnvironment.GetEnumerator()) {
        [Environment]::SetEnvironmentVariable($previous.Key, $previous.Value, 'Process')
    }
}
