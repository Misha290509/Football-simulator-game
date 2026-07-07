/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // "Stadium at night" palette — deep navy blacks with an electric
        // pitch-green accent and a gold reserved for elite ratings/trophies.
        surface: {
          900: '#05080d',
          800: '#0b111a',
          700: '#151e2b',
          600: '#26364b',
          500: '#33455e',
        },
        accent: {
          DEFAULT: '#1fb35b',
          400: '#34d977',
          600: '#178a47',
        },
        gold: {
          DEFAULT: '#f0c948',
          600: '#c9a227',
        },
      },
      fontFamily: {
        // Condensed broadcast type for headings, scorelines and big numbers.
        display: ['Oswald', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 24px rgba(31, 179, 91, 0.25)',
      },
    },
  },
  plugins: [],
};
