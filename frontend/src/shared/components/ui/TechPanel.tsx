import React from 'react';

interface TechPanelProps {
  children: React.ReactNode;
  className?: string;
  alertSeverity?: 'error' | 'warning' | 'info' | 'normal';
  title?: string;
  extraHeader?: React.ReactNode;
}

export function TechPanel({
  children,
  className = '',
  alertSeverity = 'normal',
  title,
  extraHeader,
}: TechPanelProps) {
  let borderColorClass = 'border-[#3d3d3d]';
  let accentColorClass = 'bg-[#ef4444]';
  let backgroundClass = 'bg-[#1d1d1d]';
  let titleColorClass = 'text-[#f8f8f8]';
  let dotColorClass = 'bg-[#ef4444]';

  if (alertSeverity === 'error') {
    borderColorClass = 'border-[#7c3639]';
    accentColorClass = 'bg-[#ef4444]';
    backgroundClass = 'bg-[#221b1c]';
    titleColorClass = 'text-[#ffd9d9]';
    dotColorClass = 'bg-[#ff737b]';
  } else if (alertSeverity === 'warning') {
    borderColorClass = 'border-[#6a5529]';
    accentColorClass = 'bg-[#e7b950]';
    backgroundClass = 'bg-[#211f1a]';
    titleColorClass = 'text-[#ffe8ae]';
    dotColorClass = 'bg-[#e7b950]';
  } else if (alertSeverity === 'info') {
    borderColorClass = 'border-[#3d4f62]';
    accentColorClass = 'bg-[#8aa9c8]';
    backgroundClass = 'bg-[#1d2024]';
    titleColorClass = 'text-[#e6edf4]';
    dotColorClass = 'bg-[#8aa9c8]';
  }

  return (
    <section className={`relative overflow-hidden rounded-2xl border ${borderColorClass} ${backgroundClass} p-4 md:p-5 ${className}`}>
      <div className={`absolute inset-y-0 left-0 w-1 ${accentColorClass}`} aria-hidden="true" />

      {title && (
        <header className="relative z-10 mb-4 flex items-center justify-between gap-3 border-b border-[#373737] pb-3">
          <h3 className={`flex items-center gap-2 text-[15px] font-semibold ${titleColorClass}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${dotColorClass}`} aria-hidden="true" />
            {title}
          </h3>
          {extraHeader && <div className="flex items-center">{extraHeader}</div>}
        </header>
      )}

      <div className="relative z-10 h-full w-full">
        {children}
      </div>
    </section>
  );
}
