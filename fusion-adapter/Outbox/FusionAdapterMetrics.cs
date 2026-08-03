using System.Diagnostics.Metrics;

namespace Fusion.Adapter.Outbox;

public sealed class FusionAdapterMetrics : IDisposable
{
    public const string MeterName = "Fusion.Adapter";

    private readonly Meter _meter = new(MeterName);
    private long _backlogCount;
    private double _oldestBacklogAgeSeconds;

    public FusionAdapterMetrics()
    {
        _meter.CreateObservableGauge("fusion.adapter.backlog.count", () => Interlocked.Read(ref _backlogCount));
        _meter.CreateObservableGauge("fusion.adapter.backlog.oldest_age", () => Volatile.Read(ref _oldestBacklogAgeSeconds), "s");
        RetryCount = _meter.CreateCounter<long>("fusion.adapter.retry.count");
        DeadCount = _meter.CreateCounter<long>("fusion.adapter.dead.count");
        DispatchLatency = _meter.CreateHistogram<double>("fusion.adapter.dispatch.duration", "ms");
        AuthenticationFailureCount = _meter.CreateCounter<long>("fusion.adapter.auth_failure.count");
    }

    public Counter<long> RetryCount { get; }
    public Counter<long> DeadCount { get; }
    public Histogram<double> DispatchLatency { get; }
    public Counter<long> AuthenticationFailureCount { get; }

    public void RecordBacklog(FusionOutboxBacklog backlog)
    {
        Interlocked.Exchange(ref _backlogCount, backlog.Count);
        Volatile.Write(ref _oldestBacklogAgeSeconds, Math.Max(0, backlog.OldestAge.TotalSeconds));
    }

    public void Dispose() => _meter.Dispose();
}
