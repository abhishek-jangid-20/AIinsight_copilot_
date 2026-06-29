export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  safelist: [
    // All custom color/opacity combos used in JSX
    "bg-cyan/5", "bg-cyan/8", "bg-cyan/10", "bg-cyan/12", "bg-cyan/15", "bg-cyan/20", "bg-cyan/25",
    "bg-mint/5", "bg-mint/8", "bg-mint/10", "bg-mint/15",
    "bg-violet/5", "bg-violet/8", "bg-violet/10", "bg-violet/15",
    "bg-rose/5", "bg-rose/8", "bg-rose/10",
    "bg-amber/5", "bg-amber/8", "bg-amber/10",
    "bg-line/20", "bg-line/30", "bg-line/40", "bg-line/50", "bg-line/60",
    "bg-card/50", "bg-card/60", "bg-card/70", "bg-card/80",
    "bg-ink/30", "bg-ink/40", "bg-ink/50", "bg-ink/60", "bg-ink/70", "bg-ink/80",
    "bg-panel/30", "bg-panel/40", "bg-panel/50", "bg-panel/60",
    "bg-surface/40",
    "border-cyan/8", "border-cyan/10", "border-cyan/20", "border-cyan/25", "border-cyan/30", "border-cyan/35", "border-cyan/40", "border-cyan/50",
    "border-mint/20", "border-mint/25", "border-mint/30", "border-mint/40",
    "border-violet/20", "border-violet/25", "border-violet/30",
    "border-rose/20", "border-rose/25", "border-rose/30",
    "border-amber/20", "border-amber/25",
    "border-line/40", "border-line/50", "border-line/60", "border-line/70", "border-line/80",
    "text-cyan", "text-mint", "text-violet", "text-amber", "text-rose",
    "shadow-glow", "shadow-glow-sm", "shadow-glow-mint", "shadow-card", "shadow-inner-glow",
    "rounded-xl2", "rounded-xl3",
    "animate-fade-in", "animate-slide-up", "animate-pulse-slow",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        ink:     "#060a12",
        panel:   "#0b1020",
        surface: "#0e1528",
        card:    "#111829",
        line:    "#1d2a42",
        line2:   "#243352",
        cyan:    "#43d9ff",
        mint:    "#62f5c6",
        amber:   "#f7c45f",
        violet:  "#8b73ff",
        rose:    "#f87171",
      },
      boxShadow: {
        glow:          "0 0 40px rgba(67,217,255,0.15)",
        "glow-sm":     "0 0 16px rgba(67,217,255,0.12)",
        "glow-mint":   "0 0 30px rgba(98,245,198,0.12)",
        card:          "0 4px 32px rgba(0,0,0,0.5)",
        "inner-glow":  "inset 0 0 0 1px rgba(67,217,255,0.15)",
      },
      backgroundImage: {
        "glass-card":
          "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
      },
      borderRadius: {
        xl2: "14px",
        xl3: "18px",
      },
      animation: {
        "fade-in":    "fadeIn 0.25s ease both",
        "slide-up":   "slideUp 0.3s ease both",
        "pulse-slow": "pulse 2.5s cubic-bezier(0.4,0,0.6,1) infinite",
      },
      keyframes: {
        fadeIn:  { from: { opacity: "0" }, to: { opacity: "1" } },
        slideUp: {
          from: { opacity: "0", transform: "translateY(10px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
