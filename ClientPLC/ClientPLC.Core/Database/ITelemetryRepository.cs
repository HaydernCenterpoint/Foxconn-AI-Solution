using System;
using System.Collections.Generic;
using PLC.Service;

namespace PLC.Database;

public interface ITelemetryRepository
{
    void Insert(string status, int plcRuntime, int productionQty, int defectQty, string shiftDate, string shiftName);
    Dictionary<string, object> GetLatest();
    List<TelemetryRecord> GetShiftRecords(string shiftDate, string shiftName);
    List<(string ShiftDate, string ShiftName)> GetRecentShifts(int days);
}
