/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}", // ✅ Includes Next.js App Router
    "./pages/**/*.{js,ts,jsx,tsx}", // ✅ Includes traditional Next.js pages
    "./components/**/*.{js,ts,jsx,tsx}", // ✅ Includes all components
  ],
  theme: {
    extend: {
      colors: {
        primary: "#4F46E5", // Custom Primary Color
        secondary: "#6366F1", // Custom Secondary Color
        background: "#F9FAFB", // Custom Background Color
      },
      boxShadow: {
        "xl-dark": "0px 10px 30px rgba(0, 0, 0, 0.3)", // Enhanced Shadow
      },
      keyframes: {
        "trail": {
          "0%": { "--angle": "0deg" },
          "100%": { "--angle": "360deg" },
        },
      },
    },
    animation: {
      "trail": "trail var(--duration) linear infinite",
    },
  },
  plugins: [],
};