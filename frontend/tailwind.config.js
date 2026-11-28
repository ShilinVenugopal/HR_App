/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        // Deep navy / electric indigo — primary brand scale. Keys/shape are
        // unchanged from before (50-900) so every existing `brand-*` class
        // across the app keeps working; only the hues moved to a richer,
        // more premium navy-indigo direction.
        brand: {
          50: '#eef1ff',
          100: '#e0e5ff',
          200: '#c6ccfc',
          300: '#a3aaf8',
          400: '#7c7ff1',
          500: '#5b57e8',
          600: '#463dd6',
          700: '#3830b0',
          800: '#262260',
          900: '#161337',
          950: '#0a0919',
        },
        // Cyan/teal accent — used sparingly for gradients, glows and
        // highlight details alongside the navy/indigo primary.
        accent: {
          50: '#ecfeff',
          100: '#cffafe',
          200: '#a5f3fc',
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
          700: '#0e7490',
          800: '#155e75',
          900: '#164e63',
        },
      },
      boxShadow: {
        soft: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)',
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 8px 24px -8px rgb(15 23 42 / 0.10)',
        'card-hover': '0 4px 12px 0 rgb(15 23 42 / 0.06), 0 16px 32px -12px rgb(15 23 42 / 0.16)',
        glow: '0 0 0 1px rgb(70 61 214 / 0.08), 0 8px 24px -6px rgb(70 61 214 / 0.35)',
      },
      keyframes: {
        'fade-in': { from: { opacity: 0 }, to: { opacity: 1 } },
        'scale-in': { from: { opacity: 0, transform: 'scale(0.96) translateY(4px)' }, to: { opacity: 1, transform: 'scale(1) translateY(0)' } },
        shimmer: { from: { backgroundPosition: '200% 0' }, to: { backgroundPosition: '-200% 0' } },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'scale-in': 'scale-in 160ms cubic-bezier(0.16, 1, 0.3, 1)',
        shimmer: 'shimmer 2s linear infinite',
      },
    },
  },
  plugins: [],
};
