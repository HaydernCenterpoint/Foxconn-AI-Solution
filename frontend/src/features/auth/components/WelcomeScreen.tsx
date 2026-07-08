import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import logoUrl from '../../../assets/Foxconn_Industrial_Internet.png';

interface Props {
  username: string;
  onComplete: () => void;
}

export function WelcomeScreen({ username, onComplete }: Props) {
  const { t } = useTranslation();

  useEffect(() => {
    const timer = window.setTimeout(onComplete, 1450);
    return () => window.clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="welcome-screen app-backdrop flex min-h-[100dvh] w-screen items-center justify-center bg-bg">
      <div className="flex flex-col items-center gap-5 rounded-[var(--radius-large)] border border-border bg-panel px-10 py-9 shadow-panel">
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-panel-soft">
          <img
            src={logoUrl}
            alt={t('common.logoAlt')}
            className="h-14 w-auto object-contain"
          />
        </span>
        <p className="text-lg font-semibold text-light">{t('auth.welcome', { name: username })}</p>
      </div>
    </div>
  );
}
