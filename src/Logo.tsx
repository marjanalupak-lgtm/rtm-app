// RTM tree logo: branches (derived requirements) grow from a trunk; roots below (the business need).
// "Every request has a root."
export function TreeLogo({ size = 64, tone = 'light' }: { size?: number; tone?: 'light' | 'dark' }) {
  const ink = tone === 'light' ? '#FFFFFF' : '#303240'
  const leaf = tone === 'light' ? '#BFE3FF' : '#0E77D3'
  const root = tone === 'light' ? '#8FF0AE' : '#2E8040'
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="RTM tree logo">
      <g fill="none" stroke={ink} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M32 40V27" />
        <path d="M32 27 L19 16" /><path d="M32 27 L45 16" /><path d="M32 27 V10" />
        <path d="M19 16 L12 9" /><path d="M45 16 L52 9" />
      </g>
      <g fill="none" stroke={root} strokeWidth="2.6" strokeLinecap="round">
        <path d="M32 40 C32 47 24 49 18 56" />
        <path d="M32 40 C32 48 32 52 32 58" />
        <path d="M32 40 C32 47 40 49 46 56" />
      </g>
      <path d="M14 40 H50" stroke={ink} strokeOpacity="0.45" strokeWidth="2" strokeLinecap="round" />
      <g fill={leaf}>
        <circle cx="32" cy="9" r="4" /><circle cx="19" cy="16" r="3.6" /><circle cx="45" cy="16" r="3.6" />
        <circle cx="12" cy="9" r="3" /><circle cx="52" cy="9" r="3" />
      </g>
      <circle cx="32" cy="27" r="3.4" fill={ink} />
      <g fill={root}><circle cx="18" cy="56" r="3" /><circle cx="32" cy="58" r="3.4" /><circle cx="46" cy="56" r="3" /></g>
    </svg>
  )
}
