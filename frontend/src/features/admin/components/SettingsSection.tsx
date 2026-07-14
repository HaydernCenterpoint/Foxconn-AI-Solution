import { Check, Moon, Sun } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../../../shared/store/ui.store';
import { Surface } from '../../../shared/components/ui/Surface';

interface SettingsSectionProps {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function SettingsSection({
  icon,
  title,
  description,
  children,
  className = '',
}: SettingsSectionProps) {
  return (
    <Surface variant="default" padding="none" className={className}>
      <div className="flex items-start gap-3 p-4 sm:p-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-light text-primary" aria-hidden="true">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-text-primary">{title}</h2>
          {description && <p className="mt-1 text-sm text-text-secondary">{description}</p>}
        </div>
      </div>
      <div className="border-t border-border p-4 sm:p-5">{children}</div>
    </Surface>
  );
}

export function AppearancePreferences() {
  const { t } = useTranslation();
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);
  const reducedMotion = useUiStore((state) => state.reducedMotion);
  const setReducedMotion = useUiStore((state) => state.setReducedMotion);

  const themeOptions = [
    { value: 'dark' as const, label: t('settings.appearance.dark'), icon: <Moon size={18} aria-hidden="true" /> },
    { value: 'light' as const, label: t('settings.appearance.light'), icon: <Sun size={18} aria-hidden="true" /> },
  ];

  return (
    <div className="space-y-6">
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-text-primary">{t('settings.appearance.theme')}</legend>
        <p className="text-sm text-text-secondary">{t('settings.appearance.themeHint')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {themeOptions.map((option) => {
            const isSelected = theme === option.value;

            return (
              <label
                key={option.value}
                className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors focus-within:border-primary focus-within:bg-primary-light ${
                  isSelected
                    ? 'border-primary bg-primary-light text-primary'
                    : 'border-border bg-surface-container-low text-text-primary hover:border-outline-variant hover:bg-surface-container'
                }`}
              >
                <input
                  type="radio"
                  name="application-theme"
                  value={option.value}
                  checked={isSelected}
                  onChange={() => setTheme(option.value)}
                  className="sr-only"
                />
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-container-high text-text-secondary" aria-hidden="true">
                  {option.icon}
                </span>
                <span className="min-w-0 flex-1 text-sm font-semibold">{option.label}</span>
                {isSelected && <Check size={18} aria-hidden="true" />}
              </label>
            );
          })}
        </div>
      </fieldset>

      <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-surface-container-low p-3 transition-colors hover:border-outline-variant hover:bg-surface-container">
        <input
          type="checkbox"
          checked={reducedMotion}
          onChange={(event) => setReducedMotion(event.currentTarget.checked)}
          aria-describedby="reduced-motion-description"
          className="mt-0.5 shrink-0"
        />
        <span>
          <span className="block text-sm font-semibold text-text-primary">{t('settings.appearance.reducedMotion')}</span>
          <span id="reduced-motion-description" className="mt-1 block text-sm text-text-secondary">
            {t('settings.appearance.reducedMotionHint')}
          </span>
        </span>
      </label>
    </div>
  );
}
