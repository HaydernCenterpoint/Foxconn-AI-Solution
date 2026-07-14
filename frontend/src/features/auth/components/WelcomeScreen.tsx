import { useEffect } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import logoUrl from '../../../assets/Foxconn_Industrial_Internet.png';
import { Button } from '../../../shared/components/ui/Button';
import { Surface } from '../../../shared/components/ui/Surface';
import { AuthScreen } from './AuthScreen';

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
    <AuthScreen>
      <main className="w-full max-w-sm" aria-labelledby="welcome-heading">
        <Surface variant="raised" padding="lg" className="flex flex-col items-center gap-5 text-center sm:p-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-md border border-border bg-on-primary p-2">
            <img src={logoUrl} alt={t('common.logoAlt')} className="h-10 w-auto object-contain" />
          </div>
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-success-container text-success" aria-hidden="true">
            <CheckCircle2 size={22} />
          </span>
          <div>
            <h1 id="welcome-heading" className="text-xl font-semibold text-text-primary">
              {t('auth.welcome', { name: username })}
            </h1>
            <p className="mt-2 text-sm text-text-secondary" aria-live="polite">
              {t('common.loading')}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={onComplete}>
            {t('common.actions.next')}
          </Button>
        </Surface>
      </main>
    </AuthScreen>
  );
}
