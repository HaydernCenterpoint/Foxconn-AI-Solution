using System.Data;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Npgsql;

namespace backend.Services;

public sealed record OperationalDatabaseMigration(
    string Version,
    string FileName,
    string Checksum,
    string Sql);

public sealed record OperationalDatabaseMigrationResult(
    string HeadVersion,
    int AppliedCount,
    int TotalCount);

public sealed record OperationalAppliedMigration(
    string Version,
    string Checksum,
    string AppVersion,
    string CatalogChecksum);

public sealed class OperationalDatabaseMigrationService
{
    private const string LedgerName = "public.schema_migrations";
    private static readonly Regex MigrationFilePattern = new(
        "^(?<version>[0-9]{4})_[a-z0-9][a-z0-9_-]*[.]sql$",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private static readonly IReadOnlyDictionary<string, string> ExpectedCatalogChecksums =
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["0003"] = "e7bb8a8c7a964b2dcb54b11191133419f87bd3c6150b4860b10bf11b6a509f35",
            ["0004"] = "e48038560ba139c0572ffbf94101adc0597434471c4d4154b4376b6f2ff672e4",
            ["0005"] = "e411e294f7c8d95595b527ad9ae47303cd6c6c0a99ae9fd2f7081f46a42ed5d0",
            ["0006"] = "57a6421a97708a09ab7d4e3ebef4fb5e57bf00aa4053ea3866c1a77bf3cd02cd",
        };

    private readonly string _connectionString;
    private readonly string _migrationsDirectory;
    private readonly string _appVersion;
    private readonly HashSet<string> _approvedLegacyCatalogFingerprints;
    private readonly int _migrationCommandTimeoutSeconds;
    private readonly int _migrationLockTimeoutSeconds;

    public OperationalDatabaseMigrationService(
        string connectionString,
        string? migrationsDirectory = null,
        string? appVersion = null,
        IEnumerable<string>? approvedLegacyCatalogFingerprints = null,
        int migrationCommandTimeoutSeconds = 600,
        int migrationLockTimeoutSeconds = 15)
    {
        var validatedConnectionString = string.IsNullOrWhiteSpace(connectionString)
            ? throw new ArgumentException("A database connection string is required.", nameof(connectionString))
            : connectionString;
        _migrationCommandTimeoutSeconds = Math.Clamp(migrationCommandTimeoutSeconds, 30, 3_600);
        _migrationLockTimeoutSeconds = Math.Clamp(migrationLockTimeoutSeconds, 1, 300);
        _connectionString = new NpgsqlConnectionStringBuilder(validatedConnectionString)
        {
            CommandTimeout = _migrationCommandTimeoutSeconds,
        }.ConnectionString;
        _migrationsDirectory = migrationsDirectory
            ?? Path.Combine(AppContext.BaseDirectory, "db", "migrations");
        _appVersion = appVersion
            ?? Assembly.GetExecutingAssembly().GetName().Version?.ToString()
            ?? "unknown";
        _approvedLegacyCatalogFingerprints = (approvedLegacyCatalogFingerprints ?? [])
            .Select(value => value.Trim().ToLowerInvariant())
            .Where(value => value.Length == 64 && value.All(Uri.IsHexDigit))
            .ToHashSet(StringComparer.Ordinal);
    }

    public static IReadOnlyList<OperationalDatabaseMigration> LoadMigrations(string migrationsDirectory)
    {
        if (!Directory.Exists(migrationsDirectory))
        {
            throw new InvalidOperationException($"Operational migration directory was not found: {migrationsDirectory}");
        }

        var migrations = Directory.EnumerateFiles(migrationsDirectory, "*.sql", SearchOption.TopDirectoryOnly)
            .Select(path =>
            {
                var fileName = Path.GetFileName(path);
                var match = MigrationFilePattern.Match(fileName);
                if (!match.Success)
                {
                    throw new InvalidOperationException(
                        $"Operational migration file name must match NNNN_name.sql: {fileName}");
                }

                var bytes = File.ReadAllBytes(path);
                var sqlOffset = bytes.AsSpan().StartsWith(new byte[] { 0xEF, 0xBB, 0xBF }) ? 3 : 0;
                return new OperationalDatabaseMigration(
                    match.Groups["version"].Value,
                    fileName,
                    Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant(),
                    Encoding.UTF8.GetString(bytes, sqlOffset, bytes.Length - sqlOffset));
            })
            .OrderBy(migration => migration.Version, StringComparer.Ordinal)
            .ToArray();

        if (migrations.Length == 0)
        {
            throw new InvalidOperationException("No operational database migrations were found.");
        }

        var duplicate = migrations.GroupBy(migration => migration.Version, StringComparer.Ordinal)
            .FirstOrDefault(group => group.Count() > 1);
        if (duplicate is not null)
        {
            throw new InvalidOperationException($"Duplicate operational migration version: {duplicate.Key}");
        }

        return migrations;
    }

    public async Task<OperationalDatabaseMigrationResult> MigrateAsync(
        CancellationToken cancellationToken = default)
    {
        try
        {
            return await MigrateCoreAsync(cancellationToken);
        }
        catch (PostgresException exception) when (exception.SqlState is "55P03" or "57014")
        {
            throw new InvalidOperationException(
                $"Operational migration timed out waiting for a database lock or command. " +
                $"Lock timeout is {_migrationLockTimeoutSeconds}s and command timeout is {_migrationCommandTimeoutSeconds}s. " +
                "Identify and finish the blocking transaction, then rerun --database-migrate.",
                exception);
        }
        catch (NpgsqlException exception) when (exception.InnerException is TimeoutException)
        {
            throw new InvalidOperationException(
                $"Operational migration exceeded the {_migrationCommandTimeoutSeconds}s command timeout. " +
                "Inspect database activity and migration row volume, then rerun --database-migrate.",
                exception);
        }
    }

    private async Task<OperationalDatabaseMigrationResult> MigrateCoreAsync(
        CancellationToken cancellationToken)
    {
        var migrations = LoadMigrations(_migrationsDirectory);
        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);

        await ExecuteAsync(connection, transaction,
            $"SET LOCAL lock_timeout = '{_migrationLockTimeoutSeconds}s'; " +
            $"SET LOCAL statement_timeout = '{_migrationCommandTimeoutSeconds}s';",
            cancellationToken);

        await ExecuteAsync(connection, transaction,
            "SELECT pg_advisory_xact_lock(hashtextextended('fii-ai-operational-migrations', 0));",
            cancellationToken);
        await ExecuteAsync(connection, transaction, """
            CREATE TABLE IF NOT EXISTS public.schema_migrations (
                version VARCHAR(32) PRIMARY KEY,
                checksum CHAR(64) NOT NULL,
                app_version VARCHAR(128) NOT NULL,
                catalog_checksum CHAR(64),
                applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            ALTER TABLE public.schema_migrations
                ADD COLUMN IF NOT EXISTS catalog_checksum CHAR(64);
            """, cancellationToken);

        var applied = await ReadLedgerAsync(connection, transaction, cancellationToken);
        var currentCatalogChecksum = await ComputeCatalogChecksumAsync(
            connection,
            transaction,
            cancellationToken);
        if (applied.Count == 0)
        {
            var hasOperationalTables = await HasOperationalTablesAsync(
                connection,
                transaction,
                cancellationToken);
            ValidateLedgerlessCatalog(
                hasOperationalTables,
                currentCatalogChecksum,
                _approvedLegacyCatalogFingerprints);
        }
        else if (ExpectedCatalogChecksums.ContainsKey(applied[^1].Version))
        {
            ValidateExpectedCatalogChecksum(applied[^1].Version, currentCatalogChecksum);
        }
        ValidateMigrationPrefix(migrations, applied);

        var appliedCount = 0;
        foreach (var migration in migrations.Skip(applied.Count))
        {
            await ExecuteAsync(connection, transaction, migration.Sql, cancellationToken);
            var catalogChecksum = await ComputeCatalogChecksumAsync(
                connection,
                transaction,
                cancellationToken);
            await using var ledgerCommand = new NpgsqlCommand("""
                INSERT INTO public.schema_migrations (version, checksum, app_version, catalog_checksum)
                VALUES (@version, @checksum, @app_version, @catalog_checksum);
                """, connection, transaction);
            ledgerCommand.Parameters.AddWithValue("version", migration.Version);
            ledgerCommand.Parameters.AddWithValue("checksum", migration.Checksum);
            ledgerCommand.Parameters.AddWithValue("app_version", _appVersion);
            ledgerCommand.Parameters.AddWithValue("catalog_checksum", catalogChecksum);
            await ledgerCommand.ExecuteNonQueryAsync(cancellationToken);
            appliedCount++;
        }

        var finalCatalogChecksum = await ComputeCatalogChecksumAsync(
            connection,
            transaction,
            cancellationToken);
        ValidateExpectedCatalogChecksum(migrations[^1].Version, finalCatalogChecksum);

        await transaction.CommitAsync(cancellationToken);
        return new OperationalDatabaseMigrationResult(migrations[^1].Version, appliedCount, migrations.Count);
    }

    public async Task<OperationalDatabaseMigrationResult> PreflightAsync(
        CancellationToken cancellationToken = default)
    {
        var migrations = LoadMigrations(_migrationsDirectory);
        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(
            IsolationLevel.ReadCommitted,
            cancellationToken);
        await ExecuteAsync(connection, transaction, "SET TRANSACTION READ ONLY;", cancellationToken);

        await using (var ledgerExistsCommand = new NpgsqlCommand(
            "SELECT to_regclass('public.schema_migrations') IS NOT NULL;",
            connection,
            transaction))
        {
            if (await ledgerExistsCommand.ExecuteScalarAsync(cancellationToken) is not true)
            {
                throw new InvalidOperationException(
                    $"Operational database preflight failed: {LedgerName} is missing. Run --database-migrate.");
            }
        }

        var applied = await ReadLedgerAsync(connection, transaction, cancellationToken);
        var currentCatalogChecksum = await ComputeCatalogChecksumAsync(
            connection,
            transaction,
            cancellationToken);
        ValidateExpectedCatalogChecksum(migrations[^1].Version, currentCatalogChecksum);
        ValidatePreflightState(migrations, applied);
        await transaction.CommitAsync(cancellationToken);
        return new OperationalDatabaseMigrationResult(migrations[^1].Version, 0, migrations.Count);
    }

    private static async Task ExecuteAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        string sql,
        CancellationToken cancellationToken)
    {
        await using var command = new NpgsqlCommand(sql, connection, transaction);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task<IReadOnlyList<OperationalAppliedMigration>> ReadLedgerAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        CancellationToken cancellationToken)
    {
        await using var command = new NpgsqlCommand(
            "SELECT version, checksum, app_version, catalog_checksum FROM public.schema_migrations ORDER BY version;",
            connection,
            transaction);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var applied = new List<OperationalAppliedMigration>();
        while (await reader.ReadAsync(cancellationToken))
        {
            applied.Add(new OperationalAppliedMigration(
                reader.GetString(0),
                reader.GetString(1).Trim(),
                reader.GetString(2),
                reader.IsDBNull(3) ? string.Empty : reader.GetString(3).Trim()));
        }

        return applied;
    }

    internal static async Task<string> ComputeCatalogChecksumAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        CancellationToken cancellationToken)
    {
        const string sql = """
            WITH catalog_objects AS (
                SELECT
                    'column'::text AS object_kind,
                    format('%I.%I.%I', namespace.nspname, relation.relname, attribute.attname) AS object_name,
                    concat_ws('|',
                        format_type(attribute.atttypid, attribute.atttypmod),
                        attribute.attnotnull::text,
                        COALESCE(pg_get_expr(default_value.adbin, default_value.adrelid), '')) AS definition
                FROM pg_class relation
                JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
                JOIN pg_attribute attribute ON attribute.attrelid = relation.oid
                LEFT JOIN pg_attrdef default_value
                    ON default_value.adrelid = relation.oid
                   AND default_value.adnum = attribute.attnum
                WHERE namespace.nspname = 'public'
                  AND relation.relkind IN ('r', 'p')
                  AND attribute.attnum > 0
                  AND NOT attribute.attisdropped
                  AND NOT EXISTS (
                      SELECT 1 FROM pg_depend dependency
                      WHERE dependency.classid = 'pg_class'::regclass
                        AND dependency.objid = relation.oid
                        AND dependency.deptype = 'e')

                UNION ALL
                SELECT 'constraint',
                       format('%I.%I', relation.relname, constraint_row.conname),
                       pg_get_constraintdef(constraint_row.oid, true)
                FROM pg_constraint constraint_row
                JOIN pg_class relation ON relation.oid = constraint_row.conrelid
                JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
                WHERE namespace.nspname = 'public'
                  AND NOT EXISTS (
                      SELECT 1 FROM pg_depend dependency
                      WHERE dependency.classid = 'pg_constraint'::regclass
                        AND dependency.objid = constraint_row.oid
                        AND dependency.deptype = 'e')

                UNION ALL
                SELECT 'index',
                       format('%I.%I', table_relation.relname, index_relation.relname),
                       pg_get_indexdef(index_relation.oid)
                FROM pg_index index_row
                JOIN pg_class index_relation ON index_relation.oid = index_row.indexrelid
                JOIN pg_class table_relation ON table_relation.oid = index_row.indrelid
                JOIN pg_namespace namespace ON namespace.oid = table_relation.relnamespace
                WHERE namespace.nspname = 'public'
                  AND NOT EXISTS (
                      SELECT 1 FROM pg_depend dependency
                      WHERE dependency.classid = 'pg_class'::regclass
                        AND dependency.objid = index_relation.oid
                        AND dependency.deptype = 'e')

                UNION ALL
                SELECT 'trigger',
                       format('%I.%I', relation.relname, trigger_row.tgname),
                       pg_get_triggerdef(trigger_row.oid, true)
                FROM pg_trigger trigger_row
                JOIN pg_class relation ON relation.oid = trigger_row.tgrelid
                JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
                WHERE namespace.nspname = 'public'
                  AND NOT trigger_row.tgisinternal
                  AND NOT EXISTS (
                      SELECT 1 FROM pg_depend dependency
                      WHERE dependency.classid = 'pg_trigger'::regclass
                        AND dependency.objid = trigger_row.oid
                        AND dependency.deptype = 'e')

                UNION ALL
                SELECT 'function',
                       format('%I.%I(%s)', namespace.nspname, procedure.proname,
                              pg_get_function_identity_arguments(procedure.oid)),
                       pg_get_functiondef(procedure.oid)
                FROM pg_proc procedure
                JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
                WHERE namespace.nspname = 'public'
                  AND procedure.prokind IN ('f', 'p')
                  AND NOT EXISTS (
                      SELECT 1 FROM pg_depend dependency
                      WHERE dependency.classid = 'pg_proc'::regclass
                        AND dependency.objid = procedure.oid
                        AND dependency.deptype = 'e')

                UNION ALL
                SELECT 'view',
                       format('%I.%I', namespace.nspname, relation.relname),
                       pg_get_viewdef(relation.oid, true)
                FROM pg_class relation
                JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
                WHERE namespace.nspname = 'public'
                  AND relation.relkind IN ('v', 'm')
                  AND NOT EXISTS (
                      SELECT 1 FROM pg_depend dependency
                      WHERE dependency.classid = 'pg_class'::regclass
                        AND dependency.objid = relation.oid
                        AND dependency.deptype = 'e')

                UNION ALL
                SELECT 'sequence',
                       format('%I.%I', namespace.nspname, relation.relname),
                       concat_ws('|',
                           format_type(sequence.seqtypid, NULL),
                           sequence.seqstart::text,
                           sequence.seqincrement::text,
                           sequence.seqmin::text,
                           sequence.seqmax::text,
                           sequence.seqcache::text,
                           sequence.seqcycle::text)
                FROM pg_sequence sequence
                JOIN pg_class relation ON relation.oid = sequence.seqrelid
                JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
                WHERE namespace.nspname = 'public'
                  AND NOT EXISTS (
                      SELECT 1 FROM pg_depend dependency
                      WHERE dependency.classid = 'pg_class'::regclass
                        AND dependency.objid = relation.oid
                        AND dependency.deptype = 'e')

                UNION ALL
                SELECT 'type',
                       format('%I.%I', namespace.nspname, type_row.typname),
                       CASE type_row.typtype
                           WHEN 'e' THEN (
                               SELECT string_agg(enum_row.enumlabel, '|' ORDER BY enum_row.enumsortorder)
                               FROM pg_enum enum_row
                               WHERE enum_row.enumtypid = type_row.oid)
                           WHEN 'd' THEN concat_ws('|',
                               format_type(type_row.typbasetype, type_row.typtypmod),
                               type_row.typnotnull::text,
                               COALESCE(type_row.typdefault, ''))
                       END
                FROM pg_type type_row
                JOIN pg_namespace namespace ON namespace.oid = type_row.typnamespace
                WHERE namespace.nspname = 'public'
                  AND type_row.typtype IN ('e', 'd')
                  AND NOT EXISTS (
                      SELECT 1 FROM pg_depend dependency
                      WHERE dependency.classid = 'pg_type'::regclass
                        AND dependency.objid = type_row.oid
                        AND dependency.deptype = 'e')
            )
            SELECT object_kind, object_name, definition
            FROM catalog_objects
            ORDER BY object_kind COLLATE "C", object_name COLLATE "C", definition COLLATE "C";
            """;

        await using var command = new NpgsqlCommand(sql, connection, transaction);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var canonical = new StringBuilder();
        while (await reader.ReadAsync(cancellationToken))
        {
            canonical.Append(reader.GetString(0)).Append('\t')
                .Append(reader.GetString(1)).Append('\t')
                .Append(reader.GetString(2)).Append('\n');
        }

        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(canonical.ToString())))
            .ToLowerInvariant();
    }

    private static async Task<bool> HasOperationalTablesAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        CancellationToken cancellationToken)
    {
        const string sql = """
            SELECT EXISTS (
                SELECT 1 FROM pg_class relation
                JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
                WHERE namespace.nspname = 'public'
                  AND relation.relname <> 'schema_migrations'
                  AND relation.relkind IN ('r', 'p', 'v', 'm', 'S')
                  AND NOT EXISTS (
                      SELECT 1 FROM pg_depend dependency
                      WHERE dependency.classid = 'pg_class'::regclass
                        AND dependency.objid = relation.oid
                        AND dependency.deptype = 'e')
                UNION ALL
                SELECT 1 FROM pg_proc procedure
                JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
                WHERE namespace.nspname = 'public'
                  AND NOT EXISTS (
                      SELECT 1 FROM pg_depend dependency
                      WHERE dependency.classid = 'pg_proc'::regclass
                        AND dependency.objid = procedure.oid
                        AND dependency.deptype = 'e')
                UNION ALL
                SELECT 1 FROM pg_type type_row
                JOIN pg_namespace namespace ON namespace.oid = type_row.typnamespace
                WHERE namespace.nspname = 'public'
                  AND type_row.typtype IN ('e', 'd')
                  AND NOT EXISTS (
                      SELECT 1 FROM pg_depend dependency
                      WHERE dependency.classid = 'pg_type'::regclass
                        AND dependency.objid = type_row.oid
                        AND dependency.deptype = 'e')
            );
            """;
        await using var command = new NpgsqlCommand(sql, connection, transaction);
        return await command.ExecuteScalarAsync(cancellationToken) is true;
    }

    public static void ValidateLedgerlessCatalog(
        bool hasOperationalTables,
        string catalogChecksum,
        IReadOnlySet<string> approvedLegacyCatalogFingerprints)
    {
        if (!hasOperationalTables)
        {
            return;
        }

        if (!approvedLegacyCatalogFingerprints.Contains(catalogChecksum))
        {
            throw new InvalidOperationException(
                $"Ledgerless Operations database fingerprint {catalogChecksum} is not an approved legacy baseline. " +
                "Set OperationalDatabase:ApprovedLegacyCatalogFingerprints only after independently ratifying that exact fingerprint.");
        }
    }

    public static void ValidateCatalogChecksum(
        IReadOnlyList<OperationalAppliedMigration> applied,
        string currentCatalogChecksum)
    {
        if (applied.Count == 0)
        {
            throw new InvalidOperationException(
                "Operational database migration ledger is empty; no catalog checksum is available.");
        }

        var expected = applied[^1].CatalogChecksum;
        if (string.IsNullOrWhiteSpace(expected))
        {
            throw new InvalidOperationException(
                $"Operational migration {applied[^1].Version} has no catalog checksum provenance.");
        }
        if (!string.Equals(expected, currentCatalogChecksum, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException(
                $"Operational catalog drift detected at migration {applied[^1].Version}: " +
                $"expected {expected}, found {currentCatalogChecksum}.");
        }
    }

    public static void ValidateExpectedCatalogChecksum(
        string headVersion,
        string currentCatalogChecksum)
    {
        if (!ExpectedCatalogChecksums.TryGetValue(headVersion, out var expected))
        {
            throw new InvalidOperationException(
                $"No source-controlled operational catalog checksum is defined for migration head {headVersion}.");
        }
        if (!string.Equals(expected, currentCatalogChecksum, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException(
                $"Operational catalog does not match the source-controlled contract for migration {headVersion}: " +
                $"expected {expected}, found {currentCatalogChecksum}.");
        }
    }

    public static void ValidateMigrationPrefix(
        IReadOnlyList<OperationalDatabaseMigration> migrations,
        IReadOnlyList<OperationalAppliedMigration> applied)
    {
        if (applied.Count > migrations.Count)
        {
            throw new InvalidOperationException(
                "Operational database migration ledger is ahead of this application build.");
        }

        for (var index = 0; index < applied.Count; index++)
        {
            ValidateLedgerEntry(migrations[index], applied[index], index);
        }
    }

    public static void ValidatePreflightState(
        IReadOnlyList<OperationalDatabaseMigration> migrations,
        IReadOnlyList<OperationalAppliedMigration> applied)
    {
        ValidateMigrationPrefix(migrations, applied);
        if (applied.Count != migrations.Count)
        {
            var expectedHead = migrations[^1].Version;
            var actualHead = applied.Count == 0 ? "none" : applied[^1].Version;
            throw new InvalidOperationException(
                $"Operational database migration head mismatch: expected {expectedHead}, found {actualHead}. Run --database-migrate.");
        }
    }

    private static void ValidateLedgerEntry(
        OperationalDatabaseMigration expected,
        OperationalAppliedMigration actual,
        int index)
    {
        if (!string.Equals(expected.Version, actual.Version, StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                $"Operational database migration history is not an exact prefix at position {index + 1}: expected {expected.Version}, found {actual.Version}.");
        }

        if (!string.Equals(expected.Checksum, actual.Checksum, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException(
                $"Operational database migration checksum mismatch for version {expected.Version}.");
        }

        if (string.IsNullOrWhiteSpace(actual.AppVersion))
        {
            throw new InvalidOperationException(
                $"Operational database migration {expected.Version} has no app_version provenance.");
        }
        if (string.IsNullOrWhiteSpace(actual.CatalogChecksum))
        {
            throw new InvalidOperationException(
                $"Operational database migration {expected.Version} has no catalog checksum provenance.");
        }
    }
}
