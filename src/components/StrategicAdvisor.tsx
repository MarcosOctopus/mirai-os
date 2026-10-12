"use client";

/* ── Strategic Advisor — recomendações automáticas e insights ── */

interface Recommendation {
  text: string;
  type: "recommendation" | "insight" | "alert";
}

const DEFAULT_RECS: Recommendation[] = [
  { text: "Verificar integridade do backup diário — 14h sem confirmação", type: "alert" },
  { text: "Atomic News: produzir 1 vídeo hoje sobre tendências de IA", type: "recommendation" },
  { text: "MIRAI OS está 92% completo — focar em integração com Arca", type: "insight" },
  { text: "Revisar chaves de API — 2 expiram em 7 dias", type: "alert" },
];

const TYPE_CONFIG = {
  recommendation: { icon: "→", color: "#0aefff", label: "RECOMENDAÇÃO" },
  insight: { icon: "◆", color: "#b026ff", label: "INSIGHT" },
  alert: { icon: "⚠", color: "#ff6b35", label: "ALERTA" },
};

export default function StrategicAdvisor({ recommendations }: { recommendations?: Recommendation[] }) {
  const data = recommendations ?? DEFAULT_RECS;

  return (
    <div className="mirai-panel rounded-lg p-3 h-full" style={{ background: "rgba(4,5,16,0.7)", border: "1px solid rgba(176,38,255,0.1)" }}>
      <div className="flex items-center gap-2 mb-3">
        <span className="w-1.5 h-1.5 rounded-full dot-pulse" style={{ background: "#b026ff", boxShadow: "0 0 6px #b026ff", animationDelay: "2.5s" }} />
        <h3 className="text-[10px] font-semibold tracking-[0.2em] uppercase" style={{ color: "rgba(176,38,255,0.7)" }}>
          Strategic Advisor
        </h3>
      </div>
      <div className="space-y-2">
        {data.map((r, i) => {
          const tc = TYPE_CONFIG[r.type];
          return (
            <div key={i} className="flex items-start gap-2 border-b border-dash-hair/5 pb-1.5 last:border-0">
              <span className="flex-shrink-0 text-[10px] mt-[2px]" style={{ color: tc.color }}>
                {tc.icon}
              </span>
              <div className="flex-1 min-w-0">
                <span className="text-[9px] leading-relaxed opacity-70 block">{r.text}</span>
                <span className="text-[7px] tracking-wider opacity-30" style={{ color: tc.color }}>
                  {tc.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
