import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';

interface Alarm {
  machineId: string;
  message: string;
  severity: 'error' | 'warn';
}

interface Props {
  alarms: Alarm[];
  count: number;
}

function AlarmSummaryComponent({ alarms, count }: Props) {
  const { t } = useTranslation();

  return (
    <div
      className="flex h-full flex-col rounded-xl border p-4"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-outline-variant)',
      }}
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--color-on-surface)' }}>
          {t('dashboard.kpi.activeAlarms')}
        </h3>
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full"
          style={{ backgroundColor: 'var(--color-error-container)' }}
        >
          <AlertTriangle size={16} style={{ color: 'var(--color-error)' }} />
        </div>
      </div>

      <p
        className="text-4xl font-bold tabular-nums"
        style={{ color: count > 0 ? 'var(--color-error)' : 'var(--color-running)' }}
      >
        {count}
      </p>

      <div className="mt-4 flex-1 space-y-2 overflow-y-auto">
        {alarms.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
            {t('pages.alarms.noAlarms')}
          </p>
        ) : (
          alarms.slice(0, 5).map((alarm, idx) => (
            <div
              key={`${alarm.machineId}-${idx}`}
              className="flex items-start gap-2 rounded-lg p-2"
              style={{ backgroundColor: 'var(--color-error-container)' }}
            >
              <AlertTriangle
                size={14}
                className="mt-0.5 shrink-0"
                style={{ color: 'var(--color-error)' }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium" style={{ color: 'var(--color-error)' }}>
                  {alarm.machineId}
                </p>
                <p className="mt-0.5 truncate text-[10px]" style={{ color: 'var(--color-on-surface-variant)' }}>
                  {alarm.message}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export const AlarmSummary = memo(AlarmSummaryComponent);
