import { forwardRef, type ReactNode } from 'react';
import { Button, type ButtonProps } from './Button';

interface IconButtonProps extends Omit<ButtonProps, 'children' | 'startIcon' | 'endIcon'> {
  icon: ReactNode;
  label: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, className = '', size = 'md', ...buttonProps },
  ref,
) {
  return (
    <Button
      {...buttonProps}
      ref={ref}
      size={size}
      className={`ui-icon-button ${className}`.trim()}
      aria-label={label}
      title={buttonProps.title ?? label}
    >
      {icon}
    </Button>
  );
});
