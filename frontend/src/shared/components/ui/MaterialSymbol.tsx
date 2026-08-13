import './material-symbol.css';

interface MaterialSymbolProps {
  name: string;
  className?: string;
  filled?: boolean;
  size?: number;
  label?: string;
}

export function MaterialSymbol({ name, className = '', filled = false, size, label }: MaterialSymbolProps) {
  return (
    <span
      className={`material-symbol${filled ? ' material-symbol--filled' : ''}${className ? ` ${className}` : ''}`}
      style={size ? { fontSize: size } : undefined}
      translate="no"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {name}
    </span>
  );
}
