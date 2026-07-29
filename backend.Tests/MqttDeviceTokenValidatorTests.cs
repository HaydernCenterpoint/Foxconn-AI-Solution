using backend.Security;
using backend.Services;
using Microsoft.Extensions.Configuration;
using MQTTnet;
using MQTTnet.Protocol;
using MQTTnet.Server;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;

public sealed class MqttDeviceTokenValidatorTests
{
    private const string ClientId = "00000000-0000-0000-0000-000000000123";

    private static MqttDeviceTokenValidator CreateValidator()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                [$"MqttServer:DeviceTokens:{ClientId}"] = "device-secret"
            })
            .Build();

        return new MqttDeviceTokenValidator(configuration);
    }

    [Fact]
    public void ValidateRequiresClientBoundUserNameAndToken()
    {
        var validator = CreateValidator();

        Assert.True(validator.Validate(ClientId, ClientId, "device-secret"));
        Assert.False(validator.Validate(ClientId, ClientId, "wrong-secret"));
        Assert.False(validator.Validate(ClientId, "another-client", "device-secret"));
        Assert.False(validator.Validate(ClientId, ClientId, null));
        Assert.False(validator.Validate("unknown-client", "unknown-client", "device-secret"));
    }

    [Fact]
    public void TopicOwnershipAllowsOnlyTheAuthenticatedClientNamespace()
    {
        Assert.True(MqttDeviceTokenValidator.IsOwnedPublishTopic(ClientId, $"client/{ClientId}/telemetry"));
        Assert.True(MqttDeviceTokenValidator.IsOwnedSubscription(ClientId, $"client/{ClientId}/command"));
        Assert.False(MqttDeviceTokenValidator.IsOwnedPublishTopic(ClientId, "client/other/telemetry"));
        Assert.False(MqttDeviceTokenValidator.IsOwnedPublishTopic(ClientId, $"client/{ClientId}/command"));
        Assert.False(MqttDeviceTokenValidator.IsOwnedSubscription(ClientId, "client/+/command"));
    }

    [Fact]
    public void DevelopmentDefaultsToPlaintextEndpoint()
    {
        var configuration = new ConfigurationBuilder().Build();

        var options = MqttServerService.BuildServerOptions(
            configuration,
            isDevelopment: true);

        Assert.True(options.DefaultEndpointOptions.IsEnabled);
        Assert.Equal(1883, options.DefaultEndpointOptions.Port);
        Assert.False(options.TlsEndpointOptions.IsEnabled);
        Assert.Null(options.TlsEndpointOptions.CertificateProvider);
    }

    [Fact]
    public void ProductionWithoutCertificateConfigurationFailsClearly()
    {
        var configuration = new ConfigurationBuilder().Build();

        var error = Assert.Throws<InvalidOperationException>(() =>
            MqttServerService.BuildServerOptions(
                configuration,
                isDevelopment: false));

        Assert.Contains("MqttServer:Tls:CertificatePath", error.Message);
    }

    [Fact]
    public void TlsConfigurationEnablesOnlyEncryptedEndpointWithCertificate()
    {
        const string password = "test-password";
        string directory = Path.Combine(
            Path.GetTempPath(),
            $"mqtt-tls-{Guid.NewGuid():N}");
        Directory.CreateDirectory(directory);
        string certificatePath = Path.Combine(directory, "broker.pfx");

        try
        {
            using var rsa = RSA.Create(2048);
            var request = new CertificateRequest(
                "CN=localhost",
                rsa,
                HashAlgorithmName.SHA256,
                RSASignaturePadding.Pkcs1);
            using var sourceCertificate = request.CreateSelfSigned(
                DateTimeOffset.UtcNow.AddMinutes(-1),
                DateTimeOffset.UtcNow.AddDays(1));
            File.WriteAllBytes(
                certificatePath,
                sourceCertificate.Export(X509ContentType.Pfx, password));

            var configuration = new ConfigurationBuilder()
                .AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["MqttServer:Tls:Port"] = "9443",
                    ["MqttServer:Tls:CertificatePath"] = "broker.pfx",
                    ["MqttServer:Tls:CertificatePassword"] = password
                })
                .Build();

            var options = MqttServerService.BuildServerOptions(
                configuration,
                isDevelopment: false,
                contentRootPath: directory);

            Assert.False(options.DefaultEndpointOptions.IsEnabled);
            Assert.True(options.TlsEndpointOptions.IsEnabled);
            Assert.Equal(9443, options.TlsEndpointOptions.Port);
            Assert.NotNull(options.TlsEndpointOptions.CertificateProvider);
            using var loadedCertificate = options.TlsEndpointOptions
                .CertificateProvider
                .GetCertificate();
            Assert.True(loadedCertificate.HasPrivateKey);
        }
        finally
        {
            Directory.Delete(directory, recursive: true);
        }
    }

    [Fact]
    public async Task MqttConnectRejectsMissingOrInvalidCredentials()
    {
        var validator = CreateValidator();
        var port = GetAvailablePort();
        var server = new MqttServerFactory().CreateMqttServer(
            new MqttServerOptionsBuilder()
                .WithDefaultEndpoint()
                .WithDefaultEndpointPort(port)
                .Build());
        server.ValidatingConnectionAsync += args =>
        {
            args.ReasonCode = validator.Validate(args.ClientId, args.UserName, args.Password)
                ? MqttConnectReasonCode.Success
                : MqttConnectReasonCode.BadUserNameOrPassword;
            return Task.CompletedTask;
        };

        await server.StartAsync();
        try
        {
            using var validClient = new MqttClientFactory().CreateMqttClient();
            var validResult = await validClient.ConnectAsync(
                new MqttClientFactory().CreateClientOptionsBuilder()
                    .WithTcpServer(IPAddress.Loopback.ToString(), port)
                    .WithClientId(ClientId)
                    .WithCredentials(ClientId, "device-secret")
                    .Build());
            Assert.Equal(MqttClientConnectResultCode.Success, validResult.ResultCode);
            await validClient.DisconnectAsync();

            using var invalidClient = new MqttClientFactory().CreateMqttClient();
            var invalidResult = await invalidClient.ConnectAsync(
                new MqttClientFactory().CreateClientOptionsBuilder()
                    .WithTcpServer(IPAddress.Loopback.ToString(), port)
                    .WithClientId(ClientId)
                    .Build());
            Assert.NotEqual(MqttClientConnectResultCode.Success, invalidResult.ResultCode);
        }
        finally
        {
            await server.StopAsync();
            server.Dispose();
        }
    }

    private static int GetAvailablePort()
    {
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();
        return port;
    }
}
