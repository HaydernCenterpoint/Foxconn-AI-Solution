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
  // Determine color theme based on alertSeverity
  let borderColorClass = 'border-[#14356a]';
  let accentColorClass = 'border-[#00ADB5]'; // Default teal accent
  let bgClass = 'bg-[#0A1129]/80';
  let shadowClass = 'shadow-[0_4px_15px_rgba(0,0,0,0.3)]';
  let titleColorClass = 'text-[#00ADB5]';
  let dotColorClass = 'bg-[#00ADB5]';

  if (alertSeverity === 'error') {
    borderColorClass = 'border-red-500/40';
    accentColorClass = 'border-red-500';
    bgClass = 'bg-[#1a0c10]/95';
    shadowClass = 'shadow-[0_0_20px_rgba(239,68,68,0.15)]';
    titleColorClass = 'text-red-400';
    dotColorClass = 'bg-red-500';
  } else if (alertSeverity === 'warning') {
    borderColorClass = 'border-amber-500/45';
    accentColorClass = 'border-amber-500';
    bgClass = 'bg-[#17130a]/95';
    shadowClass = 'shadow-[0_0_20px_rgba(245,158,11,0.12)]';
    titleColorClass = 'text-amber-400';
    dotColorClass = 'bg-amber-500';
  } else if (alertSeverity === 'info') {
    borderColorClass = 'border-blue-500/40';
    accentColorClass = 'border-blue-400';
    bgClass = 'bg-[#0A1430]/90';
    shadowClass = 'shadow-[0_4px_15px_rgba(0,0,0,0.35)]';
    titleColorClass = 'text-blue-400';
    dotColorClass = 'bg-blue-400';
  } else if (alertSeverity === 'normal') {
    borderColorClass = 'border-[#14356a]';
    accentColorClass = 'border-cyan-400';
    bgClass = 'bg-[#0A1129]/80';
    titleColorClass = 'text-cyan-400';
    dotColorClass = 'bg-cyan-400';
  }

  return (
    <div className={`relative overflow-hidden rounded-none border ${borderColorClass} ${bgClass} p-5 ${shadowClass} ${className}`}>
      {/* Decals (Pointer Events Disabled) */}
      <div className="absolute inset-0 pointer-events-none select-none z-0">
        <div className={`absolute top-0 left-0 w-3.5 h-3.5 border-t-2 border-l-2 ${accentColorClass}`} />
        <div className={`absolute top-0 right-0 w-3.5 h-3.5 border-t-2 border-r-2 ${accentColorClass}`} />
        <div className={`absolute bottom-0 left-0 w-3.5 h-3.5 border-b-2 border-l-2 ${accentColorClass}`} />
        <div className={`absolute bottom-0 right-0 w-3.5 h-3.5 border-b-2 border-r-2 ${accentColorClass}`} />
      </div>

      {/* Header if Title exists */}
      {title && (
        <div className="flex items-center justify-between border-b border-[#14356a]/40 pb-4 mb-4 select-none relative z-10">
          <h3 className={`text-sm font-black uppercase tracking-wider ${titleColorClass} flex items-center gap-2`}>
            <span className={`h-2 w-2 rounded-full ${dotColorClass} ${alertSeverity === 'error' || alertSeverity === 'warning' ? 'animate-pulse' : ''}`} />
            {title}
          </h3>
          {extraHeader && <div className="flex items-center">{extraHeader}</div>}
        </div>
      )}

      {/* Content */}
      <div className="relative z-10 w-full h-full">
        {children}
      </div>
    </div>
  );
}
