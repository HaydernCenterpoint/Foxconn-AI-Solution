using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace backend.Controllers;

[ApiController]
[Route("api/integrations/connectors")]
[Authorize(Roles = "ADMIN,ENGINEER")]
public sealed class ConnectorIntegrationController : ControllerBase
{
    public const string HttpClientName = "connector-api";

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _configuration;
    private readonly ILogger<ConnectorIntegrationController> _logger;

    public ConnectorIntegrationController(
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        ILogger<ConnectorIntegrationController> logger)
    {
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> List(CancellationToken cancellationToken)
    {
        var apiKey = _configuration["ConnectorApi:ApiKey"];
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            _logger.LogError("ConnectorApi:ApiKey is not configured");
            return Problem(
                statusCode: StatusCodes.Status503ServiceUnavailable,
                title: "Connector integration is unavailable");
        }

        using var request = new HttpRequestMessage(HttpMethod.Get, "connectors");
        request.Headers.TryAddWithoutValidation("X-Connector-API-Key", apiKey);

        try
        {
            var client = _httpClientFactory.CreateClient(HttpClientName);
            using var response = await client.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning(
                    "Connector API returned HTTP {StatusCode}",
                    (int)response.StatusCode);
                return Problem(
                    statusCode: StatusCodes.Status502BadGateway,
                    title: "Connector integration is unavailable");
            }

            var json = await response.Content.ReadAsStringAsync(cancellationToken);
            return Content(json, "application/json", Encoding.UTF8);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            _logger.LogWarning(exception, "Connector API request failed");
            return Problem(
                statusCode: StatusCodes.Status503ServiceUnavailable,
                title: "Connector integration is unavailable");
        }
    }
}
