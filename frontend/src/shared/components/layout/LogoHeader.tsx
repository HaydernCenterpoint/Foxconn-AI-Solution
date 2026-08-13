
import { useTranslation } from 'react-i18next';
import { MaterialSymbol } from '../ui/MaterialSymbol';
import logoUrl from '../../../assets/Foxconn_Industrial_Internet.png';
import { IconButton } from '../ui/IconButton';

interface Props {
  collapsed: boolean;
  onToggle?: () => void;
}

export function LogoHeader({ collapsed, onToggle }: Props) {
  const { t } = useTranslation();

  return (
    <header className={`app-logo-header ${collapsed ? 'is-collapsed' : ''}`}>
      <div className="app-logo-header__brand">
        <span className="app-logo-header__logo-frame">
          <img src={logoUrl} alt={t('common.logoAlt')} className="app-logo-header__logo" />
        </span>
        {!collapsed && (
          <span className="app-logo-header__copy">
            <span>{t('common.appName')}</span>
            <span>{t('common.systemName')}</span>
          </span>
        )}
      </div>
      {onToggle && (
        <IconButton
          icon={collapsed ? <MaterialSymbol name="left_panel_open" size={18} /> : <MaterialSymbol name="left_panel_close" size={18} />}
          label={t('common.aria.toggleSidebar')}
          variant="ghost"
          onClick={onToggle}
        />
      )}
    </header>
  );
}
