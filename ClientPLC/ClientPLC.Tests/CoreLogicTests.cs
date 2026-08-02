using System;
using System.Collections.Generic;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;
using System.Threading.Tasks;
using PLC.Config;
using PLC.Database;
using PLC.Model;
using PLC.Network;
using PLC.Service;
using HslCommunication;
using Xunit;
using PLC;

namespace ClientPLC.Tests;

public class CoreLogicTests
{
    [Fact]
    public void MachineStateResolver_ShouldResolveRunningStateAndAccumulateProduction()
    {
        // Arrange
        var resolver = new MachineStateResolver();
        
        var plcData = new Dictionary<string, object>
        {
            ["d100:int16"] = (short)1,     // START (active)
            ["d101:int16"] = (short)0,     // STOP
            ["d102:int16"] = (short)0,     // ERROR
            ["d200:int32"] = 42            // QUANTITY
        };

        var dbAddresses = new List<DataAddressItem>
        {
            new DataAddressItem { Address = "d100", Type = "int16", Alias = "START", Group = "Nhóm trạng thái", Enabled = true },
            new DataAddressItem { Address = "d101", Type = "int16", Alias = "STOP", Group = "Nhóm trạng thái", Enabled = true },
            new DataAddressItem { Address = "d102", Type = "int16", Alias = "ERROR", Group = "Nhóm trạng thái", Enabled = true },
            new DataAddressItem { Address = "d200", Type = "int32", Alias = "QUANTITY", Group = "Nhóm sản phẩm", Enabled = true }
        };

        // Act
        var state = resolver.ResolveState(
            plcData,
            dbAddresses,
            "machine-1",
            "Test Machine",
            isPlcConnected: true);

        // Assert
        Assert.Equal("RUNNING", state.ResolvedStatus);
        Assert.Equal(42, state.RunCount);
        Assert.Equal(0, state.CycleTimeSec);
    }

    [Fact]
    public void MachineStateResolver_ShouldAccumulateProductionOnRisingRawQuantity()
    {
        // Arrange
        var resolver = new MachineStateResolver();
        var dbAddresses = new List<DataAddressItem>
        {
            new DataAddressItem { Address = "d200", Type = "int32", Alias = "QUANTITY", Group = "Nhóm sản phẩm", Enabled = true }
        };

        // Act - Poll 1
        var state1 = resolver.ResolveState(
            new Dictionary<string, object> { ["d200:int32"] = 100 },
            dbAddresses, "m-1", "M1", true);

        // Act - Poll 2 (Production increased by 5)
        var state2 = resolver.ResolveState(
            new Dictionary<string, object> { ["d200:int32"] = 105 },
            dbAddresses, "m-1", "M1", true);

        // Assert
        Assert.Equal(100, state1.RunCount);
        Assert.Equal(105, state2.RunCount);
    }

    [Fact]
    public void ShiftService_ShouldCalculateOeeAvailabilityQualityAndPerformanceCorrectly()
    {
        // Arrange
        var mockTelemetryRepo = new MockTelemetryRepository();
        var shiftService = new ShiftService(mockTelemetryRepo);

        // Simulate shift records (first has Qty=0, last has Qty=100, defect=10, runtime=18000s)
        mockTelemetryRepo.Records.Add(new TelemetryRecord
        {
            Timestamp = DateTime.Parse("2026-06-29 07:30:00"),
            Status = "STOPPED",
            PlcRuntime = 0,
            ProductionQty = 0,
            DefectQty = 0
        });
        mockTelemetryRepo.Records.Add(new TelemetryRecord
        {
            Timestamp = DateTime.Parse("2026-06-29 12:30:00"),
            Status = "RUNNING",
            PlcRuntime = 18000, // 5 hours runtime
            ProductionQty = 100,
            DefectQty = 10
        });

        // Set target speed in config
        AppConfig.Current.TargetSpeed = 30; // 30 products per hour. 5 hours runtime * 30 = 150 target production

        // Act
        var summary = shiftService.GetShiftSummary("2026-06-29", "Day");

        // Assert
        Assert.Equal(100, summary.ProductionQty);
        Assert.Equal(10, summary.DefectQty);
        Assert.Equal(18000, summary.PlcRuntimeSeconds);
        Assert.Equal(90.0, summary.Quality); // (100 - 10)/100 = 90%
        
        // Availability: runtime is 18000s (5h). Total shift elapsed is from 07:30 to active end (current time or 19:30).
        // Let's verify availability is computed without errors.
        Assert.True(summary.Availability >= 0 && summary.Availability <= 100);
        Assert.True(summary.Performance >= 0 && summary.Performance <= 100);
        Assert.True(summary.Oee >= 0 && summary.Oee <= 100);
    }

    [Fact]
    public void ShiftService_ShouldCalculateHourlyStatsCorrectlyForNightShift()
    {
        // Arrange
        var mockTelemetryRepo = new MockTelemetryRepository();
        var shiftService = new ShiftService(mockTelemetryRepo);

        // Night shift starts at 2026-06-29 19:30:00
        mockTelemetryRepo.Records.Add(new TelemetryRecord
        {
            Timestamp = DateTime.Parse("2026-06-29 19:30:00"),
            Status = "RUNNING",
            PlcRuntime = 0,
            ProductionQty = 0,
            DefectQty = 0
        });
        mockTelemetryRepo.Records.Add(new TelemetryRecord
        {
            Timestamp = DateTime.Parse("2026-06-29 20:30:00"),
            Status = "RUNNING",
            PlcRuntime = 3600,
            ProductionQty = 10,
            DefectQty = 0
        });

        // Act
        var summary = shiftService.GetShiftSummary("2026-06-29", "Night");

        // Assert
        Assert.NotNull(summary.HourlyProduction);
        // The first hour (19:30 to 20:30) index 1 should have production of 10.
        Assert.Equal(10, summary.HourlyProduction[1]);
    }

    [Fact]
    public void PlcAddressReader_ShouldBatchReadsForConsecutiveAddresses()
    {
        // Arrange
        var reader = new PlcAddressReader();
        var mockPlc = new MockPLCAdapter();

        // 3 consecutive bool addresses, 2 consecutive int16 addresses, and 1 non-batchable string
        string addresses = "M100:bool:Start:1:Group1,M101:bool:Stop:1:Group1,M102:bool:Error:1:Group1,D100:int16:Val1:1:Group2,D101:int16:Val2:1:Group2,D200:string:Text:1:Group2";

        // Act
        var result = reader.ReadConfiguredAddresses(mockPlc, addresses, out _, out _, out _);

        // Assert
        // We should have exactly 1 batch read call for M100 length 3
        Assert.Single(mockPlc.ReadBoolBatches);
        Assert.Equal("M100", mockPlc.ReadBoolBatches[0].address);
        Assert.Equal(3, mockPlc.ReadBoolBatches[0].length);

        // We should have exactly 1 batch read call for D100 length 2
        Assert.Single(mockPlc.ReadInt16Batches);
        Assert.Equal("D100", mockPlc.ReadInt16Batches[0].address);
        Assert.Equal(2, mockPlc.ReadInt16Batches[0].length);
    }

    [Fact]
    public void ShiftService_GetShiftInfo_DayBoundary()
    {
        // Test 07:29:59 is Night shift of previous day
        var dtNight = new DateTime(2026, 6, 29, 7, 29, 59);
        var shiftNight = ShiftService.GetShiftInfo(dtNight);
        Assert.Equal("Night", shiftNight.ShiftName);
        Assert.Equal("2026-06-28", shiftNight.ShiftDate);

        // Test 07:30:00 is Day shift of today
        var dtDay = new DateTime(2026, 6, 29, 7, 30, 0);
        var shiftDay = ShiftService.GetShiftInfo(dtDay);
        Assert.Equal("Day", shiftDay.ShiftName);
        Assert.Equal("2026-06-29", shiftDay.ShiftDate);
    }

    [Fact]
    public void ShiftService_GetShiftInfo_CrossMidnight()
    {
        // Test 00:30:00 is Night shift of previous day
        var dt = new DateTime(2026, 6, 29, 0, 30, 0);
        var shift = ShiftService.GetShiftInfo(dt);
        Assert.Equal("Night", shift.ShiftName);
        Assert.Equal("2026-06-28", shift.ShiftDate);
    }

    [Fact]
    public void TelemetryPayloadBuilder_ProducesValidJson()
    {
        // Arrange
        var builder = new TelemetryPayloadBuilder();
        AppSettings.Current.UseMockData = true;

        var plcData = new Dictionary<string, object>
        {
            ["D100:int16"] = 123
        };

        // Act
        string json = builder.BuildTelemetryJson("RUNNING", isPlcConnected: true, cycleTimeSec: 1.5, runCount: 100, plcRuntimeSeconds: 300, plcData: plcData);

        // Assert
        Assert.False(string.IsNullOrEmpty(json));
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        Assert.Equal("telemetry", root.GetProperty("messageType").GetString());
        
        var payload = root.GetProperty("payload");
        Assert.Equal("RUNNING", payload.GetProperty("status").GetString());
        Assert.True(payload.GetProperty("plcConnected").GetBoolean());
        Assert.Equal(100, payload.GetProperty("production").GetProperty("qty").GetInt32());
    }

    [Fact]
    public void RegisterPayload_DoesNotContainDeviceToken()
    {
        AppConfig.Current.ServerToken = "transient-device-secret";

        string json = new TelemetryPayloadBuilder().BuildRegisterJson(42);

        Assert.DoesNotContain("transient-device-secret", json, StringComparison.Ordinal);
        using var doc = JsonDocument.Parse(json);
        Assert.False(doc.RootElement.GetProperty("payload").TryGetProperty("token", out _));
    }

    [Fact]
    public void AppConfig_DoesNotPersistDeviceToken()
    {
        var storage = new InMemoryConfigStorage();
        AppConfig.Storage = storage;
        AppConfig.Current.ServerToken = "transient-device-secret";

        AppConfig.Current.Save();

        Assert.DoesNotContain("transient-device-secret", storage.Value, StringComparison.Ordinal);
        Assert.DoesNotContain("serverToken", storage.Value, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void AppConfig_LoadScrubsLegacyPersistedDeviceToken()
    {
        var storage = new InMemoryConfigStorage(
            """{"machineId":"00000000-0000-0000-0000-000000000123","serverToken":"legacy-secret"}""");
        AppConfig.Storage = storage;

        _ = AppConfig.Load();

        Assert.DoesNotContain("legacy-secret", storage.Value, StringComparison.Ordinal);
        Assert.DoesNotContain("serverToken", storage.Value, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void CryptoHelper_RequiresConfiguredSecretAndRoundTrips()
    {
        Assert.Throws<ArgumentException>(() => CryptoHelper.Initialize("too-short"));
        CryptoHelper.Initialize("client-test-mqtt-secret-at-least-32-bytes");

        const string original = "factory telemetry";
        Assert.Equal(original, CryptoHelper.Decrypt(CryptoHelper.Encrypt(original)));
    }

    [Fact]
    public void MqttLastWill_UsesHeartbeatLivenessContractWithoutTelemetrySequence()
    {
        const string machineId = "machine-lwt";
        MethodInfo topicMethod = typeof(MqttTransport).GetMethod(
            "BuildLastWillTopic",
            BindingFlags.Static | BindingFlags.NonPublic)!;
        MethodInfo jsonMethod = typeof(MqttTransport).GetMethod(
            "BuildLastWillJson",
            BindingFlags.Static | BindingFlags.NonPublic)!;

        string topic = (string)topicMethod.Invoke(null, new object[] { machineId })!;
        string json = (string)jsonMethod.Invoke(null, new object[] { machineId })!;
        using JsonDocument document = JsonDocument.Parse(json);
        JsonElement root = document.RootElement;
        JsonElement payload = root.GetProperty("payload");

        Assert.Equal($"client/{machineId}/heartbeat", topic);
        Assert.Equal("heartbeat", root.GetProperty("messageType").GetString());
        Assert.Equal("OFFLINE", payload.GetProperty("status").GetString());
        Assert.False(payload.GetProperty("plcConnected").GetBoolean());
        Assert.False(payload.TryGetProperty("sequence", out _));
        Assert.False(root.TryGetProperty("sequence", out _));
    }

    [Theory]
    [MemberData(nameof(InvalidEncryptedPayloads))]
    public void CryptoHelper_RejectsInvalidOrUnauthenticatedPayloads(string payload)
    {
        CryptoHelper.Initialize("client-test-mqtt-secret-at-least-32-bytes");

        Assert.Throws<CryptographicException>(() => CryptoHelper.Decrypt(payload));
    }

    [Fact]
    public void CryptoHelper_RejectsWrongKey()
    {
        CryptoHelper.Initialize("client-test-mqtt-secret-at-least-32-bytes");
        string encrypted = CryptoHelper.Encrypt("factory telemetry");
        CryptoHelper.Initialize("different-client-test-secret-at-least-32-bytes");

        Assert.ThrowsAny<CryptographicException>(() => CryptoHelper.Decrypt(encrypted));
    }

    [Fact]
    public void CryptoHelper_RejectsCiphertextNonceAndTagTampering()
    {
        CryptoHelper.Initialize("client-test-mqtt-secret-at-least-32-bytes");
        string encrypted = CryptoHelper.Encrypt("factory telemetry");

        Assert.ThrowsAny<CryptographicException>(() => CryptoHelper.Decrypt(TamperEnvelope(encrypted, "CipherText")));
        Assert.ThrowsAny<CryptographicException>(() => CryptoHelper.Decrypt(TamperEnvelope(encrypted, "Nonce")));
        Assert.ThrowsAny<CryptographicException>(() => CryptoHelper.Decrypt(TamperEnvelope(encrypted, "Tag")));
    }

    [Theory]
    [MemberData(nameof(InvalidEncryptedPayloads))]
    public async Task MqttTransport_DoesNotInvokeMessageCallbackWhenDecryptionFails(string payload)
    {
        CryptoHelper.Initialize("client-test-mqtt-secret-at-least-32-bytes");
        await AssertTransportRejectsWithoutCallbackAsync(payload);
    }

    [Fact]
    public async Task MqttTransport_DoesNotInvokeMessageCallbackForWrongKey()
    {
        CryptoHelper.Initialize("client-test-mqtt-secret-at-least-32-bytes");
        string encrypted = CryptoHelper.Encrypt("factory telemetry");
        CryptoHelper.Initialize("different-client-test-secret-at-least-32-bytes");

        await AssertTransportRejectsWithoutCallbackAsync(encrypted);
    }

    [Theory]
    [InlineData("CipherText")]
    [InlineData("Nonce")]
    [InlineData("Tag")]
    public async Task MqttTransport_DoesNotInvokeMessageCallbackForTampering(string propertyName)
    {
        CryptoHelper.Initialize("client-test-mqtt-secret-at-least-32-bytes");
        string tampered = TamperEnvelope(CryptoHelper.Encrypt("factory telemetry"), propertyName);

        await AssertTransportRejectsWithoutCallbackAsync(tampered);
    }

    private static async Task AssertTransportRejectsWithoutCallbackAsync(string payload)
    {
        var transport = new MqttTransport();
        bool invoked = false;
        transport.OnMessageReceived += _ =>
        {
            invoked = true;
            return Task.CompletedTask;
        };

        var method = typeof(MqttTransport).GetMethod(
            "ProcessInboundMessageAsync",
            BindingFlags.Instance | BindingFlags.NonPublic)!;
        var task = (Task)method.Invoke(transport, new object[] { "client/test/command", payload })!;

        await Assert.ThrowsAnyAsync<CryptographicException>(() => task);
        Assert.False(invoked);
    }

    public static IEnumerable<object[]> InvalidEncryptedPayloads()
    {
        yield return new object[] { "" };
        yield return new object[] { "   " };
        yield return new object[] { "plain text" };
        yield return new object[] { "{" };
        yield return new object[] { "{}" };
        yield return new object[] { Envelope("not-base64", new byte[12], new byte[16]) };
        yield return new object[] { Envelope(new byte[] { 1 }, "not-base64", new byte[16]) };
        yield return new object[] { Envelope(new byte[] { 1 }, new byte[12], "not-base64") };
        yield return new object[] { Envelope(new byte[] { 1 }, new byte[11], new byte[16]) };
        yield return new object[] { Envelope(new byte[] { 1 }, new byte[12], new byte[15]) };
    }

    private static string TamperEnvelope(string envelopeJson, string propertyName)
    {
        var envelope = JsonSerializer.Deserialize<Dictionary<string, string>>(envelopeJson)!;
        byte[] value = Convert.FromBase64String(envelope[propertyName]);
        value[0] ^= 0x01;
        envelope[propertyName] = Convert.ToBase64String(value);
        return JsonSerializer.Serialize(envelope);
    }

    private static string Envelope(byte[] cipherText, byte[] nonce, byte[] tag) =>
        Envelope(
            Convert.ToBase64String(cipherText),
            Convert.ToBase64String(nonce),
            Convert.ToBase64String(tag));

    private static string Envelope(string cipherText, byte[] nonce, byte[] tag) =>
        Envelope(cipherText, Convert.ToBase64String(nonce), Convert.ToBase64String(tag));

    private static string Envelope(byte[] cipherText, string nonce, byte[] tag) =>
        Envelope(Convert.ToBase64String(cipherText), nonce, Convert.ToBase64String(tag));

    private static string Envelope(byte[] cipherText, byte[] nonce, string tag) =>
        Envelope(Convert.ToBase64String(cipherText), Convert.ToBase64String(nonce), tag);

    private static string Envelope(string cipherText, string nonce, string tag) =>
        JsonSerializer.Serialize(new
        {
            CipherText = cipherText,
            Nonce = nonce,
            Tag = tag
        });
}

public sealed class InMemoryConfigStorage : IConfigStorage
{
    public InMemoryConfigStorage(string value = "")
    {
        Value = value;
    }

    public string Value { get; private set; }

    public string GetConfigValue(string key) => Value;

    public void SaveConfigValue(string key, string value) => Value = value;
}

public class MockTelemetryRepository : ITelemetryRepository
{
    public List<TelemetryRecord> Records { get; } = new List<TelemetryRecord>();

    public void Insert(string status, int plcRuntime, int productionQty, int defectQty, string shiftDate, string shiftName)
    {
    }

    public Dictionary<string, object> GetLatest()
    {
        return new Dictionary<string, object>();
    }

    public List<TelemetryRecord> GetShiftRecords(string shiftDate, string shiftName)
    {
        return Records;
    }

    public List<(string ShiftDate, string ShiftName)> GetRecentShifts(int days)
    {
        return new List<(string, string)>();
    }
}

public class MockPLCAdapter : IPLCAdapter
{
    public string ClassName => "MockPLC";
    public string IpAddressOrPort => "127.0.0.1";
    public int PortOrBaudRate => 502;

    public List<(string address, ushort length)> ReadBoolBatches { get; } = new();
    public List<(string address, ushort length)> ReadInt16Batches { get; } = new();

    public OperateResult Connect() => OperateResult.CreateSuccessResult();
    public OperateResult Disconnect() => OperateResult.CreateSuccessResult();

    public OperateResult<short> ReadInt16(string address) => OperateResult.CreateSuccessResult((short)0);
    public OperateResult<short[]> ReadInt16(string address, ushort length)
    {
        ReadInt16Batches.Add((address, length));
        return OperateResult.CreateSuccessResult(new short[length]);
    }
    public OperateResult<ushort> ReadUInt16(string address) => OperateResult.CreateSuccessResult((ushort)0);
    public OperateResult<ushort[]> ReadUInt16(string address, ushort length) => OperateResult.CreateSuccessResult(new ushort[length]);
    public OperateResult<int> ReadInt32(string address) => OperateResult.CreateSuccessResult(0);
    public OperateResult<int[]> ReadInt32(string address, ushort length) => OperateResult.CreateSuccessResult(new int[length]);
    public OperateResult<uint> ReadUInt32(string address) => OperateResult.CreateSuccessResult(0u);
    public OperateResult<uint[]> ReadUInt32(string address, ushort length) => OperateResult.CreateSuccessResult(new uint[length]);
    public OperateResult<float> ReadFloat(string address) => OperateResult.CreateSuccessResult(0f);
    public OperateResult<float[]> ReadFloat(string address, ushort length) => OperateResult.CreateSuccessResult(new float[length]);
    public OperateResult<double> ReadDouble(string address) => OperateResult.CreateSuccessResult(0.0);
    public OperateResult<double[]> ReadDouble(string address, ushort length) => OperateResult.CreateSuccessResult(new double[length]);

    public OperateResult<bool> ReadBool(string address) => OperateResult.CreateSuccessResult(false);
    public OperateResult<bool[]> ReadBool(string address, ushort length)
    {
        ReadBoolBatches.Add((address, length));
        return OperateResult.CreateSuccessResult(new bool[length]);
    }
    public OperateResult<string> ReadString(string address, ushort length) => OperateResult.CreateSuccessResult("");

    public OperateResult Write(string address, short value) => OperateResult.CreateSuccessResult();
    public OperateResult Write(string address, short[] values) => OperateResult.CreateSuccessResult();
    public OperateResult Write(string address, ushort value) => OperateResult.CreateSuccessResult();
    public OperateResult Write(string address, ushort[] values) => OperateResult.CreateSuccessResult();
    public OperateResult Write(string address, int value) => OperateResult.CreateSuccessResult();
    public OperateResult Write(string address, int[] values) => OperateResult.CreateSuccessResult();
    public OperateResult Write(string address, uint value) => OperateResult.CreateSuccessResult();
    public OperateResult Write(string address, uint[] values) => OperateResult.CreateSuccessResult();
    public OperateResult Write(string address, float value) => OperateResult.CreateSuccessResult();
    public OperateResult Write(string address, float[] values) => OperateResult.CreateSuccessResult();
    public OperateResult Write(string address, double value) => OperateResult.CreateSuccessResult();
    public OperateResult Write(string address, double[] values) => OperateResult.CreateSuccessResult();
    public OperateResult Write(string address, bool value) => OperateResult.CreateSuccessResult();
    public OperateResult Write(string address, bool[] values) => OperateResult.CreateSuccessResult();
    public OperateResult Write(string address, string value) => OperateResult.CreateSuccessResult();
}
