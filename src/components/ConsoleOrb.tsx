"use client";

import { useEffect, useRef, useState } from "react";

interface ConsoleOrbProps {
  status: "idle" | "listening" | "thinking" | "speaking" | "executing" | "done";
  executingAction?: string;
  /** 0–1, controls equalizer bar heights when listening */
  audioLevel?: number;
}

const COLORS = {
  idle: "#0aefff",      // Neon cyan - holographic
  listening: "#00ff87", // Neon green - data flowing
  thinking: "#b026ff",  // Neon purple - processing
  speaking: "#ff2d78",  // Hot pink - wave transmission
  executing: "#ff6b35", // Neon orange - system active
  done: "#00ff87",      // Neon green - success
} as const;

const NBARS = 12;
const BAR_MAX = 48;

/* ------------------------------------------------------------------ */
/*  Sub-components for each state                                      */
/* ------------------------------------------------------------------ */

function IdleOrb({ color }: { color: string }) {
  return (
    <div
      className="console-orb-idle absolute inset-0 rounded-full"
      style={{
        background: `radial-gradient(circle at 35% 35%, rgba(255,255,255,0.45), ${color}99 45%, ${color}55 75%, ${color}22)`,
        boxShadow: `0 0 30px ${color}55, 0 0 60px ${color}33`,
      }}
    />
  );
}

function ListeningBars({ color, level }: { color: string; level: number }) {
  const bars = Array.from({ length: NBARS }, (_, i) => {
    const angle = (i / NBARS) * 360;
    const height = Math.max(6, level * BAR_MAX * (0.5 + Math.random() * 0.5));
    return { angle, height };
  });

  return (
    <>
      {/* Core orb */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle at 35% 35%, rgba(255,255,255,0.4), ${color}88 45%, ${color}44 75%, ${color}11)`,
          boxShadow: `0 0 30px ${color}44, 0 0 60px ${color}22`,
        }}
      />
      {/* Equalizer bars */}
      {bars.map((b, i) => (
        <div
          key={i}
          className="console-orb-bar absolute left-1/2 top-1/2"
          style={{
            width: 4,
            height: b.height,
            marginLeft: -2,
            marginTop: -b.height,
            borderRadius: 2,
            transform: `rotate(${b.angle}deg) translateY(-80px)`,
            background: color,
            opacity: 0.6 + level * 0.4,
            transition: "height 0.12s ease, opacity 0.15s ease",
            transformOrigin: "center center",
          }}
        />
      ))}
    </>
  );
}

function ThinkingRings({ color }: { color: string }) {
  const rings = [
    { size: 140, speed: 3, width: 2, opacity: 0.35 },
    { size: 170, speed: 5, width: 1.5, opacity: 0.25 },
    { size: 200, speed: 7, width: 1, opacity: 0.15 },
  ];

  return (
    <>
      {/* Core orb */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle at 35% 35%, rgba(255,255,255,0.4), ${color}88 45%, ${color}44 75%, ${color}11)`,
          boxShadow: `0 0 30px ${color}55, 0 0 60px ${color}33`,
        }}
      />
      {rings.map((r, i) => (
        <div
          key={i}
          className="console-orb-ring absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            width: r.size,
            height: r.size,
            border: `${r.width}px solid ${color}`,
            opacity: r.opacity,
            animation: `console-ring-spin-${i} ${r.speed}s linear infinite`,
          }}
        />
      ))}
    </>
  );
}

function SpeakingWaves({ color }: { color: string }) {
  const waves = [0, 0.6, 1.2, 1.8, 2.4];

  return (
    <>
      {/* Core orb */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle at 35% 35%, rgba(255,255,255,0.4), ${color}88 45%, ${color}44 75%, ${color}11)`,
          boxShadow: `0 0 30px ${color}55, 0 0 60px ${color}33`,
        }}
      />
      {waves.map((delay, i) => (
        <div
          key={i}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            width: 96,
            height: 96,
            border: `2px solid ${color}`,
            opacity: 0,
            animation: `console-wave-pulse 2.5s ease-out infinite`,
            animationDelay: `${delay}s`,
          }}
        />
      ))}
    </>
  );
}

function ExecutingOverlay({
  color,
  action,
}: {
  color: string;
  action?: string;
}) {
  return (
    <>
      {/* Core orb */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle at 35% 35%, rgba(255,255,255,0.35), ${color}88 45%, ${color}55 75%, ${color}22)`,
          boxShadow: `0 0 30px ${color}55, 0 0 60px ${color}33`,
        }}
      />
      {/* Action label */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center px-2">
          {action && (
            <p
              className="text-[10px] sm:text-xs font-medium leading-tight truncate max-w-[140px] sm:max-w-[180px]"
              style={{ color }}
            >
              {action}
            </p>
          )}
          {/* Progress bar */}
          <div
            className="mt-1.5 h-1 rounded-full overflow-hidden"
            style={{ background: `${color}33`, width: 80 }}
          >
            <div
              className="h-full rounded-full console-executing-bar"
              style={{ background: color, width: 80 }}
            />
          </div>
        </div>
      </div>
    </>
  );
}

function DoneOverlay({ color }: { color: string }) {
  return (
    <>
      <div
        className="absolute inset-0 rounded-full console-done-glow"
        style={{
          background: `radial-gradient(circle at 35% 35%, rgba(255,255,255,0.5), ${color}aa 45%, ${color}66 75%, ${color}33)`,
          boxShadow: `0 0 40px ${color}88, 0 0 80px ${color}44`,
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <svg
          className="console-done-check w-12 h-12 sm:w-16 sm:h-16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function ConsoleOrb({
  status,
  executingAction,
  audioLevel = 0.5,
}: ConsoleOrbProps) {
  const [displayStatus, setDisplayStatus] = useState<
    "idle" | "listening" | "thinking" | "speaking" | "executing" | "done"
  >("idle");
  const doneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Manage visual state — "done" auto-transitions to "idle" after 1.5 s
  useEffect(() => {
    if (doneTimerRef.current) {
      clearTimeout(doneTimerRef.current);
      doneTimerRef.current = null;
    }
    if (status === "done") {
      setDisplayStatus("done");
      doneTimerRef.current = setTimeout(() => {
        setDisplayStatus("idle");
        doneTimerRef.current = null;
      }, 1500);
    } else {
      setDisplayStatus(status);
    }
    return () => {
      if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
    };
  }, [status]);

  return (
    <div
      className="
        relative
        w-48 h-48
        max-sm:w-32 max-sm:h-32
        flex items-center justify-center
        select-none
      "
    >
      {/* ---- CSS keyframes + state-specific classes ---- */}
      <style>{`
        /* --- Idle breathing --- */
        .console-orb-idle {
          animation: console-breathe 3.5s ease-in-out infinite;
        }
        @keyframes console-breathe {
          0%, 100% { transform: scale(1); filter: brightness(1); }
          50%      { transform: scale(1.06); filter: brightness(1.25); }
        }

        /* --- Listening bars --- */
        .console-orb-bar {
          animation: console-bar-bounce 0.5s ease-in-out infinite alternate;
        }
        @keyframes console-bar-bounce {
          0%   { transform: scaleY(0.6); }
          100% { transform: scaleY(1.2); }
        }

        /* --- Thinking rings (per-ring) --- */
        @keyframes console-ring-spin-0 {
          from { transform: translate(-50%,-50%) rotate(0deg); }
          to   { transform: translate(-50%,-50%) rotate(360deg); }
        }
        @keyframes console-ring-spin-1 {
          from { transform: translate(-50%,-50%) rotate(0deg); }
          to   { transform: translate(-50%,-50%) rotate(-360deg); }
        }
        @keyframes console-ring-spin-2 {
          from { transform: translate(-50%,-50%) rotate(0deg); }
          to   { transform: translate(-50%,-50%) rotate(360deg); }
        }

        /* --- Speaking wave pulse --- */
        @keyframes console-wave-pulse {
          0%   { transform: translate(-50%,-50%) scale(0.6); opacity: 0.7; }
          60%  { transform: translate(-50%,-50%) scale(2.2); opacity: 0.2; }
          100% { transform: translate(-50%,-50%) scale(2.8); opacity: 0; }
        }

        /* --- Executing progress bar --- */
        .console-executing-bar {
          animation: console-progress-fill 2s ease-in-out infinite;
        }
        @keyframes console-progress-fill {
          0%   { width: 0%; }
          40%  { width: 65%; }
          70%  { width: 85%; }
          100% { width: 100%; }
        }

        /* --- Done checkmark + glow --- */
        .console-done-glow {
          animation: console-done-fade 1.5s ease-out forwards;
        }
        @keyframes console-done-fade {
          0%   { opacity: 1; transform: scale(1); }
          60%  { opacity: 1; transform: scale(1.08); }
          100% { opacity: 0; transform: scale(1.15); }
        }
        .console-done-check {
          animation: console-check-appear 1.5s ease-out forwards;
        }
        @keyframes console-check-appear {
          0%   { opacity: 0; transform: scale(0.3) rotate(-10deg); }
          30%  { opacity: 1; transform: scale(1.2) rotate(3deg); }
          50%  { transform: scale(1) rotate(0deg); opacity: 1; }
          80%  { opacity: 0.8; }
          100% { opacity: 0; transform: scale(1.1); }
        }
      `}</style>

      {/* ---- Render active state ---- */}
      {displayStatus === "idle" && <IdleOrb color={COLORS.idle} />}

      {displayStatus === "listening" && (
        <ListeningBars color={COLORS.listening} level={audioLevel} />
      )}

      {displayStatus === "thinking" && <ThinkingRings color={COLORS.thinking} />}

      {displayStatus === "speaking" && <SpeakingWaves color={COLORS.speaking} />}

      {displayStatus === "executing" && (
        <ExecutingOverlay
          color={COLORS.executing}
          action={executingAction}
        />
      )}

      {displayStatus === "done" && <DoneOverlay color={COLORS.done} />}
    </div>
  );
}
