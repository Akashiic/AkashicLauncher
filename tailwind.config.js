/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        void: { 950: '#06070A', 900: '#090A0F', 800: '#0E1017', 700: '#12141D', 600: '#191C28', 500: '#232737' },
        aether: { 300: '#B9A4FF', 400: '#9D82FF', 500: '#7C5CFF', 600: '#6243F0' },
        rune: { 300: '#7FF3E6', 400: '#3FE0D0', 500: '#14C8B8' },
        ember: { 400: '#FFB45C', 500: '#FF9533' },
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(124,92,255,.35), 0 8px 40px -8px rgba(124,92,255,.55)',
        'glow-rune': '0 0 0 1px rgba(63,224,208,.35), 0 8px 40px -8px rgba(63,224,208,.45)',
      },
    },
  },
  plugins: [],
}
