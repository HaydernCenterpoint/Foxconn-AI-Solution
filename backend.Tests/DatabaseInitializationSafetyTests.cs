using System.Text.RegularExpressions;

public sealed class DatabaseInitializationSafetyTests
{
    [Fact]
    public void StartupSchemaInitializationDoesNotResetOperationalData()
    {
        var sourcePath = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "backend", "Services", "DatabaseService.cs"));
        var source = File.ReadAllText(sourcePath);
        var initializeStart = source.IndexOf("private void InitializeDatabase()", StringComparison.Ordinal);
        var executeSyncStart = source.IndexOf("private static void ExecuteSync", initializeStart, StringComparison.Ordinal);

        Assert.True(initializeStart >= 0 && executeSyncStart > initializeStart);
        var initialization = source[initializeStart..executeSyncStart];

        Assert.DoesNotContain("TRUNCATE", initialization, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotMatch(new Regex(@"UPDATE\s+machines\s+SET\s+status", RegexOptions.IgnoreCase), initialization);
        Assert.DoesNotMatch(new Regex(@"INSERT\s+INTO\s+users", RegexOptions.IgnoreCase), initialization);
        Assert.Contains("throw new InvalidOperationException", initialization, StringComparison.Ordinal);
    }
}
