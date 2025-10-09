/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#4F46E5",
        secondary: "#6366F1",
        background: "#0B1020",
      },
      boxShadow: {
        "xl-dark": "0px 10px 30px rgba(0, 0, 0, 0.3)",
      },
      backdropBlur: {
        xl: '24px',
      },
    },
  },
  plugins: [],
};