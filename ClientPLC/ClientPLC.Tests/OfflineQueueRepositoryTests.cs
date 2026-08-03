using Microsoft.Data.Sqlite;
using System.IO;
using System.Reflection;
using PLC;
using PLC.Database;
using PLC.Infrastructure.Database;
using PLC.Network;
using PLC.Service;

namespace ClientPLC.Tests;

public sealed class OfflineQueueRepositoryTests
{
    private static readonly DateTimeOffset StartTime =
        new(2026, 8, 2, 10, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Options_DefaultToSevenDaysAndTwoGiB()
    {
        var options = new OfflineQueueOptions();

        Assert.Equal(TimeSpan.FromDays(7), options.MaxAge);
        Assert.Equal(2L * 1024 * 1024 * 1024, options.MaxPayloadBytes);
    }

    [Fact]
    public void DuplicateMessageId_IsIdempotentAcrossRestart()
    {
        using var database = new TempDatabase();
        var clock = new ManualTimeProvider(StartTime);
        var firstRepository = database.CreateRepository(clock: clock);

        string payload = EnvelopeJson("message-1", "telemetry");
        Assert.True(firstRepository.Enqueue(new("message-1", "telemetry", payload)));
        Assert.False(firstRepository.Enqueue(new("message-1", "telemetry", payload)));

        var restartedRepository = database.CreateRepository(clock: clock);
        OfflineQueueMessage message = Assert.Single(restartedRepository.GetDueMessages(10));
        Assert.Equal("message-1", message.MessageId);
        Assert.Equal(payload, message.Payload);
        Assert.Equal(System.Text.Encoding.UTF8.GetByteCount(payload), message.PayloadBytes);
        Assert.Equal(OfflineQueueStatus.Pending, message.Status);
        Assert.Equal(0, message.RetryCount);
        Assert.Null(message.LastError);
        Assert.Equal(StartTime, message.CreatedAt);
    }

    [Fact]
    public void DueMessages_AreBoundedAndReturnedInFifoOrder()
    {
        using var database = new TempDatabase();
        var clock = new ManualTimeProvider(StartTime);
        var options = new OfflineQueueOptions { MaxBatchSize = 2 };
        var repository = database.CreateRepository(options, clock);

        repository.Enqueue(new("third", "topic", EnvelopeJson("third", "telemetry"), StartTime.AddSeconds(-1)));
        repository.Enqueue(new("first", "topic", EnvelopeJson("first", "telemetry"), StartTime.AddSeconds(-3)));
        repository.Enqueue(new("second", "topic", EnvelopeJson("second", "telemetry"), StartTime.AddSeconds(-2)));

        IReadOnlyList<OfflineQueueMessage> messages = repository.GetDueMessages(50);

        Assert.Equal(2, messages.Count);
        Assert.Equal(new[] { "first", "second" }, messages.Select(message => message.MessageId));
    }

    [Fact]
    public void RecordFailure_SchedulesExponentialRetry()
    {
        using var database = new TempDatabase();
        var clock = new ManualTimeProvider(StartTime);
        var options = new OfflineQueueOptions
        {
            MaxAttempts = 4,
            InitialRetryDelay = TimeSpan.FromSeconds(5),
            MaxRetryDelay = TimeSpan.FromSeconds(30)
        };
        var repository = database.CreateRepository(options, clock);
        repository.Enqueue(new("retry-message", "topic", EnvelopeJson("retry-message", "telemetry")));
        long id = Assert.Single(repository.GetDueMessages(1)).Id;

        OfflineQueueMessage firstFailure = repository.RecordFailure(id, "network down");

        Assert.Equal(OfflineQueueStatus.Retry, firstFailure.Status);
        Assert.Equal(1, firstFailure.RetryCount);
        Assert.Equal(StartTime.AddSeconds(5), firstFailure.NextAttemptAt);
        Assert.Equal("network down", firstFailure.LastError);
        Assert.Empty(repository.GetDueMessages(1));

        clock.Advance(TimeSpan.FromSeconds(5));
        Assert.Single(repository.GetDueMessages(1));
        OfflineQueueMessage secondFailure = repository.RecordFailure(id, "still down");
        Assert.Equal(StartTime.AddSeconds(15), secondFailure.NextAttemptAt);
    }

    [Fact]
    public void RecordFailure_MovesMessageToDeadAtAttemptLimit()
    {
        using var database = new TempDatabase();
        var clock = new ManualTimeProvider(StartTime);
        var repository = database.CreateRepository(
            new OfflineQueueOptions { MaxAttempts = 2 },
            clock);
        repository.Enqueue(new("dead-message", "topic", EnvelopeJson("dead-message", "telemetry")));
        long id = Assert.Single(repository.GetDueMessages(1)).Id;

        repository.RecordFailure(id, "first");
        OfflineQueueMessage dead = repository.RecordFailure(id, "second");

        Assert.Equal(OfflineQueueStatus.Dead, dead.Status);
        Assert.Equal(2, dead.RetryCount);
        Assert.Null(dead.NextAttemptAt);
        Assert.Equal("second", dead.LastError);
        Assert.Empty(repository.GetDueMessages(10));
    }

    [Fact]
    public void PublishFailure_AfterAttemptWasPersisted_DoesNotDoubleCountAttempt()
    {
        using var database = new TempDatabase();
        var clock = new ManualTimeProvider(StartTime);
        var repository = database.CreateRepository(
            new OfflineQueueOptions { MaxAttempts = 3 },
            clock);
        repository.Enqueue(new("publish-failure", "topic", EnvelopeJson("publish-failure", "telemetry")));
        OfflineQueueMessage awaiting = repository.MarkAwaitingAcknowledgement("publish-failure")!;

        OfflineQueueMessage retry = repository.RecordFailure(awaiting.Id, "publish failed");

        Assert.Equal(OfflineQueueStatus.Retry, retry.Status);
        Assert.Equal(1, retry.RetryCount);
        Assert.Equal(StartTime.AddSeconds(5), retry.NextAttemptAt);
    }

    [Fact]
    public void ExpiredMessages_AreRemovedBeforeRetrieval()
    {
        using var database = new TempDatabase();
        var clock = new ManualTimeProvider(StartTime);
        var repository = database.CreateRepository(
            new OfflineQueueOptions { MaxAge = TimeSpan.FromDays(7) },
            clock);
        repository.Enqueue(new("expired", "topic", EnvelopeJson("expired", "telemetry"), StartTime.AddDays(-8)));
        repository.Enqueue(new("fresh", "topic", EnvelopeJson("fresh", "telemetry"), StartTime.AddDays(-1)));

        OfflineQueueMessage message = Assert.Single(repository.GetDueMessages(10));

        Assert.Equal("fresh", message.MessageId);
        Assert.Equal(0, repository.RemoveExpired());
        OfflineQueueAuditEvent audit = Assert.Single(repository.GetAuditEvents(10));
        Assert.Equal("expired", audit.MessageId);
        Assert.Equal(OfflineQueueAuditReason.Expired, audit.Reason);
    }

    [Fact]
    public void PayloadBudget_EvictsOldestMessagesAndSurvivesRestart()
    {
        using var database = new TempDatabase();
        var clock = new ManualTimeProvider(StartTime);
        string oldestPayload = EnvelopeJson("oldest", "telemetry");
        string newestPayload = EnvelopeJson("newest", "telemetry");
        var repository = database.CreateRepository(
            new OfflineQueueOptions { MaxPayloadBytes = oldestPayload.Length + newestPayload.Length },
            clock);
        repository.Enqueue(new("oldest", "topic", oldestPayload, StartTime.AddSeconds(-2)));
        repository.Enqueue(new("newest", "topic", newestPayload, StartTime.AddSeconds(-1)));

        var restartedRepository = database.CreateRepository(
            new OfflineQueueOptions { MaxPayloadBytes = newestPayload.Length },
            clock);
        OfflineQueueMessage remaining = Assert.Single(restartedRepository.GetDueMessages(10));

        Assert.Equal("newest", remaining.MessageId);
        Assert.Equal(newestPayload.Length, remaining.PayloadBytes);
        OfflineQueueAuditEvent audit = Assert.Single(restartedRepository.GetAuditEvents(10));
        Assert.Equal("oldest", audit.MessageId);
        Assert.Equal(OfflineQueueAuditReason.PayloadBudgetEviction, audit.Reason);
    }

    [Fact]
    public void PayloadLargerThanBudget_IsRejectedWithoutEvictingExistingMessages()
    {
        using var database = new TempDatabase();
        var clock = new ManualTimeProvider(StartTime);
        string existingPayload = EnvelopeJson("existing", "telemetry");
        string oversizedPayload = EnvelopeJson("oversized", "telemetry") + " ";
        var repository = database.CreateRepository(
            new OfflineQueueOptions { MaxPayloadBytes = existingPayload.Length },
            clock);
        repository.Enqueue(new("existing", "topic", existingPayload));

        Assert.Throws<InvalidOperationException>(() =>
            repository.Enqueue(new("oversized", "topic", oversizedPayload)));
        Assert.Equal("existing", Assert.Single(repository.GetDueMessages(10)).MessageId);
    }

    [Fact]
    public void AuditRetention_IsBoundedAcrossRestartAndPreservesAggregateEvidence()
    {
        using var database = new TempDatabase();
        var clock = new ManualTimeProvider(StartTime);
        var options = new OfflineQueueOptions
        {
            MaxAge = TimeSpan.FromSeconds(1),
            AuditMaxAge = TimeSpan.FromDays(30),
            AuditMaxRows = 3,
            MaxPayloadBytes = 1024 * 1024
        };
        var repository = database.CreateRepository(options, clock);
        for (int index = 0; index < 8; index++)
        {
            string messageId = $"audit-{index}";
            repository.Enqueue(new(
                messageId,
                "topic",
                EnvelopeJson(messageId, "telemetry"),
                StartTime.AddMinutes(index)));
            clock.Advance(TimeSpan.FromMinutes(1));
        }

        clock.Advance(TimeSpan.FromMinutes(2));
        repository.RemoveExpired();
        IReadOnlyList<OfflineQueueAuditEvent> retainedEvents = repository.GetAuditEvents(100);
        Assert.True(retainedEvents.Count <= 3, $"Retained {retainedEvents.Count} audit rows.");
        OfflineQueueAuditSummary summary = Assert.Single(repository.GetAuditSummaries());
        Assert.Equal(OfflineQueueAuditReason.Expired, summary.Reason);
        Assert.True(summary.EventCount >= 5);
        Assert.True(summary.PayloadBytes > 0);

        var restarted = database.CreateRepository(options, clock);
        Assert.True(restarted.GetAuditEvents(100).Count <= 3);
        Assert.Equal(summary.EventCount, Assert.Single(restarted.GetAuditSummaries()).EventCount);
    }

    [Fact]
    public void ExistingLegacySchema_IsMigratedIdempotently()
    {
        using var database = new TempDatabase(initialize: false);
        using (var connection = new SqliteConnection($"Data Source={database.Path}"))
        {
            connection.Open();
            using var command = connection.CreateCommand();
            command.CommandText = @"
                CREATE TABLE mqtt_offline_queue (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    topic TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                INSERT INTO mqtt_offline_queue (topic, payload, created_at)
                VALUES ('legacy-topic', 'legacy-payload', '2026-08-02 09:00:00');";
            command.ExecuteNonQuery();
        }

        var clock = new ManualTimeProvider(StartTime);
        _ = new SqliteConnectionFactory(database.Path);
        var repository = database.CreateRepository(clock: clock);
        OfflineQueueMessage migrated = Assert.Single(repository.GetDueMessages(10));

        Assert.Equal("legacy-1", migrated.MessageId);
        Assert.Equal(14, migrated.PayloadBytes);
        Assert.Equal(OfflineQueueStatus.Pending, migrated.Status);
        Assert.Equal(new DateTimeOffset(2026, 8, 2, 9, 0, 0, TimeSpan.Zero), migrated.NextAttemptAt);
    }

    [Fact]
    public void LegacyJsonEnvelope_MigratesStableIdAndCompletesWithApplicationAck()
    {
        using var database = new TempDatabase(initialize: false);
        const string messageId = "legacy-stable-message";
        string payload = EnvelopeJson(messageId, "telemetry");
        using (var connection = new SqliteConnection($"Data Source={database.Path}"))
        {
            connection.Open();
            using var command = connection.CreateCommand();
            command.CommandText = @"
                CREATE TABLE mqtt_offline_queue (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    topic TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                INSERT INTO mqtt_offline_queue (topic, payload, created_at)
                VALUES (@topic, @payload, '2026-08-02 09:00:00');";
            command.Parameters.AddWithValue("@topic", "client/machine/telemetry");
            command.Parameters.AddWithValue("@payload", payload);
            command.ExecuteNonQuery();
        }

        var repository = database.CreateRepository(clock: new ManualTimeProvider(StartTime));
        OfflineQueueMessage migrated = Assert.Single(repository.GetDueMessages(10));
        Assert.Equal(messageId, migrated.MessageId);
        Assert.Equal(payload, migrated.Payload);

        var handler = new ApplicationAcknowledgementHandler(repository, (_, _) => { });
        Assert.Equal(
            ApplicationAcknowledgementDisposition.Completed,
            handler.Handle(AckJson("ack", messageId, "Committed")));
        Assert.Null(repository.Find(messageId));
    }

    [Fact]
    public void DuplicateLegacyEnvelopeIds_KeepFirstStableIdAndFallbackLaterRows()
    {
        using var database = new TempDatabase(initialize: false);
        string payload = EnvelopeJson("duplicate-id", "telemetry");
        using (var connection = new SqliteConnection($"Data Source={database.Path}"))
        {
            connection.Open();
            using var command = connection.CreateCommand();
            command.CommandText = @"
                CREATE TABLE mqtt_offline_queue (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    topic TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                INSERT INTO mqtt_offline_queue (topic, payload, created_at)
                VALUES ('topic', @payload, '2026-08-02 08:00:00'),
                       ('topic', @payload, '2026-08-02 09:00:00');";
            command.Parameters.AddWithValue("@payload", payload);
            command.ExecuteNonQuery();
        }

        var repository = database.CreateRepository(clock: new ManualTimeProvider(StartTime));
        Assert.Equal(
            new[] { "legacy-1", "legacy-2" },
            repository.GetDueMessages(10).Select(item => item.MessageId));
    }

    [Fact]
    public void EnqueueRejectsMessageIdThatDiffersFromEnvelope()
    {
        using var database = new TempDatabase();
        var repository = database.CreateRepository(clock: new ManualTimeProvider(StartTime));

        Assert.Throws<ArgumentException>(() =>
            repository.Enqueue(new("request-id", "topic", EnvelopeJson("envelope-id", "telemetry"))));
        Assert.Empty(repository.GetDueMessages(10));
    }

    [Fact]
    public void EnqueueRejectsLegacyIdAliasWithoutRootMessageId()
    {
        using var database = new TempDatabase();
        var repository = database.CreateRepository(clock: new ManualTimeProvider(StartTime));
        string payload = System.Text.Json.JsonSerializer.Serialize(new
        {
            id = "alias-only",
            messageType = "telemetry",
            payload = new { }
        });

        Assert.Throws<ArgumentException>(() =>
            repository.Enqueue(new("alias-only", "topic", payload)));
        Assert.Empty(repository.GetDueMessages(10));
    }

    [Fact]
    public void DatabaseErrors_AreNotSwallowed()
    {
        using var database = new TempDatabase();
        var repository = database.CreateRepository(clock: new ManualTimeProvider(StartTime));
        using (var connection = new SqliteConnection($"Data Source={database.Path}"))
        {
            connection.Open();
            using var command = connection.CreateCommand();
            command.CommandText = "DROP TABLE mqtt_offline_queue;";
            command.ExecuteNonQuery();
        }

        Assert.Throws<SqliteException>(() =>
            repository.Enqueue(new("message", "topic", EnvelopeJson("message", "telemetry"))));
    }

    [Theory]
    [InlineData("ack", "Committed")]
    [InlineData("ack", "Duplicate")]
    [InlineData("syncAck", "Committed")]
    [InlineData("syncAck", "Duplicate")]
    public void SuccessfulApplicationAcknowledgement_CompletesOnlyCorrelatedMessage(
        string messageType,
        string state)
    {
        using var database = new TempDatabase();
        var repository = database.CreateRepository(clock: new ManualTimeProvider(StartTime));
        string queuedMessageType = messageType == "ack" ? "telemetry" : "sync";
        repository.Enqueue(new("target", "topic", EnvelopeJson("target", queuedMessageType)));
        repository.Enqueue(new("other", "topic", EnvelopeJson("other", "telemetry")));
        OfflineQueueMessage? callbackMessage = null;
        var handler = new ApplicationAcknowledgementHandler(
            repository,
            (message, _) => callbackMessage = message);

        ApplicationAcknowledgementDisposition disposition = handler.Handle(
            AckJson(messageType, "target", state));

        Assert.Equal(ApplicationAcknowledgementDisposition.Completed, disposition);
        Assert.Equal("target", callbackMessage?.MessageId);
        Assert.Null(repository.Find("target"));
        Assert.NotNull(repository.Find("other"));
    }

    [Theory]
    [InlineData("Busy")]
    [InlineData("RetryableFailure")]
    public void RetryableApplicationAcknowledgement_IsBoundedAndEndsDead(string state)
    {
        using var database = new TempDatabase();
        var clock = new ManualTimeProvider(StartTime);
        var repository = database.CreateRepository(
            new OfflineQueueOptions { MaxAttempts = 3 },
            clock);
        repository.Enqueue(new("retry", "topic", EnvelopeJson("retry", "telemetry")));
        repository.MarkAwaitingAcknowledgement("retry");
        var handler = new ApplicationAcknowledgementHandler(repository, (_, _) => { });

        ApplicationAcknowledgementDisposition firstDisposition = handler.Handle(
            AckJson("ack", "retry", state, "try later"));
        OfflineQueueMessage retained = repository.Find("retry")!;

        Assert.Equal(ApplicationAcknowledgementDisposition.RetryScheduled, firstDisposition);
        Assert.Equal(OfflineQueueStatus.Retry, retained.Status);
        Assert.Equal(1, retained.RetryCount);
        Assert.Equal($"{state}: try later", retained.LastError);
        Assert.Equal(StartTime.AddSeconds(5), retained.NextAttemptAt);

        clock.Advance(TimeSpan.FromSeconds(5));
        repository.MarkAwaitingAcknowledgement(Assert.Single(repository.GetDueMessages(1)).MessageId);
        Assert.Equal(
            ApplicationAcknowledgementDisposition.RetryScheduled,
            handler.Handle(AckJson("ack", "retry", state, "still unavailable")));
        clock.Advance(TimeSpan.FromSeconds(10));
        repository.MarkAwaitingAcknowledgement(Assert.Single(repository.GetDueMessages(1)).MessageId);
        ApplicationAcknowledgementDisposition finalDisposition = handler.Handle(
            AckJson("ack", "retry", state, "still unavailable"));
        OfflineQueueMessage dead = Assert.Single(repository.GetDeadMessages(10));
        Assert.Equal(ApplicationAcknowledgementDisposition.Quarantined, finalDisposition);
        Assert.Equal(3, dead.RetryCount);
        Assert.Null(dead.NextAttemptAt);
    }

    [Theory]
    [InlineData("Malformed")]
    [InlineData("PayloadTooLarge")]
    [InlineData("PermanentFailure")]
    [InlineData("Conflict")]
    public void PermanentApplicationAcknowledgement_QuarantinesForOperatorVisibility(string state)
    {
        using var database = new TempDatabase();
        var repository = database.CreateRepository(clock: new ManualTimeProvider(StartTime));
        repository.Enqueue(new("dead", "topic", EnvelopeJson("dead", "sync")));
        var handler = new ApplicationAcknowledgementHandler(repository, (_, _) => { });

        ApplicationAcknowledgementDisposition disposition = handler.Handle(
            AckJson("syncAck", "dead", state, "operator action required"));
        OfflineQueueMessage dead = Assert.Single(repository.GetDeadMessages(10));

        Assert.Equal(ApplicationAcknowledgementDisposition.Quarantined, disposition);
        Assert.Equal("dead", dead.MessageId);
        Assert.Equal(OfflineQueueStatus.Dead, dead.Status);
        Assert.Equal($"{state}: operator action required", dead.LastError);
        Assert.Null(dead.NextAttemptAt);
        Assert.Empty(repository.GetDueMessages(10));
    }

    [Fact]
    public void UnknownOrMalformedAcknowledgement_DoesNotMutateQueue()
    {
        using var database = new TempDatabase();
        var repository = database.CreateRepository(clock: new ManualTimeProvider(StartTime));
        repository.Enqueue(new("pending", "topic", EnvelopeJson("pending", "telemetry")));
        var handler = new ApplicationAcknowledgementHandler(repository, (_, _) => { });

        Assert.Equal(
            ApplicationAcknowledgementDisposition.Ignored,
            handler.Handle(AckJson("heartbeatAck", "pending", "Committed")));
        Assert.Equal(
            ApplicationAcknowledgementDisposition.Ignored,
            handler.Handle(AckJson("ack", "pending", "UnknownState")));
        Assert.Equal(
            ApplicationAcknowledgementDisposition.Ignored,
            handler.Handle("not-json"));

        Assert.Equal(OfflineQueueStatus.Pending, repository.Find("pending")?.Status);
    }

    [Fact]
    public void CompletionCallbackFailure_LeavesMessageQueued()
    {
        using var database = new TempDatabase();
        var repository = database.CreateRepository(clock: new ManualTimeProvider(StartTime));
        repository.Enqueue(new("pending", "topic", EnvelopeJson("pending", "telemetry")));
        var handler = new ApplicationAcknowledgementHandler(
            repository,
            (_, _) => throw new InvalidOperationException("local synchronization failed"));

        Assert.Throws<InvalidOperationException>(() =>
            handler.Handle(AckJson("ack", "pending", "Committed")));
        Assert.NotNull(repository.Find("pending"));
    }

    [Theory]
    [InlineData("ack", "sync")]
    [InlineData("syncAck", "telemetry")]
    public void AcknowledgementTypeMismatch_DoesNotMutateCorrelatedMessage(
        string acknowledgementType,
        string queuedMessageType)
    {
        using var database = new TempDatabase();
        var repository = database.CreateRepository(clock: new ManualTimeProvider(StartTime));
        repository.Enqueue(new("mismatch", "topic", EnvelopeJson("mismatch", queuedMessageType)));
        bool callbackInvoked = false;
        var handler = new ApplicationAcknowledgementHandler(
            repository,
            (_, _) => callbackInvoked = true);

        ApplicationAcknowledgementDisposition disposition = handler.Handle(
            AckJson(acknowledgementType, "mismatch", "Committed"));

        Assert.Equal(ApplicationAcknowledgementDisposition.TypeMismatch, disposition);
        Assert.False(callbackInvoked);
        Assert.Equal(OfflineQueueStatus.Pending, repository.Find("mismatch")?.Status);
    }

    [Fact]
    public void AwaitingAcknowledgement_UsesDeadlineAndBoundedStableIdReplay()
    {
        using var database = new TempDatabase();
        var clock = new ManualTimeProvider(StartTime);
        var repository = database.CreateRepository(
            new OfflineQueueOptions
            {
                MaxAttempts = 2,
                ApplicationAckTimeout = TimeSpan.FromSeconds(10)
            },
            clock);
        repository.Enqueue(new("stable-id", "topic", EnvelopeJson("stable-id", "telemetry")));

        OfflineQueueMessage firstPublish = repository.MarkAwaitingAcknowledgement("stable-id")!;

        Assert.Equal(OfflineQueueStatus.AwaitingAck, firstPublish.Status);
        Assert.Equal(1, firstPublish.RetryCount);
        Assert.Equal(StartTime.AddSeconds(10), firstPublish.NextAttemptAt);
        Assert.Empty(repository.GetDueMessages(10));

        clock.Advance(TimeSpan.FromSeconds(10));
        OfflineQueueMessage replay = Assert.Single(repository.GetDueMessages(10));
        Assert.Equal("stable-id", replay.MessageId);
        repository.MarkAwaitingAcknowledgement(replay.MessageId);

        clock.Advance(TimeSpan.FromSeconds(10));
        Assert.Empty(repository.GetDueMessages(10));
        OfflineQueueMessage dead = Assert.Single(repository.GetDeadMessages(10));
        Assert.Equal("stable-id", dead.MessageId);
        Assert.Equal(2, dead.RetryCount);
        Assert.Contains("deadline", dead.LastError, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void QuarantinedSyncBatch_DurablyBlocksNewSyncBatchCreation()
    {
        using var database = new TempDatabase();
        var factory = new SqliteConnectionFactory(database.Path);
        var repository = new SqliteOfflineQueueRepository(
            factory,
            timeProvider: new ManualTimeProvider(StartTime));
        const string topic = "client/machine/sync";
        repository.Enqueue(new("sync-dead", topic, EnvelopeJson("sync-dead", "sync")));
        repository.Quarantine("sync-dead", "Conflict: operator action required");
        LocalDbService localDb = CreateLocalDb(factory, repository);

        Assert.True(repository.HasDeadMessageForTopic(topic));
        Assert.False(localDb.CanCreateSyncBatch(topic));

        var restartedRepository = new SqliteOfflineQueueRepository(
            new SqliteConnectionFactory(database.Path),
            timeProvider: new ManualTimeProvider(StartTime));
        Assert.True(restartedRepository.HasDeadMessageForTopic(topic));
    }

    [Fact]
    public void DeadSync_RetryAndResolveRecoverAcrossRestart()
    {
        using var database = new TempDatabase();
        var clock = new ManualTimeProvider(StartTime);
        const string topic = "client/machine/sync";
        var repository = database.CreateRepository(clock: clock);
        repository.Enqueue(new("retry-dead", topic, EnvelopeJson("retry-dead", "sync")));
        repository.Quarantine("retry-dead", "Conflict");

        OfflineQueueMessage retried = repository.RetryDead("retry-dead")!;
        Assert.Equal(OfflineQueueStatus.Retry, retried.Status);
        Assert.False(repository.HasDeadMessageForTopic(topic));

        var restarted = database.CreateRepository(clock: clock);
        Assert.False(restarted.HasDeadMessageForTopic(topic));
        Assert.Equal("retry-dead", Assert.Single(restarted.GetDueMessages(10)).MessageId);

        restarted.Quarantine("retry-dead", "Conflict again");
        Assert.True(restarted.ResolveDead("retry-dead", "Operator discarded invalid batch"));
        Assert.Null(restarted.Find("retry-dead"));
        Assert.False(restarted.HasDeadMessageForTopic(topic));

        var afterResolveRestart = database.CreateRepository(clock: clock);
        Assert.False(afterResolveRestart.HasDeadMessageForTopic(topic));
        Assert.Contains(
            afterResolveRestart.GetAuditEvents(10),
            item => item.MessageId == "retry-dead" &&
                item.Reason == OfflineQueueAuditReason.DeadResolved &&
                !item.BlocksTopic);
    }

    [Fact]
    public void EvictedQuarantinedSyncAudit_ContinuesToBlockRebatching()
    {
        using var database = new TempDatabase();
        var clock = new ManualTimeProvider(StartTime);
        const string topic = "client/machine/sync";
        string payload = EnvelopeJson("sync-dead", "sync");
        var repository = database.CreateRepository(
            new OfflineQueueOptions { MaxPayloadBytes = payload.Length + 10 },
            clock);
        repository.Enqueue(new("sync-dead", topic, payload));
        repository.Quarantine("sync-dead", "Conflict");
        repository.Enqueue(new("replacement", "other", EnvelopeJson("replacement", "telemetry")));

        Assert.Null(repository.Find("sync-dead"));
        Assert.Contains(
            repository.GetAuditEvents(10),
            item => item.MessageId == "sync-dead" &&
                item.Status == OfflineQueueStatus.Dead &&
                item.Reason == OfflineQueueAuditReason.PayloadBudgetEviction);
        Assert.True(repository.HasDeadMessageForTopic(topic));
    }

    [Fact]
    public void EvictedQuarantinedSync_CanBeResolvedAndStaysRecoveredAcrossRestart()
    {
        using var database = new TempDatabase();
        var clock = new ManualTimeProvider(StartTime);
        const string messageId = "evicted-sync-dead";
        const string topic = "client/machine/sync";
        string payload = EnvelopeJson(messageId, "sync");
        var options = new OfflineQueueOptions
        {
            MaxPayloadBytes = payload.Length + 10
        };
        var repository = database.CreateRepository(options, clock);
        repository.Enqueue(new(messageId, topic, payload));
        repository.Quarantine(messageId, "Conflict");
        repository.Enqueue(new(
            "replacement-after-dead",
            "other",
            EnvelopeJson("replacement-after-dead", "telemetry")));

        Assert.Null(repository.Find(messageId));
        Assert.True(repository.HasDeadMessageForTopic(topic));
        Assert.True(repository.ResolveDead(messageId, "Operator resolved evicted batch"));
        Assert.False(repository.HasDeadMessageForTopic(topic));
        Assert.Contains(
            repository.GetAuditEvents(10),
            item => item.MessageId == messageId &&
                item.Reason == OfflineQueueAuditReason.PayloadBudgetEviction &&
                !item.BlocksTopic &&
                item.ResolvedAt.HasValue);
        Assert.Contains(
            repository.GetAuditEvents(10),
            item => item.MessageId == messageId &&
                item.Reason == OfflineQueueAuditReason.DeadResolved &&
                !item.BlocksTopic);

        var restarted = database.CreateRepository(options, clock);
        Assert.False(restarted.HasDeadMessageForTopic(topic));
        Assert.Contains(
            restarted.GetAuditEvents(10),
            item => item.MessageId == messageId &&
                item.Reason == OfflineQueueAuditReason.DeadResolved);
    }

    [Fact]
    public void LocalSyncDatabaseFailure_ThrowsAndPreventsQueueCompletion()
    {
        using var database = new TempDatabase();
        var factory = new SqliteConnectionFactory(database.Path);
        var repository = new SqliteOfflineQueueRepository(
            factory,
            timeProvider: new ManualTimeProvider(StartTime));
        const string messageId = "sync-local-failure";
        repository.Enqueue(new(messageId, "client/machine/sync", EnvelopeJson(messageId, "sync")));
        LocalDbService localDb = CreateLocalDb(factory, repository);
        using (var connection = new SqliteConnection($"Data Source={database.Path}"))
        {
            connection.Open();
            using var command = connection.CreateCommand();
            command.CommandText = "DROP TABLE telemetry_records;";
            command.ExecuteNonQuery();
        }

        var handler = new ApplicationAcknowledgementHandler(
            repository,
            (_, _) => localDb.MarkTelemetryRecordsAsSynced(new List<long> { 1 }));

        Assert.Throws<SqliteException>(() =>
            handler.Handle(AckJson("syncAck", messageId, "Committed")));
        Assert.NotNull(repository.Find(messageId));
    }

    [Fact]
    public void AtomicTelemetryDelivery_RollsBackTelemetryWhenQueueInsertFails()
    {
        using var database = new TempDatabase();
        var factory = new SqliteConnectionFactory(database.Path);
        var repository = new SqliteOfflineQueueRepository(factory);
        LocalDbService localDb = CreateLocalDb(factory, repository);
        const string messageId = "atomic-mismatch";

        Assert.Throws<ArgumentException>(() => localDb.StoreTelemetryForDelivery(
            new OfflineQueueEnqueueRequest(
                messageId,
                "client/machine/telemetry",
                EnvelopeJson("different-id", "telemetry")),
            deliverySequence: 1,
            productionQty: 0,
            defectQty: 0,
            plcRuntime: 0));

        Assert.Equal(0, CountRows(database.Path, "telemetry_records"));
        Assert.Equal(0, CountRows(database.Path, "mqtt_offline_queue"));
    }

    [Fact]
    public void AtomicTelemetryDelivery_InsertFailureLeavesNoQueueRow()
    {
        using var database = new TempDatabase();
        var factory = new SqliteConnectionFactory(database.Path);
        var repository = new SqliteOfflineQueueRepository(factory);
        LocalDbService localDb = CreateLocalDb(factory, repository);
        using (var connection = new SqliteConnection($"Data Source={database.Path}"))
        {
            connection.Open();
            using var command = connection.CreateCommand();
            command.CommandText = "DROP TABLE telemetry_records;";
            command.ExecuteNonQuery();
        }

        Assert.Throws<SqliteException>(() => localDb.StoreTelemetryForDelivery(
            new OfflineQueueEnqueueRequest(
                "atomic-insert-failure",
                "client/machine/telemetry",
                EnvelopeJson("atomic-insert-failure", "telemetry")),
            deliverySequence: 1,
            productionQty: 0,
            defectQty: 0,
            plcRuntime: 0));
        Assert.Equal(0, CountRows(database.Path, "mqtt_offline_queue"));
    }

    [Fact]
    public void StoredTelemetry_UsesImmutableInnerSequenceForOuterSyncContract()
    {
        using var database = new TempDatabase();
        var factory = new SqliteConnectionFactory(database.Path);
        var repository = new SqliteOfflineQueueRepository(factory);
        LocalDbService localDb = CreateLocalDb(factory, repository);
        var builder = new TelemetryPayloadBuilder();
        long deliverySequence = localDb.ReserveTelemetryDeliverySequence();
        const string messageId = "new-sequence-contract";
        string rawJson = builder.BuildTelemetryJson(
            "RUNNING",
            true,
            1.5,
            10,
            100,
            new Dictionary<string, object>(),
            deliverySequence,
            messageId);
        localDb.StoreTelemetryForDelivery(
            new OfflineQueueEnqueueRequest(messageId, "client/machine/telemetry", rawJson),
            deliverySequence,
            10,
            0,
            1.5);

        TelemetrySyncRecord record = Assert.Single(localDb.GetUnsyncedTelemetryRecords());
        using var document = System.Text.Json.JsonDocument.Parse(record.RawJson);
        long innerSequence = document.RootElement
            .GetProperty("payload")
            .GetProperty("sequence")
            .GetInt64();
        Assert.Equal(innerSequence, record.Sequence);
        Assert.Equal(rawJson, record.RawJson);
    }

    [Fact]
    public void LegacyTelemetryMigration_UsesStoredInnerSequenceAsOuterSequenceWithoutRewrite()
    {
        using var database = new TempDatabase(initialize: false);
        string rawJson = EnvelopeJsonWithSequence("old-sequence-contract", "telemetry", 77);
        using (var connection = new SqliteConnection($"Data Source={database.Path}"))
        {
            connection.Open();
            using var command = connection.CreateCommand();
            command.CommandText = @"
                CREATE TABLE telemetry_records (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    raw_json TEXT NOT NULL,
                    synced INTEGER DEFAULT 0,
                    shift_date TEXT,
                    shift_name TEXT,
                    production_qty INTEGER DEFAULT 0,
                    defect_qty INTEGER DEFAULT 0,
                    plc_runtime REAL DEFAULT 0
                );
                INSERT INTO telemetry_records (timestamp, raw_json, synced)
                VALUES ('2026-08-02T09:00:00Z', @raw_json, 0);";
            command.Parameters.AddWithValue("@raw_json", rawJson);
            command.ExecuteNonQuery();
        }

        var factory = new SqliteConnectionFactory(database.Path);
        var repository = new SqliteOfflineQueueRepository(factory);
        LocalDbService localDb = CreateLocalDb(factory, repository);
        TelemetrySyncRecord record = Assert.Single(localDb.GetUnsyncedTelemetryRecords());

        Assert.Equal(77, record.Sequence);
        Assert.Equal(rawJson, record.RawJson);
    }

    [Fact]
    public async Task LegacyRepeatedSequence_AckFirstFiveHundredLeavesLaterRowUnsynced()
    {
        using var database = new TempDatabase();
        const string rawJson = "{\"legacy\":true,\"payload\":{\"sequence\":7}}";
        using (var connection = new SqliteConnection($"Data Source={database.Path}"))
        {
            connection.Open();
            using var transaction = connection.BeginTransaction();
            using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = @"
                INSERT INTO telemetry_records (
                    delivery_sequence, timestamp, raw_json, synced)
                VALUES (7, @timestamp, @raw_json, 0);";
            command.Parameters.AddWithValue("@timestamp", "2026-08-02T09:00:00Z");
            command.Parameters.AddWithValue("@raw_json", rawJson);
            for (int index = 0; index < 501; index++)
            {
                command.ExecuteNonQuery();
            }
            transaction.Commit();
        }

        var factory = new SqliteConnectionFactory(database.Path);
        var repository = new SqliteOfflineQueueRepository(factory);
        LocalDbService localDb = CreateLocalDb(factory, repository);
        var transport = new FakeTransport();
        var service = new MqttClientService(transport, new FakePollingService(), localDb);

        await InvokePrivateAsync(service, "ProcessSyncAsync", CancellationToken.None);

        string envelope = Assert.Single(transport.PublishedPayloads);
        using var document = System.Text.Json.JsonDocument.Parse(envelope);
        System.Text.Json.JsonElement[] records = document.RootElement
            .GetProperty("payload")
            .GetProperty("records")
            .EnumerateArray()
            .ToArray();
        Assert.Equal(500, records.Length);
        Assert.All(records, record =>
        {
            Assert.Equal(7, record.GetProperty("sequence").GetInt64());
            Assert.Equal(rawJson, record.GetProperty("rawJson").GetString());
            Assert.True(record.GetProperty("localRowId").GetInt64() > 0);
        });

        string messageId = document.RootElement.GetProperty("messageId").GetString()!;
        await service.HandleApplicationAcknowledgementAsync(
            AckJson("syncAck", messageId, "Committed"));

        TelemetrySyncRecord remaining = Assert.Single(localDb.GetUnsyncedTelemetryRecords());
        Assert.Equal(501, remaining.Id);
        Assert.Equal(7, remaining.Sequence);
        Assert.Equal(rawJson, remaining.RawJson);
    }

    [Fact]
    public async Task StableConnection_PeriodicPumpPublishesDueMessageAndPersistsAckDeadline()
    {
        using var database = new TempDatabase();
        var factory = new SqliteConnectionFactory(database.Path);
        var repository = new SqliteOfflineQueueRepository(factory);
        const string messageId = "periodic-replay";
        string payload = EnvelopeJson(messageId, "telemetry");
        repository.Enqueue(new(messageId, "client/machine/telemetry", payload));
        LocalDbService localDb = CreateLocalDb(factory, repository);
        var transport = new FakeTransport();
        var service = new MqttClientService(
            transport,
            new FakePollingService(latestStatus: "RUNNING"),
            localDb);

        service.Start();
        try
        {
            await WaitUntilAsync(
                () => transport.PublishedPayloads.Contains(payload),
                TimeSpan.FromSeconds(4));
            OfflineQueueMessage awaiting = repository.Find(messageId)!;
            Assert.Equal(OfflineQueueStatus.AwaitingAck, awaiting.Status);
            Assert.NotNull(awaiting.NextAttemptAt);
        }
        finally
        {
            service.Stop();
            await Task.Delay(300);
        }
    }

    [Fact]
    public async Task FinalOfflineTelemetry_IsStoredBeforePublishCompletes()
    {
        using var database = new TempDatabase();
        var factory = new SqliteConnectionFactory(database.Path);
        var repository = new SqliteOfflineQueueRepository(factory);
        LocalDbService localDb = CreateLocalDb(factory, repository);
        var transport = new FakeTransport(blockPublishes: true);
        var service = new MqttClientService(
            transport,
            new FakePollingService(latestStatus: "RUNNING"),
            localDb);

        service.Stop();
        await transport.SendStarted.Task.WaitAsync(TimeSpan.FromSeconds(3));

        string publishedPayload = Assert.Single(transport.PublishedPayloads);
        using var document = System.Text.Json.JsonDocument.Parse(publishedPayload);
        string storedMessageId = document.RootElement.GetProperty("messageId").GetString()!;
        OfflineQueueMessage stored = repository.Find(storedMessageId)!;
        using var storedDocument = System.Text.Json.JsonDocument.Parse(stored.Payload);
        Assert.Equal(
            "OFFLINE",
            storedDocument.RootElement.GetProperty("payload").GetProperty("status").GetString());
        Assert.Contains(
            stored.Status,
            new[] { OfflineQueueStatus.AwaitingAck, OfflineQueueStatus.Retry });

        transport.ReleasePublishes();
        await service.StopAsync();
    }

    [Fact]
    public async Task StopAsync_IsIdempotentAndPublishesExactlyOneFinalOffline()
    {
        using var database = new TempDatabase();
        var factory = new SqliteConnectionFactory(database.Path);
        var repository = new SqliteOfflineQueueRepository(factory);
        LocalDbService localDb = CreateLocalDb(factory, repository);
        var transport = new FakeTransport();
        var service = new MqttClientService(
            transport,
            new FakePollingService(latestStatus: "RUNNING"),
            localDb);

        service.Start();
        await Task.Delay(100);
        Task first = service.StopAsync();
        Task second = service.StopAsync();
        await Task.WhenAll(first, second);

        string[] offlinePayloads = transport.PublishedPayloads
            .Where(IsOfflineTelemetry)
            .ToArray();
        Assert.Single(offlinePayloads);
        using var offlineDocument = System.Text.Json.JsonDocument.Parse(offlinePayloads[0]);
        string offlineMessageId = offlineDocument.RootElement.GetProperty("messageId").GetString()!;
        OfflineQueueMessage persisted = repository.Find(offlineMessageId)!;
        Assert.True(IsOfflineTelemetry(persisted.Payload));
    }

    [Fact]
    public async Task StopAsync_CommunicationDisabledPersistsOneFinalOfflineWithoutPublishing()
    {
        using var database = new TempDatabase();
        var factory = new SqliteConnectionFactory(database.Path);
        var repository = new SqliteOfflineQueueRepository(factory);
        var transport = new FakeTransport();
        var service = new MqttClientService(
            transport,
            new FakePollingService(latestStatus: "RUNNING"),
            CreateLocalDb(factory, repository));
        service.ServerCommEnabled = false;

        await Task.WhenAll(service.StopAsync(), service.StopAsync());

        Assert.Empty(transport.PublishedPayloads);
        OfflineQueueMessage persisted = Assert.Single(repository.GetDueMessages(10));
        Assert.True(IsOfflineTelemetry(persisted.Payload));
        Assert.Equal(OfflineQueueStatus.Pending, persisted.Status);
    }

    [Fact]
    public async Task StopAsync_AwaitsBlockedTransportShutdown()
    {
        using var database = new TempDatabase();
        var factory = new SqliteConnectionFactory(database.Path);
        var transport = new FakeTransport(blockStops: true);
        var service = new MqttClientService(
            transport,
            new FakePollingService(),
            CreateLocalDb(factory, new SqliteOfflineQueueRepository(factory)));

        Task stopTask = service.StopAsync();
        await transport.StopStarted.Task.WaitAsync(TimeSpan.FromSeconds(3));
        Assert.False(stopTask.IsCompleted);

        transport.ReleaseStop();
        await stopTask.WaitAsync(TimeSpan.FromSeconds(3));
        Assert.False(transport.IsConnected);
    }

    [Fact]
    public async Task SyncQueueInsertFailureSuppressesPublish()
    {
        using var database = new TempDatabase();
        var factory = new SqliteConnectionFactory(database.Path);
        var repository = new SqliteOfflineQueueRepository(factory);
        LocalDbService localDb = CreateLocalDb(factory, repository);
        SeedUnsyncedTelemetry(database.Path, "insert-failure", 11);
        ExecuteSql(database.Path, @"
            CREATE TRIGGER fail_sync_queue_insert
            BEFORE INSERT ON mqtt_offline_queue
            BEGIN
                SELECT RAISE(FAIL, 'queue insert failed');
            END;");
        var transport = new FakeTransport();
        var service = new MqttClientService(transport, new FakePollingService(), localDb);

        await InvokePrivateAsync(service, "ProcessSyncAsync", CancellationToken.None);

        Assert.Empty(transport.PublishedPayloads);
        Assert.Single(localDb.GetUnsyncedTelemetryRecords());
    }

    [Theory]
    [InlineData("DELETE FROM mqtt_offline_queue WHERE message_id = NEW.message_id;")]
    [InlineData("UPDATE mqtt_offline_queue SET status = 'DEAD' WHERE message_id = NEW.message_id;")]
    public async Task QueueReplay_ConcurrentCompletionOrQuarantineSuppressesPublish(string mutation)
    {
        using var database = new TempDatabase();
        var factory = new SqliteConnectionFactory(database.Path);
        var repository = new SqliteOfflineQueueRepository(factory);
        const string messageId = "concurrent-transition";
        string payload = EnvelopeJson(messageId, "telemetry");
        repository.Enqueue(new(messageId, "client/machine/telemetry", payload));
        ExecuteSql(database.Path, $@"
            CREATE TRIGGER mutate_awaiting_queue
            AFTER UPDATE OF status ON mqtt_offline_queue
            WHEN NEW.status = 'AWAITING_ACK'
            BEGIN
                {mutation}
            END;");
        var transport = new FakeTransport();
        var service = new MqttClientService(
            transport,
            new FakePollingService(),
            CreateLocalDb(factory, repository));

        await InvokePrivateAsync(service, "ProcessOfflineQueueAsync", CancellationToken.None);

        Assert.Empty(transport.PublishedPayloads);
    }

    [Fact]
    public async Task StopAsync_WaitsForInFlightPublishBeforeFinalOfflineAndDisconnect()
    {
        using var database = new TempDatabase();
        var factory = new SqliteConnectionFactory(database.Path);
        var repository = new SqliteOfflineQueueRepository(factory);
        LocalDbService localDb = CreateLocalDb(factory, repository);
        var transport = new OrderedFakeTransport();
        var service = new MqttClientService(
            transport,
            new FakePollingService(latestStatus: "RUNNING"),
            localDb);

        service.Start();
        await transport.FirstSendStarted.Task.WaitAsync(TimeSpan.FromSeconds(3));
        Task stopTask = service.StopAsync();
        await Task.Delay(150);
        Assert.False(stopTask.IsCompleted);
        Assert.DoesNotContain(transport.Events, item => item == "disconnect");
        Assert.Equal(1, transport.MaxConcurrentSends);

        transport.ReleaseFirstSend();
        await stopTask.WaitAsync(TimeSpan.FromSeconds(5));

        Assert.Equal(1, transport.MaxConcurrentSends);
        Assert.Equal("disconnect", transport.Events.Last());
        Assert.Single(transport.PublishedPayloads, IsOfflineTelemetry);
    }

    [Fact]
    public async Task FinalOfflineInsertFailureSuppressesPublishAndStillDisconnects()
    {
        using var database = new TempDatabase();
        var factory = new SqliteConnectionFactory(database.Path);
        var repository = new SqliteOfflineQueueRepository(factory);
        LocalDbService localDb = CreateLocalDb(factory, repository);
        using (var connection = new SqliteConnection($"Data Source={database.Path}"))
        {
            connection.Open();
            using var command = connection.CreateCommand();
            command.CommandText = "DROP TABLE telemetry_records;";
            command.ExecuteNonQuery();
        }
        var transport = new FakeTransport();
        var service = new MqttClientService(transport, new FakePollingService(), localDb);

        await service.StopAsync();

        Assert.DoesNotContain(transport.PublishedPayloads, IsOfflineTelemetry);
        Assert.False(transport.IsConnected);
        Assert.Equal(0, CountRows(database.Path, "mqtt_offline_queue"));
    }

    private static LocalDbService CreateLocalDb(
        SqliteConnectionFactory factory,
        IOfflineQueueRepository queue)
    {
        var telemetry = new SqliteTelemetryRepository(factory);
        return new LocalDbService(
            telemetry,
            new SqliteErrorHistoryRepository(factory),
            new SqliteUnitHistoryRepository(factory),
            queue,
            new SqliteAppConfigRepository(factory),
            new ShiftService(telemetry),
            factory);
    }

    private static async Task InvokePrivateAsync(
        MqttClientService service,
        string methodName,
        CancellationToken token)
    {
        MethodInfo method = typeof(MqttClientService).GetMethod(
            methodName,
            BindingFlags.Instance | BindingFlags.NonPublic)!;
        await (Task)method.Invoke(service, new object[] { token })!;
    }

    private static void SeedUnsyncedTelemetry(string path, string messageId, long sequence)
    {
        string rawJson = System.Text.Json.JsonSerializer.Serialize(new
        {
            messageId,
            payload = new { sequence }
        });
        using var connection = new SqliteConnection($"Data Source={path}");
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = @"
            INSERT INTO telemetry_records (
                delivery_sequence, timestamp, raw_json, synced)
            VALUES (@sequence, '2026-08-02T09:00:00Z', @raw_json, 0);";
        command.Parameters.AddWithValue("@sequence", sequence);
        command.Parameters.AddWithValue("@raw_json", rawJson);
        command.ExecuteNonQuery();
    }

    private static void ExecuteSql(string path, string sql)
    {
        using var connection = new SqliteConnection($"Data Source={path}");
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        command.ExecuteNonQuery();
    }

    private static string EnvelopeJson(string messageId, string messageType) =>
        System.Text.Json.JsonSerializer.Serialize(new
        {
            protocolVersion = 1,
            messageId,
            messageType,
            payload = new { records = Array.Empty<object>() }
        });

    private static string EnvelopeJsonWithSequence(
        string messageId,
        string messageType,
        long sequence) =>
        System.Text.Json.JsonSerializer.Serialize(new
        {
            protocolVersion = 1,
            messageId,
            messageType,
            payload = new { sequence }
        });

    private static long CountRows(string databasePath, string tableName)
    {
        using var connection = new SqliteConnection($"Data Source={databasePath}");
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = $"SELECT COUNT(*) FROM {tableName};";
        return Convert.ToInt64(command.ExecuteScalar());
    }

    private static async Task WaitUntilAsync(Func<bool> condition, TimeSpan timeout)
    {
        DateTime deadline = DateTime.UtcNow.Add(timeout);
        while (!condition())
        {
            if (DateTime.UtcNow >= deadline)
            {
                throw new TimeoutException("Condition was not reached before the test deadline.");
            }

            await Task.Delay(25);
        }
    }

    private static bool IsOfflineTelemetry(string json)
    {
        try
        {
            using var document = System.Text.Json.JsonDocument.Parse(json);
            return document.RootElement.TryGetProperty("messageType", out var messageType) &&
                messageType.GetString() == "telemetry" &&
                document.RootElement.TryGetProperty("payload", out var payload) &&
                payload.TryGetProperty("status", out var status) &&
                status.GetString() == "OFFLINE";
        }
        catch (System.Text.Json.JsonException)
        {
            return false;
        }
    }

    private static string AckJson(
        string messageType,
        string messageId,
        string state,
        string? detail = null) =>
        System.Text.Json.JsonSerializer.Serialize(new
        {
            messageType,
            messageId,
            payload = new { state, detail }
        });

    private sealed class ManualTimeProvider : TimeProvider
    {
        private DateTimeOffset _utcNow;

        public ManualTimeProvider(DateTimeOffset utcNow)
        {
            _utcNow = utcNow;
        }

        public override DateTimeOffset GetUtcNow() => _utcNow;

        public void Advance(TimeSpan amount)
        {
            _utcNow = _utcNow.Add(amount);
        }
    }

    private sealed class TempDatabase : IDisposable
    {
        private readonly string _directory;

        public TempDatabase(bool initialize = true)
        {
            _directory = System.IO.Path.Combine(
                System.IO.Path.GetTempPath(),
                "ClientPLC.Tests",
                Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(_directory);
            Path = System.IO.Path.Combine(_directory, "queue.db");
            if (initialize)
            {
                _ = new SqliteConnectionFactory(Path);
            }
        }

        public string Path { get; }

        public SqliteOfflineQueueRepository CreateRepository(
            OfflineQueueOptions? options = null,
            TimeProvider? clock = null)
        {
            return new SqliteOfflineQueueRepository(
                new SqliteConnectionFactory(Path),
                options,
                clock);
        }

        public void Dispose()
        {
            SqliteConnection.ClearAllPools();
            Directory.Delete(_directory, recursive: true);
        }
    }

    private sealed class FakeTransport : IServerTransport
    {
        private readonly TaskCompletionSource _release =
            new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly bool _blockPublishes;
        private readonly bool _blockStops;
        private readonly TaskCompletionSource _releaseStop =
            new(TaskCreationOptions.RunContinuationsAsynchronously);

        public FakeTransport(bool blockPublishes = false, bool blockStops = false)
        {
            _blockPublishes = blockPublishes;
            _blockStops = blockStops;
            if (!blockPublishes)
            {
                _release.SetResult();
            }
            if (!blockStops)
            {
                _releaseStop.SetResult();
            }
        }

        public bool IsConnected { get; private set; } = true;
        public System.Collections.Concurrent.ConcurrentBag<string> PublishedPayloads { get; } = new();
        public TaskCompletionSource SendStarted { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource StopStarted { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);

        public event Action<string>? OnLogReceived { add { } remove { } }
        public event Func<string, Task>? OnMessageReceived { add { } remove { } }
        public event Func<Task>? OnConnected { add { } remove { } }

        public void Start() => IsConnected = true;

        public void Stop() => IsConnected = false;

        public async Task StopAsync()
        {
            StopStarted.TrySetResult();
            if (_blockStops)
            {
                await _releaseStop.Task;
            }
            IsConnected = false;
        }

        public async Task<bool> SendMessageAsync(
            string topic,
            string payload,
            CancellationToken token)
        {
            PublishedPayloads.Add(payload);
            SendStarted.TrySetResult();
            if (_blockPublishes)
            {
                await _release.Task.WaitAsync(token);
            }
            return true;
        }

        public void ReleasePublishes() => _release.TrySetResult();
        public void ReleaseStop() => _releaseStop.TrySetResult();
    }

    private sealed class FakePollingService : IPLCPollingService
    {
        private readonly string _latestStatus;

        public FakePollingService(string latestStatus = "OFFLINE")
        {
            _latestStatus = latestStatus;
        }

        public PlcConnectionState ConnectionState => PlcConnectionState.Disconnected;
        public bool IsPlcConnected => false;
        public string ConnectedPlcBrand => string.Empty;
        public IPLCAdapter PlcInstance => null!;
        public string LastPlcError => string.Empty;
        public Dictionary<string, object> LatestPlcData { get; } = new();
        public Dictionary<string, string> LatestPlcErrors { get; } = new();
        public string LatestStatus => _latestStatus;
        public int LatestRunCount => 0;
        public int LatestPlcRuntimeSeconds => 0;
        public double LatestCycleTimeSec => 0;
        public int LatestDefectCount => 0;

        public event Action<string>? OnLogReceived { add { } remove { } }
        public event Action<Dictionary<string, object>>? OnPlcDataRead { add { } remove { } }

        public void Start() { }
        public void Stop() { }
        public void EnsurePlcConnected() { }
        public void ReconnectDefaultPlc() { }
        public void UpdateReadAddresses(string readAddresses) { }
        public bool ConnectPlc(string brand, string ip, int port) => false;
        public void DisconnectPlc() { }
    }

    private sealed class OrderedFakeTransport : IServerTransport
    {
        private readonly TaskCompletionSource _releaseFirst =
            new(TaskCreationOptions.RunContinuationsAsynchronously);
        private int _sendCount;
        private int _concurrentSends;
        private int _maxConcurrentSends;

        public bool IsConnected { get; private set; } = true;
        public int MaxConcurrentSends => Volatile.Read(ref _maxConcurrentSends);
        public System.Collections.Concurrent.ConcurrentQueue<string> Events { get; } = new();
        public System.Collections.Concurrent.ConcurrentBag<string> PublishedPayloads { get; } = new();
        public TaskCompletionSource FirstSendStarted { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);

        public event Action<string>? OnLogReceived { add { } remove { } }
        public event Func<string, Task>? OnMessageReceived { add { } remove { } }
        public event Func<Task>? OnConnected { add { } remove { } }

        public void Start() => IsConnected = true;

        public void Stop()
        {
            Events.Enqueue("disconnect");
            IsConnected = false;
        }

        public Task StopAsync()
        {
            Stop();
            return Task.CompletedTask;
        }

        public async Task<bool> SendMessageAsync(
            string topic,
            string payload,
            CancellationToken token)
        {
            int concurrent = Interlocked.Increment(ref _concurrentSends);
            UpdateMaximum(concurrent);
            int sendNumber = Interlocked.Increment(ref _sendCount);
            Events.Enqueue($"send-start:{sendNumber}");
            PublishedPayloads.Add(payload);
            try
            {
                if (sendNumber == 1)
                {
                    FirstSendStarted.TrySetResult();
                    await _releaseFirst.Task;
                }
                Events.Enqueue($"send-end:{sendNumber}");
                return true;
            }
            finally
            {
                Interlocked.Decrement(ref _concurrentSends);
            }
        }

        public void ReleaseFirstSend() => _releaseFirst.TrySetResult();

        private void UpdateMaximum(int concurrent)
        {
            int observed;
            do
            {
                observed = Volatile.Read(ref _maxConcurrentSends);
                if (observed >= concurrent)
                {
                    return;
                }
            }
            while (Interlocked.CompareExchange(ref _maxConcurrentSends, concurrent, observed) != observed);
        }
    }
}
