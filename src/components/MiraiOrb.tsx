"use client";

import { useEffect, useRef, useState } from "react";

/* ================================================================== */
/*  MIRAI ORB — Núcleo de inteligência vivo                           */
/*  Neurônios, hexágonos, anéis holográficos, partículas orbitais     */
/* ================================================================== */

interface MiraiOrbProps {
  status: "idle" | "listening" | "thinking" | "speaking" | "executing" | "done";
  executingAction?: string;
  audioLevel?: number;
}

const COLORS = {
  idle: "#0aefff",
  listening: "#00ff87",
  thinking: "#b026ff",
  speaking: "#ff2d78",
  executing: "#ff6b35",
  done: "#00ff87",
} as const;

const NEURAL_NODES = 10;
const HEX_RINGS = 3;

/* ── Neural network (dots + connection lines) ── */

function NeuralNetwork({ color, pulse = false }: { color: string; pulse?: boolean }) {
  const cx = 104, cy = 104, radius = 72;
  const nodes = Array.from({ length: NEURAL_NODES }, (_, i) => {
    const angle = (i / NEURAL_NODES) * Math.PI * 2 - Math.PI / 2;
    const r = radius + (Math.random() - 0.5) * 30;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
      size: 2 + Math.random() * 2,
      delay: Math.random() * 5,
    };
  });

  return (
    <svg
      className="absolute inset-0 w-full h-full"
      viewBox="0 0 208 208"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Connection lines */}
      {nodes.map((n, i) => {
        const next = nodes[(i + 1) % nodes.length];
        const skip = nodes[(i + 3) % nodes.length];
        return (
          <g key={`lines-${i}`}>
            <line
              x1={n.x} y1={n.y} x2={next.x} y2={next.y}
              stroke={color}
              strokeWidth={0.5}
              opacity={0.15}
              className={pulse ? "mirai-neural-pulse" : ""}
              style={{ animationDelay: `${n.delay}s` }}
            />
            <line
              x1={n.x} y1={n.y} x2={skip.x} y2={skip.y}
              stroke={color}
              strokeWidth={0.3}
              opacity={0.08}
              className={pulse ? "mirai-neural-pulse" : ""}
              style={{ animationDelay: `${(n.delay + 2) % 5}s` }}
            />
          </g>
        );
      })}
      {/* Nodes */}
      {nodes.map((n, i) => (
        <circle
          key={i}
          cx={n.x} cy={n.y} r={n.size}
          fill={color}
          opacity={0.6}
          className={pulse ? "mirai-neural-node" : ""}
          style={{ animationDelay: `${n.delay}s` }}
        />
      ))}
    </svg>
  );
}

/* ── Hexagonal rings ── */

function HexRings({ color }: { color: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      {Array.from({ length: HEX_RINGS }, (_, i) => {
        const size = 100 + i * 30;
        const speed = 20 + i * 10;
        return (
          <svg
            key={i}
            className="absolute orbital-ring"
            style={{ "--speed": `${speed}s` } as React.CSSProperties}
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            fill="none"
          >
            <polygon
              points={Array.from({ length: 6 }, (_, j) => {
                const a = (j / 6) * Math.PI * 2 - Math.PI / 2;
                const r = size / 2 - 2;
                const x = size / 2 + r * Math.cos(a);
                const y = size / 2 + r * Math.sin(a);
                return `${x},${y}`;
              }).join(" ")}
              stroke={color}
              strokeWidth={0.5 + (1 - i / HEX_RINGS) * 0.5}
              opacity={0.2 + (1 - i / HEX_RINGS) * 0.08}
            />
          </svg>
        );
      })}
    </div>
  );
}

/* ── Core glow ── */

function CoreGlow({ color, scale = 1 }: { color: string; scale?: number }) {
  return (
    <div
      className="absolute inset-0 rounded-full orb-idle"
      style={{
        background: `radial-gradient(circle at 35% 35%, rgba(255,255,255,0.6), ${color}aa 35%, ${color}55 55%, ${color}22 75%, transparent 92%)`,
        boxShadow: `0 0 60px ${color}55, 0 0 120px ${color}33, inset 0 0 80px ${color}22`,
        transform: `scale(${scale})`,
      }}
    />
  );
}

/* ── Listening equalizer ── */

function ListeningBars({ color, level }: { color: string; level: number }) {
  return (
    <>
      <CoreGlow color={color} scale={1.1} />
      {Array.from({ length: 16 }, (_, i) => {
        const angle = (i / 16) * 360;
        const h = Math.max(8, level * 60 * (0.5 + Math.random() * 0.5));
        return (
          <div
            key={i}
            className="absolute left-1/2 top-1/2"
            style={{
              width: 2,
              height: h,
              marginLeft: -1,
              borderRadius: 1,
              transform: `rotate(${angle}deg) translateY(-96px)`,
              background: color,
              opacity: 0.4 + level * 0.6,
              boxShadow: `0 0 8px ${color}`,
              transition: "height 0.08s ease, opacity 0.1s ease",
            }}
          />
        );
      })}
    </>
  );
}

/* ── Thinking rings ── */

function ThinkingRings({ color }: { color: string }) {
  return (
    <>
      <CoreGlow color={color} scale={1.15} />
      <NeuralNetwork color={color} pulse />
      <HexRings color={color} />
    </>
  );
}

/* ── Speaking waves ── */

function SpeakingWaves({ color }: { color: string }) {
  return (
    <>
      <CoreGlow color={color} scale={1.1} />
      <NeuralNetwork color={color} pulse />
      {[0, 0.5, 1.0, 1.5].map((delay, i) => (
        <div
          key={i}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            width: 80,
            height: 80,
            border: `2px solid ${color}`,
            opacity: 0,
            animation: "orb-wave-pulse 2s ease-out infinite",
            animationDelay: `${delay}s`,
            boxShadow: `0 0 15px ${color}44`,
          }}
        />
      ))}
    </>
  );
}

/* ── Executing ── */

function ExecutingOverlay({ color, action }: { color: string; action?: string }) {
  return (
    <>
      <CoreGlow color={color} scale={1.15} />
      <NeuralNetwork color={color} pulse />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          {action && (
            <p className="text-[10px] font-mono tracking-wider" style={{ color, textShadow: `0 0 15px ${color}` }}>
              {">"} {action}
            </p>
          )}
          <div className="mt-3 mx-auto h-[2px] w-24 rounded-full overflow-hidden" style={{ background: `${color}22` }}>
            <div className="h-full" style={{ background: color, animation: "orb-progress 2s ease-in-out infinite" }} />
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Done ── */

function DoneOverlay({ color }: { color: string }) {
  return (
    <>
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle at 35% 35%, rgba(255,255,255,0.5), ${color}aa 45%, ${color}66 75%, ${color}33)`,
          boxShadow: `0 0 60px ${color}88, 0 0 120px ${color}44`,
          animation: "orb-done-glow 1.5s ease-out forwards",
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <svg
          style={{ animation: "orb-check 1.5s ease-out forwards" }}
          className="w-16 h-16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth={3}
          strokeLinecap="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
    </>
  );
}

/* ── Error ── */

function ErrorOverlay() {
  return (
    <>
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: "radial-gradient(circle at 35% 35%, rgba(255,60,60,0.5), rgba(255,0,0,0.3) 45%, transparent 75%)",
          boxShadow: "0 0 50px rgba(255,0,0,0.5)",
          animation: "orb-done-glow 1.5s ease-out forwards",
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-3xl" style={{ animation: "orb-check 1.5s ease-out forwards" }}>✕</span>
      </div>
    </>
  );
}

/* ── Main ── */

export default function MiraiOrb({ status, executingAction, audioLevel = 0.5 }: MiraiOrbProps) {
  const [displayStatus, setDisplayStatus] = useState(status);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (status === "done") {
      setDisplayStatus("done");
      timerRef.current = setTimeout(() => { setDisplayStatus("idle"); timerRef.current = null; }, 1800);
    } else {
      setDisplayStatus(status);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [status]);

  const color = COLORS[displayStatus === "done" || displayStatus === "idle" ? displayStatus : displayStatus];

  return (
    <div className="relative w-56 h-56 max-sm:w-40 max-sm:h-40 flex items-center justify-center select-none">
      {displayStatus === "idle" && (
        <>
          <CoreGlow color={COLORS.idle} />
          <NeuralNetwork color={COLORS.idle} />
          <HexRings color={COLORS.idle} />
        </>
      )}
      {displayStatus === "listening" && <ListeningBars color={COLORS.listening} level={audioLevel} />}
      {displayStatus === "thinking" && <ThinkingRings color={COLORS.thinking} />}
      {displayStatus === "speaking" && <SpeakingWaves color={COLORS.speaking} />}
      {displayStatus === "executing" && <ExecutingOverlay color={COLORS.executing} action={executingAction} />}
      {displayStatus === "done" && <DoneOverlay color={COLORS.done} />}
    </div>
  );
}
