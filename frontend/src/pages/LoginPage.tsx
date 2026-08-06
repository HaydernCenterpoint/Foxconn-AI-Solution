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
import './login-page.css';

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
    () =>
      z.object({
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
  const capabilities = [
    t('auth.capabilities.liveVisibility'),
    t('auth.capabilities.equipmentHealth'),
    t('auth.capabilities.traceableOperations'),
  ];

  return (
    <AuthScreen showLanguageControl fullBleed>
      <main className="login-experience" aria-labelledby="login-heading">
        <aside className="login-brand" aria-labelledby="login-product-heading">
          <div className="login-brand__content">
            <div className="login-brand__identity">
              <img src={logoUrl} alt={t('common.logoAlt')} className="login-brand__logo" />
              <span className="login-brand__rule" aria-hidden="true" />
            </div>

            <div className="login-brand__copy">
              <p className="login-brand__eyebrow">{t('common.systemName')}</p>
              <h2 id="login-product-heading">{t('common.appName')}</h2>
              <p>{t('common.systemDescription')}</p>
            </div>

            <ul className="login-brand__capabilities" aria-label={t('common.appName')}>
              {capabilities.map((capability) => (
                <li key={capability}>
                  <span aria-hidden="true" />
                  {capability}
                </li>
              ))}
            </ul>
          </div>

          <svg className="login-brand__line" viewBox="0 0 640 180" aria-hidden="true">
            <path d="M26 130h588" className="login-brand__line-rail" />
            <path d="M66 80h132v50H66zM244 56h112v74H244zM408 72h148v58H408z" className="login-brand__line-machine" />
            <path d="M104 80V52h56v28M274 56V28h52v28M444 72V42h76v30" className="login-brand__line-detail" />
            <circle cx="136" cy="148" r="12" className="login-brand__line-wheel" />
            <circle cx="306" cy="148" r="12" className="login-brand__line-wheel" />
            <circle cx="482" cy="148" r="12" className="login-brand__line-wheel" />
            <circle cx="574" cy="148" r="12" className="login-brand__line-wheel" />
            <path d="M26 148h588" className="login-brand__line-base" />
          </svg>
        </aside>

        <section className="login-panel" aria-labelledby="login-heading">
          <div className="login-panel__inner">
            <div className="login-panel__mobile-identity">
              <img src={logoUrl} alt={t('common.logoAlt')} />
              <span aria-hidden="true" />
            </div>
            <header className="login-panel__header">
              <p>{t('common.systemName')}</p>
              <h1 id="login-heading">{t('auth.loginHeading')}</h1>
              <span>{t('auth.subtitle')}</span>
            </header>

            <form
              className="login-form"
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
              <div className="login-form__group">
                <label htmlFor={usernameId}>{t('auth.username')}</label>
                <div className="login-form__field">
                  <UserRound size={18} strokeWidth={1.75} aria-hidden="true" />
                  <input
                    {...register('username')}
                    id={usernameId}
                    type="text"
                    autoComplete="username"
                    placeholder={t('auth.usernamePlaceholder')}
                    disabled={isBusy}
                    aria-invalid={Boolean(errors.username)}
                    aria-describedby={errors.username ? usernameErrorId : undefined}
                    className="field"
                  />
                </div>
                {errors.username && (
                  <p id={usernameErrorId} className="login-form__error" role="alert">
                    {errors.username.message}
                  </p>
                )}
              </div>

              <div className="login-form__group">
                <label htmlFor={passwordId}>{t('auth.password')}</label>
                <div className="login-form__field">
                  <KeyRound size={18} strokeWidth={1.75} aria-hidden="true" />
                  <input
                    {...register('password')}
                    id={passwordId}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder={t('auth.passwordPlaceholder')}
                    disabled={isBusy}
                    aria-invalid={Boolean(errors.password)}
                    aria-describedby={errors.password ? passwordErrorId : undefined}
                    className="field"
                  />
                  <IconButton
                    type="button"
                    variant="ghost"
                    className="login-form__visibility"
                    icon={
                      showPassword ? (
                        <EyeOff size={18} strokeWidth={1.75} aria-hidden="true" />
                      ) : (
                        <Eye size={18} strokeWidth={1.75} aria-hidden="true" />
                      )
                    }
                    label={showPassword ? t('common.aria.hidePassword') : t('common.aria.showPassword')}
                    aria-pressed={showPassword}
                    disabled={isBusy}
                    onClick={() => setShowPassword((value) => !value)}
                  />
                </div>
                {errors.password && (
                  <p id={passwordErrorId} className="login-form__error" role="alert">
                    {errors.password.message}
                  </p>
                )}
              </div>

              {errorMessage && (
                <Surface variant="outlined" padding="sm" role="alert" className="login-form__server-error">
                  <AlertCircle size={18} strokeWidth={1.75} aria-hidden="true" />
                  <p>{errorMessage}</p>
                </Surface>
              )}

              <Button type="submit" size="lg" className="login-submit" loading={isBusy}>
                {isBusy ? t('auth.submitting') : t('auth.submit')}
              </Button>
            </form>

            <div className="login-support">
              <Button
                variant="ghost"
                size="sm"
                aria-expanded={showSupportInfo}
                aria-controls={supportInfoId}
                onClick={() => setShowSupportInfo((value) => !value)}
              >
                {t('auth.forgotPassword')}
              </Button>
              {showSupportInfo && (
                <p id={supportInfoId} role="status">
                  {t('auth.contactAdminInfo')}
                </p>
              )}
            </div>
          </div>

          <footer className="login-panel__footer">
            <span>{t('common.appName')}</span>
            <span>{t('common.versionLabel')}</span>
          </footer>
        </section>
      </main>
    </AuthScreen>
  );
}
