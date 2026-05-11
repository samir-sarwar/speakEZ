import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#15131a",
        coral: "#ff6b6b",
        mango: "#ffb000",
        mint: "#42d392",
        aqua: "#29b6f6",
        lilac: "#8b5cf6"
      },
      boxShadow: {
        glow: "0 24px 80px rgba(41, 182, 246, 0.18)"
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
} satisfies Config;
