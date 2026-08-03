[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$evidenceVerifier = Join-Path $PSScriptRoot "Test-ManagedStagingEvidence.ps1"
$gateVerifier = Join-Path $PSScriptRoot "Test-ManagedStagingGate.ps1"
$requiredChecks = @(
    "backend-https-ingress",
    "frontend-https-ingress",
    "certificate-lifetime",
    "mqtt-tls",
    "mqtt-device-auth",
    "mqtt-topic-isolation",
    "secret-manager-delivery",
    "operations-db-tls",
    "timescale-db-tls",
    "managed-backup",
    "restore-drill",
    "retention-policies",
    "dual-write-validation",
    "dual-write-rollback",
    "live-erp-mes-connector",
    "independent-full-stack-smoke"
)

function Write-JsonFile {
    param(
        [Parameter(Mandatory = $true)]$Value,
        [Parameter(Mandatory = $true)][string]$Path
    )

    $Value | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $Path -Encoding UTF8
}

function Read-JsonFile {
    param([Parameter(Mandatory = $true)][string]$Path)

    return Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
}

function New-ManagedStagingFixture {
    $root = Join-Path ([IO.Path]::GetTempPath()) "fii-managed-staging-$([guid]::NewGuid().ToString('N'))"
    $evidenceDirectory = Join-Path $root "evidence"
    $artifactDirectory = Join-Path $root "artifacts"
    New-Item -ItemType Directory -Path $evidenceDirectory -Force | Out-Null
    New-Item -ItemType Directory -Path $artifactDirectory -Force | Out-Null

    $approvedAt = [DateTimeOffset]::UtcNow.AddMinutes(-5)
    $sourceCommit = "d" * 40
    $reviewerId = "reviewer-security-01"
    $producerId = "release-operator-01"
    $environmentId = "managed-staging-plant-a"

    $releaseManifestPath = Join-Path $artifactDirectory "release-manifest.json"
    Write-JsonFile -Path $releaseManifestPath -Value ([pscustomobject]@{
        schemaVersion = 1
        sourceCommit = $sourceCommit
        environmentId = $environmentId
    })
    $releaseManifestSha256 = (Get-FileHash -LiteralPath $releaseManifestPath -Algorithm SHA256).Hash

    $conflictArtifactPath = Join-Path $artifactDirectory "reviewer-conflict-check.json"
    $conflictCheckedAt = $approvedAt.AddHours(-1)
    Write-JsonFile -Path $conflictArtifactPath -Value ([pscustomobject]@{
        schemaVersion = 1
        status = "passed"
        reviewerId = $reviewerId
        reviewerOrganization = "Independent Assurance Ltd"
        environmentId = $environmentId
        sourceCommit = $sourceCommit
        checkedBy = "release-governance-owner"
        checkedAtUtc = $conflictCheckedAt.ToString("O")
    })
    $checks = [System.Collections.Generic.List[object]]::new()

    foreach ($checkId in $requiredChecks) {
        $isIndependentSmoke = $checkId -eq "independent-full-stack-smoke"
        $artifactPath = Join-Path $artifactDirectory "$checkId.txt"
        Set-Content -LiteralPath $artifactPath -Value "Synthetic self-test artifact for $checkId only." -Encoding UTF8
        $artifactSha256 = (Get-FileHash -LiteralPath $artifactPath -Algorithm SHA256).Hash
        $manifest = [pscustomobject]@{
            schemaVersion = 1
            evidenceId = "evidence-$checkId"
            checkId = $checkId
            environmentId = $environmentId
            sourceCommit = $sourceCommit
            releaseManifestSha256 = $releaseManifestSha256
            capturedAtUtc = $approvedAt.AddMinutes(-30).ToString("O")
            producer = [pscustomobject]@{
                id = $(if ($isIndependentSmoke) { $reviewerId } else { $producerId })
                organization = $(if ($isIndependentSmoke) { "Independent Assurance Ltd" } else { "Factory Release Team" })
            }
            reviewerDisposition = [pscustomobject]@{
                reviewerId = $reviewerId
                status = "approved"
                reviewedAtUtc = $approvedAt.AddMinutes(-10).ToString("O")
            }
            artifact = [pscustomobject]@{
                immutableUri = ([Uri]::new($artifactPath)).AbsoluteUri
                sha256 = $artifactSha256
            }
            witnessMode = $(if ($isIndependentSmoke) { "reviewer_executed" } else { $null })
            rawArtifactSha256 = $(if ($isIndependentSmoke) { $artifactSha256 } else { $null })
        }

        $manifestPath = Join-Path $evidenceDirectory "$checkId.json"
        Write-JsonFile -Value $manifest -Path $manifestPath
        $checks.Add([pscustomobject]@{
            id = $checkId
            status = "passed"
            evidenceManifest = "evidence/$checkId.json"
            evidenceManifestSha256 = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash
        })
    }

    $attestation = [pscustomobject]@{
        schemaVersion = 2
        environment = [pscustomobject]@{
            id = $environmentId
            name = "Plant A managed staging"
        }
        release = [pscustomobject]@{
            sourceCommit = $sourceCommit
            manifestUri = ([Uri]::new($releaseManifestPath)).AbsoluteUri
            manifestSha256 = $releaseManifestSha256
        }
        reviewer = [pscustomobject]@{
            id = $reviewerId
            organization = "Independent Assurance Ltd"
            conflictCheck = [pscustomobject]@{
                status = "passed"
                reference = ([Uri]::new($conflictArtifactPath)).AbsoluteUri
                sha256 = (Get-FileHash -LiteralPath $conflictArtifactPath -Algorithm SHA256).Hash
                checkedBy = "release-governance-owner"
                checkedAtUtc = $conflictCheckedAt.ToString("O")
            }
        }
        contributors = @([pscustomobject]@{
            id = $producerId
            organization = "Factory Release Team"
            role = "evidence-producer"
        })
        approvedAtUtc = $approvedAt.ToString("O")
        checks = $checks
    }

    $attestationPath = Join-Path $root "managed-staging-attestation.json"
    Write-JsonFile -Value $attestation -Path $attestationPath
    return [pscustomobject]@{
        Root = $root
        ArtifactRoot = $artifactDirectory
        AttestationPath = $attestationPath
        SyntheticSelfTest = $true
    }
}

function Update-EvidenceManifest {
    param(
        [Parameter(Mandatory = $true)]$Fixture,
        [Parameter(Mandatory = $true)][string]$CheckId,
        [Parameter(Mandatory = $true)][scriptblock]$Mutation
    )

    $attestation = Read-JsonFile -Path $Fixture.AttestationPath
    $check = $attestation.checks | Where-Object { $_.id -eq $CheckId } | Select-Object -First 1
    $manifestPath = Join-Path $Fixture.Root ([string]$check.evidenceManifest)
    $manifest = Read-JsonFile -Path $manifestPath
    & $Mutation $manifest
    Write-JsonFile -Value $manifest -Path $manifestPath
    $check.evidenceManifestSha256 = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash
    Write-JsonFile -Value $attestation -Path $Fixture.AttestationPath
}

function Assert-FailsWith {
    param(
        [Parameter(Mandatory = $true)][scriptblock]$Action,
        [Parameter(Mandatory = $true)][string]$ExpectedPattern,
        [Parameter(Mandatory = $true)][string]$CaseName
    )

    try {
        & $Action | Out-Null
    }
    catch {
        if ($_.Exception.Message -notmatch $ExpectedPattern) {
            throw "$CaseName failed for the wrong reason: $($_.Exception.Message)"
        }
        Write-Output "PASS: $CaseName"
        return
    }
    throw "$CaseName unexpectedly passed."
}

function Invoke-FixtureCase {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][scriptblock]$Test
    )

    $fixture = New-ManagedStagingFixture
    $previousArtifactRoot = $env:FII_MANAGED_ARTIFACT_ROOT
    try {
        $env:FII_MANAGED_ARTIFACT_ROOT = $fixture.ArtifactRoot
        & $Test $fixture
        Write-Output "PASS: $Name"
    }
    finally {
        $env:FII_MANAGED_ARTIFACT_ROOT = $previousArtifactRoot
        Remove-Item -LiteralPath $fixture.Root -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Invoke-FixtureCase -Name "generated schema-v2 evidence-only validation" -Test {
    param($fixture)
    if ($fixture.SyntheticSelfTest -ne $true) { throw "Fixture must remain explicitly synthetic." }
    $result = & $evidenceVerifier -AttestationPath $fixture.AttestationPath -ArtifactRoot $fixture.ArtifactRoot | ConvertFrom-Json
    if ($result.passed -ne $true) { throw "Evidence verifier did not return passed=true." }
    if (@($result.verifiedEvidence).Count -ne $requiredChecks.Count) {
        throw "Expected $($requiredChecks.Count) verified manifests, got $(@($result.verifiedEvidence).Count)."
    }
    if ([string]$result.environment.id -ne "managed-staging-plant-a") {
        throw "Verified result lost the environment binding."
    }
    if ([string]$result.release.manifestSha256 -ne (Get-FileHash -LiteralPath (Join-Path $fixture.ArtifactRoot "release-manifest.json") -Algorithm SHA256).Hash) {
        throw "Verified result lost the release binding."
    }
}

Invoke-FixtureCase -Name "RFC3339 conflict timestamp survives runtime JSON parsing" -Test {
    param($fixture)
    $result = & $evidenceVerifier -AttestationPath $fixture.AttestationPath -ArtifactRoot $fixture.ArtifactRoot | ConvertFrom-Json
    if ($result.passed -ne $true) { throw "Evidence verifier did not accept a valid RFC3339 timestamp." }
}

Invoke-FixtureCase -Name "tampered raw artifact is rejected" -Test {
    param($fixture)
    Add-Content -LiteralPath (Join-Path $fixture.ArtifactRoot "backend-https-ingress.txt") -Value "tampered"
    Assert-FailsWith -CaseName "artifact hash mismatch" -ExpectedPattern "Artifact hash mismatch" -Action {
        & $evidenceVerifier -AttestationPath $fixture.AttestationPath -ArtifactRoot $fixture.ArtifactRoot
    }
}

Invoke-FixtureCase -Name "synthetic evidence URI is rejected" -Test {
    param($fixture)
    Update-EvidenceManifest -Fixture $fixture -CheckId "backend-https-ingress" -Mutation {
        param($manifest) $manifest.artifact.immutableUri = "evidence://synthetic/backend-https-ingress"
    }
    Assert-FailsWith -CaseName "synthetic evidence URI" -ExpectedPattern "must be an absolute HTTPS URI" -Action {
        & $evidenceVerifier -AttestationPath $fixture.AttestationPath -ArtifactRoot $fixture.ArtifactRoot
    }
}

Invoke-FixtureCase -Name "file artifact outside approved root is rejected" -Test {
    param($fixture)
    $outsidePath = Join-Path $fixture.Root "outside-root.txt"
    Set-Content -LiteralPath $outsidePath -Value "Synthetic artifact outside approved root." -Encoding UTF8
    Update-EvidenceManifest -Fixture $fixture -CheckId "backend-https-ingress" -Mutation {
        param($manifest)
        $manifest.artifact.immutableUri = ([Uri]::new($outsidePath)).AbsoluteUri
        $manifest.artifact.sha256 = (Get-FileHash -LiteralPath $outsidePath -Algorithm SHA256).Hash
    }
    Assert-FailsWith -CaseName "artifact root escape" -ExpectedPattern "outside the approved artifact root" -Action {
        & $evidenceVerifier -AttestationPath $fixture.AttestationPath -ArtifactRoot $fixture.ArtifactRoot
    }
}

Invoke-FixtureCase -Name "exact approved root is not accepted as an artifact" -Test {
    param($fixture)
    Update-EvidenceManifest -Fixture $fixture -CheckId "backend-https-ingress" -Mutation {
        param($manifest) $manifest.artifact.immutableUri = ([Uri]::new($fixture.ArtifactRoot)).AbsoluteUri
    }
    Assert-FailsWith -CaseName "exact-root policy" -ExpectedPattern "outside the approved artifact root" -Action {
        & $evidenceVerifier -AttestationPath $fixture.AttestationPath -ArtifactRoot $fixture.ArtifactRoot
    }
}

Invoke-FixtureCase -Name "sibling-prefix artifact root escape is rejected" -Test {
    param($fixture)
    $sibling = "$($fixture.ArtifactRoot)-sibling"
    New-Item -ItemType Directory -Path $sibling -Force | Out-Null
    try {
        $outsidePath = Join-Path $sibling "artifact.txt"
        Set-Content -LiteralPath $outsidePath -Value "Sibling prefix must not match." -Encoding UTF8
        Update-EvidenceManifest -Fixture $fixture -CheckId "backend-https-ingress" -Mutation {
            param($manifest)
            $manifest.artifact.immutableUri = ([Uri]::new($outsidePath)).AbsoluteUri
            $manifest.artifact.sha256 = (Get-FileHash -LiteralPath $outsidePath -Algorithm SHA256).Hash
        }
        Assert-FailsWith -CaseName "sibling-prefix policy" -ExpectedPattern "outside the approved artifact root" -Action {
            & $evidenceVerifier -AttestationPath $fixture.AttestationPath -ArtifactRoot $fixture.ArtifactRoot
        }
    }
    finally { Remove-Item -LiteralPath $sibling -Recurse -Force -ErrorAction SilentlyContinue }
}

Invoke-FixtureCase -Name "file path comparison follows OS case semantics" -Test {
    param($fixture)
    $caseVariantRoot = $fixture.ArtifactRoot.ToUpperInvariant()
    if ([Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([Runtime.InteropServices.OSPlatform]::Windows)) {
        $result = & $evidenceVerifier -AttestationPath $fixture.AttestationPath -ArtifactRoot $caseVariantRoot | ConvertFrom-Json
        if ($result.passed -ne $true) { throw "Windows case-insensitive root unexpectedly failed." }
    }
    else {
        Assert-FailsWith -CaseName "Unix case-sensitive root" -ExpectedPattern "existing absolute directory" -Action {
            & $evidenceVerifier -AttestationPath $fixture.AttestationPath -ArtifactRoot $caseVariantRoot
        }
    }
}

Invoke-FixtureCase -Name "artifact symlink or junction traversal is rejected" -Test {
    param($fixture)
    $outsideDirectory = Join-Path $fixture.Root "outside-artifacts"
    New-Item -ItemType Directory -Path $outsideDirectory -Force | Out-Null
    $outsidePath = Join-Path $outsideDirectory "linked.txt"
    Set-Content -LiteralPath $outsidePath -Value "Linked artifact." -Encoding UTF8
    $linkPath = Join-Path $fixture.ArtifactRoot "linked-directory"
    $itemType = if ([Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([Runtime.InteropServices.OSPlatform]::Windows)) { "Junction" } else { "SymbolicLink" }
    New-Item -ItemType $itemType -Path $linkPath -Target $outsideDirectory | Out-Null
    $linkedArtifact = Join-Path $linkPath "linked.txt"
    Update-EvidenceManifest -Fixture $fixture -CheckId "backend-https-ingress" -Mutation {
        param($manifest)
        $manifest.artifact.immutableUri = ([Uri]::new($linkedArtifact)).AbsoluteUri
        $manifest.artifact.sha256 = (Get-FileHash -LiteralPath $outsidePath -Algorithm SHA256).Hash
    }
    Assert-FailsWith -CaseName "reparse traversal" -ExpectedPattern "symlink or junction" -Action {
        & $evidenceVerifier -AttestationPath $fixture.AttestationPath -ArtifactRoot $fixture.ArtifactRoot
    }
}

Invoke-FixtureCase -Name "UNC file authority is rejected" -Test {
    param($fixture)
    Update-EvidenceManifest -Fixture $fixture -CheckId "backend-https-ingress" -Mutation {
        param($manifest) $manifest.artifact.immutableUri = "file://server/share/artifact.txt"
    }
    Assert-FailsWith -CaseName "UNC authority" -ExpectedPattern "local file URI with no UNC authority" -Action {
        & $evidenceVerifier -AttestationPath $fixture.AttestationPath -ArtifactRoot $fixture.ArtifactRoot
    }
}

Invoke-FixtureCase -Name "file artifact without external root mapping is rejected" -Test {
    param($fixture)
    $env:FII_MANAGED_ARTIFACT_ROOT = $null
    Assert-FailsWith -CaseName "missing artifact root" -ExpectedPattern "requires an approved artifact root" -Action {
        & $evidenceVerifier -AttestationPath $fixture.AttestationPath
    }
}

Invoke-FixtureCase -Name "manifest hash mismatch is rejected" -Test {
    param($fixture)
    Add-Content -LiteralPath (Join-Path $fixture.Root "evidence/backend-https-ingress.json") -Value " "
    Assert-FailsWith -CaseName "manifest hash mismatch" -ExpectedPattern "manifest hash mismatch" -Action {
        & $evidenceVerifier -AttestationPath $fixture.AttestationPath
    }
}

Invoke-FixtureCase -Name "environment binding mismatch is rejected" -Test {
    param($fixture)
    Update-EvidenceManifest -Fixture $fixture -CheckId "backend-https-ingress" -Mutation {
        param($manifest) $manifest.environmentId = "different-managed-staging"
    }
    Assert-FailsWith -CaseName "environment binding mismatch" -ExpectedPattern "environment binding mismatch" -Action {
        & $evidenceVerifier -AttestationPath $fixture.AttestationPath
    }
}

Invoke-FixtureCase -Name "release binding mismatch is rejected" -Test {
    param($fixture)
    Update-EvidenceManifest -Fixture $fixture -CheckId "backend-https-ingress" -Mutation {
        param($manifest) $manifest.releaseManifestSha256 = "e" * 64
    }
    Assert-FailsWith -CaseName "release binding mismatch" -ExpectedPattern "release/environment binding mismatch" -Action {
        & $evidenceVerifier -AttestationPath $fixture.AttestationPath
    }
}

Invoke-FixtureCase -Name "release manifest content is independently bound" -Test {
    param($fixture)
    $attestation = Read-JsonFile -Path $fixture.AttestationPath
    $releasePath = Join-Path $fixture.ArtifactRoot "release-manifest.json"
    $releaseManifest = Read-JsonFile -Path $releasePath
    $releaseManifest.environmentId = "different-environment"
    Write-JsonFile -Value $releaseManifest -Path $releasePath
    $attestation.release.manifestSha256 = (Get-FileHash -LiteralPath $releasePath -Algorithm SHA256).Hash
    Write-JsonFile -Value $attestation -Path $fixture.AttestationPath
    Assert-FailsWith -CaseName "release manifest content binding" -ExpectedPattern "Release manifest content binding mismatch" -Action {
        & $evidenceVerifier -AttestationPath $fixture.AttestationPath -ArtifactRoot $fixture.ArtifactRoot
    }
}

Invoke-FixtureCase -Name "reviewer conflict artifact hash is independently verified" -Test {
    param($fixture)
    Add-Content -LiteralPath (Join-Path $fixture.ArtifactRoot "reviewer-conflict-check.json") -Value "tampered"
    Assert-FailsWith -CaseName "conflict artifact hash" -ExpectedPattern "Reviewer conflict artifact hash mismatch" -Action {
        & $evidenceVerifier -AttestationPath $fixture.AttestationPath -ArtifactRoot $fixture.ArtifactRoot
    }
}

Invoke-FixtureCase -Name "reviewer conflict artifact content is independently bound" -Test {
    param($fixture)
    $attestation = Read-JsonFile -Path $fixture.AttestationPath
    $conflictPath = Join-Path $fixture.ArtifactRoot "reviewer-conflict-check.json"
    $conflict = Read-JsonFile -Path $conflictPath
    $conflict.sourceCommit = "e" * 40
    Write-JsonFile -Value $conflict -Path $conflictPath
    $attestation.reviewer.conflictCheck.sha256 = (Get-FileHash -LiteralPath $conflictPath -Algorithm SHA256).Hash
    Write-JsonFile -Value $attestation -Path $fixture.AttestationPath
    Assert-FailsWith -CaseName "conflict artifact content" -ExpectedPattern "Reviewer conflict artifact content binding mismatch" -Action {
        & $evidenceVerifier -AttestationPath $fixture.AttestationPath -ArtifactRoot $fixture.ArtifactRoot
    }
}

Invoke-FixtureCase -Name "contributor and reviewer conflict is rejected" -Test {
    param($fixture)
    $attestation = Read-JsonFile -Path $fixture.AttestationPath
    $attestation.contributors[0].id = $attestation.reviewer.id
    Write-JsonFile -Value $attestation -Path $fixture.AttestationPath
    Assert-FailsWith -CaseName "contributor/reviewer conflict" -ExpectedPattern "independent from contributors" -Action {
        & $evidenceVerifier -AttestationPath $fixture.AttestationPath
    }
}

Invoke-FixtureCase -Name "reviewer organization and contributor organization conflict is rejected" -Test {
    param($fixture)
    $attestation = Read-JsonFile -Path $fixture.AttestationPath
    $attestation.contributors[0].organization = $attestation.reviewer.organization
    Write-JsonFile -Value $attestation -Path $fixture.AttestationPath
    Assert-FailsWith -CaseName "reviewer organization independence" -ExpectedPattern "independent from contributors" -Action {
        & $evidenceVerifier -AttestationPath $fixture.AttestationPath -ArtifactRoot $fixture.ArtifactRoot
    }
}

Invoke-FixtureCase -Name "producer must bind to a matching contributor" -Test {
    param($fixture)
    Update-EvidenceManifest -Fixture $fixture -CheckId "backend-https-ingress" -Mutation {
        param($manifest) $manifest.producer.id = "unlisted-producer"
    }
    Assert-FailsWith -CaseName "producer contributor binding" -ExpectedPattern "not bound to a matching contributor" -Action {
        & $evidenceVerifier -AttestationPath $fixture.AttestationPath -ArtifactRoot $fixture.ArtifactRoot
    }
}

Invoke-FixtureCase -Name "review must not precede capture" -Test {
    param($fixture)
    Update-EvidenceManifest -Fixture $fixture -CheckId "backend-https-ingress" -Mutation {
        param($manifest) $manifest.reviewerDisposition.reviewedAtUtc = ([DateTimeOffset]$manifest.capturedAtUtc).AddSeconds(-1).ToString("O")
    }
    Assert-FailsWith -CaseName "capture review approval ordering" -ExpectedPattern "capture-to-review-to-approval order" -Action {
        & $evidenceVerifier -AttestationPath $fixture.AttestationPath -ArtifactRoot $fixture.ArtifactRoot
    }
}

Invoke-FixtureCase -Name "review must not post-date approval" -Test {
    param($fixture)
    $attestation = Read-JsonFile -Path $fixture.AttestationPath
    $approvedAt = [DateTimeOffset]$attestation.approvedAtUtc
    Update-EvidenceManifest -Fixture $fixture -CheckId "backend-https-ingress" -Mutation {
        param($manifest) $manifest.reviewerDisposition.reviewedAtUtc = $approvedAt.AddSeconds(1).ToString("O")
    }
    Assert-FailsWith -CaseName "review approval ordering" -ExpectedPattern "capture-to-review-to-approval order" -Action {
        & $evidenceVerifier -AttestationPath $fixture.AttestationPath -ArtifactRoot $fixture.ArtifactRoot
    }
}

Invoke-FixtureCase -Name "stale evidence is rejected" -Test {
    param($fixture)
    Update-EvidenceManifest -Fixture $fixture -CheckId "backend-https-ingress" -Mutation {
        param($manifest) $manifest.capturedAtUtc = [DateTimeOffset]::UtcNow.AddDays(-31).ToString("O")
    }
    Assert-FailsWith -CaseName "stale evidence" -ExpectedPattern "capture-to-review-to-approval|30-day maximum age" -Action {
        & $evidenceVerifier -AttestationPath $fixture.AttestationPath
    }
}

Invoke-FixtureCase -Name "duplicate check IDs are rejected" -Test {
    param($fixture)
    $attestation = Read-JsonFile -Path $fixture.AttestationPath
    $attestation.checks[1].id = $attestation.checks[0].id
    Write-JsonFile -Value $attestation -Path $fixture.AttestationPath
    Assert-FailsWith -CaseName "duplicate check ID" -ExpectedPattern "Duplicate managed check" -Action {
        & $evidenceVerifier -AttestationPath $fixture.AttestationPath
    }
}

Invoke-FixtureCase -Name "duplicate evidence IDs are rejected" -Test {
    param($fixture)
    Update-EvidenceManifest -Fixture $fixture -CheckId "frontend-https-ingress" -Mutation {
        param($manifest) $manifest.evidenceId = "evidence-backend-https-ingress"
    }
    Assert-FailsWith -CaseName "duplicate evidence ID" -ExpectedPattern "Duplicate evidenceId" -Action {
        & $evidenceVerifier -AttestationPath $fixture.AttestationPath
    }
}

Invoke-FixtureCase -Name "strict per-artifact byte cap is enforced while streaming" -Test {
    param($fixture)
    Assert-FailsWith -CaseName "per-artifact byte cap" -ExpectedPattern "per-artifact byte limit" -Action {
        & $evidenceVerifier -AttestationPath $fixture.AttestationPath -ArtifactRoot $fixture.ArtifactRoot -MaxArtifactBytes 32
    }
}

Invoke-FixtureCase -Name "strict aggregate byte cap is enforced" -Test {
    param($fixture)
    Assert-FailsWith -CaseName "aggregate byte cap" -ExpectedPattern "aggregate byte limit" -Action {
        & $evidenceVerifier -AttestationPath $fixture.AttestationPath -ArtifactRoot $fixture.ArtifactRoot -MaxAggregateBytes 256
    }
}

Invoke-FixtureCase -Name "deadline must be positive" -Test {
    param($fixture)
    Assert-FailsWith -CaseName "deadline validation" -ExpectedPattern "deadline must be positive" -Action {
        & $evidenceVerifier -AttestationPath $fixture.AttestationPath -ArtifactRoot $fixture.ArtifactRoot -DeadlineSeconds 0
    }
}

Invoke-FixtureCase -Name "HTTPS artifact host requires explicit allowlist" -Test {
    param($fixture)
    $attestation = Read-JsonFile -Path $fixture.AttestationPath
    $attestation.release.manifestUri = "https://artifacts.vendor.test/release.json"
    Write-JsonFile -Value $attestation -Path $fixture.AttestationPath
    Assert-FailsWith -CaseName "artifact allowlist" -ExpectedPattern "explicit artifact host allowlist" -Action {
        & $evidenceVerifier -AttestationPath $fixture.AttestationPath -ArtifactRoot $fixture.ArtifactRoot
    }
}

foreach ($unsafeUri in @(
    "https://user:secret@artifacts.vendor.test/release.json",
    "https://artifacts.vendor.test/release.json?token=secret",
    "https://127.0.0.1/release.json",
    "https://10.0.0.1/release.json",
    "https://169.254.169.254/latest/meta-data",
    "https://192.0.2.1/release.json",
    "https://artifact/release.json",
    "https://artifact.internal/release.json",
    "https://artifact.example/release.json",
    "https://artifact.example.com/release.json"
)) {
    Invoke-FixtureCase -Name "unsafe HTTPS artifact URI is rejected without disclosure" -Test {
        param($fixture)
        $attestation = Read-JsonFile -Path $fixture.AttestationPath
        $attestation.release.manifestUri = $unsafeUri
        Write-JsonFile -Value $attestation -Path $fixture.AttestationPath
        try { & $evidenceVerifier -AttestationPath $fixture.AttestationPath -ArtifactRoot $fixture.ArtifactRoot | Out-Null }
        catch {
            if ($_.Exception.Message -match 'secret|169\.254\.169\.254|artifacts\.vendor\.test') { throw "Unsafe URI leaked in verifier output." }
            Write-Output "PASS: unsafe URI rejected without URL disclosure"
            return
        }
        throw "Unsafe HTTPS artifact URI unexpectedly passed."
    }
}

$missingAttestation = Join-Path ([IO.Path]::GetTempPath()) "missing-managed-staging-$([guid]::NewGuid().ToString('N')).json"
Assert-FailsWith -CaseName "loopback gate URL rejected before evidence read or probe" -ExpectedPattern "IP-literal host" -Action {
    & $gateVerifier `
        -BackendUrl "https://127.0.0.1:65535/" `
        -FrontendUrl "https://staging.internal/" `
        -AttestationPath $missingAttestation
}
Assert-FailsWith -CaseName "example gate URL rejected before evidence read or probe" -ExpectedPattern "explicitly approved managed staging host" -Action {
    & $gateVerifier `
        -BackendUrl "https://staging.internal/" `
        -FrontendUrl "https://frontend.example.com/" `
        -AttestationPath $missingAttestation
}
Assert-FailsWith -CaseName "reserved .example gate URL rejected before evidence read or probe" -ExpectedPattern "explicitly approved managed staging host" -Action {
    & $gateVerifier `
        -BackendUrl "https://staging.internal/" `
        -FrontendUrl "https://frontend.staging.example/" `
        -AttestationPath $missingAttestation
}
Assert-FailsWith -CaseName "managed gate host requires explicit allowlist" -ExpectedPattern "explicit managed host allowlist" -Action {
    & $gateVerifier `
        -BackendUrl "https://api.staging.vendor.test/" `
        -FrontendUrl "https://frontend.staging.vendor.test/" `
        -AttestationPath $missingAttestation
}

$evidenceSource = Get-Content -LiteralPath $evidenceVerifier -Raw -Encoding UTF8
$gateSource = Get-Content -LiteralPath $gateVerifier -Raw -Encoding UTF8
if ($evidenceSource -notmatch 'AllowAutoRedirect\s*=\s*\$false' -or $gateSource -notmatch 'MaximumRedirection\s+0') {
    throw "Redirect denial controls are missing."
}
if (($evidenceSource | Select-String -Pattern 'GetHostAddresses' -AllMatches).Matches.Count -lt 1 -or
    ($gateSource | Select-String -Pattern 'GetHostAddresses' -AllMatches).Matches.Count -lt 1) {
    throw "Per-target DNS resolution checks are missing."
}
Write-Output "PASS: redirect denial and per-target DNS checks remain enforced"

Write-Output "Managed staging synthetic self-tests passed ($($requiredChecks.Count) generated manifests per fixture); no managed gate status was changed."
exit 0
