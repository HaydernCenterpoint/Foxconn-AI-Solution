namespace Fusion.Adapter.Outbox;

public interface IFusionOutboxRepository
{
    Task<FusionOutboxBacklog> GetBacklogAsync(CancellationToken cancellationToken);

    Task<IReadOnlyList<FusionOutboxRecord>> ClaimAsync(
        int batchSize,
        TimeSpan lease,
        CancellationToken cancellationToken);

    Task MarkDeliveredAsync(Guid id, Guid lockId, CancellationToken cancellationToken);

    Task ScheduleRetryAsync(
        Guid id,
        Guid lockId,
        TimeSpan delay,
        string? error,
        CancellationToken cancellationToken);

    Task MarkDeadAsync(
        Guid id,
        Guid lockId,
        string? error,
        CancellationToken cancellationToken);
}

public sealed record FusionOutboxBacklog(long Count, TimeSpan OldestAge);
