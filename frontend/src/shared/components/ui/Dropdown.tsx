import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

export interface DropdownOption<T = string | number> {
  value: T;
  label: React.ReactNode;
}

interface DropdownProps<T = string | number> {
  value: T;
  onChange: (value: T) => void;
  options: DropdownOption<T>[];
  labelPrefix?: string;
  className?: string;
}

export function Dropdown<T = string | number>({
  value,
  onChange,
  options,
  labelPrefix,
  className = '',
}: DropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();

  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const activeOptionIndex = options.length === 0 ? 0 : Math.min(activeIndex, options.length - 1);
  const selectedOption = options[selectedIndex];

  const close = (restoreFocus = false) => {
    setIsOpen(false);
    if (restoreFocus) {
      window.setTimeout(() => triggerRef.current?.focus(), 0);
    }
  };

  const openAt = (index: number) => {
    if (options.length === 0) return;
    setActiveIndex(Math.min(Math.max(index, 0), options.length - 1));
    setIsOpen(true);
  };

  const selectOption = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    close(true);
  };

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        close();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const focusTimer = window.setTimeout(() => optionRefs.current[activeOptionIndex]?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [activeOptionIndex, isOpen]);

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        openAt(selectedIndex);
        break;
      case 'ArrowUp':
        event.preventDefault();
        openAt(selectedIndex);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (isOpen) close();
        else openAt(selectedIndex);
        break;
      case 'Escape':
        if (isOpen) {
          event.preventDefault();
          close();
        }
        break;
      default:
        break;
    }
  };

  const handleOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActiveIndex((index + 1) % options.length);
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActiveIndex((index - 1 + options.length) % options.length);
        break;
      case 'Home':
        event.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        event.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        selectOption(index);
        break;
      case 'Escape':
        event.preventDefault();
        close(true);
        break;
      case 'Tab':
        close();
        break;
      default:
        break;
    }
  };

  return (
    <div ref={dropdownRef} className={`ui-dropdown ${className}`.trim()}>
      <button
        ref={triggerRef}
        type="button"
        className="ui-dropdown__trigger"
        onClick={() => (isOpen ? close() : openAt(selectedIndex))}
        onKeyDown={handleTriggerKeyDown}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        disabled={options.length === 0}
      >
        <span className="ui-dropdown__value">
          {labelPrefix && <span className="ui-dropdown__prefix">{labelPrefix}</span>}
          {selectedOption?.label}
        </span>
        <ChevronDown size={16} className={`ui-dropdown__chevron ${isOpen ? 'is-open' : ''}`} aria-hidden="true" />
      </button>

      {isOpen && (
        <ul id={listboxId} className="ui-dropdown__menu" role="listbox">
          {options.map((option, index) => (
            <li key={String(option.value)}>
              <button
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                type="button"
                role="option"
                aria-selected={option.value === value}
                tabIndex={index === activeOptionIndex ? 0 : -1}
                className={`ui-dropdown__option ${option.value === value ? 'is-selected' : ''}`}
                onClick={() => selectOption(index)}
                onFocus={() => setActiveIndex(index)}
                onKeyDown={(event) => handleOptionKeyDown(event, index)}
              >
                <span className="ui-dropdown__option-label">{option.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
