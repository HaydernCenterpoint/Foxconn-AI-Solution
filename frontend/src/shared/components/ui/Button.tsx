
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { MaterialSymbol } from './MaterialSymbol';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  startIcon?: ReactNode;
  endIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    startIcon,
    endIcon,
    className = '',
    children,
    disabled,
    type = 'button',
    ...buttonProps
  },
  ref,
) {
  return (
    <button
      {...buttonProps}
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`ui-button ui-button--${variant} ui-button--${size} ${className}`.trim()}
    >
      {loading ? <MaterialSymbol name="progress_activity" size={16} className="animate-spin" /> : startIcon}
      {children && <span className="ui-button__label">{children}</span>}
      {!loading && endIcon}
    </button>
  );
});
