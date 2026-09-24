/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Deep navy shell
        navy: { 950: '#050b1f', 900: '#0a1433', 800: '#0f1d47', 700: '#16285e', 600: '#1f3578' },
        // Electric blue primary
        brand: { 50: '#eef5ff', 100: '#d9e8ff', 200: '#b6d3ff', 300: '#84b4ff', 400: '#4f8cff', 500: '#2a6bff', 600: '#1a4ff0', 700: '#163fcc', 800: '#1837a3', 900: '#1a3380' },
        // Cyan / teal accent
        accent: { 300: '#67e8f9', 400: '#22d3ee', 500: '#06b6d4', 600: '#0891b2' },
      },
      fontFamily: { sans: ['"Segoe UI Variable"', '"Segoe UI"', 'Inter', 'system-ui', 'sans-serif'] },
      boxShadow: {
        card: '0 1px 2px rgba(10,20,51,0.06), 0 4px 16px -4px rgba(10,20,51,0.08)',
        glow: '0 0 0 1px rgba(42,107,255,0.25), 0 6px 24px -6px rgba(42,107,255,0.45)',
      },
      keyframes: {
        'fade-in': { from: { opacity: 0, transform: 'translateY(4px)' }, to: { opacity: 1, transform: 'none' } },
      },
      animation: { 'fade-in': 'fade-in 180ms ease-out' },
    },
  },
  plugins: [],
};
