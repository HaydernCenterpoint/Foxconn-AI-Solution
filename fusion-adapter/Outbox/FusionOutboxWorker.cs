using Fusion.Adapter.Configuration;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using System.Text;

namespace Fusion.Adapter.Outbox;

public sealed class FusionOutboxWorker : BackgroundService
{
    private readonly FusionOutboxDispatcher _dispatcher;
    private readonly OpenDataFusionOptions _options;
    private readonly IConfiguration _configuration;
    private readonly ILogger<FusionOutboxWorker> _logger;

    public FusionOutboxWorker(
        FusionOutboxDispatcher dispatcher,
        OpenDataFusionOptions options,
        IConfiguration configuration,
        ILogger<FusionOutboxWorker> logger)
    {
        _dispatcher = dispatcher;
        _options = options;
        _configuration = configuration;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_options.DispatchEnabled)
        {
            _logger.LogInformation("Fusion Adapter dispatch is disabled by configuration.");
            return;
        }

        if (!HasRequiredConfiguration())
        {
            _logger.LogCritical("Fusion Adapter dispatch is enabled but its required database, ODF scope, URL, or identity configuration is missing.");
            return;
        }

        var pollInterval = TimeSpan.FromSeconds(Math.Max(_options.PollIntervalSeconds, 1));
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var processed = await _dispatcher.DispatchOnceAsync(stoppingToken);
                if (processed > 0)
                    _logger.LogInformation("Fusion Adapter dispatched {ProcessedCount} outbox record(s).", processed);
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

    private bool HasRequiredConfiguration()
    {
        if (string.IsNullOrWhiteSpace(_configuration.GetConnectionString("MkzOperations")) ||
            string.IsNullOrWhiteSpace(_options.TenantId) ||
            string.IsNullOrWhiteSpace(_options.ProjectId) ||
            !Uri.TryCreate(_options.BaseUrl, UriKind.Absolute, out _))
        {
            return false;
        }

        if (_options.Authentication.Mode.Equals("development", StringComparison.OrdinalIgnoreCase))
            return !string.IsNullOrWhiteSpace(_options.Authentication.DevelopmentUser);

        if (_options.Authentication.Mode.Equals("factory", StringComparison.OrdinalIgnoreCase))
        {
            var role = _options.Authentication.FactoryRole.Trim().ToUpperInvariant();
            return Encoding.UTF8.GetByteCount(_options.Authentication.FactorySecret) >= 32 &&
                   !string.IsNullOrWhiteSpace(_options.Authentication.FactorySubject) &&
                   !string.IsNullOrWhiteSpace(_options.Authentication.FactoryIssuer) &&
                   !string.IsNullOrWhiteSpace(_options.Authentication.FactoryAudience) &&
                   role is "ADMIN" or "ENGINEER" or "GUEST";
        }

        return !string.IsNullOrWhiteSpace(_options.Authentication.TokenEndpoint) &&
               !string.IsNullOrWhiteSpace(_options.Authentication.ClientId) &&
               !string.IsNullOrWhiteSpace(_options.Authentication.ClientSecret);
    }
}
