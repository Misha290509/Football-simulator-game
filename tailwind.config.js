/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // "Neon matchnight" palette — violet-black surfaces, an electric volt
        // accent (the modern football-game signature), magenta for energy and
        // gold reserved for elite ratings/trophies.
        surface: {
          900: '#08060f',
          800: '#100c1c',
          700: '#1a1530',
          600: '#2e2650',
          500: '#3d3366',
        },
        accent: {
          DEFAULT: '#a3e635',
          400: '#bef264',
          600: '#65a30d',
        },
        volt: '#d4f04a',
        neon: {
          violet: '#8b5cf6',
          magenta: '#d946ef',
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
        glow: '0 0 24px rgba(163, 230, 53, 0.3)',
      },
    },
  },
  plugins: [],
};
