public sealed class Week8IntegrationHarnessContractTests
{
    [Fact]
    public void LocalWeek8HarnessExercisesRealAlertLifecycleWithoutBrowserFixtures()
    {
        var repositoryRoot = Path.GetFullPath(Path.Combine(
            AppContext.BaseDirectory, "..", "..", "..", ".."));
        var harnessPath = Path.Combine(
            repositoryRoot, "infrastructure", "demo", "Test-LocalIntegrationW8.ps1");

        Assert.True(File.Exists(harnessPath), "The local Week 8 integration harness is missing.");

        var harness = File.ReadAllText(harnessPath);
        var stackProbe = File.ReadAllText(Path.Combine(
            repositoryRoot, "infrastructure", "demo", "Test-FullDemo.ps1"));
        var stackStarter = File.ReadAllText(Path.Combine(
            repositoryRoot, "infrastructure", "demo", "Start-FullDemo.ps1"));
        var liveBrowser = File.ReadAllText(Path.Combine(
            repositoryRoot, "frontend", "e2e", "live-full-stack.spec.ts"));

        Assert.Contains("Start-FullDemo.ps1", harness, StringComparison.Ordinal);
        Assert.Contains("Test-FullDemo.ps1", harness, StringComparison.Ordinal);
        Assert.Contains("FII_LIVE_E2E", harness, StringComparison.Ordinal);
        Assert.Contains("FII_LIVE_FRONTEND_URL = \"http://localhost:$FrontendPort\"", harness, StringComparison.Ordinal);
        Assert.Contains("RandomNumberGenerator", harness, StringComparison.Ordinal);
        Assert.Contains("VALUES ('w8admin', '$adminHash', 'ADMIN')", harness, StringComparison.Ordinal);
        Assert.Contains("Jwt__TenantId", stackStarter, StringComparison.Ordinal);
        Assert.Contains("--database-migrate", harness, StringComparison.Ordinal);
        Assert.Contains("ReadyUrls", harness, StringComparison.Ordinal);
                Assert.Contains("UseShellExecute = $false", harness, StringComparison.Ordinal);
                Assert.Contains("CreateNoWindow = $true", harness, StringComparison.Ordinal);
        Assert.Contains("$psi.Arguments = $argString", harness, StringComparison.Ordinal);
        Assert.Contains("TriggerPhase2Alerts", stackProbe, StringComparison.Ordinal);
        Assert.Contains("Phase2AlertAcknowledge", stackProbe, StringComparison.Ordinal);
        Assert.Contains("Pending fusion outbox event with dispatch disabled", stackProbe, StringComparison.Ordinal);
        Assert.Contains("$ErrorActionPreference = 'Continue'", stackStarter, StringComparison.Ordinal);
        Assert.Contains("$composeExitCode", stackStarter, StringComparison.Ordinal);
        Assert.Contains("Wait-TimescaleExtensionReady", stackStarter, StringComparison.Ordinal);
        Assert.Contains("$extensionExitCode", stackStarter, StringComparison.Ordinal);
        Assert.Contains("FII_LIVE_ALERT_TITLE", liveBrowser, StringComparison.Ordinal);
        Assert.Contains("/acknowledge", liveBrowser, StringComparison.Ordinal);
    }
}
