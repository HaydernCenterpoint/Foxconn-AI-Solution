# 🏭 ClientPLC — Kế hoạch tổng thể

> Dự án: WPF industrial monitoring (.NET 9, WPF, MQTT, SQLite, HslCommunication)
> Build: **✅ 0 warning, 0 error** (đã fix 96 warnings)

---

## Mục lục

1. [Hiện trạng dự án](#1-hiện-trạng-dự-án)
2. [Kiến trúc tổng quan](#2-kiến-trúc-tổng-quan)
3. [Giai đoạn 0 — Đã hoàn thành](#3-giai-đoạn-0--đã-hoàn-thành)
4. [Giai đoạn 1 — Critical (Ngay lập tức)](#4-giai-đoạn-1--critical-ngay-lập-tức)
5. [Giai đoạn 2 — High priority (Ngắn hạn)](#5-giai-đoạn-2--high-priority-ngắn-hạn)
6. [Giai đoạn 3 — Medium priority (Trung hạn)](#6-giai-đoạn-3--medium-priority-trung-hạn)
7. [Phụ lục: Chi tiết warning đã fix](#7-phụ-lục-chi-tiết-warning-đã-fix)

---

## 1. Hiện trạng dự án

### Thông số kỹ thuật

| Hạng mục | Giá trị |
|---|---|
| .NET version | .NET 9.0 (windows) |
| UI framework | WPF |
| Số projects | 5 (Core, Infrastructure, ViewModels, App, Tests) |
| Tổng số file nguồn | ~80 |
| Số views/pages | 28+ chia 3 role (Admin/Engineer/Guest) |
| Database | SQLite (6 tables) |
| Network protocol | MQTT (MQTTnet 5.1) |
| PLC protocol | HslCommunication 7.0.1 (27+ brands) |
| DI container | Microsoft.Extensions.DependencyInjection 10.0.9 |
| Ngôn ngữ UI | Tiếng Việt, English, 中文 (resx) |

### NuGet packages theo project

| Project | Packages |
|---|---|
| **Core** | HslCommunication 7.0.1 |
| **Infrastructure** | Microsoft.Data.Sqlite 10.0.8, MQTTnet 5.1.0, HslCommunication 7.0.1, Serilog 4.3.1 + Sinks.File 7.0.0, System.IO.Ports 10.0.8 |
| **App** | ExcelDataReader 3.8.0 + DataSet, Microsoft.Extensions.DependencyInjection 10.0.9 |
| **Tests** | xunit 2.9.2, coverlet.collector 6.0.2, Microsoft.NET.Test.Sdk 17.12.0 |

---

## 2. Kiến trúc tổng quan

```
PLC (physical device)
   │
   │ [HslCommunication TCP]
   ▼
IPLCAdapter ◄── PLCGeneric (27+ brands, reflection)
   │
   ▼
PlcAddressReader (batch reads / individual fallback)
   │
   ▼
PLCPollingService (polling loop × ReadIntervalMs)
   │
   ├──► OnPlcDataRead event → MqttClientService → UI (ObservableCollection)
   │                        → UnitTrackingService (quality tracking)
   │                        → DashboardViewModel (KPI)
   │
   ├──► MachineStateResolver (RUNNING/STOPPED/ERROR/OFFLINE)
   ├──► AlarmEdgeDetector (error_history DB)
   ├──► LocalDbService.InsertTelemetry (SQLite)
   │
   ▼
MqttClientService.TelemetryLoopAsync (every 1s)
   │
   ├── TelemetryPayloadBuilder (JSON)
   ├── CryptoHelper.Encrypt (AES-256-GCM)
   └── MqttTransport.SendMessageAsync (MQTT → server)

Server → Client:
MQTT Broker → MqttTransport → ServerMessageHandler (commands: reloadConfig, getStatus, syncTime, ...)
```

### Sơ đồ layers

```
ClientPLC.App    (WPF, DI composition root, 28+ views)
    ↑                    ↑
    │                    │
ClientPLC.ViewModels    ClientPLC.Infrastructure
(ViewModelBase,          (Sqlite, MQTT, PLC, Serilog)
 RelayCommand,
 DashboardViewModel)
    ↑                    ↑
    │                    │
    └──────┬─────────────┘
           │
    ClientPLC.Core
    (Interfaces, Models, DTOs, Config, Resources)
           ↑
    ClientPLC.Tests (xUnit, 7 tests)
```

### Data flow chi tiết

```
┌─────────────────────────────────────────────────────────────┐
│                   MqttClientService                          │
│  ┌─────────────────────┐   ┌──────────────────────────┐     │
│  │  IServerTransport   │   │    IPLCPollingService     │     │
│  │  (MqttTransport)    │   │    (PLCPollingService)    │     │
│  │                     │   │                          │     │
│  │  Connect/Reconnect  │   │  PlcConnectionManager    │     │
│  │  Exponential backoff│   │  (rate-limited 10s)      │     │
│  │  MQTT publish/sub   │   │                          │     │
│  │  Encryption/Decrypt │   │  PlcAddressReader        │     │
│  └─────────────────────┘   │  (batch + individual)    │     │
│                            │                          │     │
│  ┌──────────────────────┐  │  MachineStateResolver    │     │
│  │   TelemetryLoopAsync │  │  (status + accumulation) │     │
│  │   ─ delta detection  │  │                          │     │
│  │   ─ full/heartbeat   │  │  AlarmEdgeDetector       │     │
│  │   ─ offline queue    │  │  (edge detection + DB)   │     │
│  │   ─ sync on connect  │  └──────────────────────────┘     │
│  │   ─ OEE calculation  │                                   │
│  └──────────────────────┘                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Giai đoạn 0 — Đã hoàn thành ✅

### 3.1 Fix CS0414 — Field unused (1 warning)

| File | Dòng | Hành động |
|---|---|---|
| `ClientPLC.App/Views/Guest/ProductionMonitorPage.xaml.cs` | 19 | Xoá `private bool _isProducing;` |

### 3.2 Fix CS1998 — Async method thiếu await (2 warnings)

| File | Method | Hành động |
|---|---|---|
| `ClientPLC.Infrastructure/Network/MqttClientService.cs` | `ReadPlcAsync()` (dòng 500) | Xoá `async`, bọc kết quả bằng `Task.FromResult()` |
| `ClientPLC.Infrastructure/Network/MqttClientService.cs` | `WritePlcAsync()` (dòng 601) | Xoá `async`, bọc kết quả bằng `Task.FromResult()` |

### 3.3 Fix CS0618 — Migrate TcpClientService → MqttClientService (93 warnings)

#### Phân tích kiến trúc

```
Before:
  TcpClientService : MqttClientService     (cùng file MqttClientService.cs)
    └── TcpClientService.Instance() → tạo instance RIÊNG, bypass DI
    └── TcpClientService.OnLogReceived   → delegate về MqttClientService
    └── TcpClientService.OnPlcDataRead   → delegate về MqttClientService
  
  DI container:
    services.AddSingleton<TcpClientService>();
    services.AddSingleton<MqttClientService>(sp => sp.GetRequiredService<TcpClientService>());

After:
  MqttClientService.Instance() → ưu tiên lấy từ DI, fallback nếu không có
  
  DI container:
    services.AddSingleton<MqttClientService>();
```

#### Files đã sửa (14 files)

| # | File | Thay đổi |
|---:|---|---|
| 1 | `ClientPLC.App/Program.cs` | DI: xoá `AddSingleton<TcpClientService>`, sửa factory registration, sửa `GetRequiredService<TcpClientService>` → `MqttClientService` |
| 2 | `ClientPLC.App/MainWindow.xaml.cs` | `TcpClientService.Instance` → `MqttClientService.Instance` (3 chỗ) |
| 3 | `ClientPLC.App/MainWindow.Roles.cs` | `TcpClientService.Instance` → `MqttClientService.Instance` (1 chỗ) |
| 4 | `ClientPLC.App/MainWindow.Timers.cs` | `TcpClientService.Instance` → `MqttClientService.Instance` (1 chỗ) |
| 5 | `ClientPLC.App/Views/Guest/StatusDetailPage.xaml.cs` | Instance refs (5 chỗ) |
| 6 | `ClientPLC.App/Views/Guest/LiveErrorsView.xaml.cs` | Instance refs (2 chỗ) |
| 7 | `ClientPLC.App/Views/Guest/ProductionMonitorPage.xaml.cs` | Instance refs (1 chỗ) |
| 8 | `ClientPLC.App/Views/Engineer/PLCDataConfigWindow.xaml.cs` | Instance refs (11 chỗ) |
| 9 | `ClientPLC.App/Views/Engineer/PlcAddressConfigPage.xaml.cs` | Instance refs (6 chỗ) |
| 10 | `ClientPLC.App/Views/Engineer/PlcGenericView.xaml.cs` | Instance refs (3 chỗ) |
| 11 | `ClientPLC.App/Views/Engineer/PlcIpPortConfigPage.xaml.cs` | Instance refs (3 chỗ) |
| 12 | `ClientPLC.App/Views/Engineer/PlcReadCycleConfigPage.xaml.cs` | Instance refs (1 chỗ) |
| 13 | `ClientPLC.App/Views/Admin/SettingsView.xaml.cs` | Instance refs (5 chỗ) |
| 14 | `ClientPLC.App/Views/Admin/ServerSettingsPage.xaml.cs` | Instance refs (3 chỗ) |

#### Xoá class cũ

| File | Dòng | Hành động |
|---|---|---|
| `ClientPLC.Infrastructure/Network/MqttClientService.cs` | 680-710 | Xoá toàn bộ class `TcpClientService` (kể cả `[Obsolete]` attribute) |

---

## 4. Giai đoạn 1 — Critical (Ngay lập tức)

> ⚠️ Các vấn đề có thể gây mất dữ liệu hoặc crash production

### 4.1 Bare `catch {}` nuốt exception

**Vấn đề:** Exception bị nuốt hoàn toàn, không log, không rethrow → lỗi âm thầm mất dữ liệu telemetry.

| File | Dòng | Hiện tại | Sửa thành |
|---|---|---|---|
| `MqttClientService.cs` | 266-268 | `catch {}` | `catch (Exception ex) { Log.Error(ex, "Telemetry loop error") }` |
| `TelemetryPayloadBuilder.cs` | 83 | `catch {}` | `catch (Exception ex) { Log.Warning(ex, "Shift summary fallback") }` |
| `CryptoHelper.cs` | (tìm) | `catch { return plaintext }` | `catch (Exception ex) { Log.Error(ex, "Encrypt failed"); throw; }` |
| `SystemInfoService.cs` | `GetLocalIpAddress()` | `catch {}` | `catch (Exception ex) { Log.Warning(ex, "Get IP failed") }` |

```csharp
// Before:
catch { }

// After:
catch (Exception ex)
{
    Log.Error(ex, "[MqttClientService] Telemetry loop error");
}
```

**Effort:** ~4 edits, 4 files — **15 phút**

### 4.2 Fix `GetAwaiter().GetResult()` — Deadlock risk

**Vấn đề:** `MqttTransport.DisconnectClient()` dùng `.GetAwaiter().GetResult()` → gây deadlock nếu gọi từ UI thread (WPF synchronization context).

```csharp
// File: MqttTransport.cs
// Before:
public void DisconnectClient()
{
    _client?.DisconnectAsync().GetAwaiter().GetResult();
}

// After:
public async Task DisconnectClientAsync()
{
    if (_client != null)
        await _client.DisconnectAsync();
}
```

**Cập nhật caller chain:** Các nơi gọi `DisconnectClient()` cần được `await`.

**Effort:** 1 method + ~3 callers — **30 phút**

### 4.3 Fix race condition `_lastConnectAttempt`

**Vấn đề:** `_lastConnectAttempt` được ghi ngoài `lock` (dòng 94), đọc trong `lock` (dòng 41) → potential torn read.

```csharp
// File: PlcConnectionManager.cs line 94
// Before:
if (!_isReconnecting)
{
    _isReconnecting = true;
    _lastConnectAttempt = DateTime.UtcNow;  // ⚠️ ghi ngoài lock
    Task.Run(() => EnsureConnected(...));
}

// After:
lock (_lock)
{
    if (!_isReconnecting)
    {
        _isReconnecting = true;
        _lastConnectAttempt = DateTime.UtcNow;
        Task.Run(() => EnsureConnected(...));
    }
}
```

**Effort:** 1 edit — **10 phút**

### 4.4 Xoá fallback plaintext khi encrypt lỗi

**Vấn đề:** `CryptoHelper.Encrypt` fallback về plaintext → gửi dữ liệu nhạy cảm dạng rõ.

```csharp
// File: CryptoHelper.cs
// Before:
try { ... encrypt ... }
catch { return plainText; }  // ⛔ security risk

// After:
try { ... encrypt ... }
catch (Exception ex)
{
    Log.Error(ex, "Encryption failed for message");
    throw;  // hoặc return null để caller xử lý
}
```

**Effort:** 1 edit — **10 phút**

---

## 5. Giai đoạn 2 — High priority (Ngắn hạn)

### 5.1 Thêm unit tests cho critical modules

**Hiện tại:** 7 tests, coverage ở mức báo động.

**Target:** 30-40 tests cho các module:

| Module | Số test tối thiểu | Nội dung |
|---|---|---|
| `PlcConnectionManager` | 5 | Connect thành công, thất bại, backoff, disconnect, reconnect |
| `AlarmEdgeDetector` | 5 | Edge detection, quality fault, error history write |
| `MqttTransport` | 4 | Send, reconnect, encrypt/decrypt, offline queue |
| `CryptoHelper` | 3 | Round-trip, invalid input, key mismatch |
| `MachineStateResolver` | 3 | (mở rộng) Edge cases: overflow, reset |
| `ShiftService` | 3 | (mở rộng) Boundary, DST, holiday |
| `PlcAddressReader` | 3 | (mở rộng) Batch gap tolerance, individual fallback |
| `UnitTrackingService` | 4 | Unit lifecycle, serial number sequencing |
| `TelemetryPayloadBuilder` | 2 | JSON schema, delta detection |

```csharp
// Ví dụ test pattern
[Fact]
public void EnsureConnected_WhenNotConfigured_ReturnsNotConfigured()
{
    var mgr = new PlcConnectionManager();
    var result = mgr.EnsureConnected();
    
    Assert.Equal(PlcConnectionState.NotConfigured, mgr.ConnectionState);
}
```

**Effort:** ~6-8 giờ cho 30-40 tests

### 5.2 Consolidate singleton pattern

**Vấn đề:** Codebase có dual singleton pattern — vừa dùng DI vừa dùng static `Instance` property. ViewModel và View dùng `MqttClientService.Instance` bypass DI → khó mock, khó test.

**Bước 1:** Inject `MqttClientService` qua constructor thay vì static Instance ở ViewModel:

| File | Pattern hiện tại | Pattern mới |
|---|---|---|
| `DashboardViewModel.cs` | `MqttClientService.Instance.LatestPlcData` | Constructor injection `IMqttClientService` |

**Bước 2:** Tạo interface `IMqttClientService` nếu cần, hoặc inject concrete class (do DI đã singleton).

**Bước 3:** Register ViewModel trong DI và resolve qua DI:

```csharp
// Program.cs
services.AddTransient<DashboardViewModel>(sp =>
    new DashboardViewModel(sp.GetRequiredService<MqttClientService>(), ...));
```

**Effort:** ~4 giờ cho toàn bộ chain

### 5.3 Replace `Debug.WriteLine` bằng Serilog

**Vấn đề:** ~40 chỗ dùng `System.Diagnostics.Debug.WriteLine()` — chỉ log ở debug build, production không thấy.

```bash
# Tìm tất cả
grep -rn "Debug.WriteLine" ClientPLC/ --include="*.cs" | wc -l
# → ~40 occurrences
```

```csharp
// Before:
Debug.WriteLine("[PlcConnectionManager] Connecting to " + ip);

// After:
Log.Debug("[PlcConnectionManager] Connecting to {PlcIp}:{PlcPort}", ip, port);
```

**Effort:** ~1 giờ (bulk replace + review từng chỗ)

### 5.4 Sửa `IsConnected` — NoResponse ≠ Connected

**Vấn đề:** `PLCPollingService.IsConnected` trả về `true` khi state là `NoResponse`.

```csharp
// File: PLCPollingService.cs
// Before:
public bool IsPlcConnected => 
    _connectionState == PlcConnectionState.Connected || 
    _connectionState == PlcConnectionState.NoResponse;  // ⚠️ optimistic

// After:
public bool IsPlcConnected => 
    _connectionState == PlcConnectionState.Connected;
```

⚠️ **Check impact:** Các nơi gọi `IsPlcConnected` có thể cần behavior khác. Cần verify UI không bị sai lệch.

**Effort:** 1 edit + verify — **30 phút**

### 5.5 Wrap fire-and-forget tasks bằng try-catch

```csharp
// File: MqttClientService.cs / PlcConnectionManager.cs
// Before:
_ = Task.Run(() => ProcessSyncAsync());

// After:
_ = Task.Run(async () =>
{
    try { await ProcessSyncAsync(); }
    catch (Exception ex) { Log.Error(ex, "Sync failed"); }
});
```

**Effort:** ~5 edits — **20 phút**

### 5.6 Replace hardcoded passwords

**Vấn đề:** `RoleManager.cs` hardcode Engineer=`666666`, Admin=`888888`.

**Solution:** Đưa vào `app_config` SQLite table hoặc encrypted config file.

```csharp
// File: RoleManager.cs
// Before:
if (role == Role.Engineer && password == "666666") ...

// After:
private static string GetPassword(Role role) =>
    AppConfig.Storage.GetValue($"password_{role}") 
    ?? throw new InvalidOperationException($"Password not configured for {role}");
```

**Effort:** 1 edit — **30 phút**

---

## 6. Giai đoạn 3 — Medium priority (Trung hạn)

### 6.1 Tách `MqttClientService` (God Object)

**Vấn đề:** `MqttClientService` ~677 dòng, ~30 public members, gánh cả transport + PLC + telemetry + sync + health.

**Giải pháp:** Tách thành:

```
MqttClientService (orchestrator, nhẹ)
  ├── ServerTransport (MqttTransport)      ← đã có
  ├── PlcPollingService                     ← đã có
  ├── TelemetryService (mới)
  │     ├── TelemetryPayloadBuilder
  │     ├── Delta detection
  │     ├── Offline queue management
  │     └── Sync on reconnect
  ├── ConnectionHealthService (mới)
  │     ├── Health status computation
  │     └── Event-based state change
  └── CommandHandler (ServerMessageHandler) ← đã có
```

**Effort:** ~1-2 ngày

### 6.2 Integration tests với SQLite thật

**Hiện tại:** Mock `ITelemetryRepository`. Cần test persistence behavior:

```csharp
[Fact]
public void InsertAndRetrieveTelemetry_ShouldRoundtrip()
{
    // SqliteConnectionFactory tạo in-memory SQLite
    var factory = new SqliteConnectionFactory();
    using var conn = factory.CreateConnection();
    conn.Open();
    
    // Run migration inline
    var repo = new SqliteTelemetryRepository(factory);
    repo.Insert(new TelemetryRecord { ... });
    
    var result = repo.GetLatest(...);
    Assert.NotNull(result);
}
```

**Effort:** ~4 giờ

### 6.3 Add structured logging sinks

**Hiện tại:** Serilog file sink, plain-text template.

**Cải thiện:**
1. JSON formatter → có thể ingest vào Elastic/Seq/Grafana
2. Optional Seq sink (dev) + file sink (production)
3. MinimumLevel overridable via config

```csharp
Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Debug()
    .WriteTo.File(
        logPath,
        rollingInterval: RollingInterval.Day,
        formatter: new JsonFormatter())      // ← JSON format
    .WriteTo.Conditional(
        evt => IsDevelopment(),
        wt => wt.Seq("http://localhost:5341"))
    .CreateLogger();
```

**Effort:** ~1 giờ

### 6.4 Add circuit breaker cho PLC reads

Dùng `Polly` để wrap PLC read operations:

```csharp
var circuitBreaker = Policy
    .Handle<TimeoutException>()
    .CircuitBreakerAsync(
        exceptionsAllowedBeforeBreaking: 3,
        durationOfBreak: TimeSpan.FromSeconds(30));

var result = await circuitBreaker.ExecuteAsync(() => plc.ReadBool(address));
```

**Effort:** ~2 giờ

### 6.5 Migration navigation pattern

**Hiện tại:** String-based `ContentControl.Content` swapping trong MainWindow code-behind.

**Cải thiện:** Sử dụng DI-resolved views + typed navigation:

```csharp
// Thay vì:
private void ShowView(string viewName) { ContentArea.Content = _viewCache[viewName]; }

// Chuyển sang:
private readonly Dictionary<Type, object> _views;
public void ShowView<T>() where T : FrameworkElement
{
    ContentArea.Content = _views[typeof(T)] ??= _serviceProvider.GetRequiredService<T>();
}
```

Hoặc dùng CommunityToolkit.Mvvm + NavigationService pattern.

**Effort:** ~4 giờ

---

## 7. Phụ lục: Chi tiết warning đã fix

### 7.1 Tổng hợp

| Warning code | Mô tả | Số lượng | Đã fix |
|---|---|---|---|
| CS0618 | `TcpClientService` is obsolete | 93 | ✅ |
| CS1998 | Async method lacks await | 2 | ✅ |
| CS0414 | Field assigned but never used | 1 | ✅ |
| **Tổng** | | **96** | **✅ 0 warning** |

### 7.2 CS1998 — Chi tiết 2 method

#### `ReadPlcAsync` (line 500)

```csharp
// Before:
public async Task<(bool success, object value, string error)> ReadPlcAsync(
    string address, string dataType, ushort length)
{
    var plc = _plcPolling.PlcInstance;
    // ... tất cả plc.Read* đều synchronous (ReadBool, ReadInt16, ...) ...
    // => async keyword không cần thiết
}

// After:
public Task<(bool success, object value, string error)> ReadPlcAsync(
    string address, string dataType, ushort length)
{
    // ... code giữ nguyên ...
    return Task.FromResult(...);  // bọc kết quả
}
```

#### `WritePlcAsync` (line 601)

```csharp
// Before:
public async Task<(bool success, string error)> WritePlcAsync(
    string address, string dataType, JsonElement jsonValue)
{
    var plc = _plcPolling.PlcInstance;
    // ... tất cả plc.Write đều synchronous ...
}

// After:
public Task<(bool success, string error)> WritePlcAsync(
    string address, string dataType, JsonElement jsonValue)
{
    // ... code giữ nguyên ...
    return Task.FromResult(...);
}
```

### 7.3 CS0618 — Danh sách files đầy đủ

| File | Project | Số refs đã sửa |
|---|---|---|
| `Program.cs` | App | 4 |
| `MainWindow.xaml.cs` | App | 3 |
| `MainWindow.Roles.cs` | App | 1 |
| `MainWindow.Timers.cs` | App | 2 |
| `StatusDetailPage.xaml.cs` | App (Guest) | 5 |
| `LiveErrorsView.xaml.cs` | App (Guest) | 2 |
| `ProductionMonitorPage.xaml.cs` | App (Guest) | 1 |
| `PLCDataConfigWindow.xaml.cs` | App (Engineer) | 11 |
| `PlcAddressConfigPage.xaml.cs` | App (Engineer) | 6 |
| `PlcGenericView.xaml.cs` | App (Engineer) | 3 |
| `PlcIpPortConfigPage.xaml.cs` | App (Engineer) | 3 |
| `PlcReadCycleConfigPage.xaml.cs` | App (Engineer) | 1 |
| `SettingsView.xaml.cs` | App (Admin) | 5 |
| `ServerSettingsPage.xaml.cs` | App (Admin) | 3 |
| **Tổng** | | **~50 refs** |

### 7.4 Kiểm tra sau fix

```bash
cd D:\nhnhnhnhnh\ClientPLC\ClientPLC.App
dotnet build
# Result: Build succeeded. 0 Warning(s) 0 Error(s)
```

---

## Bảng tổng hợp effort

| Giai đoạn | Hạng mục | Effort | Rủi ro |
|---|---|---|---|
| ✅ GĐ 0 — Build warnings | Fix 96 warnings | ~10 phút | Thấp (đã build xong) |
| 🚨 GĐ 1 — Critical | 4 items | ~1 giờ | **Cao — mất dữ liệu** |
| ⚡ GĐ 2 — High | 6 items | ~12 giờ | Trung bình |
| 📈 GĐ 3 — Medium | 5 items | ~3 ngày | Thấp |
| **Tổng** | **15 items** | **~4 ngày** | |
