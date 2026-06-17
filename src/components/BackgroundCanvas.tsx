"use client";

import { useEffect, useMemo, useRef } from "react";

type OrbStatus = "idle" | "listening" | "thinking" | "speaking" | "executing" | "done";

const STAR_COUNT = 420;
const DATA_COLUMNS = 7;
const GLYPHS = ["01", "10", "A7", "F0", "∴", "◇", "λ", "µ", "Ψ", "M", "R", "∞"];

interface Star {
  x: number;
  y: number;
  size: number;
  opacity: number;
  drift: number;
  delay: number;
  duration: number;
}

const STATUS_GLOW: Record<OrbStatus, string> = {
  idle: "rgba(10,239,255,",
  listening: "rgba(0,255,135,",
  thinking: "rgba(176,38,255,",
  speaking: "rgba(255,45,120,",
  executing: "rgba(255,107,53,",
  done: "rgba(255,255,255,",
};

function NeuralCanvas({ status }: { status?: OrbStatus }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frame = 0;
    let raf = 0;
    const nodes = Array.from({ length: 72 }, () => ({
      x: Math.random(),
      y: Math.random(),
      vx: (Math.random() - 0.5) * 0.00035,
      vy: (Math.random() - 0.5) * 0.00035,
      phase: Math.random() * Math.PI * 2,
    }));

    const resize = () => {
      canvas.width = Math.floor(window.innerWidth * window.devicePixelRatio);
      canvas.height = Math.floor(window.innerHeight * window.devicePixelRatio);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
    };

    const draw = () => {
      frame += 0.008;
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      // Reactively get status from DOM attribute
      const el = canvas.closest("[data-status]");
      const currentStatus = (el?.getAttribute("data-status") || "idle") as OrbStatus;
      const glow = STATUS_GLOW[currentStatus] || STATUS_GLOW.idle;

      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < -0.05) n.x = 1.05;
        if (n.x > 1.05) n.x = -0.05;
        if (n.y < -0.05) n.y = 1.05;
        if (n.y > 1.05) n.y = -0.05;
      }

      ctx.lineWidth = 0.45;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = (a.x - b.x) * w;
          const dy = (a.y - b.y) * h;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 170) {
            const alpha = (1 - d / 170) * 0.045 * (0.6 + Math.sin(frame + a.phase) * 0.4);
            ctx.strokeStyle = `${glow}${alpha})`;
            ctx.beginPath();
            ctx.moveTo(a.x * w, a.y * h);
            ctx.lineTo(b.x * w, b.y * h);
            ctx.stroke();
          }
        }
      }

      for (const n of nodes) {
        const pulse = 0.35 + Math.sin(frame * 2 + n.phase) * 0.25;
        ctx.fillStyle = `${glow}${0.06 + pulse * 0.05})`;
        ctx.beginPath();
        ctx.arc(n.x * w, n.y * h, 1.1 + pulse, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };

    resize();
    draw();
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={ref} className="absolute inset-0 opacity-80" />;
}

export default function BackgroundCanvas({ status = "idle" }: { status?: OrbStatus }) {
  const stars = useMemo<Star[]>(() => Array.from({ length: STAR_COUNT }, () => ({
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: 0.4 + Math.random() * 1.8,
    opacity: 0.08 + Math.random() * 0.32,
    drift: (Math.random() - 0.5) * 24,
    delay: Math.random() * 18,
    duration: 4 + Math.random() * 9,
  })), []);

  const columns = useMemo(() => Array.from({ length: DATA_COLUMNS }, (_, i) => ({
    left: i < 3 ? 4 + i * 8 : 72 + (i - 3) * 7,
    top: 8 + Math.random() * 72,
    delay: Math.random() * 18,
    duration: 28 + Math.random() * 26,
    color: i % 3 === 0
      ? "rgba(176,38,255,0.045)"
      : "rgba(10,239,255,0.055)",
    glyphs: Array.from({ length: 44 }, () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)]),
  })), []);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#03040d]">
      <div className="absolute inset-0 mirai-deep-gradient" />
      <div className="absolute inset-0 mirai-grid" />
      <div className="absolute inset-0 mirai-grid-perspective" />
      <NeuralCanvas status={status} />

      <div className="absolute inset-0">
        {stars.map((star, i) => (
          <span
            key={i}
            className="mirai-star absolute rounded-full"
            style={{
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: star.size,
              height: star.size,
              opacity: star.opacity,
              animationDuration: `${star.duration}s`,
              animationDelay: `${star.delay}s`,
              "--drift-x": `${star.drift}px`,
            } as React.CSSProperties}
          />
        ))}
      </div>

      {columns.map((column, i) => (
        <div
          key={i}
          className="absolute hidden sm:block font-mono text-[8px] leading-[2.2] tracking-[0.45em] mirai-data-rain"
          style={{
            left: `${column.left}%`,
            top: `${column.top}%`,
            color: column.color,
            animationDelay: `${column.delay}s`,
            animationDuration: `${column.duration}s`,
          }}
        >
          {[...column.glyphs, ...column.glyphs].map((g, n) => <div key={n}>{g}</div>)}
        </div>
      ))}

      <div className="absolute inset-x-0 top-[-10%] h-px mirai-scan-beam" />
      <div className="absolute inset-x-0 top-[-35%] h-px mirai-scan-beam secondary" />
      <div className="absolute inset-0 mirai-radial-crosshair" />
      <div className="absolute inset-0 mirai-scanlines" />
      <div className="absolute inset-0 mirai-vignette" />
    </div>
  );
}
