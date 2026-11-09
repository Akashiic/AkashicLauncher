/** Logo de quatro quadrados da Microsoft (botões de login). */
export function MicrosoftLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 21 21" aria-hidden>
      <rect x="1" y="1" width="9" height="9" style={{ fill: 'var(--ms-red)' }} />
      <rect x="11" y="1" width="9" height="9" style={{ fill: 'var(--ms-green)' }} />
      <rect x="1" y="11" width="9" height="9" style={{ fill: 'var(--ms-blue)' }} />
      <rect x="11" y="11" width="9" height="9" style={{ fill: 'var(--ms-yellow)' }} />
    </svg>
  )
}
