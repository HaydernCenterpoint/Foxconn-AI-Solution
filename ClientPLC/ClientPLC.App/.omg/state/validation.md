# Validation & Constraints — ClientPLC

This file documents the validation commands, test targets, and engineering constraints required for developing, building, and running the ClientPLC application.

---

## 1. Validation Commands

### 1.1 Compilation Check
To verify that code changes compile without errors or warnings:
```powershell
dotnet build D:\nhnhnhnhnh\ClientPLC\ClientPLC.sln
```
*Goal: Build succeeded. 0 Warning(s) 0 Error(s)*

### 1.2 Unit Test Execution
To run unit and integration tests:
```powershell
dotnet test D:\nhnhnhnhnh\ClientPLC\ClientPLC.sln
```

---

## 2. Technical Constraints & Guardrails

### 2.1 WPF Threading (SynchronizationContext)
- **Constraint**: WPF controls can only be accessed or modified from the main UI thread.
- **Rule**: Do not block the UI thread with synchronous waits on asynchronous operations. Avoid using `.GetAwaiter().GetResult()`, `.Result`, or `.Wait()`. Use `await` and mark caller chains as `async`.
- **UI Dispatching**: If background threads update UI-bound collections, wrap updates in `Application.Current.Dispatcher.Invoke(...)` or use thread-safe bindings.

### 2.2 PLC Driver Usage (HslCommunication)
- **Constraint**: The project uses `HslCommunication` library to communicate with various PLC brands (Mitsubishi, Siemens, Omron, etc.).
- **Rule**: Retain driver adapters and licensing boundaries. Do not bypass adapter patterns or introduce raw sockets that compete with `IPLCAdapter` instances.

### 2.3 SQLite Thread Safety
- **Constraint**: Multiple background polling tasks write to the local SQLite database while views query historical records.
- **Rule**: Ensure database operations use distinct connections per query/command or enforce thread-safe connection locks to prevent "database is locked" errors.

### 2.4 Cryptography & Plaintext
- **Constraint**: Telemetry messages published to the MQTT broker must be encrypted.
- **Rule**: Under no circumstances should failed encryption fall back to transmitting plain text telemetry. If encryption fails, throw exceptions or handle the state by queuing offline messages.
