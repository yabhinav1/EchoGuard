export function Logo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="eg-logo" x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2f6fe4" />
          <stop offset="1" stopColor="#0e9f8f" />
        </linearGradient>
      </defs>
      <path d="M16 2.5 4.5 6.8v8.4c0 7.2 4.9 12.3 11.5 14.3 6.6-2 11.5-7.1 11.5-14.3V6.8L16 2.5Z" fill="url(#eg-logo)" />
      <path d="M10.6 16.2l3.6 3.6 7.2-7.5" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
