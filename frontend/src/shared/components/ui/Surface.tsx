import type { HTMLAttributes, ReactNode } from 'react';

type SurfaceVariant = 'default' | 'quiet' | 'raised' | 'outlined';
type SurfacePadding = 'none' | 'sm' | 'md' | 'lg';

interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  variant?: SurfaceVariant;
  padding?: SurfacePadding;
}

export function Surface({
  children,
  variant = 'default',
  padding = 'md',
  className = '',
  ...divProps
}: SurfaceProps) {
  return (
    <div
      {...divProps}
      className={`ui-surface ui-surface--${variant} ui-surface--padding-${padding} ${className}`.trim()}
    >
      {children}
    </div>
  );
}
