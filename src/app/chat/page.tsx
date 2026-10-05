"use client";

// Chat do painel — conversa por ESCRITO, no padrão Dash.
//
// Mesma rota de sempre (`POST /api/chat`, streaming formato OpenAI) e os mesmos
// dois modos (`conversa` natural / `arquiteto` técnico). O que mudou é a casca:
// entrou o Shell (sidebar + topbar) e uma coluna de SESSÕES, estilo GPT.
//
// As sessões moram no navegador (localStorage) — é honesto: ainda não existe
// tabela de histórico no banco, então nada aqui finge ser servidor. Quando o
// histórico passar a viver na conta, esta tela troca a fonte sem mudar de cara.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Shell from "@/components/dash/Shell";
import { IconeChat, IconeFechar, IconeMenu, IconeSeta } from "@/components/dash/icons";

type Papel = "user" | "assistant";
type Mensagem = { role: Papel; content: string };

type Sessao = {
  id: string;
  titulo: string;
  em: number; // quando foi tocada por último
  mensagens: Mensagem[];
};

type User = { id: string; name: string; email: string; ehDono?: boolean };

const CHAVE = "mirai.chat.sessoes.v1";

const EXEMPLOS = [
  "O que está pendente hoje no ecossistema?",
  "Resume o estado do Saaso",
  "Me ajuda a pensar no painel do produto",
];

function novoId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function quando(ms: number): string {
  const min = Math.floor((Date.now() - ms) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "ontem" : `${d} dias`;
}

export default function ChatPage() {
  const [user, setUser] = useState<User | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [sessoes, setSessoes] = useState<Sessao[]>([]);
  const [atual, setAtual] = useState<string>("");
  const [texto, setTexto] = useState("");
  const [modo, setModo] = useState<"conversa" | "arquiteto">("conversa");
  const [enviando, setEnviando] = useState(false);
  const [verSessoes, setVerSessoes] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const pronto = useRef(false);

  /* ── conta ─────────────────────────────────────────────────────── */
  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.user && setUser(d.user as User))
      .catch(() => {});
  }, []);

  /* ── sessões (navegador) ───────────────────────────────────────── */
  useEffect(() => {
    try {
      const cru = localStorage.getItem(CHAVE);
      const guardadas: Sessao[] = cru ? JSON.parse(cru) : [];
      const vivas = Array.isArray(guardadas) ? guardadas.filter((s) => s && Array.isArray(s.mensagens)) : [];
      if (vivas.length) {
        vivas.sort((a, b) => b.em - a.em);
        setSessoes(vivas);
        setAtual(vivas[0].id);
        setMensagens(vivas[0].mensagens);
      } else {
        const s: Sessao = { id: novoId(), titulo: "Nova conversa", em: Date.now(), mensagens: [] };
        setSessoes([s]);
        setAtual(s.id);
      }
    } catch {
      const s: Sessao = { id: novoId(), titulo: "Nova conversa", em: Date.now(), mensagens: [] };
      setSessoes([s]);
      setAtual(s.id);
    } finally {
      pronto.current = true;
    }
  }, []);

  /* ── guarda a conversa atual a cada mensagem ───────────────────── */
  useEffect(() => {
    if (!pronto.current || !atual) return;
    setSessoes((atuais) => {
      const atualizadas = atuais.map((s) =>
        s.id === atual
          ? {
              ...s,
              em: Date.now(),
              titulo:
                s.titulo === "Nova conversa" && mensagens.some((m) => m.role === "user")
                  ? (mensagens.find((m) => m.role === "user")!.content.slice(0, 42) || "Nova conversa")
                  : s.titulo,
              mensagens,
            }
          : s,
      );
      try {
        localStorage.setItem(CHAVE, JSON.stringify(atualizadas));
      } catch {
        /* sem espaço no navegador: a conversa segue viva na tela */
      }
      return atualizadas;
    });
  }, [mensagens, atual]);

  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [mensagens]);

  const abrir = useCallback((s: Sessao) => {
    setAtual(s.id);
    setMensagens(s.mensagens);
    setVerSessoes(false);
  }, []);

  const novaConversa = useCallback(() => {
    const s: Sessao = { id: novoId(), titulo: "Nova conversa", em: Date.now(), mensagens: [] };
    setSessoes((atuais) => [s, ...atuais]);
    setAtual(s.id);
    setMensagens([]);
    setTexto("");
    setVerSessoes(false);
  }, []);

  const apagar = useCallback(
    (id: string) => {
      setSessoes((atuais) => {
        const restantes = atuais.filter((s) => s.id !== id);
        try {
          localStorage.setItem(CHAVE, JSON.stringify(restantes));
        } catch {
          /* ignora */
        }
        if (id === atual) {
          if (restantes.length) {
            setAtual(restantes[0].id);
            setMensagens(restantes[0].mensagens);
          } else {
            const s: Sessao = { id: novoId(), titulo: "Nova conversa", em: Date.now(), mensagens: [] };
            setSessoes([s]);
            setAtual(s.id);
            setMensagens([]);
          }
        }
        return restantes.length ? restantes : [{ id: novoId(), titulo: "Nova conversa", em: Date.now(), mensagens: [] }];
      });
    },
    [atual],
  );

  /* ── envio (mesma rota e mesmo streaming de antes) ─────────────── */
  async function enviar() {
    const conteudo = texto.trim();
    if (!conteudo || enviando) return;

    const historico: Mensagem[] = [...mensagens, { role: "user", content: conteudo }];
    setMensagens([...historico, { role: "assistant", content: "" }]);
    setTexto("");
    setEnviando(true);

    const trocarUltima = (novo: string) =>
      setMensagens((atualMsg) => {
        const copia = [...atualMsg];
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
        trocarUltima(`Não consegui falar com a Mirai agora (${r.status}). Tenta de novo.`);
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
            /* linha parcial do SSE */
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

  const ordenadas = useMemo(() => [...sessoes].sort((a, b) => b.em - a.em), [sessoes]);

  /* ── coluna de sessões ─────────────────────────────────────────── */
  const painelSessoes = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2">
        <button
          onClick={novaConversa}
          className="flex flex-1 items-center gap-2 rounded-[12px] bg-dash-brand px-4 py-2.5 text-[12px] font-semibold text-white transition hover:bg-dash-brandHi"
        >
          <IconeChat className="h-4 w-4" /> Nova conversa
        </button>
        <button
          onClick={() => setVerSessoes(false)}
          aria-label="Fechar conversas"
          className="grid h-9 w-9 place-items-center rounded-[10px] bg-dash-raise text-dash-muted lg:hidden"
        >
          <IconeFechar />
        </button>
      </div>

      <p className="mt-5 px-1 text-[11px] uppercase tracking-[0.18em] text-dash-dim">Últimas conversas</p>
      <div className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {ordenadas.map((s) => (
          <div
            key={s.id}
            className={`group flex items-center gap-2 rounded-[10px] px-3 py-2.5 transition ${
              s.id === atual ? "bg-dash-brand/12 text-white" : "text-dash-muted hover:bg-white/[0.04] hover:text-white"
            }`}
          >
            <button onClick={() => abrir(s)} className="min-w-0 flex-1 text-left">
              <span className="block truncate text-[13px]">{s.titulo}</span>
              <span className="mt-0.5 block text-[10px] text-dash-dim">
                {quando(s.em)} · {s.mensagens.filter((m) => m.role === "user").length}{" "}
                {s.mensagens.filter((m) => m.role === "user").length === 1 ? "pergunta" : "perguntas"}
              </span>
            </button>
            <button
              onClick={() => apagar(s.id)}
              aria-label="Apagar conversa"
              className="shrink-0 text-dash-dim opacity-0 transition group-hover:opacity-100 hover:text-dash-bad"
            >
              <IconeFechar className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      <p className="mt-3 px-1 text-[10px] leading-[1.5] text-dash-dim">
        Guardadas neste navegador. Ainda não existe histórico na conta.
      </p>
    </div>
  );

  return (
    <Shell titulo="Chat" usuario={user}>
      <div className="flex h-[calc(100dvh-140px)] min-h-[420px] gap-6">
        {/* lateral de sessões — fixa no desktop, overlay no celular */}
        <aside className="hidden w-[248px] shrink-0 rounded-[24px] border border-white/[0.07] bg-dash-card p-4 lg:flex lg:flex-col">
          {painelSessoes}
        </aside>

        {verSessoes && (
          <>
            <button
              aria-label="Fechar conversas"
              onClick={() => setVerSessoes(false)}
              className="fixed inset-0 z-30 bg-black/60 lg:hidden"
            />
            <div className="fixed inset-y-0 left-0 z-40 flex w-[280px] flex-col bg-dash-card p-4 lg:hidden">
              {painelSessoes}
            </div>
          </>
        )}

        {/* conversa */}
        <section className="flex min-w-0 flex-1 flex-col rounded-[24px] border border-white/[0.07] bg-dash-card">
          <div className="flex items-center gap-3 border-b border-white/[0.07] px-5 py-3.5">
            <button
              onClick={() => setVerSessoes(true)}
              aria-label="Ver conversas"
              className="grid h-9 w-9 place-items-center rounded-[10px] bg-dash-raise text-dash-muted lg:hidden"
            >
              <IconeMenu />
            </button>
            <p className="truncate text-[13px] text-dash-muted">
              {ordenadas.find((s) => s.id === atual)?.titulo || "Nova conversa"}
            </p>
            <div className="ml-auto flex items-center gap-1.5">
              {(["conversa", "arquiteto"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setModo(m)}
                  className={`rounded-full px-3 py-1.5 text-[11px] transition ${
                    modo === m ? "bg-dash-brand text-white" : "bg-dash-raise text-dash-muted hover:text-white"
                  }`}
                >
                  {m === "conversa" ? "conversa" : "arquiteto"}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            {mensagens.length === 0 && (
              <div className="rounded-[20px] border border-dashed border-white/10 px-5 py-6">
                <p className="text-[14px] text-white/80">Aqui é por escrito. Manda o que você quer e a Mirai responde.</p>
                <p className="mt-2 text-[12px] text-dash-muted">
                  Para <span className="text-dash-brand">falar</span>, é no Orb (menu → Orb).
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {EXEMPLOS.map((e) => (
                    <button
                      key={e}
                      onClick={() => setTexto(e)}
                      className="rounded-full bg-dash-raise px-3.5 py-2 text-[11px] text-dash-muted transition hover:text-white"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-4">
              {mensagens.map((m, i) => (
                <div
                  key={i}
                  className={
                    m.role === "user"
                      ? "ml-auto max-w-[85%] rounded-[18px] rounded-br-sm bg-dash-brand/18 px-4 py-3 text-[13px] text-white"
                      : "mr-auto max-w-[92%] rounded-[18px] rounded-bl-sm border border-white/[0.07] bg-dash-side px-4 py-3 text-[13px] text-white/85"
                  }
                >
                  <span className="mb-1 block text-[10px] uppercase tracking-[0.18em] text-dash-dim">
                    {m.role === "user" ? "você" : "mirai"}
                  </span>
                  {m.content ? (
                    <span className="whitespace-pre-wrap break-words">
                      {m.content}
                      {enviando && i === mensagens.length - 1 && (
                        <span className="ml-0.5 inline-block h-[13px] w-[2px] animate-pulse bg-dash-brand align-middle" />
                      )}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 py-1" aria-label="Mirai está digitando">
                      {[0, 150, 300].map((atraso) => (
                        <span
                          key={atraso}
                          className="h-1.5 w-1.5 animate-bounce rounded-full bg-dash-muted"
                          style={{ animationDelay: `${atraso}ms`, animationDuration: "1s" }}
                        />
                      ))}
                      <span className="ml-1 text-[11px] text-dash-dim">pensando…</span>
                    </span>
                  )}
                </div>
              ))}
              <div ref={fim} />
            </div>
          </div>

          <div className="border-t border-white/[0.07] px-4 py-3">
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
                placeholder="Escreve para a Mirai…"
                className="max-h-32 min-h-[46px] flex-1 resize-none rounded-[12px] border border-white/10 bg-dash-bg px-4 py-3 text-[13px] text-white outline-none placeholder:text-dash-dim focus:border-dash-brand/60"
              />
              <button
                onClick={() => void enviar()}
                disabled={enviando || !texto.trim()}
                aria-label="Enviar"
                className="grid h-[46px] w-[46px] place-items-center rounded-[12px] bg-dash-brand text-white transition hover:bg-dash-brandHi disabled:opacity-40"
              >
                <IconeSeta />
              </button>
            </div>
          </div>
        </section>
      </div>
    </Shell>
  );
}
