using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Fusion.Adapter.Configuration;
using Fusion.Adapter.Mapping;

namespace Fusion.Adapter.Transport;

public sealed class OpenDataFusionClient : IOpenDataFusionClient
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly HttpClient _httpClient;
    private readonly OpenDataFusionOptions _options;
    private readonly IAccessTokenProvider _tokenProvider;

    public OpenDataFusionClient(
        HttpClient httpClient,
        OpenDataFusionOptions options,
        IAccessTokenProvider tokenProvider)
    {
        _httpClient = httpClient;
        _options = options;
        _tokenProvider = tokenProvider;
    }

    public async Task<DeliveryResult> SendAsync(OpenDataFusionBundle bundle, CancellationToken cancellationToken)
    {
        if (!Uri.TryCreate(_options.BaseUrl, UriKind.Absolute, out var baseUri))
            return DeliveryResult.PermanentFailure("ODF BaseUrl must be an absolute URL.");

        using var request = new HttpRequestMessage(HttpMethod.Post, new Uri(baseUri, "api/v1/ingest/bundle"));
        request.Headers.Add("x-odf-tenant-id", _options.TenantId);
        request.Headers.Add("x-odf-project-id", _options.ProjectId);
        request.Content = new StringContent(
            JsonSerializer.Serialize(bundle, JsonOptions),
            Encoding.UTF8,
            "application/json");

        if (_options.Authentication.Mode.Equals("development", StringComparison.OrdinalIgnoreCase))
        {
            request.Headers.Add("x-odf-user", _options.Authentication.DevelopmentUser);
        }
        else
        {
            try
            {
                var token = await _tokenProvider.GetAccessTokenAsync(cancellationToken);
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            }
            catch (Exception ex) when (ex is HttpRequestException or InvalidOperationException)
            {
                return DeliveryResult.TransientFailure(ex.Message);
            }
        }

        try
        {
            using var response = await _httpClient.SendAsync(request, cancellationToken);
            if (response.IsSuccessStatusCode) return DeliveryResult.Delivered();

            var error = await response.Content.ReadAsStringAsync(cancellationToken);
            var message = string.IsNullOrWhiteSpace(error)
                ? $"ODF returned {(int)response.StatusCode} ({response.StatusCode})."
                : error;
            return response.StatusCode is HttpStatusCode.BadRequest or HttpStatusCode.UnprocessableEntity
                ? DeliveryResult.PermanentFailure(message)
                : DeliveryResult.TransientFailure(message);
        }
        catch (HttpRequestException ex)
        {
            return DeliveryResult.TransientFailure(ex.Message);
        }
        catch (TaskCanceledException ex) when (!cancellationToken.IsCancellationRequested)
        {
            return DeliveryResult.TransientFailure(ex.Message);
        }
    }
}
