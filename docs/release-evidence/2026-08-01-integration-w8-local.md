# Integration W8 â€” local no-fixture evidence

- Status: **passed**
- Generated: 2026-08-13T02:38:46.2443906+00:00
- Commit: 30579e7f2de7876126a1a7e561358444a945d5de
- Environment: disposable local Docker + local .NET/Playwright
- Run: e96ed58f47
- Operations DB: 127.0.0.1:56434/fii_w8 (ephemeral container fii-w8-db-e96ed58f47)
- Timescale project/port: fii-w8-e96ed58f47 / 127.0.0.1:55435
- CEP project/port: fii-w8-e96ed58f47-cep / 127.0.0.1:58086
- Backend/frontend/MQTT: 5266 / 3101 / 18884
- Machine/client correlation: e5f78c6c-23f1-4acc-91f9-dc5b9e045500 / e5f78c6c-23f1-4acc-91f9-dc5b9e045500

## Exact verification commands

1. Start-FullDemo.ps1 -BackendPort 5266 -FrontendPort 3101 -MqttPort 18884 -TimescalePort 55435 -TimescaleProjectName fii-w8-e96ed58f47 -CepStagingPort 58086 -SkipOpenDataFusion -SkipFusionAdapter -SkipOdysseus -SkipFrontendBuild; see [C:\Users\Haydern\Desktop\Workspace\FII AI\.runtime-logs\w8-e96ed58f47-start.log](/C:/Users/Haydern/Desktop/Workspace/FII AI/.runtime-logs/w8-e96ed58f47-start.log).
2. Test-FullDemo.ps1 -TriggerPhase2Alerts -BackendPort 5266 -FrontendPort 3101 -MqttPort 18884 -CepStagingPort 58086 -SkipOpenDataFusion -SkipOdysseus; see [C:\Users\Haydern\Desktop\Workspace\FII AI\.runtime-logs\w8-e96ed58f47-test.log](/C:/Users/Haydern/Desktop/Workspace/FII AI/.runtime-logs/w8-e96ed58f47-test.log).
3. npm --prefix frontend run e2e:live with FII_LIVE_E2E=1, real local cookie login, machine ID, and alert title; see [C:\Users\Haydern\Desktop\Workspace\FII AI\.runtime-logs\w8-e96ed58f47-browser.log](/C:/Users/Haydern/Desktop/Workspace/FII AI/.runtime-logs/w8-e96ed58f47-browser.log).

## Acceptance boundary

- Correlation is a disposable synthetic PLC/MQTT message carried through backend live telemetry, PostgreSQL raw/outbox, Timescale, CEP, durable alert/health, and authenticated browser UI.
- No `page.route` or API fixtures are used by the live browser test.
- Production remains **NO-GO pending W10 managed staging, security ingress/pentest, backup/restore, and rollback evidence**.

