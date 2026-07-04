/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Data-dense dark dashboard palette
        surface: {
          900: '#0b0f14',
          800: '#11161d',
          700: '#1a212b',
          600: '#232c38',
          500: '#2f3a48',
        },
        accent: {
          DEFAULT: '#3ba776',
          400: '#4cc78f',
          600: '#2f8a61',
        },
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
