import { useEffect, useId, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { AlertCircle, Eye, EyeOff, KeyRound, UserRound } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authApi } from '../features/auth/services/auth.api';
import { AuthScreen } from '../features/auth/components/AuthScreen';
import logoUrl from '../assets/Foxconn_Industrial_Internet.png';
import { Button } from '../shared/components/ui/Button';
import { IconButton } from '../shared/components/ui/IconButton';
import { Surface } from '../shared/components/ui/Surface';
import { useAuthStore } from '../shared/store/auth.store';

interface LoginFormData {
  username: string;
  password: string;
}

export default function LoginPage() {
  const { i18n, t } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated, login, sessionMessage, welcomePending } = useAuthStore();
  const [serverError, setServerError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showSupportInfo, setShowSupportInfo] = useState(false);
  const usernameId = useId();
  const passwordId = useId();
  const usernameErrorId = useId();
  const passwordErrorId = useId();
  const supportInfoId = useId();

  const schema = useMemo(
    () => z.object({
      username: z.string().trim().min(1, t('auth.validation.usernameRequired')),
      password: z.string().min(1, t('auth.validation.passwordRequired')),
    }),
    [t],
  );

  useEffect(() => {
    document.title = `${t('titles.login')} | ${t('common.appTitleSuffix')}`;
  }, [t]);

  const {
    register,
    handleSubmit,
    trigger,
    formState: { errors, isSubmitted },
  } = useForm<LoginFormData>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (isSubmitted) {
      void trigger();
    }
  }, [i18n.language, isSubmitted, trigger]);

  const mutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: (data) => {
      login(data.token, data.username, data.role);
      navigate('/admin', { replace: true });
    },
    onError: () => {
      setServerError(t('auth.errors.serverRejected'));
    },
  });

  if (isAuthenticated && !welcomePending) {
    return <Navigate to="/admin" replace />;
  }

  const errorMessage = serverError || (sessionMessage ? t(sessionMessage, { defaultValue: sessionMessage }) : '');
  const isBusy = mutation.isPending;

  return (
    <AuthScreen showLanguageControl>
      <main className="w-full max-w-md" aria-labelledby="login-heading">
        <Surface variant="raised" padding="lg" className="space-y-8 sm:p-8">
          <header className="text-center">
            <div className="mx-auto flex h-12 w-fit items-center justify-center rounded-md border border-border bg-on-primary px-3 py-1.5 shadow-sm">
              <img src={logoUrl} alt={t('common.logoAlt')} className="h-7 w-auto object-contain" />
            </div>
            <h1 id="login-heading" className="mt-6 text-2xl font-semibold tracking-tight text-text-primary">
              {t('auth.loginHeading')}
            </h1>
            <p className="mt-2 text-sm text-text-secondary">{t('auth.subtitle')}</p>
          </header>

          <form
            className="space-y-5"
            noValidate
            aria-busy={isBusy || undefined}
            onChange={() => {
              if (serverError) setServerError('');
            }}
            onSubmit={handleSubmit((data) => {
              setServerError('');
              mutation.mutate({ username: data.username.trim(), password: data.password });
            })}
          >
            <div>
              <label htmlFor={usernameId} className="mb-2 block text-sm font-semibold text-text-primary">
                {t('auth.username')}
              </label>
              <div className="relative">
                <UserRound className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} aria-hidden="true" />
                <input
                  {...register('username')}
                  id={usernameId}
                  type="text"
                  autoComplete="username"
                  placeholder={t('auth.usernamePlaceholder')}
                  disabled={isBusy}
                  aria-invalid={Boolean(errors.username)}
                  aria-describedby={errors.username ? usernameErrorId : undefined}
                  className="field pl-10"
                />
              </div>
              {errors.username && (
                <p id={usernameErrorId} className="mt-2 text-sm text-error" role="alert">
                  {errors.username.message}
                </p>
              )}
            </div>

            <div>
              <label htmlFor={passwordId} className="mb-2 block text-sm font-semibold text-text-primary">
                {t('auth.password')}
              </label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} aria-hidden="true" />
                <input
                  {...register('password')}
                  id={passwordId}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder={t('auth.passwordPlaceholder')}
                  disabled={isBusy}
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? passwordErrorId : undefined}
                  className="field pl-10 pr-12"
                />
                <IconButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2"
                  icon={showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                  label={showPassword ? t('common.aria.hidePassword') : t('common.aria.showPassword')}
                  aria-pressed={showPassword}
                  disabled={isBusy}
                  onClick={() => setShowPassword((value) => !value)}
                />
              </div>
              {errors.password && (
                <p id={passwordErrorId} className="mt-2 text-sm text-error" role="alert">
                  {errors.password.message}
                </p>
              )}
            </div>

            {errorMessage && (
              <Surface
                variant="outlined"
                padding="sm"
                role="alert"
                className="flex items-start gap-3 border-error bg-error-container text-error"
              >
                <AlertCircle className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
                <p className="text-sm text-error">{errorMessage}</p>
              </Surface>
            )}

            <Button type="submit" size="lg" className="w-full" loading={isBusy}>
              {isBusy ? t('auth.submitting') : t('auth.submit')}
            </Button>
          </form>

          <div className="border-t border-border pt-5">
            <Button
              variant="ghost"
              size="sm"
              className="px-0"
              aria-expanded={showSupportInfo}
              aria-controls={supportInfoId}
              onClick={() => setShowSupportInfo((value) => !value)}
            >
              {t('auth.forgotPassword')}
            </Button>
            {showSupportInfo && (
              <p id={supportInfoId} className="mt-3 text-sm text-text-secondary" role="status">
                {t('auth.contactAdminInfo')}
              </p>
            )}
          </div>
        </Surface>
      </main>
    </AuthScreen>
  );
}
