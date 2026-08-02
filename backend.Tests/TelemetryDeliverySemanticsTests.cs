using System.Text;
using backend.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Npgsql;

namespace backend.Tests;

public sealed class TelemetryDeliverySemanticsTests
{
    private static readonly Guid DeviceId = Guid.Parse("11111111-1111-1111-1111-111111111111");

    [Theory]
    [InlineData(TelemetryDeliveryState.Committed, true)]
    [InlineData(TelemetryDeliveryState.Duplicate, true)]
    [InlineData(TelemetryDeliveryState.RetryableFailure, false)]
    [InlineData(TelemetryDeliveryState.Busy, false)]
    [InlineData(TelemetryDeliveryState.Malformed, false)]
    [InlineData(TelemetryDeliveryState.PayloadTooLarge, false)]
    [InlineData(TelemetryDeliveryState.PermanentFailure, false)]
    [InlineData(TelemetryDeliveryState.Conflict, false)]
    public void OnlyCommittedAndDuplicateAreSuccessful(TelemetryDeliveryState state, bool expected)
    {
        Assert.Equal(expected, new TelemetryDeliveryResult(state).IsSuccess);
    }

    [Fact]
    public void ParserBuildsStableReceiptIdentityAndPayloadHash()
    {
        var raw = ValidTelemetry("message-1");

        var parsed = TelemetryIngestionService.TryParseDeliveryItem(
            DeviceId.ToString().ToUpperInvariant(), raw, out var first, out var error);
        var parsedAgain = TelemetryIngestionService.TryParseDeliveryItem(
            DeviceId.ToString(), raw, out var second, out _);

        Assert.True(parsed, error?.Detail);
        Assert.True(parsedAgain);
        Assert.Equal("message-1", first!.MessageId);
        Assert.Equal(DeviceId.ToString("D"), first.DeviceId);
        Assert.Equal(first.PayloadHash, second!.PayloadHash);
        Assert.Equal(64, first.PayloadHash.Length);
    }

    [Fact]
    public void ParserRejectsMissingMessageIdAndDevicePayloadMismatch()
    {
        var missingMessage = $"{{\"payload\":{{\"machineId\":\"{DeviceId}\"}}}}";
        var otherDevice = Guid.Parse("22222222-2222-2222-2222-222222222222");

        Assert.False(TelemetryIngestionService.TryParseDeliveryItem(
            DeviceId.ToString(), missingMessage, out _, out var malformed));
        Assert.Equal(TelemetryDeliveryState.Malformed, malformed!.State);
        Assert.False(TelemetryIngestionService.TryParseDeliveryItem(
            DeviceId.ToString(), ValidTelemetry("message-1", otherDevice), out _, out var conflict));
        Assert.Equal(TelemetryDeliveryState.Conflict, conflict!.State);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public void ParserRequiresPositiveImmutableDeliverySequence(long sequence)
    {
        Assert.False(TelemetryIngestionService.TryParseDeliveryItem(
            DeviceId.ToString(), ValidTelemetry("message-1", sequence: sequence), out _, out var malformed));
        Assert.Equal(TelemetryDeliveryState.Malformed, malformed!.State);
        Assert.Equal(TelemetryApproval.Unavailable, malformed.Approval);
        Assert.Null(malformed.Approved);
    }

    [Fact]
    public void SyncRejectsOuterSequenceThatDoesNotMatchSignedPayloadSequence()
    {
        var result = SyncService.ValidateAndBuildBatch(
            DeviceId.ToString(),
            new[] { new TelemetryRecordDto { Sequence = 2, RawJson = ValidTelemetry("message-1") } },
            1024 * 1024,
            1024 * 1024);

        Assert.Equal(TelemetryDeliveryState.Conflict, result.Result.State);
        Assert.Null(result.Items);
    }

    [Fact]
    public void SyncAcceptsClientImmutableDeliverySequenceContract()
    {
        const long localTelemetryRowId = 41;
        var rawJson = ValidTelemetry("client-sync-message", sequence: localTelemetryRowId);

        var result = SyncService.ValidateAndBuildBatch(
            DeviceId.ToString(),
            new[]
            {
                new TelemetryRecordDto
                {
                    Sequence = localTelemetryRowId,
                    Timestamp = "2026-08-02T00:00:00Z",
                    RawJson = rawJson,
                },
            },
            1024 * 1024,
            1024 * 1024);

        Assert.True(result.Result.IsSuccess, result.Result.Detail);
        Assert.Equal(localTelemetryRowId, Assert.Single(result.Items!).Input.Sequence);
    }

    [Theory]
    [InlineData("57P01", TelemetryDeliveryState.RetryableFailure)]
    [InlineData("57P02", TelemetryDeliveryState.RetryableFailure)]
    [InlineData("57P03", TelemetryDeliveryState.Busy)]
    [InlineData("08000", TelemetryDeliveryState.RetryableFailure)]
    [InlineData("08006", TelemetryDeliveryState.RetryableFailure)]
    [InlineData("40001", TelemetryDeliveryState.RetryableFailure)]
    [InlineData("40P01", TelemetryDeliveryState.RetryableFailure)]
    [InlineData("57014", TelemetryDeliveryState.RetryableFailure)]
    [InlineData("53300", TelemetryDeliveryState.Busy)]
    [InlineData("55P03", TelemetryDeliveryState.Busy)]
    [InlineData("22003", TelemetryDeliveryState.Malformed)]
    public void PostgreSqlFailuresHaveStableDeliveryClassification(
        string sqlState,
        TelemetryDeliveryState expected)
    {
        var exception = new PostgresException("failure", "ERROR", "ERROR", sqlState);

        Assert.Equal(expected, DatabaseService.ClassifyDatabaseFailure(exception).State);
    }

    [Fact]
    public void PermanentApprovalRejectionIsTyped()
    {
        var result = new TelemetryDeliveryResult(
            TelemetryDeliveryState.PermanentFailure,
            "Device is not approved.")
        {
            Approval = TelemetryApproval.Unapproved,
        };

        Assert.False(result.IsSuccess);
        Assert.Equal(TelemetryApproval.Unapproved, result.Approval);
        Assert.False(result.Approved!.Value);
    }

    [Fact]
    public void NonDatabaseResultsCannotDefaultToApproved()
    {
        foreach (var state in Enum.GetValues<TelemetryDeliveryState>())
        {
            var result = new TelemetryDeliveryResult(state);
            Assert.Equal(TelemetryApproval.Unavailable, result.Approval);
            Assert.Null(result.Approved);
        }
    }

    [Fact]
    public void EncryptedMqttLimitIsBoundedAndAllowsEnvelopeOverhead()
    {
        var limit = MqttServerService.GetMaxEncryptedPayloadBytes(256 * 1024);

        Assert.True(limit > 256 * 1024);
        Assert.True(limit < 512 * 1024);
    }

    [Fact]
    public void InstalledMqttServerApiHasNoConfigurableInboundPacketLimit()
    {
        var maximumPacketSize = typeof(MQTTnet.Server.ValidatingConnectionEventArgs)
            .GetProperty("MaximumPacketSize");

        Assert.NotNull(maximumPacketSize);
        Assert.False(maximumPacketSize!.CanWrite);
        Assert.Null(typeof(MQTTnet.Server.MqttServerOptions)
            .GetProperty("MaximumPacketSize"));
    }

    [Fact]
    public void SyncValidationIsByteAwareAndBuildsNothingWhenAnyRecordIsInvalid()
    {
        var valid = ValidTelemetry("message-1");
        var invalid = "{not-json";
        var records = new[]
        {
            new TelemetryRecordDto { Sequence = 1, RawJson = valid },
            new TelemetryRecordDto { Sequence = 2, RawJson = invalid },
        };

        var result = SyncService.ValidateAndBuildBatch(
            DeviceId.ToString(), records, 1024 * 1024, 1024 * 1024);

        Assert.False(result.Result.IsSuccess);
        Assert.Equal(TelemetryDeliveryState.Malformed, result.Result.State);
        Assert.Null(result.Items);

        var unicodePayload = ValidTelemetry(new string('é', 20));
        Assert.True(Encoding.UTF8.GetByteCount(unicodePayload) > unicodePayload.Length);
        var oversized = SyncService.ValidateAndBuildBatch(
            DeviceId.ToString(),
            new[] { new TelemetryRecordDto { RawJson = unicodePayload } },
            unicodePayload.Length,
            1024 * 1024);
        Assert.Equal(TelemetryDeliveryState.PayloadTooLarge, oversized.Result.State);
    }

    [Fact]
    public async Task IngressRejectsOversizedBatchBeforeQueueAdmission()
    {
        var raw = ValidTelemetry("batch-message", padding: new string('x', 1_024));
        Assert.True(TelemetryIngestionService.TryParseDeliveryItem(
            DeviceId.ToString(), raw, out var item, out var error), error?.Detail);

        var itemBytes = Encoding.UTF8.GetByteCount(raw);
        using var ingestion = new TelemetryIngestionService(
            null!,
            null!,
            NullLogger<TelemetryIngestionService>.Instance,
            Options.Create(new TelemetryIngressOptions
            {
                MaxPayloadBytes = itemBytes + 1,
                MaxSyncBatchBytes = (itemBytes * 2) - 1,
            }));

        var result = await ingestion.EnqueueBatchAsync(DeviceId.ToString(), [item!, item!])
            .WaitAsync(TimeSpan.FromSeconds(1));

        Assert.Equal(TelemetryDeliveryState.PayloadTooLarge, result.State);
    }

    [Fact]
    public void SourcesUseBoundedIngressAtomicBatchAndTruthfulAcknowledgements()
    {
        var ingestion = File.ReadAllText(RepositoryPath("backend", "Services", "TelemetryIngestionService.cs"));
        var database = File.ReadAllText(RepositoryPath("backend", "Services", "DatabaseService.cs"));
        var mqtt = File.ReadAllText(RepositoryPath("backend", "Services", "MqttServerService.cs"));
        var sync = File.ReadAllText(RepositoryPath("backend", "Services", "SyncService.cs"));

        Assert.Contains("Channel.CreateBounded", ingestion, StringComparison.Ordinal);
        Assert.Contains("QueueByteCapacity", ingestion, StringComparison.Ordinal);
        Assert.Contains("MaxAdmissionWaiters", ingestion, StringComparison.Ordinal);
        Assert.Contains("EnqueueBatchAsync", ingestion, StringComparison.Ordinal);
        Assert.Contains("BeginTransactionAsync", database, StringComparison.Ordinal);
        Assert.Contains("telemetry_receipts", database, StringComparison.Ordinal);
        Assert.Contains("InsertFusionOutboxAsync", database, StringComparison.Ordinal);
        Assert.Contains("RetryPendingSecondaryDeliveriesAsync", database, StringComparison.Ordinal);
        Assert.Contains("ProjectOperationalTelemetryAsync", database, StringComparison.Ordinal);
        Assert.Contains("FOR UPDATE SKIP LOCKED", database, StringComparison.Ordinal);
        Assert.Contains("telemetry_secondary_deliveries", database, StringComparison.Ordinal);
        Assert.DoesNotContain("RepairOperationalProjectionAsync", database, StringComparison.Ordinal);
        Assert.Contains("ApplicationMessage.Payload.Length", mqtt, StringComparison.Ordinal);
        Assert.Contains("success = result.IsSuccess", mqtt, StringComparison.Ordinal);
        Assert.Contains("approval = result.Approval.ToString()", mqtt, StringComparison.Ordinal);
        Assert.Contains("approved = result.Approved", mqtt, StringComparison.Ordinal);
        Assert.Contains("FOR UPDATE", database, StringComparison.Ordinal);
        Assert.Contains("delivery_sequence", database, StringComparison.Ordinal);
        Assert.Contains("newer.sequence > @sequence", database, StringComparison.Ordinal);
        Assert.Contains("UpdateClientLivenessAsync", mqtt, StringComparison.Ordinal);
        Assert.DoesNotContain("UPDATE machines SET", mqtt, StringComparison.Ordinal);
        Assert.Contains("EnqueueBatchAsync", sync, StringComparison.Ordinal);
        Assert.DoesNotContain("PersistTelemetryBatchAndFusionOutboxAsync", sync, StringComparison.Ordinal);
    }

    private static string ValidTelemetry(
        string messageId,
        Guid? machineId = null,
        long sequence = 1,
        string? padding = null) => $$"""
        {
          "messageId": "{{messageId}}",
          "sentAt": "2026-08-02T00:00:00Z",
          "payload": {
            "machineId": "{{machineId ?? DeviceId}}",
            "sequence": {{sequence}},
            "status": "RUNNING",
            "plcConnected": true,
            "padding": "{{padding ?? string.Empty}}"
          }
        }
        """;

    private static string RepositoryPath(params string[] segments)
    {
        var root = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", ".."));
        return Path.Combine(new[] { root }.Concat(segments).ToArray());
    }
}
