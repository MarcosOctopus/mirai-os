"use client";

import { useEffect, useState } from "react";

/* ================================================================== */
/*  HOLOGRAPHIC SYSTEM ELEMENTS                                       */
/*  Floating text, terminal readouts, scanlines — sem fundo nem borda */
/* ================================================================== */

const SYS_LINES = [
  { prefix: ">_", text: "SYS.ONLINE", color: "#0aefff" },
  { prefix: ">_", text: "CORE.TEMP // 42.7°C", color: "#0aefff" },
  { prefix: ">_", text: "MEM.ALLOC // 7.2/8.0 GB", color: "#00ff87" },
  { prefix: ">_", text: "NET.LINK // 1.2 Gbps", color: "#00ff87" },
  { prefix: ">_", text: "QUANTUM.PHASE // 0.983", color: "#b026ff" },
  { prefix: ">_", text: "NEURAL.SYNC // 47.2 Hz", color: "#b026ff" },
];

export default function HoloElements() {
  const [time, setTime] = useState("");

  useEffect(() => {
    const update = () => setTime(new Date().toLocaleTimeString("pt-BR"));
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-[1] overflow-hidden">
      {/* ── Top line: system identifier ── */}
      <div
        className="absolute top-5 left-1/2 -translate-x-1/2 z-10 hidden sm:block"
      >
        <div
          className="font-mono text-[10px] tracking-[0.5em] uppercase text-center"
          style={{
            color: "rgba(10,239,255,0.15)",
            textShadow: "0 0 20px rgba(10,239,255,0.1)",
          }}
        >
          MIRAI // COGNITIVE SYSTEM // QUANTUM CORE
        </div>
      </div>

      {/* ── Left: floating terminal lines ── */}
      <div className="absolute left-5 top-1/2 -translate-y-1/2 z-10 hidden lg:block">
        <div className="space-y-2">
          {SYS_LINES.map((line, i) => (
            <div
              key={i}
              className="mirai-fade-in font-mono text-[10px] leading-relaxed"
              style={{
                color: line.color,
                opacity: 0.2 + (1 - i / SYS_LINES.length) * 0.15,
                textShadow: `0 0 10px ${line.color}33`,
                animationDelay: `${i * 0.2}s`,
              }}
            >
              <span style={{ opacity: 0.5 }}>{line.prefix}</span>
              <span>{line.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right: clock + status ── */}
      <div className="absolute right-5 top-1/2 -translate-y-1/2 z-10 hidden lg:block text-right">
        <div
          className="mirai-fade-in font-mono text-[20px] tracking-wider"
          style={{
            color: "rgba(10,239,255,0.2)",
            textShadow: "0 0 20px rgba(10,239,255,0.1)",
          }}
        >
          {time}
        </div>
        <div
          className="mirai-fade-in font-mono text-[9px] tracking-wider mt-1"
          style={{
            color: "rgba(176,38,255,0.15)",
            textShadow: "0 0 10px rgba(176,38,255,0.1)",
            animationDelay: "0.3s",
          }}
        >
          UTC -03:00 // SÃO PAULO
        </div>
      </div>

      {/* ── Bottom-center: command prompt indication ── */}
      <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-10">
        <div
          className="font-mono text-[9px] tracking-[0.3em] uppercase"
          style={{
            color: "rgba(10,239,255,0.1)",
          }}
        >
          {">"} SYSTEM AWAITING INPUT
        </div>
        <div className="flex justify-center mt-1">
          <div
            className="w-1 h-3"
            style={{
              background: "rgba(10,239,255,0.15)",
              animation: "cursor-blink 1.2s step-end infinite",
            }}
          />
        </div>
      </div>
    </div>
  );
}
