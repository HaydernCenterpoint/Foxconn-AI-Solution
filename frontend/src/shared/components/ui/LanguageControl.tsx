
import { useId } from 'react';
import { MaterialSymbol } from './MaterialSymbol';
import { useTranslation } from 'react-i18next';
import {
  changeLanguage,
  isSupportedLanguage,
  languageOptions,
} from '../../../app/i18n';

interface LanguageControlProps {
  compact?: boolean;
  className?: string;
}

export function LanguageControl({ compact = false, className = '' }: LanguageControlProps) {
  const { i18n, t } = useTranslation();
  const controlId = useId();
  const currentLanguage = isSupportedLanguage(i18n.resolvedLanguage)
    ? i18n.resolvedLanguage
    : isSupportedLanguage(i18n.language)
      ? i18n.language
      : 'vi';

  return (
    <label className={`language-control ${compact ? 'language-control--compact' : ''} ${className}`.trim()} htmlFor={controlId}>
      {!compact && <span className="language-control__label">{t('common.language.label')}</span>}
      <MaterialSymbol name="language" size={16} className="language-control__icon" />
      <select
        id={controlId}
        className="language-control__select"
        value={currentLanguage}
        aria-label={t('common.aria.languageSelector')}
        onChange={(event) => {
          const nextLanguage = event.currentTarget.value;
          if (isSupportedLanguage(nextLanguage)) {
            void changeLanguage(nextLanguage);
          }
        }}
      >
        {languageOptions.map((option) => (
          <option key={option.code} value={option.code}>{compact ? option.shortLabel : option.label}</option>
        ))}
      </select>
    </label>
  );
}
