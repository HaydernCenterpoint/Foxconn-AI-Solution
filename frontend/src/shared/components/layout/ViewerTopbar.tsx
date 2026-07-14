import { Eye, Menu, Moon, Sun, Tv } from 'lucide-react';
import { type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import logoUrl from '../../../assets/Foxconn_Industrial_Internet.png';
import { IconButton } from '../ui/IconButton';
import { LanguageControl } from '../ui/LanguageControl';
import { LocalizedDateTime } from '../ui/LocalizedDateTime';
import { useUiStore } from '../../store/ui.store';

interface ViewerTopbarProps {
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
  menuButtonRef?: RefObject<HTMLButtonElement | null>;
}

export function ViewerTopbar({ onToggleSidebar, isSidebarOpen = false, menuButtonRef }: ViewerTopbarProps) {
  const { t } = useTranslation();
  const { theme, setTheme } = useUiStore();

  return (
    <header className="app-topbar app-topbar--viewer">
      <div className="app-topbar__leading">
        {onToggleSidebar && (
          <IconButton
            ref={menuButtonRef}
            icon={<Menu size={21} aria-hidden="true" />}
            label={t('common.aria.toggleSidebar')}
            variant="ghost"
            className="app-topbar__menu-button"
            onClick={onToggleSidebar}
            aria-controls="app-sidebar-drawer"
            aria-expanded={isSidebarOpen}
          />
        )}
        <div className="app-topbar__brand">
          <span className="app-topbar__logo-frame">
            <img src={logoUrl} alt={t('common.logoAlt')} className="app-topbar__logo" />
          </span>
          <div className="app-topbar__context">
            <span className="app-topbar__app-name">{t('common.appName')}</span>
            <span className="app-topbar__page-title">{t('common.mode.readOnly')}</span>
          </div>
        </div>
      </div>

      <div className="app-topbar__actions">
        <LocalizedDateTime className="app-topbar__clock" />
        <Link to="/slideshow" className="app-topbar__slideshow-link">
          <Tv size={17} aria-hidden="true" />
          <span>{t('common.mode.slideshow')}</span>
        </Link>
        <div className="app-topbar__viewer-indicator">
          <Eye size={16} aria-hidden="true" />
          <span>{t('common.mode.readOnly')}</span>
        </div>
        <div className="app-topbar__utility-group">
          <IconButton
            icon={theme === 'dark' ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
            label={t('settings.appearance.theme')}
            title={t(theme === 'dark' ? 'settings.appearance.light' : 'settings.appearance.dark')}
            variant="ghost"
            aria-pressed={theme === 'dark'}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          />
          <LanguageControl compact />
        </div>
      </div>
    </header>
  );
}
