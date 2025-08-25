
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: { primary: "#a6093d", secondary: "#16093d" },
      fontFamily: { avenir: ["Avenir", "system-ui", "Helvetica", "Arial", "sans-serif"] }
    },
  },
  plugins: [],
}
