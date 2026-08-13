import './material-symbol.css';

interface MaterialSymbolProps {
  name: string;
  className?: string;
  filled?: boolean;
  size?: number;
}

export function MaterialSymbol({ name, className = '', filled = false, size }: MaterialSymbolProps) {
  return (
    <span
      className={`material-symbol${filled ? ' material-symbol--filled' : ''}${className ? ` ${className}` : ''}`}
      style={size ? { fontSize: size } : undefined}
      translate="no"
      aria-hidden="true"
    >
      {name}
    </span>
  );
}
