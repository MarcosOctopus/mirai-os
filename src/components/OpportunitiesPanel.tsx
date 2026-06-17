"use client";

/* ── Opportunities Panel — oportunidades com potencial financeiro ── */

interface Opportunity {
  label: string;
  potential: string;
  priority: "alta" | "média" | "baixa";
}

const DEFAULT_OPPS: Opportunity[] = [
  { label: "Automação de conteúdo Atomic", potential: "+R$ 50k/mês", priority: "alta" },
  { label: "Consultoria IA para marcas", potential: "+R$ 12k/mês", priority: "média" },
  { label: "Plugin MIRAI para terceiros", potential: "+R$ 8k/mês", priority: "baixa" },
  { label: "Curso de Branding com IA", potential: "+R$ 5k/mês", priority: "média" },
];

const PRIORITY_COLORS = {
  alta: { color: "#00ff87", dot: "#00ff87" },
  média: { color: "#ffd700", dot: "#ffd700" },
  baixa: { color: "#0aefff", dot: "#0aefff" },
};

export default function OpportunitiesPanel({ opportunities }: { opportunities?: Opportunity[] }) {
  const data = opportunities ?? DEFAULT_OPPS;

  return (
    <div className="mirai-panel rounded-lg p-3 h-full" style={{ background: "rgba(4,5,16,0.7)", border: "1px solid rgba(0,255,135,0.1)" }}>
      <div className="flex items-center gap-2 mb-3">
        <span className="w-1.5 h-1.5 rounded-full dot-pulse" style={{ background: "#00ff87", boxShadow: "0 0 6px #00ff87", animationDelay: "2s" }} />
        <h3 className="text-[10px] font-semibold tracking-[0.2em] uppercase" style={{ color: "rgba(0,255,135,0.7)" }}>
          Opportunities
        </h3>
      </div>
      <div className="space-y-1.5">
        {data.map((o, i) => {
          const pc = PRIORITY_COLORS[o.priority];
          return (
            <div key={i} className="flex items-center justify-between border-b border-white/5 pb-1.5 last:border-0">
              <div className="flex-1 min-w-0">
                <span className="text-[9px] leading-relaxed truncate block opacity-70">{o.label}</span>
              </div>
              <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                <span className="text-[9px] font-mono font-semibold" style={{ color: pc.color, textShadow: `0 0 6px ${pc.color}44` }}>
                  {o.potential}
                </span>
                <span className="text-[7px] uppercase tracking-wider opacity-40">{o.priority}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
