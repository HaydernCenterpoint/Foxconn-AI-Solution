# Foxconn AI Solution
> [Tiếng Việt](README.md) · [English](README.en.md) · [简体中文](README.zh-CN.md)

> **发布状态：** **生产环境 NO-GO；仅为预发布环境候选版本。** 所有发布声明和决策均以[当前 Go/No-Go 决策](docs/release-evidence/2026-07-31-go-nogo-status.md)为准；本地构建或测试结果不能取代该决策。

## 概述

Foxconn AI Solution 是一个面向设备、生产线、遥测数据和告警的本地部署工业监控平台。系统通过 PLC/MQTT 接收遥测数据，将运营数据存储在 PostgreSQL 中，并提供实时 Operations UI。

## 核心能力

- 通过 ClientPLC 应用和 MQTT 从 PLC 采集数据。
- 在统一的 Operations UI 中监控设备状态、产量、遥测数据和告警。
- 使用 ASP.NET Core 和 PostgreSQL 存储并提供运营数据。
- 通过事务性 outbox 将可靠的遥测数据副本同步到 Open Data Fusion，并与 MQTT 热路径隔离。
- 独立部署和运维 Operations、Fusion Adapter 和 Open Data Fusion 组件。

## 架构

PLC 与 Operations 的数据流构成本地运行边界；Open Data Fusion 仅通过 outbox 和 adapter 接收数据，因此 ODF 故障不得阻塞遥测数据接收。

```mermaid
flowchart LR
    PLC[PLC / 设备] --> Client[ClientPLC]
    Client --> MQTT[MQTT Server]
    MQTT --> API[ASP.NET Core Backend]
    API <--> UI[React Operations UI]
    API --> DB[(PostgreSQL)]
    API --> Outbox[Fusion Outbox]
    Outbox --> Adapter[Fusion Adapter]
    Adapter --> ODF[Open Data Fusion]
```

## 组件

| 路径 | 角色 |
| --- | --- |
| `frontend/` | 使用 React + Vite 构建的 Operations UI。 |
| `backend/` | ASP.NET Core 后端、MQTT 和 PostgreSQL。 |
| `ClientPLC/` | 用于连接和监控 PLC 设备的 WPF 客户端。 |
| `Odysseus/` | AI 助手以及只读的工厂 REST/RAG 桥接层。 |
| `fusion-contracts/` | 用于 Fusion 事件的版本化共享契约。 |
| `fusion-adapter/` | 将事件分发到 ODF 的 outbox 调度器。 |
| `third_party/open-data-fusion/` | 为 Open Data Fusion 固定版本的上游 Git submodule。 |

## 快速开始

运行前提：.NET 9 SDK、Node.js、可访问且已通过 backend 的 connection string 配置的 PostgreSQL；如果使用 ODF preview，则还需要 Docker Desktop。ClientPLC 在 Windows 上运行，并且需要 .NET 9 Windows Desktop SDK。

在 Windows 上，先运行一次 `Odysseus/launch-windows.ps1` 创建 virtual environment，然后可用以下命令启动并验证完整 demo stack：

```powershell
.\infrastructure\demo\Start-FullDemo.ps1
.\infrastructure\demo\Test-FullDemo.ps1
```

Launcher 默认使用 Operations UI `3001`、backend `5166`、Odysseus `7000`、ODF web `58088` 和 ODF API `54310`；如端口不同，请传入对应的 port 参数。添加 `-WithClientPlc` 可同时启动 WPF 客户端。服务日志写入 `.runtime-logs/`。

按安全顺序端到端启动：

1. 获取源代码并初始化 submodule：

```powershell
git clone https://github.com/HaydernCenterpoint/Foxconn-AI-Solution.git
cd Foxconn-AI-Solution
git submodule update --init --recursive
```

2. Backend 同时托管 MQTT server。请在启动 backend 前启用本地 outbox 捕获：

```powershell
$env:OpenDataFusion__CaptureEnabled = 'true'
dotnet run --project backend/backend.csproj
```

让后端继续在终端 A 中运行；在终端 B 中执行 ODF 预览命令。

3. 如果使用 ODF preview，请通过以下安全脚本启动并验证 `application-preview`：

> [!WARNING]
> `application-preview` 使用 SQLite，仅用于本地/开发环境的 mapping 预览；不得将此 profile 用于生产环境。这些脚本不会创建 `third_party/open-data-fusion/.env`，并且 smoke test 仅接受 loopback URL。

~~~powershell
.\infrastructure\open-data-fusion\Start-OpenDataFusionPreview.ps1
.\infrastructure\open-data-fusion\Test-OpenDataFusionPreview.ps1
~~~

如果启动脚本提示默认的 preview PostgreSQL 端口 `55432` 已被占用，请选择空闲端口后重新运行这两个命令：

~~~powershell
.\infrastructure\open-data-fusion\Start-OpenDataFusionPreview.ps1 -PostgresPort 55433
.\infrastructure\open-data-fusion\Test-OpenDataFusionPreview.ps1
~~~

4. 保持 `OpenDataFusion__DispatchEnabled` 禁用，直到 ODF 已具备 tenant、project 和 identity。随后，按照 [Open Data Fusion 指南](infrastructure/open-data-fusion/README.md) 配置，启用 dispatch 并在单独终端运行 Fusion Adapter；不要将机密信息写入文档或源代码：

```powershell
$env:OpenDataFusion__DispatchEnabled = 'true'
dotnet run --project fusion-adapter/Fusion.Adapter.csproj
```

5. 上述组件准备就绪后，根据环境的 PLC 配置启动 ClientPLC，并在单独终端运行 Operations UI：

**启动 ClientPLC：**

```powershell
dotnet run --project ClientPLC/ClientPLC.App/ClientPLC.App.csproj
```

**启动 Operations UI：**

```powershell
npm --prefix frontend install
npm --prefix frontend run dev
```

## Open Data Fusion 集成

两个开关独立管理，用于控制同步流程：

- `OpenDataFusion__CaptureEnabled`：控制 backend 中本地事务性 outbox 的捕获。启用后，合格的遥测数据会与 outbox intent 一同记录；backend 不会从 MQTT 热路径直接调用 ODF。
- `OpenDataFusion__DispatchEnabled`：控制通过 Fusion Adapter 向 ODF 交付数据。启用后，Fusion Adapter 会将待处理的 outbox 事件交付到 ODF。仅在 ODF 已针对相应环境就绪后才启用。

参阅 [Open Data Fusion 指南](infrastructure/open-data-fusion/README.md) 以激活、选择生产拓扑并安全回滚。

## 项目结构

与平台直接相关的主要目录如下：

```text
.
├── backend/                         # ASP.NET Core Operations API
├── backend.Tests/                   # 后端测试
├── ClientPLC/                       # PLC 的 WPF 应用程序
├── frontend/                        # React + Vite Operations UI
├── fusion-contracts/                # 共享契约
├── fusion-adapter/                  # 向 ODF 分发 outbox 的工作程序
├── fusion-adapter.Tests/            # Fusion Adapter 测试
├── infrastructure/open-data-fusion/ # ODF 配置与指南
├── docs/superpowers/specs/          # 集成设计
└── third_party/open-data-fusion/    # 已固定版本的上游 Git submodule
```

## 测试与构建

请在 repository 根目录运行：

```powershell
dotnet test backend.Tests/backend.Tests.csproj
dotnet test fusion-adapter.Tests/Fusion.Adapter.Tests.csproj
npm --prefix frontend run test:run
npm --prefix frontend run type-check
npm --prefix frontend run build
```

## 相关文档

- [Open Data Fusion 运维](infrastructure/open-data-fusion/README.md)
- [Open Data Fusion 集成设计](docs/superpowers/specs/2026-07-13-open-data-fusion-integration-design.md)

## 安全与运维说明

请勿将机密信息或生产环境凭据提交到 repository。对于生产 ODF，请通过部署环境的机密管理器管理凭据和配置，并将敏感配置置于受跟踪源代码之外。
