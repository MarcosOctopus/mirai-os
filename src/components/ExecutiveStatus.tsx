"use client";

import { useMemo } from "react";

/* ── Executive Status — projetos ativos + pendências + prioridades ── */

interface StatusItem {
  label: string;
  value: string | number;
  color?: string;
}

const DEFAULT_ITEMS: StatusItem[] = [
  { label: "PROJETOS ATIVOS", value: "4", color: "#0aefff" },
  { label: "TAREFAS PENDENTES", value: "7", color: "#ff6b35" },
  { label: "PRIORIDADE MÁXIMA", value: "Backup Diário", color: "#ff2d78" },
  { label: "NÍVEL DE CARGA", value: "68%", color: "#00ff87" },
];

export default function ExecutiveStatus({ items }: { items?: StatusItem[] }) {
  const data = items ?? DEFAULT_ITEMS;

  return (
    <div className="mirai-panel rounded-lg p-3 h-full" style={{ background: "rgba(4,5,16,0.7)", border: "1px solid rgba(10,239,255,0.1)" }}>
      <div className="flex items-center gap-2 mb-3">
        <span className="w-1.5 h-1.5 rounded-full dot-pulse" style={{ background: "#0aefff", boxShadow: "0 0 6px #0aefff" }} />
        <h3 className="text-[10px] font-semibold tracking-[0.2em] uppercase" style={{ color: "rgba(10,239,255,0.7)" }}>
          Executive Status
        </h3>
      </div>
      <div className="space-y-2.5">
        {data.map((item, i) => (
          <div key={i} className="flex items-center justify-between">
            <span className="text-[9px] tracking-wider uppercase opacity-50">{item.label}</span>
            <span
              className="text-[10px] font-semibold font-mono"
              style={{
                color: item.color ?? "#c8d6e5",
                textShadow: item.color ? `0 0 8px ${item.color}44` : "none",
              }}
            >
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
