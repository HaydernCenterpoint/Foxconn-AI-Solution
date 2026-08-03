# Integration W8 â€” local no-fixture evidence

- Status: **passed**
- Generated: 2026-08-03T05:09:11.5556522+00:00
- Commit: 0b7ec0878711ac346503142bb0ebce9fdb04a6b7
- Environment: disposable local Docker + local .NET/Playwright
- Run: ff7370fddd
- Operations DB: 127.0.0.1:55454/fii_w8 (ephemeral container fii-w8-db-ff7370fddd)
- Timescale project/port: fii-w8-ff7370fddd / 127.0.0.1:55455
- CEP project/port: fii-w8-ff7370fddd-cep / 127.0.0.1:58097
- Backend/frontend/MQTT: 5277 / 3112 / 18895
- Machine/client correlation: d9a4e7c3-f3c3-4263-90e7-191e9328f9a7 / d9a4e7c3-f3c3-4263-90e7-191e9328f9a7

## Exact verification commands

1. Start-FullDemo.ps1 -BackendPort 5277 -FrontendPort 3112 -MqttPort 18895 -TimescalePort 55455 -TimescaleProjectName fii-w8-ff7370fddd -CepStagingPort 58097 -SkipOpenDataFusion -SkipFusionAdapter -SkipOdysseus; see [C:\Users\V1904123\Desktop\Workspace\nhnhnhnhnh\.runtime-logs\w8-ff7370fddd-start.log](/C:/Users/V1904123/Desktop/Workspace/nhnhnhnhnh/.runtime-logs/w8-ff7370fddd-start.log).
2. Test-FullDemo.ps1 -TriggerPhase2Alerts -BackendPort 5277 -FrontendPort 3112 -MqttPort 18895 -CepStagingPort 58097 -SkipOpenDataFusion -SkipOdysseus; see [C:\Users\V1904123\Desktop\Workspace\nhnhnhnhnh\.runtime-logs\w8-ff7370fddd-test.log](/C:/Users/V1904123/Desktop/Workspace/nhnhnhnhnh/.runtime-logs/w8-ff7370fddd-test.log).
3. npm --prefix frontend run e2e:live with FII_LIVE_E2E=1, real local cookie login, machine ID, and alert title; see [C:\Users\V1904123\Desktop\Workspace\nhnhnhnhnh\.runtime-logs\w8-ff7370fddd-browser.log](/C:/Users/V1904123/Desktop/Workspace/nhnhnhnhnh/.runtime-logs/w8-ff7370fddd-browser.log).

## Acceptance boundary

- Correlation is a disposable synthetic PLC/MQTT message carried through backend live telemetry, PostgreSQL raw/outbox, Timescale, CEP, durable alert/health, and authenticated browser UI.
- No `page.route` or API fixtures are used by the live browser test.
- Production remains **NO-GO pending W10 managed staging, security ingress/pentest, backup/restore, and rollback evidence**.
