using backend.Controllers;

namespace backend.Tests;

public class MachineHealthControllerTests
{
    [Fact]
    public void CalculateScore_UsesRecentCepEvents()
    {
        var healthy = MachineHealthController.CalculateScore("running", true, 50, 60, 0, 0);
        var degraded = MachineHealthController.CalculateScore("running", true, 50, 60, 0, 10);

        Assert.Equal((100, "healthy", 100, 100, 100), healthy);
        Assert.Equal((85, "healthy", 100, 50, 100), degraded);
    }
}
