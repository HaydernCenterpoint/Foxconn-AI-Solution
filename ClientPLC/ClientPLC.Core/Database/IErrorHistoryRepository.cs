using System;
using System.Collections.Generic;

namespace PLC.Database;

public interface IErrorHistoryRepository
{
    void AddOrUpdate(string machineId, string machineName, string errorCode, string errorName, string address, string severity, DateTime startedAt, DateTime? endedAt, int? durationSeconds, string status, string triggerValue, string description, string solution);
    List<Dictionary<string, object>> GetHistory(string machineId, string errorCode, string status, DateTime? fromDate, DateTime? toDate, string shift = "");
}
