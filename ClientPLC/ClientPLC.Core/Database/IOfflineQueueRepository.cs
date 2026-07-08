using System.Collections.Generic;

namespace PLC.Database;

public interface IOfflineQueueRepository
{
    void Enqueue(string topic, string payload);
    List<(long Id, string Topic, string Payload)> GetMessages();
    void Delete(long id);
}
