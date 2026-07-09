# MKZ Factory Monitor UI

React 19 + TypeScript frontend for the MKZ Factory AI Platform.

## Stack

- **React 19** (concurrent features, new JSX transform)
- **TypeScript** (strict mode)
- **Vite** (dev server + build)
- **Tailwind CSS** (utility-first styling)
- **Recharts** (charts: production, OEE, cycle time)
- **TanStack Query** (data fetching, caching, polling)
- **Zustand** (global UI state)
- **React Router 6** (client-side routing)
- **Storybook 8** (component development)

## Pages

| Route | Description |
|-------|-------------|
| `/` | Dashboard — KPIs, live machine status, alarms, production chart |
| `/assets` | Asset Browser — hierarchical tree, detail panel with live telemetry |
| `/alarms` | Alarms — filterable table with severity/status, acknowledge action |
| `/reports` | Reports — production analytics, OEE breakdown, CSV export |
| `/settings` | Settings — dark mode, API config |

## Getting Started

```bash
cd frontend
npm install
npm run dev       # http://localhost:5173
npm run storybook # http://localhost:6006
npm run build     # production build
```

## Mock Data

The UI ships with a complete mock API layer (`src/lib/api.ts`) so it works
without the .NET backend. Mock data includes:
- 2 production lines (LS18, LS19)
- 7 machines across both lines
- Live telemetry snapshots with realistic metrics
- 5 sample alarms (varying severity)
- 7-day production history

Once Agent C's Asset API and Agent A's Telemetry API are ready, replace the mock
imports in `src/lib/api.ts` with real `fetch()` calls to the ASP.NET Core endpoints.

## API Contracts

Data types are defined in `src/lib/contracts.ts`:
- `Asset` — UUID-based hierarchy (plant → line → machine → sensor)
- `TelemetryPoint` — `(time, asset_id, metric, value)`
- `Event/Alarm` — `(event_id, timestamp, asset_id, type, severity, payload)`
- `DashboardSummary`, `ProductionReport`

## Backend Integration Points

| Feature | Backend Endpoint | Status |
|---------|-----------------|--------|
| Dashboard summary | `GET /api/dashboard/summary` | Mock |
| Live telemetry | `GET /api/telemetry/live` | Mock |
| Production report | `GET /api/reports/query` | Mock |
| Active alarms | `GET /api/alarms?status=ACTIVE` | Mock |
| Asset tree | `GET /api/production-lines` | Mock |
| Acknowledge alarm | `PATCH /api/alarms/{id}/acknowledge` | Planned |

## Testing

```bash
npm run build        # TypeScript check + Vite build
npm run storybook    # Component development
```

## Project Structure

```
frontend/
├── src/
│   ├── lib/
│   │   ├── api.ts          # Mock API layer (swap for real fetch later)
│   │   ├── contracts.ts    # Shared TypeScript interfaces
│   │   ├── mock-data.ts    # Realistic factory mock data
│   │   ├── store.ts        # Zustand global state
│   │   └── utils.ts        # cn(), formatters, color helpers
│   ├── components/
│   │   ├── ui/             # shadcn-style primitives (Button, Card, Badge…)
│   │   ├── layout/         # Sidebar, Header, AppLayout
│   │   ├── charts/         # ProductionChart, OeeChart
│   │   └── dashboard/      # KpiCard, MachineStatusCard, AlarmListItem…
│   └── pages/              # Route-level components
├── .storybook/
├── package.json
├── tailwind.config.js
├── vite.config.ts
└── tsconfig.json
```
