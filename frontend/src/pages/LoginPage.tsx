import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
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

gsap.registerPlugin(useGSAP);

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
  const pageRef = useRef<HTMLElement>(null);
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
    formState: { errors, isSubmitted },
    trigger,
  } = useForm<LoginFormData>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (isSubmitted) {
      void trigger();
    }
  }, [i18n.language, isSubmitted, trigger]);

  useGSAP(() => {
    const page = pageRef.current;
    if (!page || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    gsap.from('.login-card', {
      opacity: 0,
      y: 18,
      duration: 0.55,
      ease: 'power3.out',
    });
  }, { scope: pageRef });

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
    <AuthScreen showLanguageControl fullBleed>
      <main
        ref={pageRef}
        className="login-experience"
        aria-labelledby="login-heading"
      >
        <div className="login-stage">
          <section className="login-card" aria-labelledby="login-form-heading">
            <header className="login-card__brand">
              <div className="login-card__logo-frame">
                <img src={logoUrl} alt={t('common.logoAlt')} className="login-card__logo" />
              </div>
              <h1 id="login-heading" className="login-card__app-name">
                {t('common.appName')}
              </h1>
              <p className="login-card__system">{t('common.systemName')}</p>
            </header>

            <div className="login-card__intro">
              <h2 id="login-form-heading">{t('auth.loginHeading')}</h2>
              <p>{t('auth.subtitle')}</p>
            </div>

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
                  <UserRound size={18} aria-hidden="true" />
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
                  <p id={usernameErrorId} className="login-form__error" role="alert">{errors.username.message}</p>
                )}
              </div>

              <div className="login-form__group">
                <label htmlFor={passwordId}>{t('auth.password')}</label>
                <div className="login-form__field">
                  <KeyRound size={18} aria-hidden="true" />
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
                    size="sm"
                    className="login-form__visibility"
                    icon={showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                    label={showPassword ? t('common.aria.hidePassword') : t('common.aria.showPassword')}
                    aria-pressed={showPassword}
                    disabled={isBusy}
                    onClick={() => setShowPassword((value) => !value)}
                  />
                </div>
                {errors.password && (
                  <p id={passwordErrorId} className="login-form__error" role="alert">{errors.password.message}</p>
                )}
              </div>

              {errorMessage && (
                <Surface variant="outlined" padding="sm" role="alert" className="login-form__server-error">
                  <AlertCircle size={18} aria-hidden="true" />
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
                <p id={supportInfoId} role="status">{t('auth.contactAdminInfo')}</p>
              )}
            </div>

            <footer className="login-card__footer">
              <span>{t('common.versionLabel')}</span>
            </footer>
          </section>
        </div>
      </main>
    </AuthScreen>
  );
}
