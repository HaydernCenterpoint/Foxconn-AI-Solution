import type { ReactNode } from 'react';

interface Props {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function PanelFrame({ title, aside, children, className = '', bodyClassName = 'p-5' }: Props) {
  return (
    <section className={`bg-surface-1 border border-border rounded-lg shadow-sm ${className}`}>
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border-subtle rounded-t-lg">
        <h2 className="text-sm font-bold text-text-primary tracking-wide">{title}</h2>
        {aside}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
