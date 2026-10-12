"use client";

/* ── Risks Panel — riscos ativos com nível de impacto ── */

interface Risk {
  label: string;
  level: "critical" | "high" | "medium" | "low";
  impact: string;
}

const DEFAULT_RISKS: Risk[] = [
  { label: "Backup não verificado", level: "high", impact: "Perda de dados" },
  { label: "API Key expirando", level: "medium", impact: "Serviço offline" },
  { label: "Limite de tokens", level: "medium", impact: "Custo elevado" },
  { label: "Domínio próximo do vencimento", level: "low", impact: "Indisponibilidade" },
];

const LEVEL_CONFIG = {
  critical: { color: "#ff2d78", dots: 4, label: "CRÍTICO" },
  high: { color: "#ff6b35", dots: 3, label: "ALTO" },
  medium: { color: "#ffd700", dots: 2, label: "MÉDIO" },
  low: { color: "#00ff87", dots: 1, label: "BAIXO" },
};

export default function RisksPanel({ risks }: { risks?: Risk[] }) {
  const data = risks ?? DEFAULT_RISKS;

  return (
    <div className="mirai-panel rounded-lg p-3 h-full" style={{ background: "rgba(4,5,16,0.7)", border: "1px solid rgba(255,45,120,0.1)" }}>
      <div className="flex items-center gap-2 mb-3">
        <span className="w-1.5 h-1.5 rounded-full dot-pulse" style={{ background: "#ff2d78", boxShadow: "0 0 6px #ff2d78", animationDelay: "1.5s" }} />
        <h3 className="text-[10px] font-semibold tracking-[0.2em] uppercase" style={{ color: "rgba(255,45,120,0.7)" }}>
          Risks
        </h3>
      </div>
      <div className="space-y-2">
        {data.map((r, i) => {
          const cfg = LEVEL_CONFIG[r.level];
          return (
            <div key={i} className="flex items-center justify-between border-b border-dash-hair/5 pb-1.5">
              <div className="flex-1 min-w-0">
                <div className="text-[9px] leading-relaxed truncate opacity-70">{r.label}</div>
                <div className="text-[8px] opacity-30 mt-0.5">{r.impact}</div>
              </div>
              <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                <div className="flex gap-[2px]">
                  {Array.from({ length: 4 }, (_, d) => (
                    <span
                      key={d}
                      className="w-1 h-3 rounded-sm"
                      style={{
                        background: d < cfg.dots ? cfg.color : "rgba(255,255,255,0.08)",
                        boxShadow: d < cfg.dots ? `0 0 4px ${cfg.color}` : "none",
                      }}
                    />
                  ))}
                </div>
                <span className="text-[7px] tracking-wider ml-1" style={{ color: cfg.color }}>
                  {cfg.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
