/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        /* Padrão Dash (base ArtDash) — o tema de TODAS as páginas internas */
        dash: {
          bg: "#121416",
          side: "#181c1f",
          card: "#161719",
          raise: "#32393e",
          line: "#25292c",
          line2: "#24272a",
          muted: "#888b93",
          dim: "#555a5f",
          brand: "#ff751f",
          brandHi: "#ff8f4d",
          ok: "#8effa2",
          warn: "#ffdd9d",
          bad: "#ff96a0",
        },
        mirai: {
          50: "#e0f7ff",
          100: "#b3eeff",
          200: "#80e5ff",
          300: "#4ddbff",
          400: "#26d1ff",
          500: "#00c8ff",
          600: "#00a8d6",
          700: "#0088ad",
          800: "#006885",
          900: "#00485c",
        },
      },
      fontFamily: {
        poppins: ["var(--fonte-poppins)", "Poppins", "system-ui", "sans-serif"],
        public: ["var(--fonte-public)", "Public Sans", "system-ui", "sans-serif"],
      },
      animation: {
        "pulse-glow": "pulse-glow 3s ease-in-out infinite",
        "orb-breathe": "orb-breathe 4s ease-in-out infinite",
        "spin-slow": "spin-slow 20s linear infinite",
        "neon-pulse": "neon-pulse 2s ease-in-out infinite",
        "fade-in": "fade-in 0.3s ease-out",
        "slide-up": "slide-up 0.4s ease-out",
      },
      keyframes: {
        "pulse-glow": {
          "0%, 100%": { opacity: "0.4", transform: "scale(1)" },
          "50%": { opacity: "0.8", transform: "scale(1.05)" },
        },
        "orb-breathe": {
          "0%, 100%": { transform: "scale(1)", filter: "brightness(1)" },
          "50%": { transform: "scale(1.03)", filter: "brightness(1.2)" },
        },
        "spin-slow": {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
        "neon-pulse": {
          "0%, 100%": {
            boxShadow:
              "0 0 10px rgba(0, 240, 255, 0.3), 0 0 20px rgba(0, 240, 255, 0.3)",
          },
          "50%": {
            boxShadow:
              "0 0 20px rgba(0, 240, 255, 0.3), 0 0 40px rgba(0, 240, 255, 0.3), 0 0 60px rgba(0, 240, 255, 0.3)",
          },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(20px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
