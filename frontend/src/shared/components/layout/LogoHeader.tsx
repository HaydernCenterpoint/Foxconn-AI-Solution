import { useTranslation } from 'react-i18next';
import logoUrl from '../../../assets/Foxconn_Industrial_Internet.png';

interface Props {
  collapsed: boolean;
  onToggle?: () => void;
}

export function LogoHeader({ collapsed, onToggle }: Props) {
  const { t } = useTranslation();

  return (
    <header
      className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4 transition-all duration-200"
      style={{
        backgroundColor: 'var(--color-background-secondary)',
        borderColor: 'var(--color-border-subtle)',
      }}
    >
      {/* Logo + Brand */}
      <div className={`flex items-center gap-3 min-w-0 ${collapsed ? 'w-full justify-center px-0' : ''}`}>
        <div className="flex h-9 shrink-0 items-center rounded bg-white px-2 py-0.5 shadow-sm">
          <img
            src={logoUrl}
            alt={t('common.logoAlt')}
            className="h-7 w-auto object-contain"
          />
        </div>
        {!collapsed && (
          <div className="flex min-w-0 flex-col animate-fade-in">
            <p
              className="truncate text-xs font-bold tracking-tight uppercase"
              style={{ color: 'var(--color-primary)' }}
            >
              Foxconn
            </p>
            <p
              className="truncate text-[10px] font-semibold text-text-muted"
            >
              Industrial Internet
            </p>
          </div>
        )}
      </div>

      {/* Toggle Sidebar */}
      {!collapsed && onToggle && (
        <button
          type="button"
          onClick={onToggle}
          className="icon-button h-8 w-8 text-text-secondary hover:text-text-primary"
          title={t('common.aria.toggleSidebar')}
          aria-label={t('common.aria.toggleSidebar')}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      )}
    </header>
  );
}
