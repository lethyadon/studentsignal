interface SignalMarkProps {
  size?: number;
  className?: string;
}

export function SignalMark({ size = 32, className = '' }: SignalMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect width="32" height="32" rx="8" fill="#0d9488" />
      {/* Central dot */}
      <circle cx="16" cy="21" r="2.5" fill="white" />
      {/* Inner arc */}
      <path
        d="M 11 17.5 Q 16 10.5 21 17.5"
        stroke="white"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
        strokeOpacity="0.75"
      />
      {/* Outer arc */}
      <path
        d="M 7.5 14 Q 16 4 24.5 14"
        stroke="white"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
        strokeOpacity="0.4"
      />
    </svg>
  );
}

