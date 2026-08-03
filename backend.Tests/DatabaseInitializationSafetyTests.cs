using System.Text.RegularExpressions;

namespace backend.Tests;

public sealed class DatabaseInitializationSafetyTests
{
    [Fact]
    public void DatabaseServiceConstructorDoesNotPerformSchemaDdl()
    {
        var source = File.ReadAllText(RepositoryPath("backend", "Services", "DatabaseService.cs"));
        var constructorStart = source.IndexOf("public DatabaseService(", StringComparison.Ordinal);
        var createConnectionStart = source.IndexOf("public NpgsqlConnection CreateConnection()", StringComparison.Ordinal);

        Assert.True(constructorStart >= 0 && createConnectionStart > constructorStart);
        var constructor = source[constructorStart..createConnectionStart];

        Assert.DoesNotContain("InitializeDatabase", constructor, StringComparison.Ordinal);
        Assert.DoesNotMatch(new Regex(@"CREATE\s+(TABLE|INDEX|TYPE)", RegexOptions.IgnoreCase), source);
        Assert.DoesNotMatch(new Regex(@"ALTER\s+TABLE", RegexOptions.IgnoreCase), source);
    }

    [Fact]
    public void ProgramPreflightsBeforeNormalApplicationStartup()
    {
        var source = File.ReadAllText(RepositoryPath("backend", "Program.cs"));
        var migrate = source.IndexOf("--database-migrate", StringComparison.Ordinal);
        var preflight = source.IndexOf("await operationalDatabase.PreflightAsync()", StringComparison.Ordinal);
        var cryptoInitialization = source.IndexOf("CryptoHelper.Initialize", StringComparison.Ordinal);
        var applicationBuild = source.LastIndexOf("builder.Build()", StringComparison.Ordinal);

        Assert.True(migrate >= 0 && migrate < preflight);
        Assert.True(preflight >= 0 && preflight < cryptoInitialization);
        Assert.True(preflight < applicationBuild);
    }

    private static string RepositoryPath(params string[] segments)
    {
        var root = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", ".."));
        return Path.Combine(new[] { root }.Concat(segments).ToArray());
    }
}
