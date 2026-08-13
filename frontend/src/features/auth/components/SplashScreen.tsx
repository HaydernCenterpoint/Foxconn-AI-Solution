
import { useTranslation } from 'react-i18next';
import { MaterialSymbol } from '../../../shared/components/ui/MaterialSymbol';
import logoUrl from '../../../assets/Foxconn_Industrial_Internet.png';
import { Surface } from '../../../shared/components/ui/Surface';
import { AuthScreen } from './AuthScreen';

export function SplashScreen() {
  const { t } = useTranslation();

  return (
    <AuthScreen>
      <main className="w-full max-w-sm" aria-busy="true" aria-live="polite">
        <Surface variant="raised" padding="lg" className="flex flex-col items-center gap-5 text-center sm:p-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-md border border-border bg-on-primary p-2">
            <img src={logoUrl} alt={t('common.logoAlt')} className="h-10 w-auto object-contain" />
          </div>
          <div className="flex items-center gap-3 text-sm font-medium text-text-secondary" role="status">
            <MaterialSymbol name="progress_activity" size={20} className="animate-spin text-primary" />
            <span>{t('common.loading')}</span>
          </div>
        </Surface>
      </main>
    </AuthScreen>
  );
}
