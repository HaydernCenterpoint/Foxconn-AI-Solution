using Fusion.Adapter.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Fusion.Adapter.Outbox;

public sealed class FusionOutboxWorker : BackgroundService
{
    private readonly FusionOutboxDispatcher _dispatcher;
    private readonly OpenDataFusionOptions _options;
    private readonly IFusionOutboxRepository _repository;
    private readonly FusionAdapterMetrics _metrics;
    private readonly ILogger<FusionOutboxWorker> _logger;

    public FusionOutboxWorker(
        FusionOutboxDispatcher dispatcher,
        OpenDataFusionOptions options,
        IFusionOutboxRepository repository,
        FusionAdapterMetrics metrics,
        ILogger<FusionOutboxWorker> logger)
    {
        _dispatcher = dispatcher;
        _options = options;
        _repository = repository;
        _metrics = metrics;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_options.DispatchEnabled)
        {
            _logger.LogInformation("Fusion Adapter dispatch is disabled by configuration.");
            return;
        }

        var pollInterval = TimeSpan.FromSeconds(Math.Max(_options.PollIntervalSeconds, 1));
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var processed = await _dispatcher.DispatchOnceAsync(stoppingToken);
                var backlog = await _repository.GetBacklogAsync(stoppingToken);
                _metrics.RecordBacklog(backlog);
                if (processed > 0)
                    _logger.LogInformation(
                        "Fusion Adapter processed {ProcessedCount} outbox record(s); backlog is {BacklogCount}, oldest age {OldestBacklogAgeSeconds:F1}s.",
                        processed,
                        backlog.Count,
                        backlog.OldestAge.TotalSeconds);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Fusion Adapter dispatch cycle failed.");
            }

            await Task.Delay(pollInterval, stoppingToken);
        }
    }

}
