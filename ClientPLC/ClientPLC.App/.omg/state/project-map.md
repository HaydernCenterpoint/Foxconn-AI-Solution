# Project Map — ClientPLC

A comprehensive visual and semantic map of modules, boundaries, and dependencies inside the ClientPLC solution.

---

## 1. Directory Structure & Architecture Layers

```
D:\nhnhnhnhnh\ClientPLC\
 ├── ClientPLC.Core/          (Domain models, shared configuration, Interfaces)
 ├── ClientPLC.Infrastructure/(SQLite database, MQTT net transport, PLC communication)
 ├── ClientPLC.ViewModels/    (MVVM ViewModels, Commands)
 ├── ClientPLC.App/           (WPF Views, Custom controls, DI composition root)
 └── ClientPLC.Tests/         (xUnit unit tests)
```

### Reference Architecture Flow:
```
[PLC physical device] --(TCP/IP HslCommunication)--> [IPLCAdapter]
                                                           │
                                                           ▼
                                                [PlcAddressReader]
                                                           │
                                                           ▼
                                                [PLCPollingService]
                                                           │
             ┌─────────────────────────────────────────────┴─────────────────────────────────────────────┐
             ▼                                             ▼                                             ▼
[MachineStateResolver]                             [AlarmEdgeDetector]                                 [LocalDbService]
 (RUNNING/STOPPED/OFFLINE)                          (SQLite error history)                              (Telemetry persistence)
             │                                             │                                             │
             └─────────────────────────────────────────────┼─────────────────────────────────────────────┘
                                                           ▼
                                                 [MqttClientService]
                                                           │
                                                           ▼
                                                    [MqttTransport]
                                                           │
                                                       (MQTT broker)
```

---

## 2. Modules & Responsibilities

### 2.1 ClientPLC.Core
- **Models**: Defines raw DTO structures, telemetry packets, alarm schemas, shift records.
- **Config**: Stores application settings (`AppSettings.cs`) including PLC brand selection, registers, network IP/Port, and shift rules.
- **Resources**: Holds localization keys for multi-language display (Vietnamese, English, Chinese).

### 2.2 ClientPLC.Infrastructure
- **PLC**: Implementation of communication adapters (e.g. Mitsubishi McNet via `HslCommunication`) and background poller (`PLCPollingService`). Handles batch reading and failover queries.
- **Network**: Manages MQTT connectivity (`MqttTransport`), message builder (`TelemetryPayloadBuilder`), and encryption helper (`CryptoHelper`).
- **Database**: Performs SQLite reading/writing (`LocalDbService`) for error logging and local telemetry backups during disconnection.
- **Service**: Implements system metrics collections (CPU/RAM telemetry) and shift changes tracker.

### 2.3 ClientPLC.ViewModels
- Implements base MVVM constructs (`ViewModelBase`, `RelayCommand`).
- Defines data-binding sources for dashboards (e.g. `DashboardViewModel` supplying production count, OEE metrics, UPH to UI).

### 2.4 ClientPLC.App
- Contains all UI views:
  - **Guest**: `DashboardView` (real-time KPIs), `LiveErrorsView` (alarms grid), `OeeDashboardPage`, `UnitHistoryPage`.
  - **Engineer**: `PLCDataConfigWindow` (register setup), `PlcConnectionTestPage`, `PlcIpPortConfigPage`.
  - **Admin**: `SettingsView` (tab control for general settings), `LanguageSettingsPage`.
- **Composition Root**: `Program.cs` wires up all singletons/transients via `Microsoft.Extensions.DependencyInjection`.

---

## 3. Dependency Hotspots & Tight Coupling
- **MqttClientService (The God Class)**: Acts as the primary orchestrator connecting Infrastructure to ViewModels. Tight coupling here makes unit testing difficult without extensive mocking.
- **Dual Singletons**: ViewModels and views bypass the DI container by accessing static `.Instance` properties of service classes (e.g., `MqttClientService.Instance`), preventing proper class decoupling.
