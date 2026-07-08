import { AppProviders } from './app/providers';
import { AppRouter } from './app/router';
import { SplashScreen } from './features/auth/components/SplashScreen';
import { WelcomeScreen } from './features/auth/components/WelcomeScreen';
import { useAuthStore } from './shared/store/auth.store';
import { useUiStore } from './shared/store/ui.store';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export default function App() {
  const { t } = useTranslation();
  const {
    checkSession,
    consumeWelcome,
    isAuthenticated,
    sessionChecked,
    username,
    welcomePending,
  } = useAuthStore();
  const { theme, setTheme, reducedMotion } = useUiStore();

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  useEffect(() => {
    if (theme !== 'dark') {
      setTheme('dark');
    }
  }, [theme, setTheme]);

  useEffect(() => {
    document.documentElement.classList.toggle('reduced-motion', reducedMotion);
    document.documentElement.dataset.theme = 'dark';
  }, [reducedMotion]);

  if (!sessionChecked) {
    return <SplashScreen />;
  }

  if (isAuthenticated && welcomePending) {
    return (
      <WelcomeScreen
        username={username || t('common.values.user')}
        onComplete={consumeWelcome}
      />
    );
  }

  return (
    <AppProviders>
      <AppRouter />
    </AppProviders>
  );
}
