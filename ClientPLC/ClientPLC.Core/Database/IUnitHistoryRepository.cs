using System;
using System.Collections.Generic;
using PLC.Model;

namespace PLC.Database;

public interface IUnitHistoryRepository
{
    void Insert(UnitRecord unit);
    List<UnitRecord> GetHistory(string machineId, string status, DateTime? fromDate, DateTime? toDate, int limit);
    Dictionary<string, int> GetStatistics(string shiftDate, string shiftName);
}
