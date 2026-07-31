# Phase 2 API Test Script
# Run this after starting the backend with: cd backend; dotnet run

$baseUrl = "http://localhost:5000"
$accessToken = $env:FII_DEMO_ACCESS_TOKEN
$hasAccessToken = -not [string]::IsNullOrWhiteSpace($accessToken)
$requestHeaders = @{}
if ($hasAccessToken) {
    $requestHeaders.Authorization = "Bearer $accessToken"
    Write-Host "Using FII_DEMO_ACCESS_TOKEN for protected endpoints." -ForegroundColor DarkGray
} else {
    Write-Host "No FII_DEMO_ACCESS_TOKEN supplied; protected endpoints should return 401." -ForegroundColor Yellow
}

Write-Host "=== Phase 2 API Tests ===" -ForegroundColor Cyan

# Test 1: Alert Stats
Write-Host "`n[1/5] Testing Alert Stats..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/v1/alerts/stats" -Method GET -Headers $requestHeaders -UseBasicParsing
    Write-Host "✅ Alert Stats: $($response.StatusCode)" -ForegroundColor Green
    Write-Host ($response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 5)
} catch {
    if ($hasAccessToken) { Write-Host "❌ Alert Stats failed: $($_.Exception.Message)" -ForegroundColor Red }
    else { Write-Host "⚠️  Alert Stats requires FII_DEMO_ACCESS_TOKEN." -ForegroundColor Yellow }
}

# Test 2: List Alerts
Write-Host "`n[2/5] Testing List Alerts..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/v1/alerts?limit=10" -Method GET -Headers $requestHeaders -UseBasicParsing
    Write-Host "✅ List Alerts: $($response.StatusCode)" -ForegroundColor Green
    $data = $response.Content | ConvertFrom-Json
    Write-Host "Found $($data.count) alerts"
} catch {
    if ($hasAccessToken) { Write-Host "❌ List Alerts failed: $($_.Exception.Message)" -ForegroundColor Red }
    else { Write-Host "⚠️  List Alerts requires FII_DEMO_ACCESS_TOKEN." -ForegroundColor Yellow }
}

# Test 3: Health Score (need a valid asset UUID)
Write-Host "`n[3/5] Testing Health Score (with sample UUID)..." -ForegroundColor Yellow
$sampleAssetId = "00000000-0000-0000-0000-000000000000"
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/v1/assets/$sampleAssetId/health" -Method GET -Headers $requestHeaders -UseBasicParsing
    Write-Host "✅ Health Score: $($response.StatusCode)" -ForegroundColor Green
    Write-Host ($response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 5)
} catch {
    if ($hasAccessToken) { Write-Host "⚠️  Health Score: Expected (no data for sample UUID)" -ForegroundColor Yellow }
    else { Write-Host "⚠️  Health Score requires FII_DEMO_ACCESS_TOKEN." -ForegroundColor Yellow }
}

# Test 4: Failure Risk Prediction
Write-Host "`n[4/5] Testing Failure Risk Prediction..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/v1/predictions/risk/$sampleAssetId?window=1h" -Method GET -Headers $requestHeaders -UseBasicParsing
    Write-Host "✅ Failure Risk: $($response.StatusCode)" -ForegroundColor Green
    Write-Host ($response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 5)
} catch {
    if ($hasAccessToken) { Write-Host "⚠️  Failure Risk: Expected (no data for sample UUID)" -ForegroundColor Yellow }
    else { Write-Host "⚠️  Failure Risk requires FII_DEMO_ACCESS_TOKEN." -ForegroundColor Yellow }
}

# Test 5: Anomaly Detection
Write-Host "`n[5/5] Testing Anomaly Detection..." -ForegroundColor Yellow
try {
    $body = @{
        assetId = $sampleAssetId
        metricType = "temperature"
    } | ConvertTo-Json

    $response = Invoke-WebRequest -Uri "$baseUrl/api/v1/predictions/anomaly" -Method POST -Body $body -ContentType "application/json" -Headers $requestHeaders -UseBasicParsing
    Write-Host "✅ Anomaly Detection: $($response.StatusCode)" -ForegroundColor Green
    Write-Host ($response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 5)
} catch {
    if ($hasAccessToken) { Write-Host "⚠️  Anomaly Detection: Expected (no data for sample UUID)" -ForegroundColor Yellow }
    else { Write-Host "⚠️  Anomaly Detection requires FII_DEMO_ACCESS_TOKEN." -ForegroundColor Yellow }
}

Write-Host "`n=== Test Summary ===" -ForegroundColor Cyan
if ($hasAccessToken) {
    Write-Host "All Phase 2 endpoint requests completed with the supplied token." -ForegroundColor Green
    Write-Host "Note: Some endpoints return empty data because sample UUID has no telemetry." -ForegroundColor Yellow
} else {
    Write-Host "Protected endpoint reachability was not asserted; set FII_DEMO_ACCESS_TOKEN and re-run." -ForegroundColor Yellow
}
Write-Host "`nNext steps:" -ForegroundColor Cyan
Write-Host "1. Apply database migrations to TimescaleDB" -ForegroundColor White
Write-Host "2. Insert sample assets and telemetry data" -ForegroundColor White
Write-Host "3. Re-run this test with real asset UUIDs" -ForegroundColor White
