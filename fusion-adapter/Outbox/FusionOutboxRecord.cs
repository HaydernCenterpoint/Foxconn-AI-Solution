using Mkz.Fusion.Contracts;

namespace Fusion.Adapter.Outbox;

public sealed record FusionOutboxRecord(
    Guid Id,
    Guid LockId,
    int Attempts,
    TelemetryFusionEvent Event)
{
    public static FusionOutboxRecord For(TelemetryFusionEvent telemetryEvent, int attempts = 0) =>
        new(Guid.NewGuid(), Guid.NewGuid(), attempts, telemetryEvent);
}
