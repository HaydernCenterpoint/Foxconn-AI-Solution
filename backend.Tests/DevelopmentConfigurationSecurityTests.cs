using Microsoft.Extensions.Configuration;

public sealed class DevelopmentConfigurationSecurityTests
{
    [Fact]
    public void DevelopmentConfigurationDoesNotTrackRuntimeSecrets()
    {
        var configurationPath = Path.GetFullPath(
            Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "backend", "appsettings.Development.json"));
        var configuration = new ConfigurationBuilder()
            .AddJsonFile(configurationPath, optional: false)
            .Build();

        Assert.Null(configuration["Jwt:Key"]);
        Assert.Null(configuration["Mqtt:EncryptionKey"]);

        foreach (var connectionString in configuration.GetSection("ConnectionStrings").GetChildren())
        {
            Assert.DoesNotContain("Password=", connectionString.Value, StringComparison.OrdinalIgnoreCase);
        }
    }
}
