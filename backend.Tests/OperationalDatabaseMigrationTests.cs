using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using backend.Services;

namespace backend.Tests;

public sealed class OperationalDatabaseMigrationTests
{
    [Fact]
    public void RepositoryMigrationSetHasExpectedCanonicalHead()
    {
        var migrations = OperationalDatabaseMigrationService.LoadMigrations(RepositoryPath(
            "backend", "db", "migrations"));

        Assert.Equal(new[] { "0001", "0002", "0003", "0004", "0005", "0006" }, migrations.Select(migration => migration.Version));
    }

    [Fact]
    public void LoadMigrationsOrdersVersionsAndUsesExactFileSha256()
    {
        var directory = CreateTemporaryDirectory();
        try
        {
            File.WriteAllText(Path.Combine(directory, "0002_second.sql"), "SELECT 2;", new UTF8Encoding(false));
            File.WriteAllText(Path.Combine(directory, "0001_first.sql"), "SELECT 1;", new UTF8Encoding(false));

            var migrations = OperationalDatabaseMigrationService.LoadMigrations(directory);

            Assert.Equal(new[] { "0001", "0002" }, migrations.Select(migration => migration.Version));
            Assert.Equal(
                Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(Path.Combine(directory, "0001_first.sql")))).ToLowerInvariant(),
                migrations[0].Checksum);
        }
        finally
        {
            Directory.Delete(directory, recursive: true);
        }
    }

    [Fact]
    public void LoadMigrationsRejectsDuplicateVersions()
    {
        var directory = CreateTemporaryDirectory();
        try
        {
            File.WriteAllText(Path.Combine(directory, "0001_first.sql"), "SELECT 1;");
            File.WriteAllText(Path.Combine(directory, "0001_duplicate.sql"), "SELECT 2;");

            var error = Assert.Throws<InvalidOperationException>(
                () => OperationalDatabaseMigrationService.LoadMigrations(directory));

            Assert.Contains("Duplicate operational migration version", error.Message, StringComparison.Ordinal);
        }
        finally
        {
            Directory.Delete(directory, recursive: true);
        }
    }

    [Fact]
    public void PreflightRequiresExactHeadChecksumAndAppVersionProvenance()
    {
        var migrations = new[]
        {
            Migration("0001", "a"),
            Migration("0002", "b"),
        };

        Assert.Throws<InvalidOperationException>(() =>
            OperationalDatabaseMigrationService.ValidatePreflightState(
                migrations,
                new[] { Applied("0001", "a") }));
        Assert.Throws<InvalidOperationException>(() =>
            OperationalDatabaseMigrationService.ValidatePreflightState(
                migrations,
                new[] { Applied("0001", "changed"), Applied("0002", "b") }));
        Assert.Throws<InvalidOperationException>(() =>
            OperationalDatabaseMigrationService.ValidatePreflightState(
                migrations,
                new[] { Applied("0001", "a"), Applied("0002", "b", "") }));

        OperationalDatabaseMigrationService.ValidatePreflightState(
            migrations,
            new[] { Applied("0001", "a"), Applied("0002", "b") });
    }

    [Fact]
    public void MigrationPrefixRejectsUnknownOrOutOfOrderLedgerRows()
    {
        var migrations = new[] { Migration("0001", "a"), Migration("0002", "b") };

        Assert.Throws<InvalidOperationException>(() =>
            OperationalDatabaseMigrationService.ValidateMigrationPrefix(
                migrations,
                new[] { Applied("0002", "b") }));
        Assert.Throws<InvalidOperationException>(() =>
            OperationalDatabaseMigrationService.ValidateMigrationPrefix(
                migrations,
                new[] { Applied("0001", "a"), Applied("0002", "b"), Applied("0003", "c") }));
    }

    [Fact]
    public void BaselineConsolidatesOperationalTelemetryAndKeepsTimescaleSeparate()
    {
        var sql = File.ReadAllText(RepositoryPath(
            "backend", "db", "migrations", "0001_operational_baseline.sql"));

        Assert.Single(Regex.Matches(sql, @"CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+telemetry_data", RegexOptions.IgnoreCase).Cast<Match>());
        Assert.Single(Regex.Matches(sql, @"CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+event_log", RegexOptions.IgnoreCase).Cast<Match>());
        Assert.DoesNotContain("create_hypertable", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("independent lineage under infrastructure/timescaledb", sql, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("TRUNCATE", sql, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("DROP TABLE", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("ON CONFLICT (machine_id) DO NOTHING", sql, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void RunnerContractStoresChecksumAndAppVersionAndUsesReadOnlyPreflight()
    {
        var source = File.ReadAllText(RepositoryPath(
            "backend", "Services", "OperationalDatabaseMigrationService.cs"));

        Assert.Contains("SHA256.HashData", source, StringComparison.Ordinal);
        Assert.Contains("checksum CHAR(64) NOT NULL", source, StringComparison.Ordinal);
        Assert.Contains("app_version VARCHAR(128) NOT NULL", source, StringComparison.Ordinal);
        Assert.Contains("catalog_checksum CHAR(64)", source, StringComparison.Ordinal);
        Assert.Contains("ComputeCatalogChecksumAsync", source, StringComparison.Ordinal);
        Assert.Contains("ValidateLedgerlessCatalog", source, StringComparison.Ordinal);
        Assert.Contains("SET TRANSACTION READ ONLY", source, StringComparison.Ordinal);
        Assert.Contains("ValidatePreflightState", source, StringComparison.Ordinal);
    }

    [Fact]
    public void LedgerlessCatalogFailsClosedUnlessExactFingerprintIsApproved()
    {
        const string fingerprint = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

        OperationalDatabaseMigrationService.ValidateLedgerlessCatalog(
            hasOperationalTables: false,
            fingerprint,
            new HashSet<string>());
        Assert.Throws<InvalidOperationException>(() =>
            OperationalDatabaseMigrationService.ValidateLedgerlessCatalog(
                hasOperationalTables: true,
                fingerprint,
                new HashSet<string>()));
        OperationalDatabaseMigrationService.ValidateLedgerlessCatalog(
            hasOperationalTables: true,
            fingerprint,
            new HashSet<string> { fingerprint });
    }

    [Fact]
    public void CatalogValidationRequiresLatestAppliedFingerprintToMatch()
    {
        var applied = new[] { Applied("0002", "migration", catalogChecksum: "catalog") };

        OperationalDatabaseMigrationService.ValidateCatalogChecksum(applied, "catalog");
        Assert.Throws<InvalidOperationException>(() =>
            OperationalDatabaseMigrationService.ValidateCatalogChecksum(applied, "drift"));
        Assert.Throws<InvalidOperationException>(() =>
            OperationalDatabaseMigrationService.ValidateCatalogChecksum(
                new[] { Applied("0002", "migration", catalogChecksum: "") },
                "catalog"));
    }

    [Fact]
    public void SourceControlledHeadCatalogContractFailsClosed()
    {
        var source = File.ReadAllText(RepositoryPath(
            "backend", "Services", "OperationalDatabaseMigrationService.cs"));
        var expected = Regex.Match(
            source,
            "\\[\\\"0005\\\"\\] = \\\"(?<checksum>[^\\\"]+)\\\"").Groups["checksum"].Value;
        var upgradeBaseline = Regex.Match(
            source,
            "\\[\\\"0003\\\"\\] = \\\"(?<checksum>[^\\\"]+)\\\"").Groups["checksum"].Value;

        Assert.NotEmpty(expected);
        Assert.Equal("e7bb8a8c7a964b2dcb54b11191133419f87bd3c6150b4860b10bf11b6a509f35", upgradeBaseline);
        OperationalDatabaseMigrationService.ValidateExpectedCatalogChecksum("0005", expected);
        Assert.Throws<InvalidOperationException>(() =>
            OperationalDatabaseMigrationService.ValidateExpectedCatalogChecksum("0005", new string('f', 64)));
        Assert.Throws<InvalidOperationException>(() =>
            OperationalDatabaseMigrationService.ValidateExpectedCatalogChecksum("9999", expected));
    }

    [Fact]
    public void CatalogContractCoversGovernedNonTableObjectsAndMigrationTimeouts()
    {
        var source = File.ReadAllText(RepositoryPath(
            "backend", "Services", "OperationalDatabaseMigrationService.cs"));

        Assert.Contains("SELECT 'view'", source, StringComparison.Ordinal);
        Assert.Contains("SELECT 'sequence'", source, StringComparison.Ordinal);
        Assert.Contains("SELECT 'type'", source, StringComparison.Ordinal);
        Assert.Contains("lock_timeout", source, StringComparison.Ordinal);
        Assert.Contains("statement_timeout", source, StringComparison.Ordinal);
        Assert.Contains("blocking transaction", source, StringComparison.Ordinal);
        Assert.DoesNotMatch(@"SELECT\s+1\s+SELECT\s+1", source);
    }

    [Fact]
    public void ThirdMigrationMakesProjectionRetryDurableAndPreservesHistory()
    {
        var sql = File.ReadAllText(RepositoryPath(
            "backend", "db", "migrations", "0003_projection_and_history_integrity.sql"));

        Assert.Contains("projection_status", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("projection_attempts", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("source_telemetry_id", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("REFERENCES assets(id) ON DELETE RESTRICT NOT VALID", sql, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("REFERENCES assets(id) ON DELETE CASCADE", sql, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void FourthMigrationSeparatesSecondaryTargetsAndPreservesMachineHistory()
    {
        var sql = File.ReadAllText(RepositoryPath(
            "backend", "db", "migrations", "0004_secondary_delivery_leases_and_history.sql"));

        Assert.Contains("telemetry_secondary_deliveries", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("target IN ('CEP', 'TIMESCALE')", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("lease_expires_at", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("DROP COLUMN IF EXISTS projection_status", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("machine_telemetry_machine_id_fkey", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("machine_telemetry_history_machine_id_fkey", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("ON DELETE RESTRICT NOT VALID", sql, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void FifthMigrationDefaultsMachinesPendingAndEnforcesDeliveryTruth()
    {
        var sql = File.ReadAllText(RepositoryPath(
            "backend", "db", "migrations", "0005_approval_sequence_and_delivery_truth.sql"));

        Assert.Contains("approval_status SET DEFAULT 'PENDING'", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("delivery_sequence", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("delivery_sequence > 0", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("sequence > 0", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("ux_telemetry_receipts_device_sequence", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("ux_machine_telemetry_machine_sequence", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("'DISABLED'", sql, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void SecondMigrationNormalizesLegacyCatalogWithoutDiscardingDuplicateTelemetry()
    {
        var sql = File.ReadAllText(RepositoryPath(
            "backend", "db", "migrations", "0002_ingress_receipts_and_catalog_normalization.sql"));

        Assert.Contains("telemetry_data_duplicates_archive", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("row_number()", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("ux_telemetry_data_identity", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("ALTER COLUMN metric TYPE VARCHAR(100)", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("ALTER COLUMN created_at SET NOT NULL", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("REFERENCES assets(id) ON DELETE CASCADE NOT VALID", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("telemetry_receipts_device_message_key UNIQUE (device_id, message_id)", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("payload_hash CHAR(64) NOT NULL", sql, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("DROP TABLE", sql, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("TRUNCATE", sql, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void SixthMigrationAddsServiceAccountApiKeyColumn()
    {
        var sql = File.ReadAllText(RepositoryPath(
            "backend", "db", "migrations", "0006_service_account_api_key.sql"));

        Assert.Contains("ALTER TABLE users ADD COLUMN IF NOT EXISTS api_key_hash", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("api_key_hash IS NOT NULL", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("idx_users_api_key_hash", sql, StringComparison.OrdinalIgnoreCase);
    }

    private static OperationalDatabaseMigration Migration(string version, string checksum) =>
        new(version, $"{version}_migration.sql", checksum, "SELECT 1;");

    private static OperationalAppliedMigration Applied(
        string version,
        string checksum,
        string appVersion = "1.0.0",
        string catalogChecksum = "catalog") => new(version, checksum, appVersion, catalogChecksum);

    private static string CreateTemporaryDirectory()
    {
        var path = Path.Combine(Path.GetTempPath(), $"fii-db-migrations-{Guid.NewGuid():N}");
        Directory.CreateDirectory(path);
        return path;
    }

    private static string RepositoryPath(params string[] segments)
    {
        var root = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", ".."));
        return Path.Combine(new[] { root }.Concat(segments).ToArray());
    }
}
