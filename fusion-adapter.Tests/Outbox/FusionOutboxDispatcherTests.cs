using Fusion.Adapter.Configuration;
using Fusion.Adapter.Mapping;
using Fusion.Adapter.Outbox;
using Fusion.Adapter.Transport;
using Mkz.Fusion.Contracts;

namespace Fusion.Adapter.Tests.Outbox;

public sealed class FusionOutboxDispatcherTests
{
    [Fact]
    public async Task DispatchOnceAsync_MarksDeliveredAfterSuccessfulOdfResponse()
    {
        var repository = new FakeRepository(FusionOutboxRecord.For(TestEvent));
        var client = new FakeClient(DeliveryResult.Delivered());
        var dispatcher = new FusionOutboxDispatcher(
            repository,
            new OpenDataFusionBundleMapper(TestOptions),
            client,
            TestOptions);

        await dispatcher.DispatchOnceAsync(CancellationToken.None);

        Assert.Equal(1, repository.DeliveredCount);
        Assert.Equal(0, repository.DeadCount);
        Assert.Equal(0, repository.RetryCount);
    }

    [Fact]
    public async Task DispatchOnceAsync_MarksDeadForInvalidBundle()
    {
        var repository = new FakeRepository(FusionOutboxRecord.For(TestEvent));
        var client = new FakeClient(DeliveryResult.PermanentFailure("ODF rejected payload"));
        var dispatcher = new FusionOutboxDispatcher(
            repository,
            new OpenDataFusionBundleMapper(TestOptions),
            client,
            TestOptions);

        await dispatcher.DispatchOnceAsync(CancellationToken.None);

        Assert.Equal(1, repository.DeadCount);
        Assert.Equal(0, repository.DeliveredCount);
    }

    [Fact]
    public async Task DispatchOnceAsync_SchedulesTransientFailureForRetry()
    {
        var repository = new FakeRepository(FusionOutboxRecord.For(TestEvent));
        var client = new FakeClient(DeliveryResult.TransientFailure("ODF unavailable"));
        var dispatcher = new FusionOutboxDispatcher(
            repository,
            new OpenDataFusionBundleMapper(TestOptions),
            client,
            TestOptions);

        await dispatcher.DispatchOnceAsync(CancellationToken.None);

        Assert.Equal(1, repository.RetryCount);
        Assert.Equal(0, repository.DeliveredCount);
        Assert.Equal(0, repository.DeadCount);
    }

    private static OpenDataFusionOptions TestOptions => new()
    {
        DispatchEnabled = true,
        TenantId = "tenant-a",
        ProjectId = "project-a",
        PlantExternalId = "mkz:plant:site-a",
        PlantName = "Site A"
    };

    private static TelemetryFusionEvent TestEvent => new(
        1,
        Guid.Parse("77777777-7777-7777-7777-777777777777"),
        "telemetry:66666666-6666-6666-6666-666666666666:message-1",
        DateTimeOffset.Parse("2026-07-13T10:00:00Z"),
        new MachineSnapshot(Guid.Parse("66666666-6666-6666-6666-666666666666"), "client-a", "PRESS-A", "Press A"),
        null,
        new TelemetryValues("message-1", "RUNNING", true, 42, null, null, null, null, false),
        "{}");

    private sealed class FakeRepository : IFusionOutboxRepository
    {
        private readonly IReadOnlyList<FusionOutboxRecord> _records;

        public FakeRepository(params FusionOutboxRecord[] records)
        {
            _records = records;
        }

        public int DeliveredCount { get; private set; }
        public int DeadCount { get; private set; }
        public int RetryCount { get; private set; }

        public Task<IReadOnlyList<FusionOutboxRecord>> ClaimAsync(int batchSize, TimeSpan lease, CancellationToken cancellationToken) =>
            Task.FromResult(_records);

        public Task MarkDeliveredAsync(Guid id, Guid lockId, CancellationToken cancellationToken)
        {
            DeliveredCount++;
            return Task.CompletedTask;
        }

        public Task ScheduleRetryAsync(Guid id, Guid lockId, TimeSpan delay, string? error, CancellationToken cancellationToken)
        {
            RetryCount++;
            return Task.CompletedTask;
        }

        public Task MarkDeadAsync(Guid id, Guid lockId, string? error, CancellationToken cancellationToken)
        {
            DeadCount++;
            return Task.CompletedTask;
        }
    }

    private sealed class FakeClient : IOpenDataFusionClient
    {
        private readonly DeliveryResult _result;

        public FakeClient(DeliveryResult result)
        {
            _result = result;
        }

        public Task<DeliveryResult> SendAsync(OpenDataFusionBundle bundle, CancellationToken cancellationToken) =>
            Task.FromResult(_result);
    }
}
