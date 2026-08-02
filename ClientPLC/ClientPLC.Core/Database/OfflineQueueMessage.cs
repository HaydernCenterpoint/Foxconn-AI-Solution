using System;

namespace PLC.Database;

public enum OfflineQueueStatus
{
    Pending,
    AwaitingAck,
    Retry,
    Dead
}

public enum OfflineQueueAuditReason
{
    Expired,
    PayloadBudgetEviction,
    DeadRetried,
    DeadResolved
}

public enum ApplicationAcknowledgementState
{
    Committed,
    Duplicate,
    Busy,
    RetryableFailure,
    Malformed,
    PayloadTooLarge,
    PermanentFailure,
    Conflict
}

public sealed record OfflineQueueEnqueueRequest(
    string MessageId,
    string Topic,
    string Payload,
    DateTimeOffset? CreatedAt = null);

public sealed record OfflineQueueMessage(
    long Id,
    string MessageId,
    string Topic,
    string Payload,
    OfflineQueueStatus Status,
    int RetryCount,
    DateTimeOffset? NextAttemptAt,
    string? LastError,
    long PayloadBytes,
    DateTimeOffset CreatedAt);

public sealed record OfflineQueueAuditEvent(
    long Id,
    string MessageId,
    string Topic,
    OfflineQueueStatus Status,
    OfflineQueueAuditReason Reason,
    string? Detail,
    long PayloadBytes,
    DateTimeOffset CreatedAt,
    DateTimeOffset AuditedAt,
    bool BlocksTopic,
    DateTimeOffset? ResolvedAt);

public sealed record OfflineQueueAuditSummary(
    OfflineQueueAuditReason Reason,
    OfflineQueueStatus Status,
    long EventCount,
    long PayloadBytes,
    DateTimeOffset FirstAuditedAt,
    DateTimeOffset LastAuditedAt);

public sealed record ApplicationAcknowledgement(
    string MessageType,
    string MessageId,
    ApplicationAcknowledgementState State,
    string? Detail);

public sealed class OfflineQueueOptions
{
    public TimeSpan MaxAge { get; init; } = TimeSpan.FromDays(7);

    public long MaxPayloadBytes { get; init; } = 2L * 1024 * 1024 * 1024;

    public int MaxAttempts { get; init; } = 5;

    public int MaxBatchSize { get; init; } = 100;

    public TimeSpan InitialRetryDelay { get; init; } = TimeSpan.FromSeconds(5);

    public TimeSpan MaxRetryDelay { get; init; } = TimeSpan.FromMinutes(5);

    public TimeSpan ApplicationAckTimeout { get; init; } = TimeSpan.FromSeconds(30);

    public TimeSpan AuditMaxAge { get; init; } = TimeSpan.FromDays(90);

    public int AuditMaxRows { get; init; } = 10_000;

    public void Validate()
    {
        if (MaxAge <= TimeSpan.Zero)
        {
            throw new ArgumentOutOfRangeException(nameof(MaxAge));
        }

        if (MaxPayloadBytes <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(MaxPayloadBytes));
        }

        if (MaxAttempts <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(MaxAttempts));
        }

        if (MaxBatchSize <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(MaxBatchSize));
        }

        if (InitialRetryDelay <= TimeSpan.Zero)
        {
            throw new ArgumentOutOfRangeException(nameof(InitialRetryDelay));
        }

        if (MaxRetryDelay < InitialRetryDelay)
        {
            throw new ArgumentOutOfRangeException(nameof(MaxRetryDelay));
        }

        if (ApplicationAckTimeout <= TimeSpan.Zero)
        {
            throw new ArgumentOutOfRangeException(nameof(ApplicationAckTimeout));
        }

        if (AuditMaxAge <= TimeSpan.Zero)
        {
            throw new ArgumentOutOfRangeException(nameof(AuditMaxAge));
        }

        if (AuditMaxRows <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(AuditMaxRows));
        }
    }
}
