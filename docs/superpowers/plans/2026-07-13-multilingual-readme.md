# Multilingual Root README Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a clear, accurate, and synchronized Vietnamese, English, and Simplified Chinese README set for the repository root.

**Architecture:** Treat the Vietnamese root README as the GitHub landing page and use it as the canonical content outline. Create two parallel translations with identical section order, relative language navigation, shared Mermaid topology, and unchanged commands/paths. Link out to the existing Open Data Fusion runbook instead of duplicating operational detail.

**Tech Stack:** GitHub-Flavored Markdown, Mermaid, PowerShell, Git.

---

## File structure

| File | Responsibility |
| --- | --- |
| `README.md` | Vietnamese default landing page for GitHub |
| `README.en.md` | English translation with matching technical content |
| `README.zh-CN.md` | Simplified Chinese translation with matching technical content |
| `infrastructure/open-data-fusion/README.md` | Existing detailed ODF setup/runbook linked from all three README files |
| `docs/superpowers/specs/2026-07-13-multilingual-readme-design.md` | Approved scope and acceptance criteria |

### Task 1: Write the Vietnamese GitHub landing page

**Files:**
- Create: `README.md`
- Reference: `infrastructure/open-data-fusion/README.md`
- Reference: `frontend/package.json`
- Reference: `backend/backend.csproj`
- Reference: `fusion-adapter/Fusion.Adapter.csproj`

- [ ] **Step 1: Establish the Vietnamese page structure**

  Write `README.md` in this exact section order:

  ```markdown
  # Foxconn AI Solution
  > [Tiếng Việt](README.md) · [English](README.en.md) · [简体中文](README.zh-CN.md)

  ## Tổng quan
  ## Khả năng chính
  ## Kiến trúc
  ## Thành phần
  ## Khởi chạy nhanh
  ## Tích hợp Open Data Fusion
  ## Cấu trúc dự án
  ## Kiểm thử và xây dựng
  ## Tài liệu liên quan
  ## Lưu ý bảo mật và vận hành
  ```

  Use a one-sentence Vietnamese description that identifies the project as an on-premise industrial monitoring platform for machine, production-line, telemetry, and alarm operations. Keep the visual language minimalist: do not add unverified CI, release, performance, or coverage badges.

- [ ] **Step 2: Add the verified architecture and component inventory**

  Add a Mermaid `flowchart LR` with these nodes and relationships:

  ```mermaid
  flowchart LR
      PLC[PLC / thiết bị] --> Client[ClientPLC]
      Client --> MQTT[MQTT Server]
      MQTT --> API[ASP.NET Core Backend]
      API <--> UI[React Operations UI]
      API --> DB[(PostgreSQL)]
      API --> Outbox[Fusion Outbox]
      Outbox --> Adapter[Fusion Adapter]
      Adapter --> ODF[Open Data Fusion]
  ```

  Follow it with a six-row component table for `frontend/`, `backend/`, `ClientPLC/`, `fusion-contracts/`, `fusion-adapter/`, and `third_party/open-data-fusion/`. State only the responsibilities and technologies verified in the repository.

- [ ] **Step 3: Add reproducible quick-start and ODF guidance**

  Include short, separately labelled command blocks for:

  ```powershell
  git clone https://github.com/HaydernCenterpoint/Foxconn-AI-Solution.git
  cd Foxconn-AI-Solution
  git submodule update --init --recursive
  ```

  ```powershell
  dotnet run --project backend/backend.csproj
  ```

  ```powershell
  npm --prefix frontend install
  npm --prefix frontend run dev
  ```

  Include the ODF mapping-preview command, without inserting development passwords:

  ```powershell
  Copy-Item infrastructure/open-data-fusion/.env.example third_party/open-data-fusion/.env
  Push-Location third_party/open-data-fusion
  docker compose --env-file .env --profile application-preview up -d
  Pop-Location
  ```

  Explain that `OpenDataFusion__CaptureEnabled` controls local outbox capture and `OpenDataFusion__DispatchEnabled` controls delivery, then link to `infrastructure/open-data-fusion/README.md` for activation and rollback.

- [ ] **Step 4: Add project navigation, validation commands, and safety boundaries**

  Include a compact project tree containing the six top-level components, the application test directories, and the ODF infrastructure directory. Add these verified commands:

  ```powershell
  dotnet test backend.Tests/backend.Tests.csproj
  dotnet test fusion-adapter.Tests/Fusion.Adapter.Tests.csproj
  npm --prefix frontend run test:run
  npm --prefix frontend run type-check
  npm --prefix frontend run build
  ```

  End the page with links to the ODF runbook and approved integration design. State that secrets, production ODF credentials, and production deployment configuration must stay outside Git.

- [ ] **Step 5: Commit the Vietnamese landing page**

  Run:

  ```powershell
  git add README.md
  git commit -m "docs: add Vietnamese project README"
  ```

  Expected: one commit containing only `README.md`.

### Task 2: Create synchronized English and Simplified Chinese translations

**Files:**
- Create: `README.en.md`
- Create: `README.zh-CN.md`
- Reference: `README.md`

- [ ] **Step 1: Create the English README**

  Translate every Vietnamese prose heading, paragraph, table heading, and list item into English. Preserve the Mermaid node IDs, directory paths, URLs, command blocks, configuration keys, and product name exactly. Start with:

  ```markdown
  # Foxconn AI Solution
  > [Tiếng Việt](README.md) · [English](README.en.md) · [简体中文](README.zh-CN.md)
  ```

  Use the corresponding English section names: `Overview`, `Core capabilities`, `Architecture`, `Components`, `Quick start`, `Open Data Fusion integration`, `Project structure`, `Test and build`, `Related documentation`, and `Security and operations notes`.

- [ ] **Step 2: Create the Simplified Chinese README**

  Translate the same content into Simplified Chinese while leaving command blocks, file paths, URLs, setting names, and product names unchanged. Use the corresponding Chinese section names: `概述`, `核心能力`, `架构`, `组件`, `快速开始`, `Open Data Fusion 集成`, `项目结构`, `测试与构建`, `相关文档`, and `安全与运维说明`.

- [ ] **Step 3: Verify translation parity before cross-link validation**

  Run this PowerShell check from the repository root:

  ```powershell
  $files = @('README.md', 'README.en.md', 'README.zh-CN.md')
  $markers = @(
    'README.md',
    'README.en.md',
    'README.zh-CN.md',
    '```mermaid',
    'git submodule update --init --recursive',
    'OpenDataFusion__CaptureEnabled',
    'OpenDataFusion__DispatchEnabled',
    'infrastructure/open-data-fusion/README.md'
  )
  foreach ($file in $files) {
    $content = Get-Content -Raw -Encoding UTF8 $file
    foreach ($marker in $markers) {
      if ($content -notlike "*$marker*") {
        throw "$file is missing: $marker"
      }
    }
  }
  ```

  Expected: the command exits without an exception.

- [ ] **Step 4: Commit both translations**

  Run:

  ```powershell
  git add README.en.md README.zh-CN.md
  git commit -m "docs: add English and Chinese READMEs"
  ```

  Expected: one commit containing only the two translation files.

### Task 3: Validate Markdown, links, and scope

**Files:**
- Modify: `README.md`
- Modify: `README.en.md`
- Modify: `README.zh-CN.md`

- [ ] **Step 1: Validate all linked local files**

  Run:

  ```powershell
  $targets = @(
    'README.md',
    'README.en.md',
    'README.zh-CN.md',
    'infrastructure/open-data-fusion/README.md',
    'docs/superpowers/specs/2026-07-13-open-data-fusion-integration-design.md'
  )
  foreach ($target in $targets) {
    if (-not (Test-Path $target)) {
      throw "Missing README target: $target"
    }
  }
  ```

  Expected: the command exits without an exception.

- [ ] **Step 2: Check formatting and sensitive-content boundaries**

  Run:

  ```powershell
  git diff --check
  $files = @('README.md', 'README.en.md', 'README.zh-CN.md')
  $forbidden = @('Password=', 'ClientSecret=', 'gho_')
  foreach ($file in $files) {
    $content = Get-Content -Raw -Encoding UTF8 $file
    foreach ($token in $forbidden) {
      if ($content.Contains($token)) {
        throw "$file contains a forbidden secret-like token: $token"
      }
    }
  }
  ```

  Expected: no whitespace errors and no exception.

- [ ] **Step 3: Inspect the rendered structure in source form**

  Verify each file has one H1, the language switch directly beneath it, one Mermaid block, matching command blocks, and exactly one relative link to the ODF runbook. Correct wording or Markdown hierarchy if any file differs.

- [ ] **Step 4: Commit only verification fixes, if any**

  Run:

  ```powershell
  git status --short
  ```

  Expected: a clean worktree. If validation required a documentation correction, stage only the corrected README files and commit with `docs: validate multilingual README`.
