using System;
using System.Collections.Generic;
using PLC.Config;
using PLC.Database;

namespace PLC.Service;

public class ShiftService
{
    private readonly ITelemetryRepository _telemetryRepository;

    public ShiftService(ITelemetryRepository telemetryRepository)
    {
        _telemetryRepository = telemetryRepository;
    }

    public ShiftSummary GetShiftSummary(string shiftDate, string shiftName)
    {
        var shiftSummary = new ShiftSummary
        {
            ShiftDate = shiftDate,
            ShiftName = shiftName
        };

        var list = _telemetryRepository.GetShiftRecords(shiftDate, shiftName);
        if (list.Count > 0)
        {
            var firstRec = list[0];
            var lastRec = list[list.Count - 1];
            shiftSummary.RecordCount = list.Count;
            shiftSummary.FirstTimestamp = firstRec.Timestamp;
            shiftSummary.LastTimestamp = lastRec.Timestamp;
            shiftSummary.ProductionQty = lastRec.ProductionQty;
            shiftSummary.DefectQty = Math.Max(0, lastRec.DefectQty - firstRec.DefectQty);
            shiftSummary.PlcRuntimeSeconds = Math.Max(0, lastRec.PlcRuntime - firstRec.PlcRuntime);

            DateTime now = DateTime.Now;
            DateTime shiftStart;
            DateTime shiftEnd;
            if (string.Equals(shiftName, "Night", StringComparison.OrdinalIgnoreCase))
            {
                shiftStart = DateTime.Parse(shiftDate + " 19:30:00");
                shiftEnd = shiftStart.AddHours(12);
            }
            else
            {
                shiftStart = DateTime.Parse(shiftDate + " 07:30:00");
                shiftEnd = shiftStart.AddHours(12);
            }
            DateTime activeEnd = ((now < shiftEnd && now > shiftStart) ? now : shiftEnd);

            double num = (activeEnd - shiftStart).TotalSeconds;
            if (num <= 0.0)
            {
                num = 43200.0;
            }

            shiftSummary.Availability = ((num > 0.0) ? Math.Min(100.0, (double)shiftSummary.PlcRuntimeSeconds / num * 100.0) : 0.0);
            shiftSummary.Quality = ((shiftSummary.ProductionQty > 0) ? Math.Max(0.0, (double)(shiftSummary.ProductionQty - shiftSummary.DefectQty) / (double)shiftSummary.ProductionQty * 100.0) : 100.0);
            
            double num2 = (double)shiftSummary.PlcRuntimeSeconds / 3600.0;
            double num3 = ((AppConfig.Current.TargetSpeed > 0) ? ((double)AppConfig.Current.TargetSpeed) : 60.0);
            double num4 = num2 * num3;
            shiftSummary.Performance = ((num4 > 0.0) ? Math.Min(100.0, (double)shiftSummary.ProductionQty / num4 * 100.0) : 0.0);
            shiftSummary.Oee = shiftSummary.Availability / 100.0 * (shiftSummary.Performance / 100.0) * (shiftSummary.Quality / 100.0) * 100.0;

            double num5 = (lastRec.Timestamp - firstRec.Timestamp).TotalHours;
            shiftSummary.AvgSpeedPerHour = ((num5 > 0.0) ? ((double)shiftSummary.ProductionQty / num5) : 0.0);

            CalculateHourlyStats(list, shiftStart, out var hourlyProduction, out var hourlyYield, out var hourlyCycleTime);
            shiftSummary.HourlyProduction = hourlyProduction;
            shiftSummary.HourlyYield = hourlyYield;
            shiftSummary.HourlyCycleTime = hourlyCycleTime;
        }

        return shiftSummary;
    }

    private void CalculateHourlyStats(List<TelemetryRecord> records, DateTime shiftStart, out List<int> production, out List<double> yield, out List<double> ct)
    {
        production = new List<int>(new int[12]);
        yield = new List<double>(new double[12]);
        ct = new List<double>(new double[12]);

        if (records.Count == 0) return;

        int[] prodArray = new int[12];
        int[] defectArray = new int[12];
        int[] runtimeArray = new int[12];
        bool[] hasData = new bool[12];

        int firstProd = records[0].ProductionQty;
        int firstDefect = records[0].DefectQty;
        int firstRuntime = records[0].PlcRuntime;

        foreach (var record in records)
        {
            double totalSeconds = (record.Timestamp - shiftStart).TotalSeconds;
            if (totalSeconds >= 0.0)
            {
                int hourIndex = (int)Math.Floor(totalSeconds / 3600.0);
                if (hourIndex >= 0 && hourIndex < 12)
                {
                    prodArray[hourIndex] = record.ProductionQty;
                    defectArray[hourIndex] = record.DefectQty;
                    runtimeArray[hourIndex] = record.PlcRuntime;
                    hasData[hourIndex] = true;
                }
            }
        }

        int prevProd = firstProd;
        int prevDefect = firstDefect;
        int prevRuntime = firstRuntime;

        for (int i = 0; i < 12; i++)
        {
            if (hasData[i])
            {
                int prodDiff = Math.Max(0, prodArray[i] - prevProd);
                int defectDiff = Math.Max(0, defectArray[i] - prevDefect);
                int runtimeDiff = Math.Max(0, runtimeArray[i] - prevRuntime);

                production[i] = prodDiff;
                yield[i] = prodDiff > 0 ? Math.Max(0.0, (double)(prodDiff - defectDiff) / prodDiff * 100.0) : 0.0;
                ct[i] = prodDiff > 0 ? Math.Max(0.1, (double)runtimeDiff / prodDiff) : 0.0;

                prevProd = prodArray[i];
                prevDefect = defectArray[i];
                prevRuntime = runtimeArray[i];
            }
            else
            {
                production[i] = 0;
                yield[i] = 0.0;
                ct[i] = 0.0;
            }
        }
    }

    public static (string ShiftName, string ShiftDate, DateTime ShiftStart, DateTime ShiftEnd) GetShiftInfo(DateTime dt)
    {
        TimeSpan timeOfDay = dt.TimeOfDay;
        TimeSpan timeSpan = new TimeSpan(7, 30, 0);
        TimeSpan timeSpan2 = new TimeSpan(19, 30, 0);
        string item;
        DateTime date;
        DateTime item2;
        DateTime item3;
        if (timeOfDay < timeSpan)
        {
            item = "Night";
            date = dt.AddDays(-1.0).Date;
            item2 = date.Add(timeSpan2);
            item3 = date.AddDays(1.0).Add(timeSpan);
        }
        else if (timeOfDay < timeSpan2)
        {
            item = "Day";
            date = dt.Date;
            item2 = date.Add(timeSpan);
            item3 = date.Add(timeSpan2);
        }
        else
        {
            item = "Night";
            date = dt.Date;
            item2 = date.Add(timeSpan2);
            item3 = date.AddDays(1.0).Add(timeSpan);
        }
        return (ShiftName: item, ShiftDate: date.ToString("yyyy-MM-dd"), ShiftStart: item2, ShiftEnd: item3);
    }
}
