using System;
using System.Collections.Generic;
using System.Data.Common;
using System.Globalization;
using System.Text;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using PLC.Database;

namespace PLC.Infrastructure.Database;

public class SqliteOfflineQueueRepository : IOfflineQueueRepository
{
    private const int MaxStoredErrorLength = 4096;

    private readonly IDatabaseConnectionFactory _connectionFactory;
    private readonly OfflineQueueOptions _options;
    private readonly TimeProvider _timeProvider;

    public SqliteOfflineQueueRepository(
        IDatabaseConnectionFactory connectionFactory,
        OfflineQueueOptions? options = null,
        TimeProvider? timeProvider = null)
    {
        _connectionFactory = connectionFactory ?? throw new ArgumentNullException(nameof(connectionFactory));
        _options = options ?? new OfflineQueueOptions();
        _options.Validate();
        _timeProvider = timeProvider ?? TimeProvider.System;
        EnforceRetention();
    }

    public bool Enqueue(OfflineQueueEnqueueRequest message)
    {
        DateTimeOffset now = _timeProvider.GetUtcNow();
        using var connection = (SqliteConnection)_connectionFactory.CreateConnection();
        using var transaction = connection.BeginTransaction();
        bool inserted = EnqueueCore(message, connection, transaction, now);
        transaction.Commit();
        return inserted;
    }

    public bool Enqueue(
        OfflineQueueEnqueueRequest message,
        DbConnection connection,
        DbTransaction transaction)
    {
        if (connection is not SqliteConnection sqliteConnection ||
            transaction is not SqliteTransaction sqliteTransaction)
        {
            throw new ArgumentException("SQLite connection and transaction are required.");
        }

        return EnqueueCore(message, sqliteConnection, sqliteTransaction, _timeProvider.GetUtcNow());
    }

    public IReadOnlyList<OfflineQueueMessage> GetDueMessages(int maxCount)
    {
        if (maxCount <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(maxCount));
        }

        RemoveExpired();
        int limit = Math.Min(maxCount, _options.MaxBatchSize);
        using var connection = (SqliteConnection)_connectionFactory.CreateConnection();
        using (var transaction = connection.BeginTransaction())
        {
            MoveExpiredAcknowledgementsToDead(connection, transaction, _timeProvider.GetUtcNow());
            transaction.Commit();
        }
        const string sql = @"
            SELECT id, message_id, topic, payload, status, retry_count,
                   next_attempt_at, last_error, payload_bytes, created_at
            FROM mqtt_offline_queue
            WHERE status IN ('PENDING', 'AWAITING_ACK', 'RETRY')
              AND (next_attempt_at IS NULL OR julianday(next_attempt_at) <= julianday(@now))
            ORDER BY julianday(created_at) ASC, id ASC
            LIMIT @limit;";
        using var command = new SqliteCommand(sql, connection);
        command.Parameters.AddWithValue("@now", FormatTimestamp(_timeProvider.GetUtcNow()));
        command.Parameters.AddWithValue("@limit", limit);
        using var reader = command.ExecuteReader();
        var messages = new List<OfflineQueueMessage>(limit);
        while (reader.Read())
        {
            messages.Add(ReadMessage(reader));
        }

        return messages;
    }

    public IReadOnlyList<OfflineQueueAuditEvent> GetAuditEvents(int maxCount)
    {
        if (maxCount <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(maxCount));
        }

        using var connection = (SqliteConnection)_connectionFactory.CreateConnection();
        const string sql = @"
            SELECT id, message_id, topic, status, reason, detail,
                   payload_bytes, created_at, audited_at, blocks_topic, resolved_at
            FROM mqtt_offline_queue_audit
            ORDER BY id DESC
            LIMIT @limit;";
        using var command = new SqliteCommand(sql, connection);
        command.Parameters.AddWithValue("@limit", Math.Min(maxCount, _options.MaxBatchSize));
        using var reader = command.ExecuteReader();
        var events = new List<OfflineQueueAuditEvent>();
        while (reader.Read())
        {
            events.Add(new OfflineQueueAuditEvent(
                reader.GetInt64(0),
                reader.GetString(1),
                reader.GetString(2),
                ParseStatus(reader.GetString(3)),
                ParseAuditReason(reader.GetString(4)),
                reader.IsDBNull(5) ? null : reader.GetString(5),
                reader.GetInt64(6),
                ParseTimestamp(reader.GetString(7)),
                ParseTimestamp(reader.GetString(8)),
                reader.GetInt64(9) != 0,
                reader.IsDBNull(10) ? null : ParseTimestamp(reader.GetString(10))));
        }

        return events;
    }

    public IReadOnlyList<OfflineQueueAuditSummary> GetAuditSummaries()
    {
        using var connection = (SqliteConnection)_connectionFactory.CreateConnection();
        const string sql = @"
            SELECT reason, status, event_count, payload_bytes,
                   first_audited_at, last_audited_at
            FROM mqtt_offline_queue_audit_summary
            ORDER BY reason, status;";
        using var command = new SqliteCommand(sql, connection);
        using var reader = command.ExecuteReader();
        var summaries = new List<OfflineQueueAuditSummary>();
        while (reader.Read())
        {
            summaries.Add(new OfflineQueueAuditSummary(
                ParseAuditReason(reader.GetString(0)),
                ParseStatus(reader.GetString(1)),
                reader.GetInt64(2),
                reader.GetInt64(3),
                ParseTimestamp(reader.GetString(4)),
                ParseTimestamp(reader.GetString(5))));
        }
        return summaries;
    }

    public IReadOnlyList<OfflineQueueMessage> GetDeadMessages(int maxCount)
    {
        if (maxCount <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(maxCount));
        }

        using var connection = (SqliteConnection)_connectionFactory.CreateConnection();
        const string sql = @"
            SELECT id, message_id, topic, payload, status, retry_count,
                   next_attempt_at, last_error, payload_bytes, created_at
            FROM mqtt_offline_queue
            WHERE status = 'DEAD'
            ORDER BY julianday(created_at) ASC, id ASC
            LIMIT @limit;";
        using var command = new SqliteCommand(sql, connection);
        command.Parameters.AddWithValue("@limit", Math.Min(maxCount, _options.MaxBatchSize));
        using var reader = command.ExecuteReader();
        var messages = new List<OfflineQueueMessage>();
        while (reader.Read())
        {
            messages.Add(ReadMessage(reader));
        }

        return messages;
    }

    public bool HasActiveMessageForTopic(string topic)
    {
        if (string.IsNullOrWhiteSpace(topic))
        {
            throw new ArgumentException("A topic is required.", nameof(topic));
        }

        using var connection = (SqliteConnection)_connectionFactory.CreateConnection();
        using var command = new SqliteCommand(@"
            SELECT 1
            FROM mqtt_offline_queue
            WHERE topic = @topic AND status IN ('PENDING', 'AWAITING_ACK', 'RETRY')
            LIMIT 1;", connection);
        command.Parameters.AddWithValue("@topic", topic);
        return command.ExecuteScalar() is not null;
    }

    public bool HasDeadMessageForTopic(string topic)
    {
        if (string.IsNullOrWhiteSpace(topic))
        {
            throw new ArgumentException("A topic is required.", nameof(topic));
        }

        using var connection = (SqliteConnection)_connectionFactory.CreateConnection();
        using var command = new SqliteCommand(@"
            SELECT 1
            FROM mqtt_offline_queue
            WHERE topic = @topic AND status = 'DEAD'
            UNION ALL
            SELECT 1
            FROM mqtt_offline_queue_blocker
            WHERE topic = @topic AND resolved_at IS NULL
            LIMIT 1;", connection);
        command.Parameters.AddWithValue("@topic", topic);
        return command.ExecuteScalar() is not null;
    }

    public OfflineQueueMessage? Find(string messageId)
    {
        using var connection = (SqliteConnection)_connectionFactory.CreateConnection();
        using var transaction = connection.BeginTransaction();
        OfflineQueueMessage? message = GetByMessageId(connection, transaction, messageId);
        transaction.Commit();
        return message;
    }

    public OfflineQueueMessage? MarkAwaitingAcknowledgement(string messageId)
    {
        using var connection = (SqliteConnection)_connectionFactory.CreateConnection();
        using var transaction = connection.BeginTransaction();
        OfflineQueueMessage? current = GetByMessageId(connection, transaction, messageId);
        if (current is null || current.Status == OfflineQueueStatus.Dead)
        {
            transaction.Commit();
            return current;
        }

        int attemptCount = current.RetryCount == int.MaxValue ? int.MaxValue : current.RetryCount + 1;
        UpdateState(
            connection,
            transaction,
            current.Id,
            OfflineQueueStatus.AwaitingAck,
            attemptCount,
            _timeProvider.GetUtcNow().Add(_options.ApplicationAckTimeout),
            "Awaiting application acknowledgement.");
        OfflineQueueMessage updated = GetById(connection, transaction, current.Id)!;
        transaction.Commit();
        return updated;
    }

    public OfflineQueueMessage? Complete(string messageId)
    {
        using var connection = (SqliteConnection)_connectionFactory.CreateConnection();
        using var transaction = connection.BeginTransaction();
        OfflineQueueMessage? current = GetByMessageId(connection, transaction, messageId);
        if (current is not null)
        {
            using var command = new SqliteCommand(
                "DELETE FROM mqtt_offline_queue WHERE id = @id;",
                connection,
                transaction);
            command.Parameters.AddWithValue("@id", current.Id);
            command.ExecuteNonQuery();
        }

        transaction.Commit();
        return current;
    }

    public OfflineQueueMessage? ScheduleRetry(string messageId, string error)
    {
        using var connection = (SqliteConnection)_connectionFactory.CreateConnection();
        using var transaction = connection.BeginTransaction();
        OfflineQueueMessage? current = GetByMessageId(connection, transaction, messageId);
        if (current is null)
        {
            transaction.Commit();
            return current;
        }

        int retryCount = current.RetryCount;
        bool isDead = retryCount >= _options.MaxAttempts;
        OfflineQueueStatus status = isDead ? OfflineQueueStatus.Dead : OfflineQueueStatus.Retry;
        DateTimeOffset? nextAttemptAt = isDead
            ? null
            : _timeProvider.GetUtcNow().Add(GetRetryDelay(Math.Max(1, retryCount)));
        UpdateState(
            connection,
            transaction,
            current.Id,
            status,
            retryCount,
            nextAttemptAt,
            NormalizeError(error));
        OfflineQueueMessage updated = GetById(connection, transaction, current.Id)!;
        transaction.Commit();
        return updated;
    }

    public OfflineQueueMessage? Quarantine(string messageId, string error)
    {
        using var connection = (SqliteConnection)_connectionFactory.CreateConnection();
        using var transaction = connection.BeginTransaction();
        OfflineQueueMessage? current = GetByMessageId(connection, transaction, messageId);
        if (current is null)
        {
            transaction.Commit();
            return null;
        }

        UpdateState(
            connection,
            transaction,
            current.Id,
            OfflineQueueStatus.Dead,
            current.RetryCount,
            null,
            NormalizeError(error));
        UpsertTopicBlocker(connection, transaction, current, _timeProvider.GetUtcNow());
        OfflineQueueMessage updated = GetById(connection, transaction, current.Id)!;
        transaction.Commit();
        return updated;
    }

    public OfflineQueueMessage? RetryDead(string messageId)
    {
        using var connection = (SqliteConnection)_connectionFactory.CreateConnection();
        using var transaction = connection.BeginTransaction();
        OfflineQueueMessage? current = GetByMessageId(connection, transaction, messageId);
        if (current is null || current.Status != OfflineQueueStatus.Dead)
        {
            transaction.Commit();
            return current;
        }

        UpdateState(
            connection,
            transaction,
            current.Id,
            OfflineQueueStatus.Retry,
            0,
            _timeProvider.GetUtcNow(),
            "Operator retried dead message.");
        DateTimeOffset now = _timeProvider.GetUtcNow();
        ResolveTopicBlocker(
            connection,
            transaction,
            messageId,
            "Operator retried dead message.",
            now);
        ResolveBlockingAuditHistory(connection, transaction, messageId, now);
        InsertAuditEvent(
            connection,
            transaction,
            current,
            OfflineQueueAuditReason.DeadRetried,
            "Operator retried dead message.",
            blocksTopic: false,
            now,
            resolvedAt: now);
        OfflineQueueMessage updated = GetById(connection, transaction, current.Id)!;
        EnforceAuditRetention(connection, transaction, now);
        transaction.Commit();
        return updated;
    }

    public bool ResolveDead(string messageId, string detail)
    {
        if (string.IsNullOrWhiteSpace(messageId))
        {
            return false;
        }

        string resolutionDetail = NormalizeError(detail);
        DateTimeOffset now = _timeProvider.GetUtcNow();
        using var connection = (SqliteConnection)_connectionFactory.CreateConnection();
        using var transaction = connection.BeginTransaction();
        OfflineQueueMessage? current = GetByMessageId(connection, transaction, messageId);
        if (current is not null && current.Status != OfflineQueueStatus.Dead)
        {
            transaction.Commit();
            return false;
        }

        OfflineQueueMessage? auditSource = current;
        if (auditSource is null)
        {
            auditSource = GetUnresolvedBlockerAuditSource(connection, transaction, messageId);
            if (auditSource is null)
            {
                transaction.Commit();
                return false;
            }
        }

        ResolveTopicBlocker(
            connection,
            transaction,
            messageId,
            resolutionDetail,
            now);
        ResolveBlockingAuditHistory(connection, transaction, messageId, now);
        InsertAuditEvent(
            connection,
            transaction,
            auditSource,
            OfflineQueueAuditReason.DeadResolved,
            resolutionDetail,
            blocksTopic: false,
            now,
            resolvedAt: now);
        if (current is not null)
        {
            using var command = new SqliteCommand(
                "DELETE FROM mqtt_offline_queue WHERE id = @id;",
                connection,
                transaction);
            command.Parameters.AddWithValue("@id", current.Id);
            command.ExecuteNonQuery();
        }
        EnforceAuditRetention(connection, transaction, now);
        transaction.Commit();
        return true;
    }

    public OfflineQueueMessage RecordFailure(long id, string error)
    {
        if (id <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(id));
        }

        string storedError = NormalizeError(error);
        using var connection = (SqliteConnection)_connectionFactory.CreateConnection();
        using var transaction = connection.BeginTransaction();
        OfflineQueueMessage current = GetById(connection, transaction, id)
            ?? throw new InvalidOperationException($"Offline queue message {id} does not exist.");
        if (current.Status == OfflineQueueStatus.Dead)
        {
            transaction.Commit();
            return current;
        }

        int retryCount = current.Status == OfflineQueueStatus.AwaitingAck
            ? current.RetryCount
            : current.RetryCount == int.MaxValue ? int.MaxValue : current.RetryCount + 1;
        bool isDead = retryCount >= _options.MaxAttempts;
        OfflineQueueStatus status = isDead ? OfflineQueueStatus.Dead : OfflineQueueStatus.Retry;
        DateTimeOffset? nextAttemptAt = isDead
            ? null
            : _timeProvider.GetUtcNow().Add(GetRetryDelay(retryCount));

        UpdateState(connection, transaction, id, status, retryCount, nextAttemptAt, storedError);

        OfflineQueueMessage updated = GetById(connection, transaction, id)!;
        transaction.Commit();
        return updated;
    }

    public int RemoveExpired()
    {
        using var connection = (SqliteConnection)_connectionFactory.CreateConnection();
        using var transaction = connection.BeginTransaction();
        int removed = RemoveExpired(connection, transaction, _timeProvider.GetUtcNow());
        EnforceAuditRetention(connection, transaction, _timeProvider.GetUtcNow());
        transaction.Commit();
        return removed;
    }

    public void Enqueue(string topic, string payload)
    {
        Enqueue(new OfflineQueueEnqueueRequest(ExtractMessageId(payload) ?? Guid.NewGuid().ToString("N"), topic, payload));
    }

    public List<(long Id, string Topic, string Payload)> GetMessages()
    {
        var messages = GetDueMessages(_options.MaxBatchSize);
        var result = new List<(long Id, string Topic, string Payload)>(messages.Count);
        foreach (OfflineQueueMessage message in messages)
        {
            result.Add((message.Id, message.Topic, message.Payload));
        }

        return result;
    }

    public void Delete(long id)
    {
        using var connection = (SqliteConnection)_connectionFactory.CreateConnection();
        using var command = new SqliteCommand("DELETE FROM mqtt_offline_queue WHERE id = @id;", connection);
        command.Parameters.AddWithValue("@id", id);
        command.ExecuteNonQuery();
    }

    private bool EnqueueCore(
        OfflineQueueEnqueueRequest message,
        SqliteConnection connection,
        SqliteTransaction transaction,
        DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(message);
        if (string.IsNullOrWhiteSpace(message.MessageId))
        {
            throw new ArgumentException("A stable messageId is required.", nameof(message));
        }
        if (string.IsNullOrWhiteSpace(message.Topic))
        {
            throw new ArgumentException("A topic is required.", nameof(message));
        }
        ArgumentNullException.ThrowIfNull(message.Payload);

        string requestedMessageId = message.MessageId.Trim();
        string? envelopeMessageId = ExtractMessageId(message.Payload);
        if (string.IsNullOrWhiteSpace(envelopeMessageId) ||
            !string.Equals(requestedMessageId, envelopeMessageId, StringComparison.Ordinal))
        {
            throw new ArgumentException(
                "Queue messageId must exactly match payload.messageId.",
                nameof(message));
        }

        long payloadBytes = Encoding.UTF8.GetByteCount(message.Payload);
        if (payloadBytes > _options.MaxPayloadBytes)
        {
            throw new InvalidOperationException("The message payload exceeds the offline queue storage budget.");
        }

        DateTimeOffset createdAt = (message.CreatedAt ?? now).ToUniversalTime();
        RemoveExpired(connection, transaction, now);
        if (MessageExists(connection, transaction, requestedMessageId))
        {
            return false;
        }

        EnforcePayloadBudget(connection, transaction, payloadBytes);
        const string sql = @"
            INSERT INTO mqtt_offline_queue (
                message_id, topic, payload, status, retry_count, next_attempt_at,
                last_error, payload_bytes, created_at, sequence)
            VALUES (
                @message_id, @topic, @payload, 'PENDING', 0, @next_attempt_at,
                NULL, @payload_bytes, @created_at, 0);";
        using var command = new SqliteCommand(sql, connection, transaction);
        command.Parameters.AddWithValue("@message_id", requestedMessageId);
        command.Parameters.AddWithValue("@topic", message.Topic);
        command.Parameters.AddWithValue("@payload", message.Payload);
        command.Parameters.AddWithValue("@next_attempt_at", FormatTimestamp(createdAt));
        command.Parameters.AddWithValue("@payload_bytes", payloadBytes);
        command.Parameters.AddWithValue("@created_at", FormatTimestamp(createdAt));
        command.ExecuteNonQuery();
        return true;
    }

    private bool MessageExists(SqliteConnection connection, SqliteTransaction transaction, string messageId)
    {
        using var command = new SqliteCommand(
            "SELECT 1 FROM mqtt_offline_queue WHERE message_id = @message_id LIMIT 1;",
            connection,
            transaction);
        command.Parameters.AddWithValue("@message_id", messageId.Trim());
        return command.ExecuteScalar() is not null;
    }

    private void EnforceRetention()
    {
        using var connection = (SqliteConnection)_connectionFactory.CreateConnection();
        using var transaction = connection.BeginTransaction();
        RemoveExpired(connection, transaction, _timeProvider.GetUtcNow());
        EnforcePayloadBudget(connection, transaction, 0);
        EnforceAuditRetention(connection, transaction, _timeProvider.GetUtcNow());
        transaction.Commit();
    }

    private int RemoveExpired(
        SqliteConnection connection,
        SqliteTransaction transaction,
        DateTimeOffset now)
    {
        string cutoff = FormatTimestamp(now.Subtract(_options.MaxAge));
        const string auditSql = @"
            INSERT INTO mqtt_offline_queue_audit (
                message_id, topic, status, reason, detail, payload_bytes,
                created_at, audited_at, blocks_topic, resolved_at)
            SELECT message_id, topic, status, 'EXPIRED',
                   'Removed after exceeding the offline queue retention age.',
                   payload_bytes, created_at, @audited_at,
                   CASE WHEN status = 'DEAD' THEN 1 ELSE 0 END,
                   NULL
            FROM mqtt_offline_queue
            WHERE julianday(created_at) < julianday(@cutoff);";
        using (var auditCommand = new SqliteCommand(auditSql, connection, transaction))
        {
            auditCommand.Parameters.AddWithValue("@audited_at", FormatTimestamp(now));
            auditCommand.Parameters.AddWithValue("@cutoff", cutoff);
            auditCommand.ExecuteNonQuery();
        }

        using (var blockerCommand = new SqliteCommand(@"
            INSERT INTO mqtt_offline_queue_blocker (
                message_id, topic, created_at, resolved_at, resolution_detail)
            SELECT message_id, topic, @created_at, NULL, NULL
            FROM mqtt_offline_queue
            WHERE status = 'DEAD'
              AND julianday(created_at) < julianday(@cutoff)
            ON CONFLICT(message_id) DO UPDATE SET
                topic = excluded.topic,
                resolved_at = NULL,
                resolution_detail = NULL;", connection, transaction))
        {
            blockerCommand.Parameters.AddWithValue("@created_at", FormatTimestamp(now));
            blockerCommand.Parameters.AddWithValue("@cutoff", cutoff);
            blockerCommand.ExecuteNonQuery();
        }

        using var deleteCommand = new SqliteCommand(@"
            DELETE FROM mqtt_offline_queue
            WHERE julianday(created_at) < julianday(@cutoff);", connection, transaction);
        deleteCommand.Parameters.AddWithValue("@cutoff", cutoff);
        return deleteCommand.ExecuteNonQuery();
    }

    private void EnforcePayloadBudget(
        SqliteConnection connection,
        SqliteTransaction transaction,
        long incomingPayloadBytes)
    {
        using var totalCommand = new SqliteCommand(
            "SELECT COALESCE(SUM(payload_bytes), 0) FROM mqtt_offline_queue;",
            connection,
            transaction);
        long totalBytes = Convert.ToInt64(totalCommand.ExecuteScalar(), CultureInfo.InvariantCulture);
        long bytesToFree = totalBytes + incomingPayloadBytes - _options.MaxPayloadBytes;
        if (bytesToFree <= 0)
        {
            return;
        }

        var idsToDelete = new List<long>();
        using (var oldestCommand = new SqliteCommand(@"
            SELECT id, payload_bytes
            FROM mqtt_offline_queue
            ORDER BY julianday(created_at) ASC, id ASC;", connection, transaction))
        using (var reader = oldestCommand.ExecuteReader())
        {
            long selectedBytes = 0;
            while (reader.Read() && selectedBytes < bytesToFree)
            {
                idsToDelete.Add(reader.GetInt64(0));
                selectedBytes += reader.GetInt64(1);
            }
        }

        foreach (long id in idsToDelete)
        {
            OfflineQueueMessage? evicted = GetById(connection, transaction, id);
            if (evicted?.Status == OfflineQueueStatus.Dead)
            {
                UpsertTopicBlocker(
                    connection,
                    transaction,
                    evicted,
                    _timeProvider.GetUtcNow());
            }
            AuditMessage(
                connection,
                transaction,
                id,
                OfflineQueueAuditReason.PayloadBudgetEviction,
                "Removed to enforce the offline queue payload budget.",
                _timeProvider.GetUtcNow());
            using var deleteCommand = new SqliteCommand(
                "DELETE FROM mqtt_offline_queue WHERE id = @id;",
                connection,
                transaction);
            deleteCommand.Parameters.AddWithValue("@id", id);
            deleteCommand.ExecuteNonQuery();
        }
        EnforceAuditRetention(connection, transaction, _timeProvider.GetUtcNow());
    }

    private void MoveExpiredAcknowledgementsToDead(
        SqliteConnection connection,
        SqliteTransaction transaction,
        DateTimeOffset now)
    {
        using (var command = new SqliteCommand(@"
            UPDATE mqtt_offline_queue
            SET status = 'DEAD',
                next_attempt_at = NULL,
                last_error = 'Application acknowledgement deadline exceeded after maximum delivery attempts.'
            WHERE status = 'AWAITING_ACK'
              AND retry_count >= @max_attempts
              AND julianday(next_attempt_at) <= julianday(@now);", connection, transaction))
        {
            command.Parameters.AddWithValue("@max_attempts", _options.MaxAttempts);
            command.Parameters.AddWithValue("@now", FormatTimestamp(now));
            command.ExecuteNonQuery();
        }

        using var blockerCommand = new SqliteCommand(@"
            INSERT INTO mqtt_offline_queue_blocker (
                message_id, topic, created_at, resolved_at, resolution_detail)
            SELECT message_id, topic, @created_at, NULL, NULL
            FROM mqtt_offline_queue
            WHERE status = 'DEAD'
              AND last_error = 'Application acknowledgement deadline exceeded after maximum delivery attempts.'
            ON CONFLICT(message_id) DO UPDATE SET
                topic = excluded.topic,
                resolved_at = NULL,
                resolution_detail = NULL;", connection, transaction);
        blockerCommand.Parameters.AddWithValue("@created_at", FormatTimestamp(now));
        blockerCommand.ExecuteNonQuery();
    }

    private static void AuditMessage(
        SqliteConnection connection,
        SqliteTransaction transaction,
        long id,
        OfflineQueueAuditReason reason,
        string detail,
        DateTimeOffset auditedAt)
    {
        const string sql = @"
            INSERT INTO mqtt_offline_queue_audit (
                message_id, topic, status, reason, detail, payload_bytes,
                created_at, audited_at, blocks_topic, resolved_at)
            SELECT message_id, topic, status, @reason, @detail,
                   payload_bytes, created_at, @audited_at,
                   CASE WHEN status = 'DEAD' THEN 1 ELSE 0 END,
                   NULL
            FROM mqtt_offline_queue
            WHERE id = @id;";
        using var command = new SqliteCommand(sql, connection, transaction);
        command.Parameters.AddWithValue("@reason", ToDatabaseAuditReason(reason));
        command.Parameters.AddWithValue("@detail", detail);
        command.Parameters.AddWithValue("@audited_at", FormatTimestamp(auditedAt));
        command.Parameters.AddWithValue("@id", id);
        command.ExecuteNonQuery();
    }

    private static void InsertAuditEvent(
        SqliteConnection connection,
        SqliteTransaction transaction,
        OfflineQueueMessage message,
        OfflineQueueAuditReason reason,
        string detail,
        bool blocksTopic,
        DateTimeOffset auditedAt,
        DateTimeOffset? resolvedAt = null)
    {
        const string sql = @"
            INSERT INTO mqtt_offline_queue_audit (
                message_id, topic, status, reason, detail, payload_bytes,
                created_at, audited_at, blocks_topic, resolved_at)
            VALUES (
                @message_id, @topic, @status, @reason, @detail, @payload_bytes,
                @created_at, @audited_at, @blocks_topic, @resolved_at);";
        using var command = new SqliteCommand(sql, connection, transaction);
        command.Parameters.AddWithValue("@message_id", message.MessageId);
        command.Parameters.AddWithValue("@topic", message.Topic);
        command.Parameters.AddWithValue("@status", ToDatabaseStatus(message.Status));
        command.Parameters.AddWithValue("@reason", ToDatabaseAuditReason(reason));
        command.Parameters.AddWithValue("@detail", detail);
        command.Parameters.AddWithValue("@payload_bytes", message.PayloadBytes);
        command.Parameters.AddWithValue("@created_at", FormatTimestamp(message.CreatedAt));
        command.Parameters.AddWithValue("@audited_at", FormatTimestamp(auditedAt));
        command.Parameters.AddWithValue("@blocks_topic", blocksTopic ? 1 : 0);
        command.Parameters.AddWithValue(
            "@resolved_at",
            resolvedAt.HasValue ? FormatTimestamp(resolvedAt.Value) : DBNull.Value);
        command.ExecuteNonQuery();
    }

    private static OfflineQueueMessage? GetUnresolvedBlockerAuditSource(
        SqliteConnection connection,
        SqliteTransaction transaction,
        string messageId)
    {
        const string sql = @"
            SELECT blocker.message_id,
                   blocker.topic,
                   blocker.created_at,
                   COALESCE((
                       SELECT audit.payload_bytes
                       FROM mqtt_offline_queue_audit AS audit
                       WHERE audit.message_id = blocker.message_id
                       ORDER BY audit.id DESC
                       LIMIT 1), 0)
            FROM mqtt_offline_queue_blocker AS blocker
            WHERE blocker.message_id = @message_id
              AND blocker.resolved_at IS NULL;";
        using var command = new SqliteCommand(sql, connection, transaction);
        command.Parameters.AddWithValue("@message_id", messageId.Trim());
        using var reader = command.ExecuteReader();
        if (!reader.Read())
        {
            return null;
        }

        return new OfflineQueueMessage(
            0,
            reader.GetString(0),
            reader.GetString(1),
            string.Empty,
            OfflineQueueStatus.Dead,
            0,
            null,
            null,
            reader.GetInt64(3),
            ParseTimestamp(reader.GetString(2)));
    }

    private static void UpsertTopicBlocker(
        SqliteConnection connection,
        SqliteTransaction transaction,
        OfflineQueueMessage message,
        DateTimeOffset now)
    {
        const string sql = @"
            INSERT INTO mqtt_offline_queue_blocker (
                message_id, topic, created_at, resolved_at, resolution_detail)
            VALUES (@message_id, @topic, @created_at, NULL, NULL)
            ON CONFLICT(message_id) DO UPDATE SET
                topic = excluded.topic,
                resolved_at = NULL,
                resolution_detail = NULL;";
        using var command = new SqliteCommand(sql, connection, transaction);
        command.Parameters.AddWithValue("@message_id", message.MessageId);
        command.Parameters.AddWithValue("@topic", message.Topic);
        command.Parameters.AddWithValue("@created_at", FormatTimestamp(now));
        command.ExecuteNonQuery();
    }

    private static void ResolveTopicBlocker(
        SqliteConnection connection,
        SqliteTransaction transaction,
        string messageId,
        string detail,
        DateTimeOffset resolvedAt)
    {
        using var command = new SqliteCommand(@"
            UPDATE mqtt_offline_queue_blocker
            SET resolved_at = @resolved_at,
                resolution_detail = @detail
            WHERE message_id = @message_id
              AND resolved_at IS NULL;", connection, transaction);
        command.Parameters.AddWithValue("@resolved_at", FormatTimestamp(resolvedAt));
        command.Parameters.AddWithValue("@detail", detail);
        command.Parameters.AddWithValue("@message_id", messageId);
        command.ExecuteNonQuery();
    }

    private static void ResolveBlockingAuditHistory(
        SqliteConnection connection,
        SqliteTransaction transaction,
        string messageId,
        DateTimeOffset resolvedAt)
    {
        using var command = new SqliteCommand(@"
            UPDATE mqtt_offline_queue_audit
            SET blocks_topic = 0,
                resolved_at = COALESCE(resolved_at, @resolved_at)
            WHERE message_id = @message_id
              AND blocks_topic <> 0;", connection, transaction);
        command.Parameters.AddWithValue("@resolved_at", FormatTimestamp(resolvedAt));
        command.Parameters.AddWithValue("@message_id", messageId.Trim());
        command.ExecuteNonQuery();
    }

    private void EnforceAuditRetention(
        SqliteConnection connection,
        SqliteTransaction transaction,
        DateTimeOffset now)
    {
        string cutoff = FormatTimestamp(now.Subtract(_options.AuditMaxAge));
        const string candidateSql = @"
            SELECT id, reason, status, payload_bytes, audited_at
            FROM mqtt_offline_queue_audit
            WHERE (
                  julianday(audited_at) < julianday(@cutoff)
                  OR id NOT IN (
                      SELECT id
                      FROM mqtt_offline_queue_audit
                      ORDER BY id DESC
                      LIMIT @max_rows))
            ORDER BY id;";
        var candidates = new List<(long Id, string Reason, string Status, long Bytes, string AuditedAt)>();
        using (var command = new SqliteCommand(candidateSql, connection, transaction))
        {
            command.Parameters.AddWithValue("@cutoff", cutoff);
            command.Parameters.AddWithValue("@max_rows", _options.AuditMaxRows);
            using var reader = command.ExecuteReader();
            while (reader.Read())
            {
                candidates.Add((
                    reader.GetInt64(0),
                    reader.GetString(1),
                    reader.GetString(2),
                    reader.GetInt64(3),
                    reader.GetString(4)));
            }
        }

        foreach (var group in candidates.GroupBy(item => (item.Reason, item.Status)))
        {
            const string summarySql = @"
                INSERT INTO mqtt_offline_queue_audit_summary (
                    reason, status, event_count, payload_bytes,
                    first_audited_at, last_audited_at)
                VALUES (
                    @reason, @status, @event_count, @payload_bytes,
                    @first_audited_at, @last_audited_at)
                ON CONFLICT(reason, status) DO UPDATE SET
                    event_count = event_count + excluded.event_count,
                    payload_bytes = payload_bytes + excluded.payload_bytes,
                    first_audited_at = MIN(first_audited_at, excluded.first_audited_at),
                    last_audited_at = MAX(last_audited_at, excluded.last_audited_at);";
            using var command = new SqliteCommand(summarySql, connection, transaction);
            command.Parameters.AddWithValue("@reason", group.Key.Reason);
            command.Parameters.AddWithValue("@status", group.Key.Status);
            command.Parameters.AddWithValue("@event_count", group.LongCount());
            command.Parameters.AddWithValue("@payload_bytes", group.Sum(item => item.Bytes));
            command.Parameters.AddWithValue("@first_audited_at", group.Min(item => item.AuditedAt));
            command.Parameters.AddWithValue("@last_audited_at", group.Max(item => item.AuditedAt));
            command.ExecuteNonQuery();
        }

        foreach (long id in candidates.Select(item => item.Id))
        {
            using var command = new SqliteCommand(
                "DELETE FROM mqtt_offline_queue_audit WHERE id = @id;",
                connection,
                transaction);
            command.Parameters.AddWithValue("@id", id);
            command.ExecuteNonQuery();
        }
    }

    private OfflineQueueMessage? GetById(
        SqliteConnection connection,
        SqliteTransaction transaction,
        long id)
    {
        const string sql = @"
            SELECT id, message_id, topic, payload, status, retry_count,
                   next_attempt_at, last_error, payload_bytes, created_at
            FROM mqtt_offline_queue
            WHERE id = @id;";
        using var command = new SqliteCommand(sql, connection, transaction);
        command.Parameters.AddWithValue("@id", id);
        using var reader = command.ExecuteReader();
        return reader.Read() ? ReadMessage(reader) : null;
    }

    private OfflineQueueMessage? GetByMessageId(
        SqliteConnection connection,
        SqliteTransaction transaction,
        string messageId)
    {
        if (string.IsNullOrWhiteSpace(messageId))
        {
            return null;
        }

        const string sql = @"
            SELECT id, message_id, topic, payload, status, retry_count,
                   next_attempt_at, last_error, payload_bytes, created_at
            FROM mqtt_offline_queue
            WHERE message_id = @message_id;";
        using var command = new SqliteCommand(sql, connection, transaction);
        command.Parameters.AddWithValue("@message_id", messageId.Trim());
        using var reader = command.ExecuteReader();
        return reader.Read() ? ReadMessage(reader) : null;
    }

    private static void UpdateState(
        SqliteConnection connection,
        SqliteTransaction transaction,
        long id,
        OfflineQueueStatus status,
        int retryCount,
        DateTimeOffset? nextAttemptAt,
        string error)
    {
        const string sql = @"
            UPDATE mqtt_offline_queue
            SET status = @status,
                retry_count = @retry_count,
                next_attempt_at = @next_attempt_at,
                last_error = @last_error
            WHERE id = @id;";
        using var command = new SqliteCommand(sql, connection, transaction);
        command.Parameters.AddWithValue("@status", ToDatabaseStatus(status));
        command.Parameters.AddWithValue("@retry_count", retryCount);
        command.Parameters.AddWithValue(
            "@next_attempt_at",
            nextAttemptAt.HasValue ? FormatTimestamp(nextAttemptAt.Value) : DBNull.Value);
        command.Parameters.AddWithValue("@last_error", error);
        command.Parameters.AddWithValue("@id", id);
        command.ExecuteNonQuery();
    }

    private static string NormalizeError(string? error)
    {
        string value = error ?? string.Empty;
        return value.Length <= MaxStoredErrorLength ? value : value[..MaxStoredErrorLength];
    }

    private TimeSpan GetRetryDelay(int retryCount)
    {
        double multiplier = Math.Pow(2, Math.Min(retryCount - 1, 30));
        double delayMilliseconds = Math.Min(
            _options.InitialRetryDelay.TotalMilliseconds * multiplier,
            _options.MaxRetryDelay.TotalMilliseconds);
        return TimeSpan.FromMilliseconds(delayMilliseconds);
    }

    private static OfflineQueueMessage ReadMessage(SqliteDataReader reader)
    {
        return new OfflineQueueMessage(
            reader.GetInt64(0),
            reader.GetString(1),
            reader.GetString(2),
            reader.GetString(3),
            ParseStatus(reader.GetString(4)),
            reader.GetInt32(5),
            reader.IsDBNull(6) ? null : ParseTimestamp(reader.GetString(6)),
            reader.IsDBNull(7) ? null : reader.GetString(7),
            reader.GetInt64(8),
            ParseTimestamp(reader.GetString(9)));
    }

    private static string FormatTimestamp(DateTimeOffset value) =>
        value.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture);

    private static DateTimeOffset ParseTimestamp(string value) =>
        DateTimeOffset.Parse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal).ToUniversalTime();

    private static string ToDatabaseStatus(OfflineQueueStatus status) => status switch
    {
        OfflineQueueStatus.Pending => "PENDING",
        OfflineQueueStatus.AwaitingAck => "AWAITING_ACK",
        OfflineQueueStatus.Retry => "RETRY",
        OfflineQueueStatus.Dead => "DEAD",
        _ => throw new ArgumentOutOfRangeException(nameof(status))
    };

    private static OfflineQueueStatus ParseStatus(string status) => status switch
    {
        "PENDING" => OfflineQueueStatus.Pending,
        "AWAITING_ACK" => OfflineQueueStatus.AwaitingAck,
        "RETRY" => OfflineQueueStatus.Retry,
        "DEAD" => OfflineQueueStatus.Dead,
        _ => throw new InvalidOperationException($"Unknown offline queue status '{status}'.")
    };

    private static string ToDatabaseAuditReason(OfflineQueueAuditReason reason) => reason switch
    {
        OfflineQueueAuditReason.Expired => "EXPIRED",
        OfflineQueueAuditReason.PayloadBudgetEviction => "PAYLOAD_BUDGET_EVICTION",
        OfflineQueueAuditReason.DeadRetried => "DEAD_RETRIED",
        OfflineQueueAuditReason.DeadResolved => "DEAD_RESOLVED",
        _ => throw new ArgumentOutOfRangeException(nameof(reason))
    };

    private static OfflineQueueAuditReason ParseAuditReason(string reason) => reason switch
    {
        "EXPIRED" => OfflineQueueAuditReason.Expired,
        "PAYLOAD_BUDGET_EVICTION" => OfflineQueueAuditReason.PayloadBudgetEviction,
        "DEAD_RETRIED" => OfflineQueueAuditReason.DeadRetried,
        "DEAD_RESOLVED" => OfflineQueueAuditReason.DeadResolved,
        _ => throw new InvalidOperationException($"Unknown offline queue audit reason '{reason}'.")
    };

    private static string? ExtractMessageId(string payload)
    {
        try
        {
            using JsonDocument document = JsonDocument.Parse(payload);
            if (document.RootElement.ValueKind != JsonValueKind.Object)
            {
                return null;
            }

            if (document.RootElement.TryGetProperty("messageId", out JsonElement messageId) &&
                messageId.ValueKind == JsonValueKind.String)
            {
                string? value = messageId.GetString();
                return string.IsNullOrWhiteSpace(value) ? null : value;
            }
        }
        catch (JsonException)
        {
        }

        return null;
    }
}
