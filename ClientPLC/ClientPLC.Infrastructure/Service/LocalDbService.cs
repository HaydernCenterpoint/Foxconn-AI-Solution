using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using Microsoft.Data.Sqlite;
using PLC.Config;
using PLC.Database;
using PLC.Model;
using PLC.Infrastructure.Database;

namespace PLC.Service;

public class LocalDbService : IConfigStorage
{
    private static LocalDbService? _instance;
    private static readonly object _lock = new object();

    private readonly ITelemetryRepository _telemetryRepository;
    private readonly IErrorHistoryRepository _errorHistoryRepository;
    private readonly IUnitHistoryRepository _unitHistoryRepository;
    private readonly IOfflineQueueRepository _offlineQueueRepository;
    private readonly IAppConfigRepository _appConfigRepository;
    private readonly ShiftService _shiftService;
    private readonly IDatabaseConnectionFactory _connectionFactory;

    internal IOfflineQueueRepository OfflineQueueRepository => _offlineQueueRepository;

    public static LocalDbService Instance
    {
        get
        {
            lock (_lock)
            {
                if (_instance == null)
                {
                    _instance = new LocalDbService();
                }
                return _instance;
            }
        }
    }

    public string DbPath => _connectionFactory.DbPath;

    public LocalDbService(
        ITelemetryRepository telemetryRepository,
        IErrorHistoryRepository errorHistoryRepository,
        IUnitHistoryRepository unitHistoryRepository,
        IOfflineQueueRepository offlineQueueRepository,
        IAppConfigRepository appConfigRepository,
        ShiftService shiftService,
        IDatabaseConnectionFactory connectionFactory)
    {
        _telemetryRepository = telemetryRepository;
        _errorHistoryRepository = errorHistoryRepository;
        _unitHistoryRepository = unitHistoryRepository;
        _offlineQueueRepository = offlineQueueRepository;
        _appConfigRepository = appConfigRepository;
        _shiftService = shiftService;
        _connectionFactory = connectionFactory;
    }

    public LocalDbService()
    {
        var factory = new SqliteConnectionFactory();
        _connectionFactory = factory;
        _telemetryRepository = new SqliteTelemetryRepository(factory);
        _errorHistoryRepository = new SqliteErrorHistoryRepository(factory);
        _unitHistoryRepository = new SqliteUnitHistoryRepository(factory);
        _offlineQueueRepository = new SqliteOfflineQueueRepository(factory);
        _appConfigRepository = new SqliteAppConfigRepository(factory);
        _shiftService = new ShiftService(_telemetryRepository);
    }

    public static (string ShiftName, string ShiftDate, DateTime ShiftStart, DateTime ShiftEnd) GetShiftInfo(DateTime dt)
    {
        return ShiftService.GetShiftInfo(dt);
    }

    public void EnqueueOfflineMessage(string topic, string payload)
    {
        _offlineQueueRepository.Enqueue(topic, payload);
    }

    public bool EnqueueOfflineMessage(OfflineQueueEnqueueRequest message)
    {
        return _offlineQueueRepository.Enqueue(message);
    }

    public OfflineQueueMessage PrepareOfflineMessageForPublish(
        OfflineQueueEnqueueRequest message,
        bool enqueueIfMissing)
    {
        if (enqueueIfMissing)
        {
            _offlineQueueRepository.Enqueue(message);
        }

        OfflineQueueMessage existing = _offlineQueueRepository.Find(message.MessageId)
            ?? throw new InvalidOperationException(
                $"Offline queue message '{message.MessageId}' was not persisted.");
        if (!string.Equals(existing.Topic, message.Topic, StringComparison.Ordinal) ||
            !string.Equals(existing.Payload, message.Payload, StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                $"Offline queue message '{message.MessageId}' does not match the publish envelope.");
        }

        OfflineQueueMessage awaiting = _offlineQueueRepository
            .MarkAwaitingAcknowledgement(message.MessageId)
            ?? throw new InvalidOperationException(
                $"Offline queue message '{message.MessageId}' disappeared before publish.");
        if (awaiting.Status != OfflineQueueStatus.AwaitingAck ||
            !string.Equals(awaiting.Topic, message.Topic, StringComparison.Ordinal) ||
            !string.Equals(awaiting.Payload, message.Payload, StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                $"Offline queue message '{message.MessageId}' could not enter AwaitingAck.");
        }

        return awaiting;
    }

    public long ReserveTelemetryDeliverySequence()
    {
        using var connection = (SqliteConnection)_connectionFactory.CreateConnection();
        using var transaction = connection.BeginTransaction();
        const string readSql = "SELECT next_value FROM telemetry_delivery_sequence WHERE singleton = 1;";
        using var readCommand = new SqliteCommand(readSql, connection, transaction);
        long sequence = Convert.ToInt64(readCommand.ExecuteScalar());
        using var updateCommand = new SqliteCommand(
            "UPDATE telemetry_delivery_sequence SET next_value = next_value + 1 WHERE singleton = 1;",
            connection,
            transaction);
        updateCommand.ExecuteNonQuery();
        transaction.Commit();
        return sequence;
    }

    public long StoreTelemetryForDelivery(
        OfflineQueueEnqueueRequest message,
        long deliverySequence,
        int productionQty,
        int defectQty,
        double plcRuntime)
    {
        if (deliverySequence <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(deliverySequence));
        }

        var shift = GetShiftInfo(DateTime.Now);
        using var connection = (SqliteConnection)_connectionFactory.CreateConnection();
        using var transaction = connection.BeginTransaction();
        const string sql = @"
            INSERT INTO telemetry_records (
                delivery_sequence, timestamp, raw_json, synced, shift_date, shift_name,
                production_qty, defect_qty, plc_runtime)
            VALUES (
                @delivery_sequence, @timestamp, @raw_json, 0, @shift_date, @shift_name,
                @production_qty, @defect_qty, @plc_runtime);
            SELECT last_insert_rowid();";
        using var command = new SqliteCommand(sql, connection, transaction);
        command.Parameters.AddWithValue("@delivery_sequence", deliverySequence);
        command.Parameters.AddWithValue("@timestamp", DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ"));
        command.Parameters.AddWithValue("@raw_json", message.Payload);
        command.Parameters.AddWithValue("@shift_date", shift.ShiftDate);
        command.Parameters.AddWithValue("@shift_name", shift.ShiftName);
        command.Parameters.AddWithValue("@production_qty", productionQty);
        command.Parameters.AddWithValue("@defect_qty", defectQty);
        command.Parameters.AddWithValue("@plc_runtime", plcRuntime);
        long rowId = Convert.ToInt64(command.ExecuteScalar());

        if (!_offlineQueueRepository.Enqueue(message, connection, transaction))
        {
            throw new InvalidOperationException(
                $"Offline queue message '{message.MessageId}' already exists.");
        }

        transaction.Commit();
        return rowId;
    }

    public IReadOnlyList<OfflineQueueMessage> GetDueOfflineMessages(int maxCount)
    {
        return _offlineQueueRepository.GetDueMessages(maxCount);
    }

    public IReadOnlyList<OfflineQueueMessage> GetDeadOfflineMessages(int maxCount)
    {
        return _offlineQueueRepository.GetDeadMessages(maxCount);
    }

    public IReadOnlyList<OfflineQueueAuditEvent> GetOfflineQueueAuditEvents(int maxCount)
    {
        return _offlineQueueRepository.GetAuditEvents(maxCount);
    }

    public IReadOnlyList<OfflineQueueAuditSummary> GetOfflineQueueAuditSummaries()
    {
        return _offlineQueueRepository.GetAuditSummaries();
    }

    public bool HasActiveOfflineMessageForTopic(string topic)
    {
        return _offlineQueueRepository.HasActiveMessageForTopic(topic);
    }

    public bool CanCreateSyncBatch(string topic)
    {
        return !_offlineQueueRepository.HasActiveMessageForTopic(topic) &&
            !_offlineQueueRepository.HasDeadMessageForTopic(topic);
    }

    public OfflineQueueMessage? MarkOfflineMessageAwaitingAcknowledgement(string messageId)
    {
        return _offlineQueueRepository.MarkAwaitingAcknowledgement(messageId);
    }

    public OfflineQueueMessage? RetryDeadOfflineMessage(string messageId)
    {
        return _offlineQueueRepository.RetryDead(messageId);
    }

    public bool ResolveDeadOfflineMessage(string messageId, string detail)
    {
        return _offlineQueueRepository.ResolveDead(messageId, detail);
    }

    public OfflineQueueMessage RecordOfflineMessageFailure(long id, string error)
    {
        return _offlineQueueRepository.RecordFailure(id, error);
    }

    public OfflineQueueMessage? RecordOfflineMessageFailure(string messageId, string error)
    {
        OfflineQueueMessage? message = _offlineQueueRepository.Find(messageId);
        return message is null ? null : _offlineQueueRepository.RecordFailure(message.Id, error);
    }

    public int RemoveExpiredOfflineMessages()
    {
        return _offlineQueueRepository.RemoveExpired();
    }

    public List<(long Id, string Topic, string Payload)> GetOfflineMessages()
    {
        return _offlineQueueRepository.GetMessages();
    }

    public void DeleteOfflineMessage(long id)
    {
        _offlineQueueRepository.Delete(id);
    }

    public void InsertTelemetry(string status, int plcRuntime, int productionQty, int defectQty)
    {
        var shift = GetShiftInfo(DateTime.Now);
        _telemetryRepository.Insert(status, plcRuntime, productionQty, defectQty, shift.ShiftDate, shift.ShiftName);
    }

    public List<TelemetrySyncRecord> GetUnsyncedTelemetryRecords()
    {
        var list = new List<TelemetrySyncRecord>();
        try
        {
            using var conn = _connectionFactory.CreateConnection();
            string sql = @"
                SELECT id, delivery_sequence, timestamp, raw_json
                FROM telemetry_records
                WHERE synced = 0
                ORDER BY id ASC
                LIMIT 500;";
            using var cmd = new SqliteCommand(sql, (SqliteConnection)conn);
            using var reader = cmd.ExecuteReader();
            while (reader.Read())
            {
                list.Add(new TelemetrySyncRecord
                {
                    Id = reader.GetInt64(0),
                    Sequence = reader.GetInt64(1),
                    Timestamp = reader.GetString(2),
                    RawJson = reader.GetString(3)
                });
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine("[LocalDbService] GetUnsyncedTelemetryRecords error: " + ex.Message);
        }
        return list;
    }

    public void MarkTelemetryRecordsAsSynced(List<long> rowIds)
    {
        if (rowIds == null || rowIds.Count == 0) return;
        long[] uniqueRowIds = rowIds.Distinct().ToArray();
        using var conn = _connectionFactory.CreateConnection();
        var parameterNames = uniqueRowIds.Select((_, index) => $"@id{index}").ToArray();
        string sql = $"UPDATE telemetry_records SET synced = 1 WHERE id IN ({string.Join(",", parameterNames)});";
        using var cmd = new SqliteCommand(sql, (SqliteConnection)conn);
        for (int index = 0; index < uniqueRowIds.Length; index++)
        {
            cmd.Parameters.AddWithValue(parameterNames[index], uniqueRowIds[index]);
        }
        int affected = cmd.ExecuteNonQuery();
        if (affected != uniqueRowIds.Length)
        {
            throw new InvalidOperationException(
                $"Only {affected} of {uniqueRowIds.Length} telemetry records were marked synchronized.");
        }
    }

    public void MarkTelemetryPayloadAsSynced(string rawJson)
    {
        if (string.IsNullOrWhiteSpace(rawJson)) return;
        using var conn = _connectionFactory.CreateConnection();
        const string sql = "UPDATE telemetry_records SET synced = 1 WHERE raw_json = @raw_json;";
        using var cmd = new SqliteCommand(sql, (SqliteConnection)conn);
        cmd.Parameters.AddWithValue("@raw_json", rawJson);
        if (cmd.ExecuteNonQuery() == 0)
        {
            throw new InvalidOperationException(
                "The acknowledged telemetry payload does not exist in local storage.");
        }
    }

    public long GetLastSyncSequence()
    {
        try
        {
            using var conn = _connectionFactory.CreateConnection();
            string sql = "SELECT COALESCE(MAX(delivery_sequence), 0) FROM telemetry_records WHERE synced = 1;";
            using var cmd = new SqliteCommand(sql, (SqliteConnection)conn);
            var val = cmd.ExecuteScalar();
            return val != null && val != DBNull.Value ? Convert.ToInt64(val) : 0L;
        }
        catch (Exception ex)
        {
            Debug.WriteLine("[LocalDbService] GetLastSyncSequence error: " + ex.Message);
            return 0L;
        }
    }

    public Dictionary<string, object> GetLatestTelemetry()
    {
        return _telemetryRepository.GetLatest();
    }

    public ShiftSummary GetShiftSummary(string shiftDate, string shiftName)
    {
        return _shiftService.GetShiftSummary(shiftDate, shiftName);
    }

    public List<TelemetryRecord> GetShiftTelemetryRecords(string shiftDate, string shiftName)
    {
        return _telemetryRepository.GetShiftRecords(shiftDate, shiftName);
    }

    public List<WeeklyReportItem> GetWeeklyReport()
    {
        List<WeeklyReportItem> list = new List<WeeklyReportItem>();
        try
        {
            var shifts = _telemetryRepository.GetRecentShifts(7);
            int count = 0;
            foreach (var item in shifts)
            {
                if (count++ >= 14) break;
                ShiftSummary shiftSummary = GetShiftSummary(item.ShiftDate, item.ShiftName);
                list.Add(new WeeklyReportItem
                {
                    Date = item.ShiftDate,
                    Shift = item.ShiftName,
                    Qty = shiftSummary.ProductionQty,
                    Oee = shiftSummary.Oee
                });
            }
            list.Reverse();
        }
        catch (Exception ex)
        {
            Debug.WriteLine("[LocalDbService] GetWeeklyReport error: " + ex.Message);
        }
        return list;
    }

    public void SaveAddressProfile(string profileName, List<DataAddressItem> items)
    {
        SaveAddressesToDb(items);
    }

    public void SaveAddressProfileForMachine(string profileName, string machineId, List<DataAddressItem> items)
    {
        SaveAddressesToDb(items);
    }

    public List<DataAddressItem> LoadAddressProfile(string profileName)
    {
        return LoadAddressesFromDb();
    }

    public List<DataAddressItem> LoadAddressProfileForMachine(string profileName, string machineId)
    {
        return LoadAddressesFromDb();
    }

    private class JsonAddressConfig
    {
        public string Address { get; set; } = "";
        public string Type { get; set; } = "";
        public string Alias { get; set; } = "";
        public bool Enabled { get; set; } = true;
        public string Group { get; set; } = "";
        public string ActiveValue { get; set; } = "true";
        public string Severity { get; set; } = "Medium";
    }

    public void SaveAddressesToDb(List<DataAddressItem> items)
    {
        var list = items.Select(x => new JsonAddressConfig
        {
            Address = x.Address,
            Type = x.Type,
            Alias = x.Alias,
            Enabled = x.Enabled,
            Group = x.Group,
            ActiveValue = x.ActiveValue,
            Severity = x.Severity
        }).ToList();
        
        AppConfig.Current.ReadAddresses = System.Text.Json.JsonSerializer.Serialize(list);
        AppConfig.Current.Save();
    }

    public List<DataAddressItem> LoadAddressesFromDb()
    {
        var list = new List<DataAddressItem>();
        string readAddresses = AppConfig.Current.ReadAddresses;

        // Neu ReadAddresses rong, tra ve danh sach rong de khoi tao slate sach (chuyen sang dung live config tu PLC Address Config)
        if (string.IsNullOrWhiteSpace(readAddresses))
        {
            return list;
        }

        if (!string.IsNullOrWhiteSpace(readAddresses))
        {
            readAddresses = readAddresses.Trim();
            int index = 1;
            if (readAddresses.StartsWith("[")) // JSON array format
            {
                try
                {
                    var jsonList = System.Text.Json.JsonSerializer.Deserialize<List<JsonAddressConfig>>(readAddresses);
                    if (jsonList != null)
                    {
                        foreach (var x in jsonList)
                        {
                            var item = new DataAddressItem
                            {
                                Index = index++,
                                Address = x.Address,
                                Alias = x.Alias,
                                Type = x.Type,
                                Enabled = x.Enabled,
                                Value = "Chờ đọc...",
                                LastUpdate = "Never",
                                ActiveValue = x.ActiveValue,
                                Severity = x.Severity,
                                Description = "",
                                Solution = ""
                            };
                            if (!string.IsNullOrWhiteSpace(x.Group))
                            {
                                item.Group = x.Group;
                            }
                            else
                            {
                                item.UpdateGroup();
                            }
                            list.Add(item);
                        }
                    }
                }
                catch (Exception ex)
                {
                    Debug.WriteLine("[LocalDbService] Error parsing JSON addresses: " + ex.Message);
                }
            }
            else // Old colon-delimited format
            {
                string[] array = readAddresses.Split(',');
                foreach (string text in array)
                {
                    if (string.IsNullOrWhiteSpace(text)) continue;
                    string[] array3 = text.Split(':');
                    if (array3.Length >= 2)
                    {
                        string address = array3[0].Trim();
                        string type = array3[1].Trim();
                        string alias = ((array3.Length > 2) ? array3[2].Trim() : "");
                        bool enabled = true;
                        if (array3.Length > 3)
                        {
                            enabled = array3[3].Trim() == "1";
                        }
                        string group = "";
                        if (array3.Length > 4)
                        {
                            group = array3[4].Trim();
                        }
                        string activeValue = "true";
                        if (array3.Length > 5)
                        {
                            activeValue = array3[5].Trim();
                        }
                        string severity = "Medium";
                        if (array3.Length > 6)
                        {
                            severity = array3[6].Trim();
                        }
                        var item = new DataAddressItem
                        {
                            Index = index++,
                            Address = address,
                            Alias = alias,
                            Type = type,
                            Enabled = enabled,
                            Value = "Chờ đọc...",
                            LastUpdate = "Never",
                            ActiveValue = activeValue,
                            Severity = severity,
                            Description = "",
                            Solution = ""
                        };
                        if (!string.IsNullOrWhiteSpace(group))
                        {
                            item.Group = group;
                        }
                        else
                        {
                            item.UpdateGroup();
                        }
                        list.Add(item);
                    }
                }
            }
        }
        return list;
    }

    public List<string> GetAddressProfiles()
    {
        List<string> list = new List<string>();
        try
        {
            using var conn = _connectionFactory.CreateConnection();
            string query = "SELECT DISTINCT profile_name FROM plc_addresses ORDER BY profile_name ASC;";
            using var cmd = new SqliteCommand(query, (SqliteConnection)conn);
            using var reader = cmd.ExecuteReader();
            while (reader.Read())
            {
                list.Add(reader.GetString(0));
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine("[LocalDbService] GetAddressProfiles error: " + ex.Message);
        }
        return list;
    }

    public void DeleteAddressProfile(string profileName)
    {
        try
        {
            using var conn = _connectionFactory.CreateConnection();
            string commandText = "DELETE FROM plc_addresses WHERE profile_name = @profile_name AND machine_id = @machine_id;";
            using var cmd = new SqliteCommand(commandText, (SqliteConnection)conn);
            cmd.Parameters.AddWithValue("@profile_name", profileName);
            cmd.Parameters.AddWithValue("@machine_id", AppConfig.Current.MachineId);
            cmd.ExecuteNonQuery();
        }
        catch (Exception ex)
        {
            Debug.WriteLine("[LocalDbService] DeleteAddressProfile error: " + ex.Message);
            throw;
        }
    }

    public void AddOrUpdateErrorHistory(string machineId, string machineName, string errorCode, string errorName, string address, string severity, DateTime startedAt, DateTime? endedAt, int? durationSeconds, string status, string triggerValue, string description, string solution)
    {
        _errorHistoryRepository.AddOrUpdate(machineId, machineName, errorCode, errorName, address, severity, startedAt, endedAt, durationSeconds, status, triggerValue, description, solution);
    }

    public List<Dictionary<string, object>> GetErrorHistory(string machineId = "", string errorCode = "", string status = "", DateTime? fromDate = null, DateTime? toDate = null, string shift = "")
    {
        return _errorHistoryRepository.GetHistory(machineId, errorCode, status, fromDate, toDate, shift);
    }

    public string GetConfigValue(string key)
    {
        return GetConfigValue(key, "");
    }

    public string GetConfigValue(string key, string defaultValue = "")
    {
        return _appConfigRepository.GetValue(key, defaultValue);
    }

    public void SaveConfigValue(string key, string value)
    {
        _appConfigRepository.SaveValue(key, value);
    }

    public void InsertUnitRecord(UnitRecord unit)
    {
        _unitHistoryRepository.Insert(unit);
    }

    public List<UnitRecord> GetUnitHistory(string machineId = "", string status = "", DateTime? fromDate = null, DateTime? toDate = null, int limit = 100)
    {
        return _unitHistoryRepository.GetHistory(machineId, status, fromDate, toDate, limit);
    }

    public Dictionary<string, int> GetUnitStatistics(string shiftDate = "", string shiftName = "")
    {
        return _unitHistoryRepository.GetStatistics(shiftDate, shiftName);
    }
}

public class TelemetrySyncRecord
{
    public long Id { get; set; }
    public long Sequence { get; set; }
    public string Timestamp { get; set; } = "";
    public string RawJson { get; set; } = "";
}
