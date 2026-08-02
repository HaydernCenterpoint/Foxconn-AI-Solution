using Fusion.Adapter.Configuration;
using Fusion.Adapter.Mapping;
using Fusion.Adapter.Transport;
using System.Diagnostics;

namespace Fusion.Adapter.Outbox;

public sealed class FusionOutboxDispatcher
{
    private readonly IFusionOutboxRepository _repository;
    private readonly OpenDataFusionBundleMapper _mapper;
    private readonly IOpenDataFusionClient _client;
    private readonly OpenDataFusionOptions _options;
    private readonly FusionAdapterMetrics _metrics;

    public FusionOutboxDispatcher(
        IFusionOutboxRepository repository,
        OpenDataFusionBundleMapper mapper,
        IOpenDataFusionClient client,
        OpenDataFusionOptions options,
        FusionAdapterMetrics metrics)
    {
        _repository = repository;
        _mapper = mapper;
        _client = client;
        _options = options;
        _metrics = metrics;
    }

    public async Task<int> DispatchOnceAsync(CancellationToken cancellationToken)
    {
        var records = await _repository.ClaimAsync(
            _options.BatchSize,
            TimeSpan.FromSeconds(_options.LeaseSeconds),
            cancellationToken);

        foreach (var record in records)
        {
            DeliveryResult result;
            var startedAt = Stopwatch.GetTimestamp();
            try
            {
                result = await _client.SendAsync(_mapper.Map(record.Event), cancellationToken);
            }
            catch (HttpRequestException ex)
            {
                result = DeliveryResult.TransientFailure(ex.Message);
            }
            catch (TaskCanceledException ex) when (!cancellationToken.IsCancellationRequested)
            {
                result = DeliveryResult.TransientFailure(ex.Message);
            }
            catch (Exception ex)
            {
                result = DeliveryResult.TransientFailure(ex.Message);
            }
            finally
            {
                _metrics.DispatchLatency.Record(Stopwatch.GetElapsedTime(startedAt).TotalMilliseconds);
            }

            if (result.IsAuthenticationFailure)
                _metrics.AuthenticationFailureCount.Add(1);

            if (result.Kind == DeliveryKind.Delivered)
            {
                await _repository.MarkDeliveredAsync(record.Id, record.LockId, cancellationToken);
                continue;
            }

            if (result.Kind == DeliveryKind.PermanentFailure || record.Attempts + 1 >= _options.MaxAttempts)
            {
                await _repository.MarkDeadAsync(record.Id, record.LockId, result.Error, cancellationToken);
                _metrics.DeadCount.Add(1);
                continue;
            }

            await _repository.ScheduleRetryAsync(
                record.Id,
                record.LockId,
                RetryPolicy.NextDelay(record.Attempts + 1),
                result.Error,
                cancellationToken);
            _metrics.RetryCount.Add(1);
        }

        return records.Count;
    }
}
