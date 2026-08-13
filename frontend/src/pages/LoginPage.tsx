import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { MaterialSymbol } from '../shared/components/ui/MaterialSymbol';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';

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

gsap.registerPlugin(useGSAP, ScrollTrigger);

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
    setFocus,
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

  useGSAP(() => {
    const page = pageRef.current;
    if (!page || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    gsap.timeline({ defaults: { duration: 0.8, ease: 'power3.out' } })
      .from('.login-stack-card', { opacity: 0, y: 44, stagger: 0.1 })
      .from('.login-hero__copy', { opacity: 0, y: 28 }, '-=0.48');

    gsap.fromTo('.login-hero__image',
      { opacity: 0.6, scale: 1.08 },
      { duration: 1.8, ease: 'power2.out', opacity: 1, scale: 1 },
    );

    const scroller = page.parentElement?.parentElement;
    if (scroller instanceof HTMLElement) {
      gsap.to('.login-hero__image', {
        ease: 'none',
        opacity: 0.35,
        scale: 1.04,
        scrollTrigger: {
          trigger: page,
          scroller,
          start: 'top top',
          end: 'bottom top',
          scrub: 0.7,
        },
      });

      gsap.fromTo('.login-hero__word',
        { opacity: 0.18, y: 10 },
        {
          opacity: 1,
          y: 0,
          ease: 'none',
          stagger: 0.04,
          scrollTrigger: {
            trigger: '.login-hero__lede',
            scroller,
            start: 'top 86%',
            end: 'bottom 56%',
            scrub: 0.65,
          },
        },
      );
    }
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
  const platformModules = [t('navigation.overview'), t('navigation.fiiAssistant'), t('navigation.fiiDataFusion')];
  const heroDescription = t('common.systemDescription');
  const heroWords = heroDescription.split(/\s+/);
  const proofLines = [heroDescription, t('auth.subtitle'), t('common.systemName')];

  return (
    <AuthScreen showLanguageControl fullBleed>
      <main ref={pageRef} className="login-experience grid grid-flow-dense lg:grid-cols-12" aria-labelledby="login-heading">
        <section className="login-hero login-stack-card lg:col-span-7">
          <div className="login-hero__image" aria-hidden="true" />
          <div className="login-hero__wash" aria-hidden="true" />

          <div className="login-hero__copy">
            <div className="login-hero__logo-frame">
              <img src={logoUrl} alt={t('common.logoAlt')} className="login-hero__logo" />
            </div>
            <h1 id="login-heading" className="login-hero__title max-w-6xl">
              <span>{t('common.appName')}</span>
              <span className="login-hero__title-mark" aria-hidden="true" />
            </h1>
            <p className="login-hero__lede" aria-label={heroDescription}>
              {heroWords.map((word, index) => (
                <span className="login-hero__word" key={`${word}-${index}`}>
                  {word}{index < heroWords.length - 1 ? ' ' : ''}
                </span>
              ))}
            </p>

            <div className="login-hero__actions">
              <Button size="lg" className="login-hero__primary" onClick={() => setFocus('username')}>
                {t('auth.submit')}
              </Button>
              <Button
                variant="secondary"
                size="lg"
                className="login-hero__secondary"
                onClick={() => setShowSupportInfo(true)}
              >
                {t('auth.forgotPassword')}
              </Button>
            </div>

            <div className="login-accordion" aria-hidden="true">
              {platformModules.map((module) => (
                <div className="login-accordion__item" key={module}>
                  <span className="login-accordion__line" />
                  <strong>{module}</strong>
                </div>
              ))}
            </div>

            <div className="login-feedback" aria-hidden="true">
              <div className="login-feedback__track">
                {proofLines.map((line) => <p key={line}>{line}</p>)}
              </div>
            </div>
          </div>

          <div className="login-marquee" aria-hidden="true">
            <div className="login-marquee__track">
              {[...platformModules, ...platformModules].map((module, index) => (
                <span key={`${module}-${index}`}>{module}</span>
              ))}
            </div>
          </div>
        </section>

        <section className="login-panel login-stack-card lg:col-span-5" aria-labelledby="login-form-heading">
          <div className="login-panel__inner">
            <header className="login-panel__header">
              <p>{t('common.systemName')}</p>
              <h2 id="login-form-heading">{t('auth.loginHeading')}</h2>
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
                  <MaterialSymbol name="person" size={18} />
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
                  <MaterialSymbol name="key" size={18} />
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
                    icon={showPassword ? <MaterialSymbol name="visibility_off" size={18} /> : <MaterialSymbol name="visibility" size={18} />}
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
                  <MaterialSymbol name="error" size={18} />
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
