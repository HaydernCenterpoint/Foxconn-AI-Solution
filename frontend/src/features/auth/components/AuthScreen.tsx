import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LanguageControl } from '../../../shared/components/ui/LanguageControl';
import { TechBackground } from '../../../shared/components/ui/TechBackground';

interface AuthScreenProps {
  children: ReactNode;
  showLanguageControl?: boolean;
  fullBleed?: boolean;
}

export function AuthScreen({ children, showLanguageControl = false, fullBleed = false }: AuthScreenProps) {
  const { t } = useTranslation();

  if (fullBleed) {
    return (
      <div className="relative min-h-[100dvh] w-full overflow-y-auto bg-background">
        {showLanguageControl && (
          <div className="absolute right-4 top-4 z-20">
            <LanguageControl compact />
          </div>
        )}
        {children}
      </div>
    );
  }

  return (
    <div className="relative flex min-h-[100dvh] w-full flex-col overflow-y-auto bg-background px-4 py-4 sm:px-6 sm:py-6">
      <TechBackground />
      <header className="relative z-10 flex min-h-9 items-center justify-between gap-4">
        <span className="text-xs font-medium text-text-muted">{t('common.appName')}</span>
        {showLanguageControl && <LanguageControl compact />}
      </header>
      <div className="relative z-10 flex flex-1 items-center justify-center py-8">{children}</div>
      <footer className="relative z-10 text-center text-xs text-text-muted">
        {t('common.systemName')}
      </footer>
    </div>
  );
}
