---
tags: [system]
updated: 2026-08-13
---

# ClientPLC

## Role
WPF desktop. Read PLC, local buffer, publish MQTT telemetry.

## Repo path
`ClientPLC/`

## Depends on
- Device token via env `FII_MQTT_DEVICE_TOKEN` (not JSON config)
- MQTT broker in [[60 Systems/Operations Backend]]

## Must not
- Write secrets into local config files
- Block if ODF is down

## Related
- [[70 Conventions/Secrets]]
- [[10 Project/Architecture Map]]
