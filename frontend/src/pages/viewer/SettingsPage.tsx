import type { ReactNode } from 'react';
import { Globe2, Moon, Palette, Sun, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../../shared/components/ui/Badge';
import { Button } from '../../shared/components/ui/Button';
import { LanguageControl } from '../../shared/components/ui/LanguageControl';
import { PageHeader } from '../../shared/components/ui/PageHeader';
import { Surface } from '../../shared/components/ui/Surface';
import { useAuthStore } from '../../shared/store/auth.store';
import { useUiStore } from '../../shared/store/ui.store';
import './viewer.css';

interface SettingSectionProps {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}

function SettingSection({ icon, title, children }: SettingSectionProps) {
  return (
    <Surface variant="raised" className="viewer-settings__section">
      <header className="viewer-settings__section-header">
        <span className="viewer-settings__section-icon" aria-hidden="true">{icon}</span>
        <h2 className="viewer-settings__section-title">{title}</h2>
      </header>
      {children}
    </Surface>
  );
}

export function SettingsPage() {
  const { t } = useTranslation();
  const { username, role } = useAuthStore();
  const { theme, setTheme } = useUiStore();

  return (
    <div className="viewer-page">
      <PageHeader
        eyebrow={t('settings.eyebrow', { defaultValue: 'Viewer preferences' })}
        title={t('settings.title', { defaultValue: 'Settings' })}
        description={t('settings.viewerSubtitle', { defaultValue: 'Configure read-only viewer display preferences.' })}
      />

      <div className="viewer-settings__grid">
        <SettingSection icon={<UserRound size={20} />} title={t('settings.profile.title', { defaultValue: 'User profile' })}>
          <div className="viewer-settings__profile">
            <div className="viewer-settings__profile-row">
              <span className="viewer-settings__label">{t('settings.profile.username', { defaultValue: 'Account' })}</span>
              <span className="viewer-settings__value">{username || t('common.guest', { defaultValue: 'Guest' })}</span>
            </div>
            <div className="viewer-settings__profile-row">
              <span className="viewer-settings__label">{t('settings.profile.role', { defaultValue: 'Access level' })}</span>
              <Badge variant="neutral">{role || 'GUEST'}</Badge>
            </div>
          </div>
        </SettingSection>

        <SettingSection icon={<Globe2 size={20} />} title={t('settings.language.title', { defaultValue: 'Language' })}>
          <div className="viewer-settings__row">
            <div>
              <span className="viewer-settings__label">{t('settings.language.selectLabel', { defaultValue: 'Display language' })}</span>
              <p className="viewer-settings__caption">
                {t('settings.language.description', { defaultValue: 'Applies to the viewer navigation and all available translated content.' })}
              </p>
            </div>
            <LanguageControl />
          </div>
        </SettingSection>

        <SettingSection icon={<Palette size={20} />} title={t('settings.theme.title', { defaultValue: 'Appearance' })}>
          <div className="viewer-settings__row">
            <div>
              <span className="viewer-settings__label">{t('settings.theme.selectLabel', { defaultValue: 'Color mode' })}</span>
              <p className="viewer-settings__caption">
                {t('settings.theme.description', { defaultValue: 'Choose the application color mode for this browser.' })}
              </p>
            </div>
            <div className="viewer-settings__theme-actions">
              <Button
                variant={theme === 'dark' ? 'primary' : 'secondary'}
                size="sm"
                startIcon={<Moon size={16} aria-hidden="true" />}
                aria-pressed={theme === 'dark'}
                onClick={() => setTheme('dark')}
              >
                {t('settings.appearance.dark', { defaultValue: 'Dark' })}
              </Button>
              <Button
                variant={theme === 'light' ? 'primary' : 'secondary'}
                size="sm"
                startIcon={<Sun size={16} aria-hidden="true" />}
                aria-pressed={theme === 'light'}
                onClick={() => setTheme('light')}
              >
                {t('settings.appearance.light', { defaultValue: 'Light' })}
              </Button>
            </div>
          </div>
        </SettingSection>
      </div>
    </div>
  );
}

export default SettingsPage;
