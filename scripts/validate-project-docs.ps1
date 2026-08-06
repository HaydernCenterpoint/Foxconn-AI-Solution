[CmdletBinding()]
param(
    [string]$DocumentPath,
    [string]$ResultPath
)

$repoRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($DocumentPath)) {
    $DocumentPath = Join-Path $repoRoot 'docs/PROJECT-GUIDE.vi.md'
}
if ([string]::IsNullOrWhiteSpace($ResultPath)) {
    $ResultPath = Join-Path $repoRoot '.omx/specs/autoresearch-project-docs/result.json'
}

$errors = [System.Collections.Generic.List[string]]::new()
if (-not (Test-Path -LiteralPath $DocumentPath -PathType Leaf)) {
    $errors.Add("Document not found: $DocumentPath")
    $content = ''
} else {
    $content = Get-Content -LiteralPath $DocumentPath -Raw -Encoding UTF8
}

$requiredHeadings = @(
    '# FII AI / MKZ Factory Monitor',
    '## 1.',
    '## 3.',
    '## 4.',
    '## 5.',
    '## 6.',
    '## 7.',
    '## 8.',
    '## 9.',
    '## 10.',
    '## 11.',
    '## 12.',
    '## 15.'
)
foreach ($heading in $requiredHeadings) {
    if (-not $content.Contains($heading)) {
        $errors.Add("Missing required heading marker: $heading")
    }
}

$requiredReferences = @(
    'backend/',
    'frontend/',
    'ClientPLC/',
    'fusion-adapter/',
    'fusion-contracts/',
    'factory-ai-platform/',
    'Open-Data-Fusion/',
    'third_party/open-data-fusion/',
    'infrastructure/'
)
foreach ($reference in $requiredReferences) {
    if (-not $content.Contains($reference)) {
        $errors.Add("Missing repository reference: $reference")
    }
}

$requiredTerms = @(
    'PostgreSQL',
    'TimescaleDB',
    'MQTT',
    'React',
    'FastAPI',
    'Python',
    'Open Data Fusion',
    'NO-GO'
)
foreach ($term in $requiredTerms) {
    if (-not $content.Contains($term)) {
        $errors.Add("Missing technology/status term: $term")
    }
}

$requiredCommands = @(
    'dotnet run --project backend/backend.csproj',
    'npm --prefix frontend run',
    'docker compose',
    'dotnet test'
)
foreach ($command in $requiredCommands) {
    if (-not $content.Contains($command)) {
        $errors.Add("Missing usage/validation command: $command")
    }
}

$forbiddenLiterals = @(
    'admin123',
    'minio_secure_password_7788',
    'password_engineer',
    'password_admin'
)
foreach ($literal in $forbiddenLiterals) {
    if ($content.Contains($literal)) {
        $errors.Add("Document contains a forbidden credential literal: $literal")
    }
}

$bytes = if (Test-Path -LiteralPath $DocumentPath -PathType Leaf) {
    (Get-Item -LiteralPath $DocumentPath).Length
} else {
    0
}
$lineCount = if ([string]::IsNullOrEmpty($content)) {
    0
} else {
    ($content -split '\r?\n').Count
}
$passed = $errors.Count -eq 0
$summary = if ($passed) {
    'Project guide contains the required scope, architecture, technology, usage, validation, and safety coverage.'
} else {
    'Project guide validation failed; see errors.'
}

$result = [ordered]@{
    status = if ($passed) { 'passed' } else { 'failed' }
    passed = $passed
    summary = $summary
    document_path = $DocumentPath
    metrics = [ordered]@{
        bytes = $bytes
        lines = $lineCount
        required_headings = $requiredHeadings.Count
        required_references = $requiredReferences.Count
        required_terms = $requiredTerms.Count
        required_commands = $requiredCommands.Count
    }
    errors = @($errors)
    validated_at = (Get-Date).ToUniversalTime().ToString('o')
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $ResultPath) | Out-Null
$result | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $ResultPath -Encoding UTF8
$result | ConvertTo-Json -Depth 6

if (-not $passed) {
    exit 1
}
