import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  changeLanguage,
  isSupportedLanguage,
  languageOptions,
  type SupportedLanguage,
} from '../../../app/i18n';
import './language-selector.css';

interface Props {
  compact?: boolean;
  className?: string;
}

export function LanguageSelector({ compact = false, className = '' }: Props) {
  const { i18n, t } = useTranslation();
  const currentLanguage = isSupportedLanguage(i18n.language) ? i18n.language : 'vi';
  const [isOpen, setIsOpen] = useState(false);
  const listboxId = useId();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLLIElement | null>>([]);
  const currentOption = languageOptions.find((option) => option.code === currentLanguage) ?? languageOptions[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const selectedIndex = languageOptions.findIndex((option) => option.code === currentLanguage);
    const focusOption = window.requestAnimationFrame(() => {
      optionRefs.current[Math.max(0, selectedIndex)]?.focus();
    });

    return () => window.cancelAnimationFrame(focusOption);
  }, [currentLanguage, isOpen]);

  const closeAndRestoreFocus = () => {
    setIsOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const handleSelect = (code: SupportedLanguage) => {
    void changeLanguage(code);
    closeAndRestoreFocus();
  };

  const handleOptionKeyDown = (event: React.KeyboardEvent<HTMLLIElement>, index: number) => {
    const lastIndex = languageOptions.length - 1;
    let nextIndex: number;

    switch (event.key) {
      case 'ArrowDown':
        nextIndex = index === lastIndex ? 0 : index + 1;
        break;
      case 'ArrowUp':
        nextIndex = index === 0 ? lastIndex : index - 1;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = lastIndex;
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        handleSelect(languageOptions[index].code);
        return;
      case 'Escape':
        event.preventDefault();
        closeAndRestoreFocus();
        return;
      case 'Tab':
        setIsOpen(false);
        return;
      default:
        return;
    }

    event.preventDefault();
    optionRefs.current[nextIndex]?.focus();
  };

  return (
    <div
      ref={dropdownRef}
      className={`language-selector${compact ? ' language-selector--compact' : ''}${className ? ` ${className}` : ''}`}
    >
      {!compact && <span className="language-selector__field-label">{t('common.language.label')}</span>}

      <button
        type="button"
        ref={triggerRef}
        className={`language-selector__trigger${isOpen ? ' language-selector__trigger--open' : ''}`}
        onClick={() => setIsOpen((open) => !open)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setIsOpen(true);
          } else if (event.key === 'Escape' && isOpen) {
            event.preventDefault();
            closeAndRestoreFocus();
          }
        }}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={listboxId}
      >
        <Globe size={16} strokeWidth={1.8} aria-hidden="true" />
        {!compact && <span className="language-selector__current-label">{currentOption.label}</span>}
        <span className="language-selector__code">{currentOption.shortLabel}</span>
        <ChevronDown
          size={14}
          strokeWidth={1.8}
          className={`language-selector__chevron${isOpen ? ' language-selector__chevron--open' : ''}`}
          aria-hidden="true"
        />
      </button>

      <ul
        id={listboxId}
        className={`language-selector__menu${isOpen ? ' language-selector__menu--open' : ''}`}
        role="listbox"
        aria-label={t('common.language.label')}
      >
        <li role="presentation" className="language-selector__menu-heading">
          <span>{t('common.language.label')}</span>
          <strong>{currentOption.shortLabel}</strong>
        </li>

        {languageOptions.map((option, index) => {
          const isSelected = option.code === currentLanguage;

          return (
            <li
              key={option.code}
              ref={(element) => {
                optionRefs.current[index] = element;
              }}
              className={`language-selector__option${isSelected ? ' language-selector__option--selected' : ''}`}
              role="option"
              aria-selected={isSelected}
              tabIndex={isOpen && isSelected ? 0 : -1}
              onClick={() => handleSelect(option.code)}
              onKeyDown={(event) => handleOptionKeyDown(event, index)}
            >
              <span className="language-selector__option-label">{option.label}</span>
              <span className="language-selector__option-end">
                <span className="language-selector__code">{option.shortLabel}</span>
                {isSelected && <Check size={15} strokeWidth={2.2} aria-hidden="true" />}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
