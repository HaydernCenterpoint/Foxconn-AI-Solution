import { useTranslation } from 'react-i18next';
import { MaterialSymbol } from '../../shared/components/ui/MaterialSymbol';

import { LanguageSelector } from '../../shared/components/i18n/LanguageSelector';
import { useAuthStore } from '../../shared/store/auth.store';
import { useUiStore } from '../../shared/store/ui.store';
import './modern-settings.css';

interface SettingSectionProps {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}

function SettingSection({ icon, title, children }: SettingSectionProps) {
  return (
    <section className="modern-settings__section">
      <header className="modern-settings__section-head">
        <div className="modern-settings__section-icon">
          {icon}
        </div>
        <h2>{title}</h2>
      </header>
      <div className="modern-settings__section-body">{children}</div>
    </section>
  );
}

const themeOptions = [
  { value: 'dark' as const, label: 'Dark', color: 'var(--color-background)' },
  { value: 'light' as const, label: 'Light', color: '#e4e4e4' },
];

export default function SettingsPage() {
  const { t } = useTranslation();
  const auth = useAuthStore();
  const ui = useUiStore();

  return (
    <div className="modern-settings space-y-6">
      <div className="modern-settings__intro">
        <h1 className="modern-settings__title">{t('settings.title', 'Cài đặt hệ thống')}</h1>
        <p className="modern-settings__subtitle">{t('settings.viewerSubtitle', 'Cấu hình hiển thị và tùy chọn cá nhân.')}</p>
      </div>

      <div className="modern-settings__grid">
        {/* User Profile */}
        <SettingSection icon={<MaterialSymbol name="person" size={18} />} title={t('settings.profile.title', 'Thông tin người dùng')}>
          <div className="modern-settings__list">
            <div className="modern-settings__row">
              <span>{t('settings.profile.username', 'Tài khoản')}</span>
              <span>{auth.username || t('common.guest', 'Khách')}</span>
            </div>
            <div className="modern-settings__row">
              <span>{t('settings.profile.role', 'Quyền hạn')}</span>
              <span className="modern-settings__role">
                {auth.role || 'GUEST'}
              </span>
            </div>
          </div>
        </SettingSection>

        {/* Display / Language */}
        <SettingSection icon={<MaterialSymbol name="language" size={18} />} title={t('settings.language.title', 'Ngôn ngữ & Hiển thị')}>
          <div className="space-y-4">
            <div>
              <label className="modern-settings__label">
                {t('settings.language.selectLabel', 'Chọn ngôn ngữ')}
              </label>
              <LanguageSelector />
            </div>
          </div>
        </SettingSection>

        {/* Theme Settings */}
        <SettingSection icon={<MaterialSymbol name="palette" size={18} />} title={t('settings.theme.title', 'Giao diện ứng dụng')}>
          <div>
            <label className="modern-settings__label">
              {t('settings.theme.selectLabel', 'Tông màu chủ đạo')}
            </label>
            <div className="modern-settings__theme-list">
              {themeOptions.map((theme) => (
                <button
                  key={theme.value}
                  type="button"
                  onClick={() => ui.setTheme(theme.value)}
                  className={`modern-settings__theme-button${ui.theme === theme.value ? ' is-selected' : ''}`}
                >
                  <span className="modern-settings__theme-dot" style={{ backgroundColor: theme.color }} />
                  {theme.label}
                </button>
              ))}
            </div>
          </div>
        </SettingSection>
      </div>
    </div>
  );
}
export { SettingsPage };
