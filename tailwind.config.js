/**
 * Tailwind lê TODAS as cores/fontes/raios de src/theme/tokens.css.
 * A paleta padrão do Tailwind está desativada de propósito: nenhuma cor
 * fora do tema pode ser usada.
 * @type {import('tailwindcss').Config}
 */
const v = (name) => `color-mix(in srgb, var(${name}) calc(<alpha-value> * 100%), transparent)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      inherit: 'inherit',
      bg: v('--bg-base'),
      surface: v('--surface'),
      'surface-2': v('--surface-2'),
      track: v('--track'),
      line: v('--border'),
      'line-strong': v('--border-strong'),
      brand: v('--brand'),
      'brand-hover': v('--brand-hover'),
      accent: v('--accent'),
      'accent-strong': v('--accent-strong'),
      'accent-text': v('--accent-strong-text'),
      fg: v('--text'),
      muted: v('--text-muted'),
      subtle: v('--text-subtle'),
      disabled: v('--text-disabled'),
      danger: v('--danger'),
      'danger-text': v('--danger-text'),
      success: v('--success'),
      warning: v('--warning'),
      overlay: v('--overlay'),
      shade: v('--shade'),
    },
    fontFamily: {
      display: 'var(--font-display)',
      sans: 'var(--font-body)',
      mono: 'var(--font-mono)',
    },
    borderRadius: {
      none: '0',
      sm: 'var(--radius-xs)',
      DEFAULT: 'var(--radius-sm)',
      md: 'var(--radius-sm)',
      lg: 'var(--radius-sm)',
      xl: 'var(--radius-md)',
      '2xl': 'var(--radius-lg)',
      '3xl': 'var(--radius-xl)',
      full: 'var(--radius-pill)',
    },
    boxShadow: {
      none: 'none',
      glow: 'var(--shadow-glow)',
      'glow-strong': 'var(--shadow-glow-strong)',
      popover: 'var(--shadow-popover)',
    },
    extend: {
      transitionTimingFunction: { 'out-expo': 'var(--ease-out-expo)' },
      letterSpacing: { display: 'var(--tracking-display)', label: 'var(--tracking-label)' },
    },
  },
  plugins: [],
}
