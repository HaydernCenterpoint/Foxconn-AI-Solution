using Fusion.Adapter.Configuration;
using Fusion.Adapter.Mapping;
using Fusion.Adapter.Transport;

namespace Fusion.Adapter.Outbox;

public sealed class FusionOutboxDispatcher
{
    private readonly IFusionOutboxRepository _repository;
    private readonly OpenDataFusionBundleMapper _mapper;
    private readonly IOpenDataFusionClient _client;
    private readonly OpenDataFusionOptions _options;

    public FusionOutboxDispatcher(
        IFusionOutboxRepository repository,
        OpenDataFusionBundleMapper mapper,
        IOpenDataFusionClient client,
        OpenDataFusionOptions options)
    {
        _repository = repository;
        _mapper = mapper;
        _client = client;
        _options = options;
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

            if (result.Kind == DeliveryKind.Delivered)
            {
                await _repository.MarkDeliveredAsync(record.Id, record.LockId, cancellationToken);
                continue;
            }

            if (result.Kind == DeliveryKind.PermanentFailure || record.Attempts + 1 >= _options.MaxAttempts)
            {
                await _repository.MarkDeadAsync(record.Id, record.LockId, result.Error, cancellationToken);
                continue;
            }

            await _repository.ScheduleRetryAsync(
                record.Id,
                record.LockId,
                RetryPolicy.NextDelay(record.Attempts + 1),
                result.Error,
                cancellationToken);
        }

        return records.Count;
    }
}
