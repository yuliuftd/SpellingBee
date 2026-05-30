interface BeeIconProps {
  size?: 'sm' | 'md' | 'lg';
  floating?: boolean;
  rotation?: number;
}

export default function BeeIcon({ size = 'md', floating = false, rotation = 0 }: BeeIconProps) {
  const sizeMap = {
    sm: 24,
    md: 32,
    lg: 40,
  };

  const width = sizeMap[size];
  const animationClass = floating ? 'animate-bounce' : '';

  return (
    <div
      className={animationClass}
      style={floating ? { animationDuration: '2s' } : undefined}
    >
      <svg
        width={width}
        height={width}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ transform: `rotate(${rotation}deg)` }}
      >
        {/* Bee body */}
        <ellipse
          cx="20"
          cy="22"
          rx="8"
          ry="10"
          fill="#FCD34D"
          stroke="#B8860B"
          strokeWidth="1.5"
        />
        {/* Bee head */}
        <circle cx="20" cy="10" r="6" fill="#FCD34D" stroke="#B8860B" strokeWidth="1.5" />
        {/* Eyes */}
        <circle cx="17" cy="8" r="1.5" fill="#000" />
        <circle cx="23" cy="8" r="1.5" fill="#000" />
        {/* Antenna */}
        <path
          d="M 19 4 Q 17 2 16 1"
          stroke="#B8860B"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M 21 4 Q 23 2 24 1"
          stroke="#B8860B"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
        />
        {/* Stripes */}
        <rect x="14" y="19" width="12" height="2" fill="#B8860B" opacity="0.7" />
        <rect x="14" y="25" width="12" height="2" fill="#B8860B" opacity="0.7" />
        {/* Wings left */}
        <ellipse
          cx="12"
          cy="18"
          rx="5"
          ry="8"
          fill="#E0F2FE"
          opacity="0.8"
          stroke="#0EA5E9"
          strokeWidth="1"
        />
        {/* Wings right */}
        <ellipse
          cx="28"
          cy="18"
          rx="5"
          ry="8"
          fill="#E0F2FE"
          opacity="0.8"
          stroke="#0EA5E9"
          strokeWidth="1"
        />
        {/* Legs */}
        <line x1="16" y1="30" x2="14" y2="35" stroke="#B8860B" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="20" y1="31" x2="20" y2="36" stroke="#B8860B" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="24" y1="30" x2="26" y2="35" stroke="#B8860B" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}
