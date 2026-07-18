interface MachineIconProps {
  type: string;
}

export const MachineIcon = ({ type }: MachineIconProps) => {
  const detail = type === 'welding'
    ? <path d="M43 28 61 44l17-12M61 44v20" />
    : type === 'cutting'
      ? <><path d="M34 30h52M60 30v32" /><circle cx="60" cy="46" r="7" /></>
      : type === 'stamping'
        ? <><path d="M42 26h36v12H42zM60 38v20" /><path d="M45 64h30" /></>
        : type === 'feeding'
          ? <><path d="M47 25h26l-5 23H52z" /><path d="M60 48v16" /></>
          : type === 'assembly'
            ? <><path d="M36 31h48v28" /><path d="M60 31v25M53 56h14" /></>
            : <><path d="m43 43 17-10 17 10-17 10z" /><path d="M43 43v17l17 10 17-10V43" /></>;

  return (
    <svg
      viewBox="0 0 120 100"
      className="h-16 w-20"
      role="img"
      aria-label={type}
      style={{ color: 'var(--color-primary)' }}
    >
      <path
        d="M28 70h64l-12 16H40z"
        fill="var(--color-surface-container-high)"
        stroke="currentColor"
        strokeWidth="2"
      />
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {detail}
      </g>
    </svg>
  );
};
