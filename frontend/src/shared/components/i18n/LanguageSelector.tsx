import { useState, useRef, useEffect } from 'react';
import { Check, Globe, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  changeLanguage,
  isSupportedLanguage,
  languageOptions,
  type SupportedLanguage,
} from '../../../app/i18n';

interface Props {
  compact?: boolean;
  className?: string;
}

export function LanguageSelector({ compact = false, className = '' }: Props) {
  const { i18n, t } = useTranslation();
  const currentLanguage = isSupportedLanguage(i18n.language) ? i18n.language : 'vi';
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (code: SupportedLanguage) => {
    void changeLanguage(code);
    setIsOpen(false);
  };

  const currentOption = languageOptions.find((opt) => opt.code === currentLanguage) || languageOptions[0];

  const getLangMeta = (code: SupportedLanguage) => {
    switch (code) {
      case 'vi':
        return {
          badge: 'VI',
          flag: '🇻🇳',
          textColor: 'text-red-600 dark:text-red-400',
          bgColor: 'bg-red-500/10 dark:bg-red-500/20',
          borderColor: 'border-red-500/20'
        };
      case 'en':
        return {
          badge: 'EN',
          flag: '🇺🇸',
          textColor: 'text-blue-600 dark:text-blue-400',
          bgColor: 'bg-blue-500/10 dark:bg-blue-500/20',
          borderColor: 'border-blue-500/20'
        };
      case 'zh-CN':
        return {
          badge: 'ZH',
          flag: '🇨🇳',
          textColor: 'text-amber-600 dark:text-amber-400',
          bgColor: 'bg-amber-500/10 dark:bg-amber-500/20',
          borderColor: 'border-amber-500/20'
        };
    }
  };

  const currentMeta = getLangMeta(currentOption.code);

  return (
    <div ref={dropdownRef} className={`relative inline-block text-left ${className}`} style={{ zIndex: 100 }}>
      <div className="flex items-center gap-2">
        {!compact && (
          <span className="text-[10px] font-bold uppercase tracking-wider opacity-70" style={{ color: 'var(--color-on-surface-variant)' }}>
            {t('common.language.label')}
          </span>
        )}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`group inline-flex h-9 items-center justify-between gap-2 text-xs font-semibold transition-all duration-300 active:scale-95 cursor-pointer focus:outline-none ${
            compact ? 'px-1' : 'rounded-xl border px-3 shadow-sm hover:shadow'
          }`}
          style={{
            minWidth: compact ? 'auto' : '9.5rem',
            backgroundColor: compact ? 'transparent' : (isOpen ? 'var(--color-surface-container-high)' : 'var(--color-surface-container-low)'),
            borderColor: compact ? 'transparent' : (isOpen ? 'var(--color-primary)' : 'var(--color-outline-variant)'),
            color: 'var(--color-on-surface)',
            boxShadow: compact ? 'none' : (isOpen ? '0 0 0 2px rgba(26, 115, 232, 0.2)' : 'var(--shadow-1)'),
          }}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
        >
          <div className="flex items-center gap-1.5 truncate">
            <Globe 
              size={13} 
              className="shrink-0 transition-transform duration-500 ease-out group-hover:rotate-45"
              style={{ color: isOpen ? 'var(--color-primary)' : 'var(--color-on-surface-variant)' }} 
            />
            {!compact && (
              <span className="truncate pr-1 text-xs font-bold leading-none">
                {currentOption.label}
              </span>
            )}
            <span className={`px-1 py-0.5 rounded text-[9px] font-extrabold tracking-wide border leading-none shrink-0 ${currentMeta.bgColor} ${currentMeta.textColor} ${currentMeta.borderColor}`}>
              {currentMeta.badge}
            </span>
          </div>
          <ChevronDown
            size={12}
            className={`shrink-0 transition-transform duration-300 ease-in-out ${isOpen ? 'rotate-180 text-[var(--color-primary)]' : 'text-[var(--color-on-surface-variant)]'}`}
          />
        </button>
      </div>

      <ul
        className="absolute right-0 mt-2 w-52 origin-top-right overflow-hidden rounded-xl border p-1.5 shadow-xl transition-all duration-200 ease-out backdrop-blur-md"
        role="listbox"
        style={{
          boxShadow: 'var(--shadow-4)',
          transform: isOpen ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(-8px)',
          opacity: isOpen ? 1 : 0,
          visibility: isOpen ? 'visible' : 'hidden',
          pointerEvents: isOpen ? 'auto' : 'none',
          backgroundColor: '#07142C',
          borderColor: 'rgba(32, 198, 226, 0.25)',
        }}
      >
        <div className="px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wider opacity-60 border-b border-outline-variant/30 mb-1" style={{ color: 'var(--color-on-surface-variant)' }}>
          {t('common.language.current', { defaultValue: 'CHỌN NGÔN NGỮ' })}
        </div>
        {languageOptions.map((option) => {
          const isSelected = option.code === currentLanguage;
          const meta = getLangMeta(option.code);
          return (
            <li
              key={option.code}
              role="option"
              aria-selected={isSelected}
              onClick={() => handleSelect(option.code)}
              className="group flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-xs font-semibold transition-all duration-150 relative overflow-hidden hover:bg-surface-container-high"
              style={{
                backgroundColor: isSelected ? 'var(--color-accent-container)' : 'transparent',
                color: isSelected ? 'var(--color-primary)' : 'var(--color-on-surface)',
              }}
            >
              <div 
                className={`absolute left-0 top-0 bottom-0 w-[3px] bg-primary transition-transform duration-200 ${isSelected ? 'scale-y-100' : 'scale-y-0 group-hover:scale-y-100'}`} 
                style={{ backgroundColor: 'var(--color-primary)' }}
              />
              
              <div className="flex items-center gap-2 pl-1.5">
                <span className="font-semibold text-xs transition-transform duration-200 group-hover:translate-x-0.5">
                  {option.label}
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                <span className={`px-1 py-0.5 rounded text-[8px] font-extrabold border leading-none ${meta.bgColor} ${meta.textColor} ${meta.borderColor}`}>
                  {meta.badge}
                </span>
                {isSelected && (
                  <Check size={13} style={{ color: 'var(--color-primary)' }} className="shrink-0 animate-in zoom-in-50 duration-200" />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
