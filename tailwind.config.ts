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
        ink: "#07070a",
        panel: "#101118",
        line: "rgba(255,255,255,0.1)",
        acid: "#b8ff4d",
        pulse: "#ff4d8d",
        wave: "#48e5c2"
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "ui-sans-serif", "system-ui"]
      },
      boxShadow: {
        glow: "0 0 70px rgba(184, 255, 77, 0.14)"
      }
    }
  },
  plugins: []
};

export default config;
