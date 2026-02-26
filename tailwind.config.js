/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        inter: ['Inter', 'sans-serif'],
      },
      colors: {
        primary: 'var(--primary)',
        'primary-alt': 'var(--primary-alt)',
        secondary: 'var(--secondary)',
      },
      fontSize: {
        xxs: ['0.625rem', { lineHeight: '1rem' }],
        xs: ['0.75rem', { lineHeight: '1.125rem' }],
        sm: ['0.875rem', { lineHeight: '1.45rem' }],
        base: ['1rem', { lineHeight: '1.5rem' }],
        lg: ['1.125rem', { lineHeight: '1.75rem' }],
        xl: ['1.25rem', { lineHeight: '1.5rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['2rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.375rem', { lineHeight: '3.25rem' }],
        '5xl': ['3rem', { lineHeight: '1' }],
        '6xl': ['3.875rem', { lineHeight: '1' }],
        '7xl': ['4.5rem', { lineHeight: '1' }],
        '8xl': ['5.75rem', { lineHeight: '1.43' }],
        '9xl': ['7.25rem', { lineHeight: '94.828%' }],
      },
    },
  },
  plugins: [],
};
