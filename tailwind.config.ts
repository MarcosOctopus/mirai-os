/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        /* Padrão Dash — os tokens apontam para CANAIS RGB em variáveis CSS
           (globals.css). Dois motivos, e os dois importam:
           1) o TEMA (escuro/claro) troca só as variáveis — nenhuma classe muda;
           2) `/85`, `/10` continuam funcionando, porque o Tailwind injeta o alfa
              no `<alpha-value>`. Um hex fixo aqui impediria os dois.
           `fg` é a TINTA (o que era `text-white`); `hair` é o FIO (o que era
           `border-white/`, `bg-white/`): brancos no escuro, pretos no claro. */
        dash: {
          bg: "rgb(var(--dash-bg) / <alpha-value>)",
          side: "rgb(var(--dash-side) / <alpha-value>)",
          card: "rgb(var(--dash-card) / <alpha-value>)",
          raise: "rgb(var(--dash-raise) / <alpha-value>)",
          line: "rgb(var(--dash-line) / <alpha-value>)",
          line2: "rgb(var(--dash-line2) / <alpha-value>)",
          fg: "rgb(var(--dash-fg) / <alpha-value>)",
          hair: "rgb(var(--dash-hair) / <alpha-value>)",
          scrim: "rgb(var(--dash-scrim) / <alpha-value>)",
          muted: "rgb(var(--dash-muted) / <alpha-value>)",
          dim: "rgb(var(--dash-dim) / <alpha-value>)",
          brand: "rgb(var(--dash-brand) / <alpha-value>)",
          brandHi: "rgb(var(--dash-brandHi) / <alpha-value>)",
          ok: "rgb(var(--dash-ok) / <alpha-value>)",
          warn: "rgb(var(--dash-warn) / <alpha-value>)",
          bad: "rgb(var(--dash-bad) / <alpha-value>)",
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
