/**
 * Shared Fincura logo — a shield shape with ₹ symbol,
 * representing "protecting/growing your money".
 */
export default function FincuraLogo({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0 }}
      aria-label="Fincura logo"
    >
      {/* Shield shape */}
      <path
        d="M20 2 L36 10 Q38 11 38 13 L38 22 Q38 32 20 42 Q2 32 2 22 L2 13 Q2 11 4 10 Z"
        fill="#1a472a"
      />
      {/* Inner glow */}
      <path
        d="M20 6 L33 12.5 Q34 13 34 14.5 L34 22 Q34 30 20 38 Q6 30 6 22 L6 14.5 Q6 13 7 12.5 Z"
        fill="#2e7d52"
      />
      {/* ₹ symbol */}
      <text
        x="20"
        y="27"
        textAnchor="middle"
        fontFamily="DM Sans, Arial, sans-serif"
        fontWeight="700"
        fontSize="18"
        fill="white"
      >
        ₹
      </text>
      {/* Growth arrow accent */}
      <path
        d="M27 14 L31 10 L31 14"
        stroke="white"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.85"
      />
    </svg>
  )
}
