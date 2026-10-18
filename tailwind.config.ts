import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#FBF7F0",
        ink: "#1E2A26",
        muted: "#6B7A74",
        line: "#EDE6DA",
        primary: {
          DEFAULT: "#0B6B4F",
          soft: "#E6F2EC",
          deep: "#07503B",
        },
        saffron: { DEFAULT: "#F2A93B", soft: "#FDF3E0" },
        brick: { DEFAULT: "#C8412F", soft: "#FBEAE7" },
        amberw: { DEFAULT: "#E0A100", soft: "#FBF3DA" },
        night: {
          bg: "#141B18",
          card: "#1C2622",
          line: "#2A3631",
          ink: "#EDF3EF",
          muted: "#9AA8A2",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        urdu: ["var(--font-nastaliq)", "Noto Nastaliq Urdu", "serif"],
      },
      borderRadius: { "2xl": "1rem", "3xl": "1.5rem" },
      boxShadow: {
        soft: "0 1px 2px rgba(30,42,38,0.04), 0 4px 16px rgba(30,42,38,0.06)",
        lift: "0 8px 30px rgba(30,42,38,0.12)",
      },
      keyframes: {
        flash: {
          "0%": { backgroundColor: "rgba(242,169,59,0.28)" },
          "100%": { backgroundColor: "transparent" },
        },
        pulseRing: {
          "0%": { transform: "scale(0.95)", opacity: "0.7" },
          "70%": { transform: "scale(1.35)", opacity: "0" },
          "100%": { transform: "scale(1.35)", opacity: "0" },
        },
        wave: {
          "0%,100%": { transform: "scaleY(0.35)" },
          "50%": { transform: "scaleY(1)" },
        },
        slideUp: {
          "0%": { transform: "translateY(14px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
      },
      animation: {
        flash: "flash 1.6s ease-out 0s 1",
        pulseRing: "pulseRing 1.6s cubic-bezier(0.4,0,0.6,1) infinite",
        wave: "wave 0.9s ease-in-out infinite",
        slideUp: "slideUp 0.22s ease-out",
        shimmer: "shimmer 1.4s linear infinite",
      },
    },
  },
  plugins: [],
};
export default config;
