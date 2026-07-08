import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './en';
import { vi } from './vi';
import { zhCN } from './zh-CN';

export const SUPPORTED_LANGUAGES = ['vi', 'en', 'zh-CN'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_STORAGE_KEY = 'app.language';

export const languageOptions: Array<{
  code: SupportedLanguage;
  label: string;
  shortLabel: string;
  intlLocale: string;
}> = [
  { code: 'vi', label: 'Tiếng Việt', shortLabel: 'VI', intlLocale: 'vi-VN' },
  { code: 'en', label: 'English', shortLabel: 'EN', intlLocale: 'en-US' },
  { code: 'zh-CN', label: '简体中文', shortLabel: '中文', intlLocale: 'zh-CN' },
];

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return typeof value === 'string' && SUPPORTED_LANGUAGES.includes(value as SupportedLanguage);
}

function normalizeLanguage(value: unknown): SupportedLanguage {
  if (isSupportedLanguage(value)) return value;
  if (value === 'zh') return 'zh-CN';
  return 'vi';
}

function detectInitialLanguage(): SupportedLanguage {
  if (typeof window === 'undefined') return 'vi';

  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (isSupportedLanguage(stored)) return stored;
  if (stored) {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'vi');
    return 'vi';
  }

  const legacy = window.localStorage.getItem('mkz-language');
  if (legacy) {
    const normalizedLegacy = normalizeLanguage(legacy);
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, normalizedLegacy);
    return normalizedLegacy;
  }

  const browserLanguage = window.navigator.languages?.[0] ?? window.navigator.language;
  if (browserLanguage?.toLowerCase().startsWith('zh-cn')) return 'zh-CN';
  if (browserLanguage?.toLowerCase().startsWith('en')) return 'en';
  if (browserLanguage?.toLowerCase().startsWith('vi')) return 'vi';

  return 'vi';
}

const resources = {
  vi: { translation: vi },
  en: { translation: en },
  'zh-CN': { translation: zhCN },
} as const;

void i18n.use(initReactI18next).init({
  resources,
  lng: detectInitialLanguage(),
  fallbackLng: 'vi',
  returnEmptyString: false,
  interpolation: { escapeValue: false },
  missingKeyHandler: (_, __, key) => {
    if (import.meta.env.DEV) {
      console.warn(`[i18n] Missing translation key: ${key}`);
    }
  },
});

function applyDocumentLanguage(language: string) {
  const normalized = normalizeLanguage(language);
  document.documentElement.lang = normalized;
  document.documentElement.dir = 'ltr';
}

if (typeof document !== 'undefined') {
  applyDocumentLanguage(i18n.language);
}

i18n.on('languageChanged', (language) => {
  const normalized = normalizeLanguage(language);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, normalized);
  }
  if (typeof document !== 'undefined') {
    applyDocumentLanguage(normalized);
  }
});

export function changeLanguage(language: SupportedLanguage) {
  return i18n.changeLanguage(language);
}

export function getCurrentLanguage(): SupportedLanguage {
  return normalizeLanguage(i18n.language);
}

export default i18n;
