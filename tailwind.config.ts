import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        fantasy: {
          bg: "#0B0E14",
          card: "#151A23",
          border: "#232A38",
          primary: "#3B82F6",
          accent: "#10B981",
          danger: "#EF4444",
          gold: "#F59E0B",
          text: "#F3F4F6",
          muted: "#9CA3AF",
        },
      },
    },
  },
  plugins: [],
};
export default config;
