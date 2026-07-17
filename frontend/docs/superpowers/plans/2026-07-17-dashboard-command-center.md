# Dashboard Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign only the shared dashboard page as a responsive dark industrial command center while preserving its data, localization, filtering, navigation, and role behavior.

**Architecture:** Keep `ModernDashboardPage` and `createDashboardViewModel` unchanged. Refine `ModernDashboard` as the single presentational boundary, move its existing alarm panel into the operational rail, and replace page-local CSS with a cyan-accented control-room system. Add regression coverage for interaction and accessible loading/error semantics before changing the layout.

**Tech Stack:** React 19, TypeScript 6, React Router, react-i18next, Recharts, Lucide React, plain scoped CSS, Vitest, Testing Library

---

## File map

- Modify `src/features/dashboard/components/ModernDashboard.test.tsx`: lock search, alarm filtering, loading, and error behavior.
- Modify `src/features/dashboard/components/ModernDashboard.tsx`: add accessible state markup, loading skeletons, semantic KPI tones, and the command-center panel order.
- Modify `src/features/dashboard/components/modern-dashboard.css`: implement the dark industrial palette, dense desktop grid, responsive fallbacks, focus states, skeletons, and reduced-motion handling.
- Do not modify `ModernDashboardPage.tsx`, `dashboardViewModel.ts`, APIs, routes, application shell, or translation catalogs unless a test proves an existing contract is missing.

### Task 1: Lock dashboard behavior and state semantics

**Files:**
- Modify: `src/features/dashboard/components/ModernDashboard.test.tsx`
- Modify: `src/features/dashboard/components/ModernDashboard.tsx`

- [ ] **Step 1: Extend the fixture and add interaction/state regression tests**

Update the Vitest imports and add `userEvent`:

```tsx
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
```

Add a resolved alarm to `viewModel.pendingOrders` after the existing active alarm:

```tsx
{
  id: '1003',
  machineId: 'machine-1',
  machineName: 'Press A',
  severity: 'LOW',
  message: 'Inspection completed',
  status: 'RESOLVED',
  createdAt: '2026-07-14T09:30:00Z',
},
```

Reset the shared i18n instance before every test:

```tsx
beforeEach(async () => {
  await testI18n.changeLanguage('vi');
});
```

Append these tests inside `describe('ModernDashboard', ...)`:

```tsx
it('preserves dashboard search and active-alarm filtering', async () => {
  const user = userEvent.setup();

  render(
    <I18nextProvider i18n={testI18n}>
      <MemoryRouter>
        <ModernDashboard viewModel={viewModel} username="Lan" basePath="/admin" />
      </MemoryRouter>
    </I18nextProvider>,
  );

  expect(screen.getByText('Inspection completed')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: vi.dashboardPage.modern.filter }));
  expect(screen.queryByText('Inspection completed')).not.toBeInTheDocument();
  expect(screen.getByText('Temperature exceeded limit')).toBeInTheDocument();

  await user.type(
    screen.getByRole('textbox', { name: vi.dashboardPage.modern.searchAria }),
    'Welder B',
  );
  expect(screen.getByText('Welder B')).toBeInTheDocument();
  expect(screen.queryByText('Assembly')).not.toBeInTheDocument();
});

it('announces loading and error states with distinct semantics', () => {
  const { container, rerender } = render(
    <I18nextProvider i18n={testI18n}>
      <MemoryRouter>
        <ModernDashboard
          viewModel={viewModel}
          username="Lan"
          basePath="/admin"
          isLoading
        />
      </MemoryRouter>
    </I18nextProvider>,
  );

  expect(container.firstElementChild).toHaveAttribute('aria-busy', 'true');
  expect(screen.getByRole('status')).toHaveTextContent(vi.dashboardPage.modern.loading);
  expect(container.querySelector('.modern-dashboard__skeleton')).toBeInTheDocument();

  rerender(
    <I18nextProvider i18n={testI18n}>
      <MemoryRouter>
        <ModernDashboard
          viewModel={viewModel}
          username="Lan"
          basePath="/admin"
          isError
        />
      </MemoryRouter>
    </I18nextProvider>,
  );

  expect(container.firstElementChild).not.toHaveAttribute('aria-busy');
  expect(screen.getByRole('alert')).toHaveTextContent(vi.dashboardPage.modern.loadError);
  expect(container.querySelector('.modern-dashboard__skeleton')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the targeted test and verify the new state test fails**

Run:

```bash
npm run test:run -- src/features/dashboard/components/ModernDashboard.test.tsx
```

Expected: FAIL because the dashboard root lacks `aria-busy`, the error notice still has `role="status"`, and no skeleton exists.

- [ ] **Step 3: Add the minimal loading skeleton and accessible state roles**

Add this helper after `PanelEmpty` in `ModernDashboard.tsx`:

```tsx
function DashboardSkeleton() {
  return (
    <div className="modern-dashboard__skeleton" aria-hidden="true">
      <div className="modern-dashboard__skeleton-kpis">
        {[0, 1, 2].map((item) => <span key={item} />)}
      </div>
      <div className="modern-dashboard__skeleton-layout">
        <span className="is-wide" />
        <span />
        <span className="is-wide" />
        <span />
      </div>
    </div>
  );
}
```

Change the dashboard root and notice markup:

```tsx
<div className="modern-dashboard" aria-busy={isLoading || undefined}>
```

```tsx
{(isLoading || isError) && (
  <div
    className={`modern-dashboard__notice ${isError ? 'is-error' : ''}`}
    role={isError ? 'alert' : 'status'}
  >
    {isError ? t('dashboardPage.modern.loadError') : t('dashboardPage.modern.loading')}
  </div>
)}

{isLoading ? <DashboardSkeleton /> : (
  <div className="modern-dashboard__loaded">
```

Insert that conditional opening immediately before the current `.modern-dashboard__kpi-grid`. Insert this closing immediately after the current `.modern-dashboard__layout`:

```tsx
  </div>
)}
```

This wraps the current KPI grid and layout once. Do not hide cached content when `isError` is true.

- [ ] **Step 4: Run the targeted test and verify all four tests pass**

Run:

```bash
npm run test:run -- src/features/dashboard/components/ModernDashboard.test.tsx
```

Expected: 1 test file passed, 4 tests passed.

- [ ] **Step 5: Commit the behavior lock and state semantics**

```bash
git add src/features/dashboard/components/ModernDashboard.test.tsx src/features/dashboard/components/ModernDashboard.tsx
git commit -m "test(frontend): lock dashboard interaction states"
```

### Task 2: Implement the command-center composition

**Files:**
- Modify: `src/features/dashboard/components/ModernDashboard.tsx`
- Modify: `src/features/dashboard/components/modern-dashboard.css`
- Test: `src/features/dashboard/components/ModernDashboard.test.tsx`

- [ ] **Step 1: Replace decorative KPI colors with semantic tones**

Replace `KpiMeta` and `KPI_META` with:

```tsx
interface KpiMeta {
  icon: LucideIcon;
}

const KPI_META: Record<DashboardKpiCard['id'], KpiMeta> = {
  'total-production': { icon: Wrench },
  'production-efficiency': { icon: Gauge },
  'active-alarms': { icon: CircleAlert },
};
```

Replace the KPI article opening tag with a derived tone:

```tsx
const tone = kpi.id === 'active-alarms' && kpi.value > 0 ? 'critical' : 'primary';

return (
  <article className={`modern-dashboard__kpi modern-dashboard__kpi--${tone}`} key={kpi.id}>
```

Replace the defect chart colors with CSS variables:

```tsx
const defectsData = [
  {
    name: t('dashboardPage.modern.goodTotal'),
    value: viewModel.defects.nonDefectiveTotal,
    color: 'var(--md-accent-muted)',
  },
  {
    name: t('dashboardPage.modern.defectEstimate'),
    value: viewModel.defects.total,
    color: 'var(--md-danger)',
  },
];
```

- [ ] **Step 2: Recolor the existing Recharts elements without changing their data**

Use these values in both Cartesian charts:

```tsx
<CartesianGrid vertical={false} stroke="var(--md-grid)" strokeDasharray="3 3" />
<XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--md-muted)', fontSize: 10 }} />
<YAxis axisLine={false} tickLine={false} width={40} tick={{ fill: 'var(--md-muted)', fontSize: 10 }} />
<Tooltip
  cursor={{ fill: 'var(--md-hover)' }}
  contentStyle={{
    background: 'var(--md-surface-raised)',
    border: '1px solid var(--md-border-strong)',
    borderRadius: 6,
  }}
/>
```

Use `var(--md-bar-track)` for the threshold bar, `var(--md-bar)` for ordinary production bars, and `var(--md-accent)` for the hourly peak. Change the trend gradient and area stroke from red to `var(--md-accent)`.

- [ ] **Step 3: Move recent alarms into the operational rail**

Remove the existing recent-alert `Panel` from `.modern-dashboard__primary-grid`. Keep its internal button, table, filter, links, and empty state unchanged.

Render this block as the first child of `.modern-dashboard__rail`, before line status:

```tsx
<Panel
  title={t('dashboardPage.modern.recentAlerts')}
  className="modern-dashboard__alarms-panel"
  action={(
    <button
      type="button"
      className={onlyActiveAlerts ? 'is-active' : ''}
      aria-pressed={onlyActiveAlerts}
      onClick={() => setOnlyActiveAlerts((value) => !value)}
    >
      <SlidersHorizontal aria-hidden="true" size={14} />
      {onlyActiveAlerts ? t('dashboardPage.modern.open') : t('dashboardPage.modern.filter')}
    </button>
  )}
>
  {visibleAlarms.length > 0 ? (
    <div className="modern-dashboard__alarm-table">
      <table>
        <caption className="modern-dashboard__sr-only">
          {t('dashboardPage.modern.recentAlerts')}
        </caption>
        <thead>
          <tr>
            <th scope="col">{t('dashboardPage.modern.machine')}</th>
            <th scope="col">{t('dashboardPage.modern.content')}</th>
            <th scope="col">{t('dashboardPage.modern.time')}</th>
            <th scope="col">{t('dashboardPage.modern.status')}</th>
          </tr>
        </thead>
        <tbody>
          {visibleAlarms.slice(0, 4).map((alarm) => (
            <tr key={alarm.id}>
              <td>
                <Link to={alarmsRoute}>
                  <b>{alarm.machineName}</b>
                  <small>{alarm.severity}</small>
                </Link>
              </td>
              <td>{alarm.message}</td>
              <td>{formatAlarmDate(alarm.createdAt, locale, t('common.notAvailable'))}</td>
              <td>
                <span className={`modern-dashboard__alarm-status modern-dashboard__alarm-status--${alarm.status.toLocaleLowerCase()}`}>
                  {alarm.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : <PanelEmpty>{t('dashboardPage.modern.noMatchingAlerts')}</PanelEmpty>}
</Panel>
```

After the move, `.modern-dashboard__primary-grid` contains production, defect, and trend panels only. The existing line-status panel, top-machine panel, and machine action link remain after this new first rail child without markup changes.

- [ ] **Step 4: Replace the page-local visual system and grid CSS**

Replace the opening token block and core layout selectors in `modern-dashboard.css` with:

```css
.modern-dashboard {
  --md-bg: #071114;
  --md-surface: #0d1b1f;
  --md-surface-raised: #11252a;
  --md-hover: rgb(34 199 201 / 0.07);
  --md-border: #1f4149;
  --md-border-strong: #2b5962;
  --md-grid: #17363d;
  --md-text: #dff7f7;
  --md-muted: #829ca2;
  --md-accent: #22c7c9;
  --md-accent-muted: #245a60;
  --md-bar: #4a7f86;
  --md-bar-track: #173238;
  --md-warning: #dba54d;
  --md-danger: #df6666;
  width: 100%;
  min-width: 0;
  color: var(--md-text);
  font-family: "Be Vietnam Pro", system-ui, sans-serif;
}

.modern-dashboard *,
.modern-dashboard *::before,
.modern-dashboard *::after { box-sizing: border-box; }

.modern-dashboard a { color: inherit; text-decoration: none; }
.modern-dashboard button,
.modern-dashboard input { font: inherit; }
.modern-dashboard :is(a, button, input):focus-visible {
  outline: 2px solid var(--md-accent);
  outline-offset: 3px;
}

.modern-dashboard__intro {
  min-height: 4.75rem;
  display: flex;
  align-items: center;
  gap: 2rem;
  margin-bottom: .85rem;
  padding: .25rem 0 .75rem;
  border-bottom: 1px solid var(--md-border);
}

.modern-dashboard__intro p,
.modern-dashboard__intro h1,
.modern-dashboard__intro span { margin: 0; }
.modern-dashboard__intro p { margin-bottom: .25rem; color: var(--md-muted); font-size: .75rem; }
.modern-dashboard__intro h1 { font-size: clamp(1.45rem, 2vw, 1.9rem); line-height: 1.05; letter-spacing: -.025em; }
.modern-dashboard__intro span { display: block; margin-top: .35rem; color: #a9c2c6; font-size: .8rem; }

.modern-dashboard__search {
  width: min(100%, 31rem);
  min-height: 2.75rem;
  margin-left: auto;
  padding: 0 .9rem;
  display: flex;
  align-items: center;
  gap: .55rem;
  border: 1px solid var(--md-border);
  border-radius: .5rem;
  background: var(--md-surface);
  color: var(--md-muted);
  transition: border-color .18s ease, background .18s ease;
}

.modern-dashboard__search:focus-within { border-color: var(--md-accent); background: var(--md-surface-raised); }
.modern-dashboard__search input { min-width: 0; width: 100%; border: 0; outline: 0; background: transparent; color: var(--md-text); }
.modern-dashboard__search input::placeholder { color: var(--md-muted); }

.modern-dashboard__notice {
  margin-bottom: .85rem;
  padding: .7rem .9rem;
  border: 1px solid #66522c;
  border-radius: .5rem;
  background: #211c12;
  color: #f0ce87;
}

.modern-dashboard__notice.is-error { border-color: #643838; background: #241516; color: #f0a2a2; }

.modern-dashboard__kpi-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: .75rem;
  margin-bottom: .75rem;
}

.modern-dashboard__kpi,
.modern-dashboard__panel { border: 1px solid var(--md-border); background: var(--md-surface); }
.modern-dashboard__kpi { min-height: 5.35rem; position: relative; display: flex; align-items: center; padding: .9rem 1rem; border-radius: .55rem; }
.modern-dashboard__kpi::before { content: ""; position: absolute; inset: 0 auto 0 0; width: 2px; background: var(--md-accent); }
.modern-dashboard__kpi--critical::before { background: var(--md-danger); }
.modern-dashboard__kpi-icon { margin-right: .8rem; display: grid; place-items: center; color: var(--md-accent); }
.modern-dashboard__kpi--critical .modern-dashboard__kpi-icon { color: var(--md-danger); }
.modern-dashboard__kpi h2,
.modern-dashboard__kpi strong { display: block; margin: 0; }
.modern-dashboard__kpi h2 { color: #b7cccf; font-size: .78rem; font-weight: 600; }
.modern-dashboard__kpi strong { margin-top: .28rem; font-size: 1.55rem; line-height: 1; font-variant-numeric: tabular-nums; }
.modern-dashboard__kpi-unit { position: absolute; right: .85rem; bottom: .7rem; color: var(--md-muted); font-size: .65rem; white-space: nowrap; }

.modern-dashboard__layout {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(19rem, .78fr);
  gap: .75rem;
}

.modern-dashboard__primary-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(14rem, .65fr);
  grid-template-areas: "production production" "trend defect";
  gap: .75rem;
}

.modern-dashboard__panel { min-width: 0; overflow: hidden; padding: .9rem; border-radius: .55rem; }
.modern-dashboard__panel-head { min-height: 2rem; display: flex; align-items: center; justify-content: space-between; gap: .75rem; }
.modern-dashboard__panel-head h2 { margin: 0; font-size: .9rem; font-weight: 650; }
.modern-dashboard__panel-head a,
.modern-dashboard__panel-head button {
  min-height: 2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: .35rem;
  border: 1px solid var(--md-border);
  border-radius: .4rem;
  background: var(--md-surface-raised);
  color: var(--md-text);
  padding: 0 .6rem;
  font-size: .72rem;
  cursor: pointer;
}
.modern-dashboard__panel-head button:active,
.modern-dashboard__rail-action:active { transform: translateY(1px); }
.modern-dashboard__panel-head button.is-active { border-color: var(--md-danger); background: #28191a; color: #efaaaa; }
.modern-dashboard__production-panel { grid-area: production; min-height: 20rem; }
.modern-dashboard__trend-panel { grid-area: trend; min-height: 15rem; }
.modern-dashboard__defect-panel { grid-area: defect; min-height: 15rem; }
.modern-dashboard__alarms-panel { min-height: 15.5rem; }

.modern-dashboard__rail { display: grid; align-content: start; gap: .75rem; }
```

Replace the remaining component selectors with these exact semantic styles:

```css
.modern-dashboard__mini-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: .5rem;
  margin: .75rem 0 .55rem;
}
.modern-dashboard__mini-stats > div {
  min-width: 0;
  min-height: 3.65rem;
  display: grid;
  grid-template-columns: 1.75rem 1fr;
  grid-template-rows: 1fr 1fr;
  align-items: center;
  gap: 0 .45rem;
  padding: .5rem;
  border: 1px solid var(--md-border);
  border-radius: .45rem;
  background: linear-gradient(90deg, rgb(34 199 201 / .07), transparent 55%);
}
.modern-dashboard__mini-stats svg { grid-row: span 2; color: var(--md-accent); }
.modern-dashboard__mini-stats span,
.modern-dashboard__mini-stats strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.modern-dashboard__mini-stats span { color: var(--md-muted); font-size: .67rem; }
.modern-dashboard__mini-stats strong { font-size: .78rem; font-variant-numeric: tabular-nums; }
.modern-dashboard__chart { width: 100%; height: 11.5rem; }
.modern-dashboard__trend-panel .modern-dashboard__chart { height: 11.25rem; }
.modern-dashboard__empty { min-height: 8rem; display: grid; place-items: center; margin: 0; padding: 1rem; color: var(--md-muted); font-size: .8rem; text-align: center; }
.modern-dashboard__donut { height: 11.5rem; position: relative; }
.modern-dashboard__donut > div:last-child { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; pointer-events: none; }
.modern-dashboard__donut span,
.modern-dashboard__donut strong,
.modern-dashboard__donut small { display: block; }
.modern-dashboard__donut span { color: var(--md-muted); font-size: .7rem; }
.modern-dashboard__donut strong { margin: .2rem 0; font-size: 1.55rem; font-variant-numeric: tabular-nums; }
.modern-dashboard__donut small { color: var(--md-muted); font-size: .65rem; }

.modern-dashboard__alarm-table { margin-top: .5rem; overflow: auto; }
.modern-dashboard__alarm-table table { width: 100%; min-width: 30rem; border-collapse: collapse; color: #c7dcdf; font-size: .7rem; }
.modern-dashboard__alarm-table th,
.modern-dashboard__alarm-table td { padding: .48rem .45rem; text-align: left; }
.modern-dashboard__alarm-table thead th { border-bottom: 1px solid var(--md-border-strong); color: #dff7f7; font-size: .65rem; font-weight: 700; }
.modern-dashboard__alarm-table tbody td { border-bottom: 1px solid var(--md-border); }
.modern-dashboard__alarm-table tbody tr { transition: background .18s ease; }
.modern-dashboard__alarm-table tbody tr:hover { background: var(--md-hover); }
.modern-dashboard__alarm-table b,
.modern-dashboard__alarm-table small { display: block; }
.modern-dashboard__alarm-table small { margin-top: .12rem; color: var(--md-muted); font-size: .6rem; }
.modern-dashboard__alarm-table td:nth-child(1) { width: 25%; }
.modern-dashboard__alarm-table td:nth-child(2) { width: 36%; }
.modern-dashboard__alarm-table td:nth-child(3) { width: 22%; }
.modern-dashboard__alarm-status,
.modern-dashboard__status { border-radius: 999px; padding: .2rem .38rem; font-size: .6rem; font-weight: 700; white-space: nowrap; }
.modern-dashboard__alarm-status--active,
.modern-dashboard__status--error { background: #2a1719; color: #ed8d8d; }
.modern-dashboard__alarm-status--acknowledged,
.modern-dashboard__status--maintenance { background: #292311; color: #e2bc66; }
.modern-dashboard__alarm-status--resolved,
.modern-dashboard__status--active { background: #102b2c; color: #61d6d7; }
.modern-dashboard__status { font-style: normal; }
.modern-dashboard__status--idle,
.modern-dashboard__status--offline,
.modern-dashboard__status--unknown { background: #17272b; color: #9bb0b5; }

.modern-dashboard__lines-panel { min-height: 17rem; }
.modern-dashboard__products-panel { min-height: 10rem; }
.modern-dashboard__line-list,
.modern-dashboard__product-list { display: grid; gap: .45rem; margin-top: .6rem; }
.modern-dashboard__line-item {
  min-height: 4rem;
  display: grid;
  grid-template-columns: 2.4rem 1fr auto;
  align-items: center;
  gap: .55rem;
  padding: .45rem;
  border: 1px solid var(--md-border);
  border-radius: .45rem;
  transition: border-color .18s ease, background .18s ease;
}
.modern-dashboard__line-item:hover { border-color: var(--md-border-strong); background: var(--md-hover); }
.modern-dashboard__line-icon { height: 2.75rem; display: grid; place-items: center; border-radius: .4rem; background: #12282d; }
.modern-dashboard__line-icon--active { color: var(--md-accent); }
.modern-dashboard__line-icon--error { color: var(--md-danger); }
.modern-dashboard__line-icon--maintenance { color: var(--md-warning); }
.modern-dashboard__line-icon--idle,
.modern-dashboard__line-icon--offline,
.modern-dashboard__line-icon--unknown { color: var(--md-muted); }
.modern-dashboard__line-item b,
.modern-dashboard__line-item small { display: block; }
.modern-dashboard__line-item b { font-size: .76rem; }
.modern-dashboard__line-item small { margin-top: .2rem; color: var(--md-muted); font-size: .64rem; }

.modern-dashboard__product { min-height: 3.4rem; display: flex; align-items: center; gap: .55rem; padding: .45rem; border: 1px solid transparent; border-radius: .45rem; background: #0b171a; transition: border-color .18s ease, background .18s ease, transform .18s ease; }
.modern-dashboard__product:hover { border-color: var(--md-border); background: var(--md-hover); transform: translateY(-1px); }
.modern-dashboard__product > span { width: 2.35rem; height: 2.35rem; display: grid; place-items: center; border-radius: .35rem; color: var(--md-accent); background: #102a2d; }
.modern-dashboard__product b,
.modern-dashboard__product small { display: block; }
.modern-dashboard__product b { font-size: .76rem; }
.modern-dashboard__product small { margin-top: .15rem; color: var(--md-muted); font-size: .64rem; }
.modern-dashboard__rail-action { min-height: 2.75rem; display: flex; align-items: center; justify-content: center; gap: .4rem; border: 1px solid var(--md-border-strong); border-radius: .45rem; background: var(--md-surface-raised); color: #b8d9dc; font-size: .76rem; font-weight: 650; transition: border-color .18s ease, background .18s ease, transform .18s ease; }
.modern-dashboard__rail-action:hover { border-color: var(--md-accent); background: var(--md-hover); }
.modern-dashboard__sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
.modern-dashboard .recharts-cartesian-axis-tick-value { font-size: 10px; }
```

Add the loading skeleton and responsive rules:

```css
.modern-dashboard__skeleton { display: grid; gap: .75rem; }
.modern-dashboard__skeleton-kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .75rem; }
.modern-dashboard__skeleton-layout { display: grid; grid-template-columns: minmax(0, 2fr) minmax(19rem, .78fr); gap: .75rem; }
.modern-dashboard__skeleton span {
  min-height: 5.35rem;
  display: block;
  border: 1px solid var(--md-border);
  border-radius: .55rem;
  background: linear-gradient(90deg, var(--md-surface) 20%, var(--md-surface-raised) 50%, var(--md-surface) 80%);
  background-size: 200% 100%;
  animation: modern-dashboard-skeleton 1.4s ease-in-out infinite;
}
.modern-dashboard__skeleton-layout span { min-height: 14rem; }
.modern-dashboard__skeleton-layout .is-wide { min-height: 20rem; }

@keyframes modern-dashboard-skeleton {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}

@media (max-width: 1199px) {
  .modern-dashboard__layout,
  .modern-dashboard__skeleton-layout { grid-template-columns: 1fr; }
  .modern-dashboard__rail { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .modern-dashboard__alarms-panel,
  .modern-dashboard__rail-action { grid-column: 1 / -1; }
}

@media (max-width: 767px) {
  .modern-dashboard__intro { align-items: flex-start; flex-direction: column; gap: .75rem; }
  .modern-dashboard__search { width: 100%; margin-left: 0; }
  .modern-dashboard__kpi-grid,
  .modern-dashboard__skeleton-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .modern-dashboard__primary-grid { grid-template-columns: 1fr; grid-template-areas: "production" "trend" "defect"; }
  .modern-dashboard__rail { grid-template-columns: 1fr; }
  .modern-dashboard__alarms-panel,
  .modern-dashboard__rail-action { grid-column: auto; }
  .modern-dashboard__mini-stats { overflow-x: auto; grid-template-columns: repeat(3, minmax(8rem, 1fr)); }
  .modern-dashboard__alarm-table { margin-inline: -.25rem; }
}

@media (max-width: 479px) {
  .modern-dashboard__kpi-grid,
  .modern-dashboard__skeleton-kpis { grid-template-columns: 1fr; }
  .modern-dashboard__kpi { min-height: 4.8rem; }
}

@media (prefers-reduced-motion: reduce) {
  .modern-dashboard *,
  .modern-dashboard *::before,
  .modern-dashboard *::after {
    scroll-behavior: auto !important;
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
  }
}
```

- [ ] **Step 5: Run the targeted component tests**

Run:

```bash
npm run test:run -- src/features/dashboard/components/ModernDashboard.test.tsx
```

Expected: 1 test file passed, 4 tests passed.

- [ ] **Step 6: Check the dashboard diff for accidental scope expansion**

Run:

```bash
git diff --check
git diff -- src/features/dashboard/components/ModernDashboard.tsx src/features/dashboard/components/modern-dashboard.css src/features/dashboard/components/ModernDashboard.test.tsx
```

Expected: no whitespace errors; no API, route, shell, view-model, or translation changes.

- [ ] **Step 7: Commit the visual redesign**

```bash
git add src/features/dashboard/components/ModernDashboard.tsx src/features/dashboard/components/modern-dashboard.css
git commit -m "feat(frontend): redesign dashboard command center"
```

### Task 3: Verify the complete frontend

**Files:**
- Verify: `src/features/dashboard/components/ModernDashboard.tsx`
- Verify: `src/features/dashboard/components/modern-dashboard.css`
- Verify: `src/features/dashboard/components/ModernDashboard.test.tsx`

- [ ] **Step 1: Run the full unit test suite**

Run:

```bash
npm run test:run
```

Expected: all test files pass.

- [ ] **Step 2: Run lint**

Run:

```bash
npm run lint
```

Expected: exit code 0 with no ESLint errors.

- [ ] **Step 3: Run TypeScript checking**

Run:

```bash
npm run type-check
```

Expected: exit code 0 with no TypeScript errors.

- [ ] **Step 4: Run the production build**

Run:

```bash
npm run build
```

Expected: TypeScript and Vite build successfully and emit `dist/`.

- [ ] **Step 5: Run a local HTTP smoke check**

Run the Vite dev server on a free localhost port, request `/` and `/admin`, and confirm both return the application document. Stop the exact Vite process after the check.

Expected: HTTP 200 for `/`; `/admin` returns the SPA document and routing remains client-side.

- [ ] **Step 6: Verify responsive CSS and accessibility contracts**

Confirm the final stylesheet contains breakpoints at 1199px, 767px, and 479px; a reduced-motion block; a visible focus selector; and no `h-screen`, `100vh`, pure `#000000`, or new external font import.

Run:

```bash
rg -n "1199px|767px|479px|prefers-reduced-motion|focus-visible" src/features/dashboard/components/modern-dashboard.css
rg -n "h-screen|100vh|#000000|@import.*font" src/features/dashboard/components/modern-dashboard.css
```

Expected: the first command finds every required guardrail; the second command returns no matches.

- [ ] **Step 7: Review repository state and report evidence**

Run:

```bash
git status --short
git log -3 --oneline
```

Expected: only pre-existing unrelated untracked paths remain; the dashboard test and redesign commits are present. Report any visual-browser validation gap explicitly rather than claiming a screenshot was inspected.
