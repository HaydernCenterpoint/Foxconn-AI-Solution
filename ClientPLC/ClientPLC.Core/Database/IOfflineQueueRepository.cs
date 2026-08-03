using System.Collections.Generic;
using System.Data.Common;

namespace PLC.Database;

public interface IOfflineQueueRepository
{
    bool Enqueue(OfflineQueueEnqueueRequest message);
    bool Enqueue(
        OfflineQueueEnqueueRequest message,
        DbConnection connection,
        DbTransaction transaction);
    IReadOnlyList<OfflineQueueMessage> GetDueMessages(int maxCount);
    IReadOnlyList<OfflineQueueMessage> GetDeadMessages(int maxCount);
    IReadOnlyList<OfflineQueueAuditEvent> GetAuditEvents(int maxCount);
    IReadOnlyList<OfflineQueueAuditSummary> GetAuditSummaries();
    bool HasActiveMessageForTopic(string topic);
    bool HasDeadMessageForTopic(string topic);
    OfflineQueueMessage? Find(string messageId);
    OfflineQueueMessage? MarkAwaitingAcknowledgement(string messageId);
    OfflineQueueMessage? Complete(string messageId);
    OfflineQueueMessage? ScheduleRetry(string messageId, string error);
    OfflineQueueMessage? Quarantine(string messageId, string error);
    OfflineQueueMessage? RetryDead(string messageId);
    bool ResolveDead(string messageId, string detail);
    OfflineQueueMessage RecordFailure(long id, string error);
    int RemoveExpired();

    // Compatibility surface retained for callers that have not moved to the typed API.
    void Enqueue(string topic, string payload);
    List<(long Id, string Topic, string Payload)> GetMessages();
    void Delete(long id);
}
