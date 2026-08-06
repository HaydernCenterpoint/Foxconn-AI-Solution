import { render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { beforeAll, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { en } from '../../../app/i18n/en';
import { vi } from '../../../app/i18n/vi';
import type { DashboardViewModel } from '../dashboardViewModel';
import { ModernDashboard } from './ModernDashboard';

const viewModel = {
  kpis: [
    { id: 'total-production', value: 1_200, unit: 'units' },
    { id: 'production-efficiency', value: 75, unit: '%' },
    { id: 'active-alarms', value: 2, unit: 'alarms' },
  ],
  stockBars: [
    { name: '08:00', current: 20, threshold: 40, hasData: true },
    { name: '09:00', current: 35, threshold: 40, hasData: true },
  ],
  defects: { total: 80, rate: 6.7, nonDefectiveTotal: 1_120, nonDefectiveRate: 93.3, hasData: true },
  trend: [
    { name: '08:00', production: 20, waste: 1, hasData: true },
    { name: '09:00', production: 35, waste: 2, hasData: true },
  ],
  lineStatuses: [
    { id: 'line-1', name: 'Assembly', status: 'active', machineCount: 2, producedQuantity: 700 },
  ],
  pendingOrders: [],
  topProducts: [],
} satisfies DashboardViewModel;

const noChartViewModel = {
  ...viewModel,
  stockBars: [],
  defects: { ...viewModel.defects, hasData: false },
  trend: [],
} satisfies DashboardViewModel;

const testI18n = createInstance();

describe('ModernDashboard', () => {
  beforeAll(async () => {
    await testI18n.use(initReactI18next).init({
      resources: { vi: { translation: vi }, en: { translation: en } },
      lng: 'vi',
      fallbackLng: 'vi',
      interpolation: { escapeValue: false },
    });
  });

  it('renders live production data with operational navigation', async () => {
    render(
      <I18nextProvider i18n={testI18n}>
        <MemoryRouter>
          <ModernDashboard viewModel={viewModel} username="Lan" basePath="/admin" />
        </MemoryRouter>
      </I18nextProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Tổng quan sản xuất' })).toBeInTheDocument();
    expect(screen.getByText('1.200')).toBeInTheDocument();
    expect(screen.getByText('Assembly')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Assembly/i })).toHaveAttribute('href', '/admin/lines');
    expect(screen.queryByText('John Hardward')).not.toBeInTheDocument();
  });

  it('uses the selected application language for new dashboard content', async () => {
    await testI18n.changeLanguage('en');

    render(
      <I18nextProvider i18n={testI18n}>
        <MemoryRouter>
          <ModernDashboard viewModel={noChartViewModel} username="Lan" basePath="/admin" />
        </MemoryRouter>
      </I18nextProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Production overview' })).toBeInTheDocument();
    await testI18n.changeLanguage('vi');
  });
});
