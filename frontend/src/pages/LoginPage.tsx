import { useEffect, useId, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { Eye, EyeOff, KeyRound, UserRound, Globe2, ArrowRight } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authApi } from '../features/auth/services/auth.api';
import logoUrl from '../assets/Foxconn_Industrial_Internet.png';
import { Button } from '../shared/components/ui/Button';
import { IconButton } from '../shared/components/ui/IconButton';
import { Surface } from '../shared/components/ui/Surface';
import { useAuthStore } from '../shared/store/auth.store';
import { changeLanguage, languageOptions, isSupportedLanguage } from '../app/i18n';
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
  const [langOpen, setLangOpen] = useState(false);
  const usernameId = useId();
  const passwordId = useId();
  const usernameErrorId = useId();
  const passwordErrorId = useId();
  const supportInfoId = useId();

  const currentLang = isSupportedLanguage(i18n.resolvedLanguage)
    ? i18n.resolvedLanguage
    : isSupportedLanguage(i18n.language) ? i18n.language : 'vi';
  const currentOpt = languageOptions.find(o => o.code === currentLang) ?? languageOptions[0];

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
  } = useForm<LoginFormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (isSubmitted) void trigger();
  }, [i18n.language, isSubmitted, trigger]);

  const mutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: (data) => {
      login(data.token, data.username, data.role);
      navigate('/admin', { replace: true });
    },
    onError: () => setServerError(t('auth.errors.serverRejected')),
  });

  if (isAuthenticated && !welcomePending) return <Navigate to="/admin" replace />;

  const errorMessage = serverError || (sessionMessage ? t(sessionMessage, { defaultValue: sessionMessage }) : '');

  return (
    <div className="login-clean min-h-[100dvh] flex flex-col bg-[#FCFCFB] text-black">
      <header className="h-[56px] shrink-0 flex items-center justify-between px-6 lg:px-8 border-b border-zinc-200 bg-white/80 backdrop-blur sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <img src={logoUrl} alt={t('common.logoAlt')} className="h-[28px] w-auto object-contain" />
          <span className="hidden sm:inline text-[11px] tracking-[0.14em] uppercase text-black ml-2 border-l border-zinc-200 pl-3">
            {t('common.systemName')}
          </span>
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setLangOpen(v => !v)}
            aria-label={t('common.aria.languageSelector')}
            aria-expanded={langOpen}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-zinc-200 bg-white text-[12px] font-medium text-black hover:bg-zinc-50 transition"
          >
            <Globe2 size={14} aria-hidden="true" className="text-black" /> {currentOpt.shortLabel}
            <span className="text-black text-[10px]">▼</span>
          </button>
          {langOpen && (
            <div className="absolute right-0 top-[calc(100%+8px)] min-w-[160px] rounded-xl border border-zinc-200 bg-white shadow-lg overflow-hidden py-1 z-30">
              {languageOptions.map(opt => (
                <button
                  key={opt.code}
                  type="button"
                  onClick={() => { void changeLanguage(opt.code); setLangOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-[13px] text-black hover:bg-zinc-50 flex items-center justify-between ${opt.code === currentLang ? 'font-semibold bg-zinc-50' : ''}`}
                >
                  <span>{opt.label}</span>
                  <span className="text-[11px] text-black">{opt.shortLabel}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <main className="relative flex-1 flex items-center justify-center p-6 sm:p-8 overflow-hidden" aria-labelledby="login-heading">
        {/* Expanded background decoration */}
        <div className="absolute inset-0 bg-[#FCFCFB]" aria-hidden="true" />
        <div className="login-clean__grid" aria-hidden="true" />
        <div className="absolute -top-24 -right-24 w-[720px] h-[720px] rounded-full bg-[#E8EEFF] opacity-60" aria-hidden="true" />
        <div className="absolute -bottom-32 -left-32 w-[720px] h-[720px] rounded-full bg-[#FFF0F1] opacity-50 blur-[40px]" aria-hidden="true" />

        <div className="relative w-full max-w-[420px]">
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 text-[11px] tracking-[0.16em] uppercase text-black">
              <span className="w-6 h-[1px] bg-black/20" /> Industrial Operations
            </div>
            <h1 id="login-heading" className="mt-3 text-[28px] sm:text-[32px] font-semibold tracking-[-0.02em] leading-[1.05] text-black">
              Monitor <span className="font-normal">production</span> in real time.
            </h1>
            <p className="mt-2 text-[13px] leading-5 text-black max-w-[34ch] mx-auto">{t('common.systemDescription')}</p>
          </div>

          <div className="bg-white rounded-[24px] border border-zinc-200 shadow-[0_8px_40px_rgba(0,0,0,0.06)] p-7 sm:p-8">
            <div className="mb-6">
              <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-black">{t('auth.loginHeading')}</h2>
              <p className="mt-1 text-[13px] text-black">{t('auth.subtitle')}</p>
            </div>

            <form
              className="space-y-4"
              noValidate
              aria-busy={mutation.isPending || undefined}
              onChange={() => { if (serverError) setServerError(''); }}
              onSubmit={handleSubmit((data) => {
                setServerError('');
                mutation.mutate({ username: data.username.trim(), password: data.password });
              })}
            >
              <div className="space-y-2">
                <label htmlFor={usernameId} className="text-[12px] font-medium text-black">{t('auth.username')}</label>
                <div className="relative">
                  <UserRound size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-black pointer-events-none" aria-hidden="true" />
                  <input
                    {...register('username')}
                    id={usernameId}
                    type="text"
                    autoComplete="username"
                    placeholder={t('auth.usernamePlaceholder')}
                    disabled={mutation.isPending}
                    aria-invalid={Boolean(errors.username)}
                    aria-describedby={errors.username ? usernameErrorId : undefined}
                    className="w-full h-[44px] pl-10 pr-3 rounded-xl border border-zinc-200 bg-white text-[14px] text-black placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#0B1D5A]/10 focus:border-[#0B1D5A] transition"
                  />
                </div>
                {errors.username && <p id={usernameErrorId} className="text-[12px] text-[#E30613]" role="alert">{errors.username.message}</p>}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor={passwordId} className="text-[12px] font-medium text-black">{t('auth.password')}</label>
                  <button type="button" onClick={() => setShowSupportInfo(v => !v)} className="text-[12px] text-black hover:text-black underline decoration-zinc-300 underline-offset-4">
                    {t('auth.forgotPassword')}
                  </button>
                </div>
                <div className="relative">
                  <KeyRound size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-black pointer-events-none" aria-hidden="true" />
                  <input
                    {...register('password')}
                    id={passwordId}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder={t('auth.passwordPlaceholder')}
                    disabled={mutation.isPending}
                    aria-invalid={Boolean(errors.password)}
                    aria-describedby={errors.password ? passwordErrorId : undefined}
                    className="w-full h-[44px] pl-10 pr-10 rounded-xl border border-zinc-200 bg-white text-[14px] text-black placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#0B1D5A]/10 focus:border-[#0B1D5A] transition"
                  />
                  <IconButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-black"
                    icon={showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                    label={showPassword ? t('common.aria.hidePassword') : t('common.aria.showPassword')}
                    aria-pressed={showPassword}
                    disabled={mutation.isPending}
                    onClick={() => setShowPassword(v => !v)}
                  />
                </div>
                {errors.password && <p id={passwordErrorId} className="text-[12px] text-[#E30613]" role="alert">{errors.password.message}</p>}
              </div>

              {errorMessage && (
                <Surface variant="outlined" padding="sm" role="alert" className="flex items-start gap-2 border-[#E30613]/30 bg-[#E30613]/[0.06] text-black rounded-xl">
                  <span className="text-[#E30613] mt-0.5">●</span>
                  <p className="m-0 text-[13px] text-black">{errorMessage}</p>
                </Surface>
              )}

              <Button type="submit" size="lg" className="w-full h-[44px] rounded-xl bg-[#0B1D5A] hover:bg-[#0A1848] text-white border-[#0B1D5A] flex items-center justify-center gap-2" loading={mutation.isPending}>
                {mutation.isPending ? t('auth.submitting') : t('auth.submit')} {!mutation.isPending && <ArrowRight size={16} aria-hidden="true" />}
              </Button>
            </form>

            <div className="mt-4 text-center">
              {showSupportInfo && <p id={supportInfoId} role="status" className="text-[12px] text-black leading-relaxed">{t('auth.contactAdminInfo')}</p>}
            </div>

            <div className="pt-4 flex items-center gap-3 text-[11px] text-black">
              <span className="h-[1px] flex-1 bg-zinc-200" />
              <span className="tracking-wide">SECURE FACTORY SSO</span>
              <span className="h-[1px] flex-1 bg-zinc-200" />
            </div>
          </div>

          <p className="mt-6 text-center text-[11px] tracking-wide text-black">{t('common.versionLabel')} · Foxconn Industrial Internet</p>
        </div>
      </main>
    </div>
  );
}
