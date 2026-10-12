"use client";

/* ── Memory Stream — últimas memórias e decisões em scroll ── */

const MOCK_MEMORIES = [
  { time: "2 min atrás", text: "Decisão: Priorizar backup diário do ecossistema Mirai" },
  { time: "15 min atrás", text: "Memória: Nova estrutura de diretórios para projetos" },
  { time: "1h atrás", text: "Decisão: Usar Higgsfield para geração de vídeos" },
  { time: "2h atrás", text: "Aprendizado: Kling com end_image_url = thumb sem texto" },
  { time: "3h atrás", text: "Decisão: Loop imperceptível + música Suno → MP4" },
  { time: "5h atrás", text: "Memória: Neon texto SÓ na thumb YouTube" },
  { time: "8h atrás", text: "Decisão: MVP = 1 vídeo/dia Atomic News" },
];

export default function MemoryStream() {
  return (
    <div className="mirai-panel rounded-lg p-3 h-full flex flex-col" style={{ background: "rgba(4,5,16,0.7)", border: "1px solid rgba(176,38,255,0.1)" }}>
      <div className="flex items-center gap-2 mb-3 flex-shrink-0">
        <span className="w-1.5 h-1.5 rounded-full dot-pulse" style={{ background: "#b026ff", boxShadow: "0 0 6px #b026ff", animationDelay: "0.5s" }} />
        <h3 className="text-[10px] font-semibold tracking-[0.2em] uppercase" style={{ color: "rgba(176,38,255,0.7)" }}>
          Memory Stream
        </h3>
      </div>
      <div className="flex-1 overflow-hidden relative">
        <div className="scroll-text absolute inset-0">
          <div className="space-y-2 pr-1">
            {[...MOCK_MEMORIES, ...MOCK_MEMORIES].map((m, i) => (
              <div key={i} className="border-b border-dash-hair/5 pb-1.5">
                <div className="text-[8px] tracking-wider opacity-30" style={{ color: "#b026ff" }}>
                  {m.time}
                </div>
                <div className="text-[9px] leading-relaxed mt-0.5 opacity-60">{m.text}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
