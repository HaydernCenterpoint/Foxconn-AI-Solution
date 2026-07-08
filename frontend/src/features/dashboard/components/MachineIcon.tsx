// Highly polished custom Machine SVG Icons representing industrial stations
export const MachineIcon = ({ type }: { type: string }) => {
  if (type === 'feeding') {
    return (
      <svg viewBox="0 0 120 100" className="w-20 h-16 text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.35)]">
        {/* Isometric Platform */}
        <polygon points="20,70 60,85 100,70 60,55" fill="#0A1832" stroke="currentColor" strokeWidth="1.5" />
        <polygon points="20,70 20,75 60,90 60,85" fill="#071228" stroke="currentColor" strokeWidth="1.5" />
        <polygon points="60,85 60,90 100,75 100,70" fill="#050C1C" stroke="currentColor" strokeWidth="1.5" />
        {/* Material Funnel/Chute */}
        <polygon points="50,20 70,20 75,45 45,45" fill="#0E244C" stroke="currentColor" strokeWidth="1.5" />
        <rect x="56" y="45" width="8" height="15" fill="#0E244C" stroke="currentColor" strokeWidth="1.5" />
        {/* Supporting Pillars */}
        <line x1="40" y1="50" x2="40" y2="70" stroke="currentColor" strokeWidth="1.5" />
        <line x1="80" y1="50" x2="80" y2="70" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="60" cy="50" r="2.5" fill="#00E676" />
      </svg>
    );
  }
  if (type === 'cutting') {
    return (
      <svg viewBox="0 0 120 100" className="w-20 h-16 text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.35)]">
        {/* Isometric Platform */}
        <polygon points="20,70 60,85 100,70 60,55" fill="#0A1832" stroke="currentColor" strokeWidth="1.5" />
        <polygon points="20,70 20,75 60,90 60,85" fill="#071228" stroke="currentColor" strokeWidth="1.5" />
        <polygon points="60,85 60,90 100,75 100,70" fill="#050C1C" stroke="currentColor" strokeWidth="1.5" />
        {/* Laser Head Assembly */}
        <rect x="52" y="25" width="16" height="25" rx="1" fill="#0E244C" stroke="currentColor" strokeWidth="1.5" />
        <line x1="60" y1="50" x2="60" y2="68" stroke="#FF5C6C" strokeWidth="2.5" className="animate-pulse" />
        {/* Guide Rails */}
        <line x1="30" y1="40" x2="90" y2="40" stroke="currentColor" strokeWidth="1.2" strokeDasharray="3 3" />
        <circle cx="60" cy="68" r="3" fill="#FF5C6C" />
      </svg>
    );
  }
  if (type === 'stamping') {
    return (
      <svg viewBox="0 0 120 100" className="w-20 h-16 text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.35)]">
        {/* Isometric Platform */}
        <polygon points="20,70 60,85 100,70 60,55" fill="#0A1832" stroke="currentColor" strokeWidth="1.5" />
        <polygon points="20,70 20,75 60,90 60,85" fill="#071228" stroke="currentColor" strokeWidth="1.5" />
        <polygon points="60,85 60,90 100,75 100,70" fill="#050C1C" stroke="currentColor" strokeWidth="1.5" />
        {/* Press Gantry Frame */}
        <polygon points="40,20 80,20 80,65 40,65" fill="none" stroke="currentColor" strokeWidth="2" />
        {/* Stamping Block */}
        <polygon points="48,30 72,30 72,48 48,48" fill="#0E244C" stroke="currentColor" strokeWidth="1.5" />
        {/* Piston shaft */}
        <line x1="60" y1="20" x2="60" y2="30" stroke="currentColor" strokeWidth="3" />
        <circle cx="60" cy="55" r="3.5" fill="#00E676" />
      </svg>
    );
  }
  if (type === 'welding') {
    return (
      <svg viewBox="0 0 120 100" className="w-20 h-16 text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.35)]">
        {/* Isometric Platform */}
        <polygon points="20,70 60,85 100,70 60,55" fill="#0A1832" stroke="currentColor" strokeWidth="1.5" />
        <polygon points="20,70 20,75 60,90 60,85" fill="#071228" stroke="currentColor" strokeWidth="1.5" />
        <polygon points="60,85 60,90 100,75 100,70" fill="#050C1C" stroke="currentColor" strokeWidth="1.5" />
        {/* Robot Arm Pillar */}
        <rect x="55" y="40" width="10" height="20" fill="#0E244C" stroke="currentColor" strokeWidth="1.5" />
        <ellipse cx="60" cy="40" rx="6" ry="3" fill="#0E244C" stroke="currentColor" strokeWidth="1.5" />
        {/* Primary Arm Segment */}
        <line x1="60" y1="40" x2="45" y2="20" stroke="currentColor" strokeWidth="3" />
        <circle cx="45" cy="20" r="4" fill="currentColor" />
        {/* Secondary Arm Segment */}
        <line x1="45" y1="20" x2="70" y2="15" stroke="currentColor" strokeWidth="2.5" />
        <circle cx="70" cy="15" r="3.5" fill="currentColor" />
        {/* Welding Tool Tip & Glowing Spark */}
        <line x1="70" y1="15" x2="80" y2="30" stroke="currentColor" strokeWidth="1.5" />
        <polygon points="78,30 82,30 80,34" fill="#00E676" />
        <circle cx="80" cy="32" r="3" fill="#00E676" className="animate-pulse" />
      </svg>
    );
  }
  if (type === 'assembly') {
    return (
      <svg viewBox="0 0 120 100" className="w-20 h-16 text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.35)]">
        {/* Isometric Platform */}
        <polygon points="20,70 60,85 100,70 60,55" fill="#0A1832" stroke="currentColor" strokeWidth="1.5" />
        <polygon points="20,70 20,75 60,90 60,85" fill="#071228" stroke="currentColor" strokeWidth="1.5" />
        <polygon points="60,85 60,90 100,75 100,70" fill="#050C1C" stroke="currentColor" strokeWidth="1.5" />
        {/* Pick & Place Portal Frame */}
        <path d="M 30,60 L 30,25 L 90,25 L 90,60" fill="none" stroke="currentColor" strokeWidth="2" />
        {/* Slide carriage and Gripper Arm */}
        <rect x="52" y="21" width="16" height="8" rx="1" fill="#0E244C" stroke="currentColor" strokeWidth="1.5" />
        <line x1="60" y1="29" x2="60" y2="48" stroke="currentColor" strokeWidth="2" />
        {/* Gripped Part */}
        <rect x="54" y="48" width="12" height="6" fill="#00E676" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    );
  }
  // packing
  return (
    <svg viewBox="0 0 120 100" className="w-20 h-16 text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.35)]">
      {/* Isometric Platform */}
      <polygon points="20,70 60,85 100,70 60,55" fill="#0A1832" stroke="currentColor" strokeWidth="1.5" />
      <polygon points="20,70 20,75 60,90 60,85" fill="#071228" stroke="currentColor" strokeWidth="1.5" />
      <polygon points="60,85 60,90 100,75 100,70" fill="#050C1C" stroke="currentColor" strokeWidth="1.5" />
      {/* Box design */}
      <polygon points="40,42 60,32 80,42 60,52" fill="#0E244C" stroke="currentColor" strokeWidth="1.5" />
      <polygon points="40,42 40,58 60,68 60,52" fill="#0B2044" stroke="currentColor" strokeWidth="1.5" />
      <polygon points="60,68 60,52 80,42 80,58" fill="#071530" stroke="currentColor" strokeWidth="1.5" />
      {/* Packaging tape line details */}
      <line x1="60" y1="32" x2="60" y2="52" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />
    </svg>
  );
};

