/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#020203',
        card: 'rgba(2, 2, 3, 0.9)',
        text: {
          primary: '#FFFFFF',
          secondary: 'rgba(255, 255, 255, 0.66)',
        },
        border: {
          primary: 'rgba(255, 255, 255, 0.03)',
          secondary: 'rgba(255, 255, 255, 0.08)',
          dashed: 'rgba(255, 255, 255, 0.13)',
        },
        accent: '#627eea',
      },
      fontFamily: {
        hyperwave: ['Hyperwave', 'sans-serif'],
        work: ['Work Sans', 'sans-serif'],
      },
      backdropBlur: {
        'custom': '50px',
      },
    },
  },
  plugins: [],
}