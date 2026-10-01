"use client";

// Chat do painel — conversa por ESCRITO.
//
// É a parte "chat" do painel: o dono digita, a Mirai responde em streaming.
// Falar por voz não mora aqui: quem quer voz vai no modo conversa (`/`, o Orb).
//
// Usa a MESMA rota que o resto do app já usava (`POST /api/chat`, streaming no
// formato OpenAI: `data: {"choices":[{"delta":{"content":"..."}}]}`), com os dois
// modos que já existiam: `conversa` (natural) e `arquiteto` (técnico).
import { useEffect, useRef, useState } from "react";
import Nav from "@/components/mirai/Nav";

type Papel = "user" | "assistant";
type Mensagem = { role: Papel; content: string };

const EXEMPLOS = [
  "O que está pendente hoje no ecossistema?",
  "Resume o estado do Saaso",
  "Me ajuda a pensar no painel do produto",
];

export default function ChatPage() {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [texto, setTexto] = useState("");
  const [modo, setModo] = useState<"conversa" | "arquiteto">("conversa");
  const [enviando, setEnviando] = useState(false);
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [mensagens]);

  async function enviar() {
    const conteudo = texto.trim();
    if (!conteudo || enviando) return;

    const historico: Mensagem[] = [...mensagens, { role: "user", content: conteudo }];
    setMensagens([...historico, { role: "assistant", content: "" }]);
    setTexto("");
    setEnviando(true);

    const trocarUltima = (novo: string) =>
      setMensagens((atual) => {
        const copia = [...atual];
        copia[copia.length - 1] = { role: "assistant", content: novo };
        return copia;
      });

    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: historico, mode: modo }),
      });

      if (!r.ok || !r.body) {
        trocarUltima("Não consegui falar com a Mirai agora (" + r.status + "). Tenta de novo.");
        return;
      }

      const leitor = r.body.getReader();
      const decodificador = new TextDecoder();
      let acumulado = "";

      while (true) {
        const { done, value } = await leitor.read();
        if (done) break;
        const bloco = decodificador.decode(value, { stream: true });
        for (const linha of bloco.split("\n")) {
          if (!linha.startsWith("data: ")) continue;
          const dado = linha.slice(6).trim();
          if (!dado || dado === "[DONE]") continue;
          try {
            const p = JSON.parse(dado);
            const pedaco: string = p.choices?.[0]?.delta?.content || "";
            if (pedaco) {
              acumulado += pedaco;
              trocarUltima(acumulado);
            }
          } catch {
            // linha parcial do SSE: ignora, a próxima vem completa
          }
        }
      }

      if (!acumulado) trocarUltima("(resposta vazia — tenta de novo)");
    } catch {
      trocarUltima("Caiu a conexão no meio. Tenta de novo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="flex h-dvh flex-col bg-[#03040d] text-cyan-100">
      <Nav atual="/chat" />

      <div className="flex min-h-0 flex-1 flex-col">
        {/* mensagens */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
            {mensagens.length === 0 && (
              <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                <p className="text-sm text-white/70">
                  Aqui é por escrito. Manda o que você quer e a Mirai responde.
                </p>
                <p className="mt-2 text-xs text-white/40">
                  Se preferir <span className="text-cyan-200/80">falar</span>, o modo conversa tem voz:
                  menu → <span className="text-cyan-200/80">Conversa</span>.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {EXEMPLOS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => setTexto(e)}
                      className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/60 hover:bg-white/5 hover:text-white"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {mensagens.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user"
                    ? "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-cyan-500/15 px-4 py-3 text-sm text-cyan-50"
                    : "mr-auto max-w-[90%] rounded-2xl rounded-bl-sm border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/85"
                }
              >
                <span className="mb-1 block text-[10px] uppercase tracking-widest text-white/35">
                  {m.role === "user" ? "você" : "mirai"}
                </span>
                <span className="whitespace-pre-wrap break-words">
                  {m.content || (enviando ? "..." : "")}
                </span>
              </div>
            ))}
            <div ref={fim} />
          </div>
        </div>

        {/* barra de envio */}
        <div className="border-t border-white/10 bg-[#03040d]/95 px-4 py-3">
          <div className="mx-auto w-full max-w-2xl">
            <div className="mb-2 flex items-center gap-2">
              {(["conversa", "arquiteto"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setModo(m)}
                  className={`rounded-full px-3 py-1 text-xs transition-colors ${
                    modo === m
                      ? "bg-cyan-500/20 text-cyan-100"
                      : "text-white/40 hover:bg-white/5 hover:text-white/70"
                  }`}
                >
                  {m === "conversa" ? "Conversa" : "Arquiteto"}
                </button>
              ))}
            </div>

            <div className="flex items-end gap-2">
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void enviar();
                  }
                }}
                rows={1}
                placeholder="Escreve para a Mirai..."
                className="max-h-32 min-h-[46px] flex-1 resize-none rounded-xl border border-white/12 bg-white/[0.04] px-3 py-3 text-sm text-white placeholder:text-white/30 focus:border-cyan-400/40 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void enviar()}
                disabled={enviando || !texto.trim()}
                aria-label="Enviar"
                className="rounded-xl border border-cyan-400/30 bg-cyan-500/15 p-3 text-cyan-100 disabled:opacity-40"
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M4 12h15M13 6l6 6-6 6" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
