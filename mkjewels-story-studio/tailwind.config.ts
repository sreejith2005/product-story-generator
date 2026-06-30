import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        cream: "#f7f4ef",
        porcelain: "#ffffff",
        charcoal: "#050505",
        ink: "#24201b",
        gold: "#c99a4a",
        stone: "#d7c3a0",
        sage: "#16633f",
        brand: {
          black: "#050505",
          gold: "#c99a4a",
          "gold-light": "#f1d08a",
          champagne: "#fff8ea",
          ivory: "#f7f4ef",
          graphite: "#24201b",
          line: "#d7c3a0"
        }
      },
      fontFamily: {
        serif: ["var(--font-playfair)", "Georgia", "serif"],
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"]
      },
      boxShadow: {
        soft: "0 18px 60px rgba(5, 5, 5, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
