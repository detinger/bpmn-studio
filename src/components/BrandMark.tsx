/** Logo: start event, task and gateway connected by a flow. */
export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <circle cx="6" cy="16" r="3.6" stroke="currentColor" strokeWidth="2" />
      <rect x="12" y="11" width="9" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M26.5 12l4 4-4 4-4-4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M9.6 16H12M21 16h1.5" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
