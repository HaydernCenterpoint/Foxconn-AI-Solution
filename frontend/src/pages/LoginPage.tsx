import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { Eye, EyeOff } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authApi } from '../features/auth/services/auth.api';
import logoUrl from '../assets/Foxconn_Industrial_Internet.png';
import { LanguageSelector } from '../shared/components/i18n/LanguageSelector';
import { useAuthStore } from '../shared/store/auth.store';
import { TechBackground } from '../shared/components/ui/TechBackground';

interface FormData {
  username: string;
  password: string;
  remember?: boolean;
}

export default function LoginPage() {
  const { i18n, t } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated, login, sessionMessage, welcomePending } = useAuthStore();
  const [serverError, setServerError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const schema = useMemo(() => z.object({
    username: z.string().trim().min(1, t('auth.validation.usernameRequired')),
    password: z.string().min(1, t('auth.validation.passwordRequired')),
    remember: z.boolean().optional(),
  }), [t]);

  useEffect(() => {
    document.title = `${t('titles.login')} | ${t('common.appTitleSuffix')}`;
  }, [t]);

  const { register, handleSubmit, trigger, formState: { errors, isSubmitted } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { remember: true },
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
    onError: (error) => {
      console.warn(error);
      setServerError(t('auth.errors.serverRejected'));
    },
  });

  if (isAuthenticated && !welcomePending) {
    return <Navigate to="/admin" replace />;
  }

  return (
    <div
      className="relative flex min-h-[100dvh] w-full flex-col items-center justify-between p-4 md:p-6"
      style={{ backgroundColor: 'var(--color-background)' }}
    >
      <TechBackground />
      {/* Language selector in top right */}
      <div className="absolute top-4 right-4 md:top-6 md:right-6 z-50">
        <LanguageSelector className="transition-opacity" />
      </div>

      {/* Spacer / Header placeholder to center the card vertically */}
      <div className="h-6 w-full" />

      {/* Login Card */}
      <main className="w-full max-w-[448px] rounded-3xl border border-outline bg-surface p-8 md:p-10 shadow-lg transition-all duration-300">
        {/* Logo and Header */}
        <div className="flex flex-col items-center text-center">
          <div className="flex h-11 items-center justify-center rounded-lg bg-white px-3 py-1 shadow-sm border border-slate-100">
            <img src={logoUrl} alt={t('common.logoAlt')} className="h-7 w-auto object-contain" />
          </div>
          <h1 className="mt-6 text-2xl font-normal text-text-primary tracking-tight font-sans">
            {t('auth.loginHeading')}
          </h1>
          <p className="mt-2 text-sm text-text-secondary font-sans">
            {t('auth.subtitle')}
          </p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit((data) => {
            setServerError('');
            mutation.mutate({ username: data.username, password: data.password });
          })}
          className="mt-8 space-y-5"
        >
          {/* Username Input Group */}
          <div className="relative">
            <label className="text-xs font-semibold text-text-secondary mb-1.5 block">
              {t('auth.username')}
            </label>
            <input
              {...register('username')}
              autoComplete="username"
              type="text"
              className="w-full px-3.5 py-2.5 rounded-lg border border-outline bg-transparent text-sm text-text-primary placeholder-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all font-sans"
              placeholder={t('auth.usernamePlaceholder')}
            />
            {errors.username && (
              <p className="mt-1 text-xs text-error">
                {errors.username.message}
              </p>
            )}
          </div>

          {/* Password Input Group */}
          <div className="relative">
            <label className="text-xs font-semibold text-text-secondary mb-1.5 block">
              {t('auth.password')}
            </label>
            <div className="relative">
              <input
                {...register('password')}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                className="w-full pl-3.5 pr-11 py-2.5 rounded-lg border border-outline bg-transparent text-sm text-text-primary placeholder-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all font-sans"
                placeholder={t('auth.passwordPlaceholder')}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-container-high transition-colors"
                aria-label={showPassword ? t('common.aria.hidePassword') : t('common.aria.showPassword')}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.password && (
              <p className="mt-1 text-xs text-error">
                {errors.password.message}
              </p>
            )}
          </div>

          {/* Remember Me Checkbox */}
          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer select-none">
              <input 
                type="checkbox" 
                {...register('remember')} 
                className="rounded border-outline text-primary focus:ring-primary h-3.5 w-3.5"
              />
              <span>{t('auth.remember')}</span>
            </label>
          </div>

          {/* Error Message */}
          {(serverError || sessionMessage) && (
            <div className="rounded-lg border border-error bg-error-container/20 px-3.5 py-2.5 text-xs text-error transition-all font-sans">
              {serverError || (sessionMessage ? t(sessionMessage, { defaultValue: sessionMessage }) : '')}
            </div>
          )}

          {/* Action Buttons (Google Style) */}
          <div className="flex items-center justify-between pt-4">
            <button
              type="button"
              className="text-xs font-semibold text-primary hover:text-primary-hover transition-colors"
              onClick={() => alert(t('auth.contactAdminInfo'))}
            >
              {t('auth.forgotPassword')}
            </button>
            
            <button
              type="submit"
              disabled={mutation.isPending}
              className="px-6 py-2 rounded-full bg-primary hover:bg-primary-hover text-white text-xs font-bold shadow-sm transition-all duration-200 active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[90px]"
            >
              {mutation.isPending ? (
                <svg className="h-4 w-4 animate-spin text-white" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                t('auth.submit', { defaultValue: 'Tiếp theo' })
              )}
            </button>
          </div>
        </form>
      </main>

      {/* Footer (Google Sign-In Style) */}
      <footer className="w-full max-w-[1024px] flex flex-col sm:flex-row items-center justify-center sm:justify-end gap-4 py-4 px-4 text-[11px] text-text-muted">
        {/* Helpful links */}
        <div className="flex items-center gap-6">
          <a href="#" className="hover:text-text-primary transition-colors">{t('common.footer.help')}</a>
          <a href="#" className="hover:text-text-primary transition-colors">{t('common.footer.privacy')}</a>
          <a href="#" className="hover:text-text-primary transition-colors">{t('common.footer.terms')}</a>
        </div>
      </footer>
    </div>
  );
}
