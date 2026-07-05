import type { Config } from 'tailwindcss';

// The palette lives in CSS variables (globals.css) so dark mode can retheme
// every token — including `white`, which acts as the card/surface color — by
// flipping variables under `.dark` instead of touching every component.
const v = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './context/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        white: v('--c-surface'),
        sky: {
          50: v('--c-sky-50'),
          100: v('--c-sky-100'),
          200: v('--c-sky-200'),
          300: v('--c-sky-300'),
          400: v('--c-sky-400'),
          500: v('--c-sky-500'),
        },
        beige: {
          50: v('--c-beige-50'),
          100: v('--c-beige-100'),
          200: v('--c-beige-200'),
          300: v('--c-beige-300'),
        },
        brand: {
          black: v('--c-brand-black'),
          dark: v('--c-brand-dark'),
          mid: v('--c-brand-mid'),
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};

export default config;
