# CEP staging

This compose target runs the existing CEP service alone on `localhost:58085`.
The backend publishes an event only after `machine_telemetry` commits; failed
or slow CEP requests are logged and never roll back operational telemetry.

Start the full integration environment with:

```powershell
.\infrastructure\demo\Start-FullDemo.ps1
.\infrastructure\demo\Test-FullDemo.ps1
```

The smoke test sends MQTT telemetry, then verifies that CEP contains the
resulting `backend_telemetry` event for the smoke machine. The process is
intentionally staging-only: its in-memory event store is not an operational
event system of record.
