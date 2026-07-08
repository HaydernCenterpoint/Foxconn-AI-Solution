import { useTranslation } from 'react-i18next';
import logoUrl from '../../../assets/Foxconn_Industrial_Internet.png';

export function SplashScreen() {
  const { t } = useTranslation();

  return (
    <div className="app-backdrop flex min-h-[100dvh] w-screen items-center justify-center bg-bg">
      <div className="flex flex-col items-center gap-6 rounded-[var(--radius-large)] border border-border bg-panel px-10 py-9 shadow-panel">
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-panel-soft">
          <img
            src={logoUrl}
            alt={t('common.logoAlt')}
            className="h-14 w-auto object-contain"
          />
        </span>
        <div className="h-1.5 w-32 overflow-hidden rounded-full bg-panel-soft" aria-label={t('common.loading')}>
          <div className="loading-bar h-full w-1/2 rounded-full bg-accent" />
        </div>
      </div>
    </div>
  );
}
