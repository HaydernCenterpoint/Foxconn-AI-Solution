using System.Collections.Concurrent;
using System.Diagnostics.Metrics;
using Fusion.Adapter.Outbox;

namespace Fusion.Adapter.Tests.Outbox;

public sealed class FusionAdapterMetricsTests
{
    [Fact]
    public void Metrics_ExposeRequiredBacklogAndDeliverySignals()
    {
        var measurements = new ConcurrentDictionary<string, ConcurrentBag<double>>();
        using var listener = new MeterListener
        {
            InstrumentPublished = (instrument, meterListener) =>
            {
                if (instrument.Meter.Name == FusionAdapterMetrics.MeterName)
                    meterListener.EnableMeasurementEvents(instrument);
            }
        };
        listener.SetMeasurementEventCallback<long>((instrument, value, _, _) =>
            measurements.GetOrAdd(instrument.Name, _ => []).Add(value));
        listener.SetMeasurementEventCallback<double>((instrument, value, _, _) =>
            measurements.GetOrAdd(instrument.Name, _ => []).Add(value));
        listener.Start();

        using var metrics = new FusionAdapterMetrics();
        metrics.RecordBacklog(new FusionOutboxBacklog(7, TimeSpan.FromSeconds(42)));
        metrics.RetryCount.Add(1);
        metrics.DeadCount.Add(1);
        metrics.DispatchLatency.Record(12.5);
        metrics.AuthenticationFailureCount.Add(1);
        listener.RecordObservableInstruments();

        Assert.Contains(7, measurements["fusion.adapter.backlog.count"]);
        Assert.Contains(42, measurements["fusion.adapter.backlog.oldest_age"]);
        Assert.Contains(1, measurements["fusion.adapter.retry.count"]);
        Assert.Contains(1, measurements["fusion.adapter.dead.count"]);
        Assert.Contains(12.5, measurements["fusion.adapter.dispatch.duration"]);
        Assert.Contains(1, measurements["fusion.adapter.auth_failure.count"]);
    }
}
