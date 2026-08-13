
import { useTranslation } from 'react-i18next';
import { MaterialSymbol } from '../../../shared/components/ui/MaterialSymbol';
import { Dropdown } from '../../../shared/components/ui/Dropdown';
import type { AlertFilters as AlertFiltersType } from '../services/alerts.api';

interface AlertFiltersProps {
  filters: AlertFiltersType;
  onChange: (filters: AlertFiltersType) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export function AlertFilters({ filters, onChange, searchQuery, onSearchChange }: AlertFiltersProps) {
  const { t } = useTranslation();

  const statusOptions = [
    { value: '', label: t('alerts.filters.allStatuses') },
    { value: 'open', label: t('alerts.filters.open') },
    { value: 'acknowledged', label: t('alerts.filters.acknowledged') },
    { value: 'resolved', label: t('alerts.filters.resolved') },
    { value: 'suppressed', label: t('alerts.filters.suppressed') },
  ];

  const severityOptions = [
    { value: '', label: t('alerts.filters.allSeverities') },
    { value: 'critical', label: t('alerts.filters.critical') },
    { value: 'high', label: t('alerts.filters.high') },
    { value: 'medium', label: t('alerts.filters.medium') },
    { value: 'low', label: t('alerts.filters.low') },
  ];

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Dropdown
        value={filters.status ?? ''}
        onChange={(value) => onChange({ ...filters, status: value || undefined })}
        options={statusOptions}
        labelPrefix={`${t('alerts.filters.status')}: `}
      />

      <Dropdown
        value={filters.severity ?? ''}
        onChange={(value) => onChange({ ...filters, severity: value || undefined })}
        options={severityOptions}
        labelPrefix={`${t('alerts.filters.severity')}: `}
      />

      <div className="relative ml-auto min-w-[220px]">
        <MaterialSymbol
          name="search"
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('alerts.filters.searchPlaceholder')}
          className="w-full rounded-lg border border-border bg-surface-1 py-2 pl-9 pr-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-primary"
        />
      </div>
    </div>
  );
}
