import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

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
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value) || options[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={dropdownRef} className={`relative min-w-[140px] select-none ${className}`}>
      {/* Dropdown Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-outline bg-surface px-3.5 py-2 text-xs font-semibold text-text-primary hover:bg-surface-container-high transition-all active:scale-[0.98] focus:outline-none focus:ring-1 focus:ring-primary shadow-sm"
      >
        <span className="truncate">
          {labelPrefix && <span className="text-text-muted mr-1.5 font-bold uppercase tracking-wider">{labelPrefix}</span>}
          {selectedOption?.label}
        </span>
        <ChevronDown
          size={14}
          className={`text-text-secondary transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Options Dropdown Overlay */}
      {isOpen && (
        <ul className="absolute right-0 z-50 mt-1 w-full min-w-[160px] rounded-lg border border-outline bg-surface py-1 text-xs font-semibold text-text-primary shadow-lg ring-1 ring-black/5 focus:outline-none max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-100">
          {options.map((option) => (
            <li key={String(option.value)}>
              <button
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`flex w-full items-center px-3.5 py-2.5 text-left transition-colors hover:bg-surface-container-high ${
                  option.value === value
                    ? 'bg-primary-light text-primary font-bold'
                    : 'text-text-primary'
                }`}
              >
                <span className="truncate">{option.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
