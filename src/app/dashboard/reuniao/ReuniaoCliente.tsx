"use client";

/**
 * REUNIÃO — a lista vem do ACERVO, não de um banco próprio.
 *
 * Duas entradas, dois custos (decisão do dono, 18/11/2026):
 *   · "Colar link" (Meet/Zoom/Teams): a plataforma grava e transcreve; nós
 *     REGISTRAMOS a reunião. Custo zero.
 *   · "Gravar agora" (microfone): o áudio vai para a fila da Arca e o cano único
 *     transcreve. Custo REAL medido: ~R$0,22 por hora (Groq whisper-large-v3).
 *     O comentário antigo dizia R$1/h e estava errado — corrigido em 25/11/2026.
 *
 * Regra: nunca transcrever de novo o que a plataforma já transcreveu.
 *
 * VISUAL (25/11/2026): o dono mostrou a ideia de uma lista com filtro por origem
 * e uma tela de "Nova reunião" com o tempo correndo. O que ficou da ideia: os
 * filtros por origem e a tabela. O que NÃO entrou: a coluna "Duração" — o acervo
 * guarda título, tags e data, não a duração; número inventado na tela é mentira.
 * Quando o cano passar a gravar a duração na nota, a coluna volta.
 *
 * Visual: o mesmo do painel (dash-bg/fg/muted, rounded-[10px], chips
 * rounded-full, sem emoji, sem cor inventada).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Shell from "@/components/dash/Shell";
import { IconeAlerta, IconeCheck, IconeMicrofone, IconeRelogio } from "@/components/dash/icons";

type Reuniao = { caminho: string; titulo: string; tags: string[]; modificado: string };

const PLATAFORMAS = ["Google Meet", "Zoom", "Microsoft Teams", "Presencial"] as const;

/** Origens do filtro. "Mirai" = gravada aqui, pelo microfone. */
const ORIGENS = ["Todas", "Google Meet", "Microsoft Teams", "Zoom", "Mirai", "Presencial"] as const;

function quando(v: string): string {
  if (!v) return "—";
  const d = new Date(v.length <= 16 ? `${v}:00` : v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function mmss(seg: number): string {
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Origem de uma reunião, a partir das tags que o registro gravou. */
function origemDe(r: Reuniao): string {
  const t = r.tags.map((x) => x.toLowerCase());
  if (t.some((x) => x.includes("gravada-aqui"))) return "Mirai";
  if (t.some((x) => x.includes("teams"))) return "Microsoft Teams";
  if (t.some((x) => x.includes("meet"))) return "Google Meet";
  if (t.some((x) => x.includes("zoom"))) return "Zoom";
  if (t.some((x) => x.includes("presencial"))) return "Presencial";
  return "—";
}

export default function ReuniaoCliente() {
  const [reunioes, setReunioes] = useState<Reuniao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [filtro, setFiltro] = useState<string>("Todas");

  const [modal, setModal] = useState(false);
  const [aba, setAba] = useState<"gravar" | "link">("gravar");

  // gravação
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [tituloGravacao, setTituloGravacao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [micIndisponivel, setMicIndisponivel] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const partesRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // link
  const [tituloLink, setTituloLink] = useState("");
  const [plataforma, setPlataforma] = useState<string>("Google Meet");
  const [link, setLink] = useState("");
  const [quandoReuniao, setQuandoReuniao] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const r = await fetch("/api/reuniao", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      setReunioes(d.reunioes || []);
    } catch (e) {
      setErro(String(e instanceof Error ? e.message : e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const pararTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const pararTudo = useCallback(() => {
    pararTimer();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setGravando(false);
  }, []);

  useEffect(() => pararTudo, [pararTudo]);

  async function comecarGravacao() {
    setErro("");
    setAviso("");
    setMicIndisponivel(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      partesRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) partesRef.current.push(e.data);
      };
      rec.start(1000);
      recorderRef.current = rec;
      setGravando(true);
      setSegundos(0);
      timerRef.current = setInterval(() => setSegundos((s) => s + 1), 1000);
    } catch (e) {
      setMicIndisponivel(true);
      const emPreview = typeof window !== "undefined" && window.self !== window.top;
      setErro(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? emPreview
            ? "O navegador bloqueou o microfone. Se o app está aberto dentro de uma prévia, abra em uma aba própria e permita o microfone para o site."
            : "O navegador bloqueou o microfone. Permita o microfone nas configurações do site e tente de novo."
          : `Não consegui abrir o microfone: ${String(e)}`,
      );
    }
  }

  async function enviarGravacao() {
    const rec = recorderRef.current;
    if (!rec) return;
    setEnviando(true);
    setErro("");
    await new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
      rec.stop();
    });
    pararTudo();
    const blob = new Blob(partesRef.current, { type: "audio/webm" });
    if (!blob.size) {
      setEnviando(false);
      setErro("A gravação saiu vazia — confira o microfone.");
      return;
    }
    try {
      const r = await fetch("/api/reuniao/gravar", {
        method: "POST",
        headers: {
          "Content-Type": "audio/webm",
          "X-Reuniao-Titulo": tituloGravacao || `Reunião ${new Date().toLocaleDateString("pt-BR")}`,
          "X-Reuniao-Tags": "reuniao,gravada-aqui",
        },
        body: blob,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      setAviso(d.mensagem || "Áudio na fila do acervo.");
      setModal(false);
      setTituloGravacao("");
      setSegundos(0);
    } catch (e) {
      setErro(`Não consegui enviar o áudio: ${String(e instanceof Error ? e.message : e)}`);
    } finally {
      setEnviando(false);
    }
  }

  async function salvarLink() {
    setEnviando(true);
    setErro("");
    try {
      const r = await fetch("/api/reuniao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: tituloLink,
          plataforma,
          link,
          quando: quandoReuniao ? quandoReuniao.replace("T", " ") : undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      setAviso("Reunião registrada no acervo. A transcrição fica no workspace da plataforma.");
      setModal(false);
      setTituloLink("");
      setLink("");
      setQuandoReuniao("");
      await carregar();
    } catch (e) {
      setErro(String(e instanceof Error ? e.message : e));
    } finally {
      setEnviando(false);
    }
  }

  const campo =
    "w-full rounded-[10px] border border-dash-line bg-dash-raise px-3 py-2 text-[13.5px] text-dash-fg outline-none placeholder:text-dash-dim focus:border-dash-brand/60";

  const contagens = useMemo(() => {
    const c: Record<string, number> = { Todas: reunioes.length };
    for (const r of reunioes) {
      const o = origemDe(r);
      c[o] = (c[o] || 0) + 1;
    }
    return c;
  }, [reunioes]);

  const visiveis = useMemo(
    () => (filtro === "Todas" ? reunioes : reunioes.filter((r) => origemDe(r) === filtro)),
    [reunioes, filtro],
  );

  return (
    <Shell titulo="Reunião">
      <div className="mx-auto w-full max-w-[1000px] px-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-semibold tracking-tight text-dash-fg">Reunião</h1>
            <p className="mt-1 max-w-[540px] text-[13px] leading-[1.6] text-dash-muted">
              Tudo que entra aqui vai para o acervo, em <span className="text-dash-fg">05_REUNIOES</span>,
              dividido em notas e com tags.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setModal(true);
              setAba("gravar");
              setErro("");
              setMicIndisponivel(false);
            }}
            className="flex items-center gap-2 rounded-[10px] bg-dash-brand px-4 py-2.5 text-[13.5px] font-semibold text-white transition hover:brightness-110"
          >
            <IconeMicrofone className="h-4 w-4" />
            Nova reunião
          </button>
        </div>

        {aviso && (
          <div className="mt-5 flex items-start gap-2 rounded-[12px] border border-dash-ok/30 bg-dash-ok/10 px-4 py-3 text-[13px] text-dash-fg">
            <IconeCheck className="mt-[2px] h-4 w-4 shrink-0 text-dash-ok" />
            <span>{aviso}</span>
          </div>
        )}
        {erro && !modal && (
          <div className="mt-5 flex items-start gap-2 rounded-[12px] border border-dash-warn/30 bg-dash-warn/10 px-4 py-3 text-[13px] text-dash-fg">
            <IconeAlerta className="mt-[2px] h-4 w-4 shrink-0 text-dash-warn" />
            <span>{erro}</span>
          </div>
        )}

        {/* FILTRO POR ORIGEM — a ideia do dono, no nosso padrão */}
        <div className="mt-7 flex flex-wrap gap-2">
          {ORIGENS.map((o) => {
            const n = contagens[o] || 0;
            const ativo = filtro === o;
            return (
              <button
                key={o}
                type="button"
                onClick={() => setFiltro(o)}
                className={`rounded-full border px-3.5 py-1.5 text-[12.5px] transition ${
                  ativo
                    ? "border-dash-brand bg-dash-brand text-white"
                    : "border-dash-line text-dash-muted hover:border-dash-brand/40 hover:text-dash-fg"
                }`}
              >
                {o}
                {n > 0 && <span className={`ml-1.5 ${ativo ? "text-white/70" : "text-dash-dim"}`}>{n}</span>}
              </button>
            );
          })}
        </div>

        {/* TABELA — desktop; no celular vira cartão */}
        <div className="mt-4 overflow-hidden rounded-[14px] border border-dash-line bg-dash-card">
          <div className="hidden grid-cols-[1fr_170px_190px] border-b border-dash-hair/[0.08] px-5 py-3 md:grid">
            {["Título", "Origem", "Quando"].map((h) => (
              <span key={h} className="text-[11px] uppercase tracking-[0.14em] text-dash-dim">
                {h}
              </span>
            ))}
          </div>

          {carregando && (
            <div className="px-5 py-8 text-[13px] text-dash-muted">Lendo o acervo…</div>
          )}

          {!carregando && !erro && visiveis.length === 0 && (
            <div className="px-5 py-10 text-center">
              <IconeRelogio className="mx-auto h-5 w-5 text-dash-dim" />
              <p className="mt-2 text-[13.5px] text-dash-muted">
                {filtro === "Todas" ? "Nenhuma reunião no acervo ainda." : `Nenhuma reunião de ${filtro}.`}
              </p>
              <p className="mt-1 text-[12.5px] text-dash-dim">
                Grave pelo microfone ou registre o link — as duas caem em 05_REUNIOES.
              </p>
            </div>
          )}

          {visiveis.length > 0 && (
            <ul className="divide-y divide-dash-hair/[0.07]">
              {visiveis.map((r) => {
                const origem = origemDe(r);
                return (
                  <li
                    key={r.caminho}
                    className="px-5 py-4 transition hover:bg-dash-hair/[0.03] md:grid md:grid-cols-[1fr_170px_190px] md:items-center md:gap-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-medium text-dash-fg">{r.titulo}</p>
                      <p className="mt-1 truncate text-[12px] text-dash-dim md:hidden">
                        {origem !== "—" ? `${origem} · ` : ""}
                        {quando(r.modificado)}
                      </p>
                      {r.tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {r.tags.slice(0, 5).map((t) => (
                            <span
                              key={t}
                              className="rounded-full border border-dash-line px-2 py-[2px] text-[10.5px] text-dash-muted"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="hidden md:block">
                      {origem === "—" ? (
                        <span className="text-[12.5px] text-dash-dim">—</span>
                      ) : (
                        <span className="inline-flex rounded-full border border-dash-line px-2.5 py-[3px] text-[11.5px] text-dash-muted">
                          {origem}
                        </span>
                      )}
                    </div>
                    <div className="hidden text-[12.5px] text-dash-muted md:block">{quando(r.modificado)}</div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <p className="mt-3 text-[11.5px] leading-[1.6] text-dash-dim">
          Importadas do workspace: Meet, Zoom e Teams gravam e transcrevem por conta delas — custo zero
          para nós. Gravadas aqui: o microfone grava e o acervo transcreve, cerca de R$ 0,22 por hora.
        </p>
      </div>

      {modal && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-dash-scrim/55 p-4 backdrop-blur-md">
          <div className="w-full max-w-[560px] overflow-hidden rounded-[20px] border border-dash-line bg-dash-card">
            <div className="flex items-start justify-between gap-4 border-b border-dash-hair/[0.08] px-6 py-4">
              <div>
                <h3 className="text-[18px] font-semibold text-dash-fg">Nova reunião</h3>
                <p className="mt-0.5 text-[12px] text-dash-dim">
                  {aba === "gravar" ? "Gravar pelo microfone deste dispositivo" : "Registrar uma reunião de plataforma"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (gravando) return;
                  setModal(false);
                  setErro("");
                  setMicIndisponivel(false);
                }}
                className="rounded-[8px] border border-dash-line px-3 py-1.5 text-[12px] text-dash-muted transition hover:text-dash-fg"
              >
                Voltar
              </button>
            </div>

            <div className="flex gap-2 px-6 pt-4">
              {(["gravar", "link"] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  disabled={gravando}
                  onClick={() => {
                    setAba(id);
                    setErro("");
                    setMicIndisponivel(false);
                  }}
                  className={`rounded-full border px-3.5 py-1.5 text-[12.5px] transition disabled:opacity-40 ${
                    aba === id
                      ? "border-dash-brand bg-dash-brand text-white"
                      : "border-dash-line text-dash-muted hover:text-dash-fg"
                  }`}
                >
                  {id === "gravar" ? "Gravar agora" : "Colar link"}
                </button>
              ))}
            </div>

            <div className="px-6 py-5">
              {aba === "gravar" ? (
                <>
                  <label className="block text-[12px] text-dash-dim">Título</label>
                  <input
                    value={tituloGravacao}
                    onChange={(e) => setTituloGravacao(e.target.value)}
                    placeholder="Reunião com o cliente X"
                    className={`mt-1.5 ${campo}`}
                    disabled={gravando}
                  />

                  <div className="mt-4 rounded-[12px] border border-dash-line bg-dash-raise px-4 py-5 text-center">
                    <p className="font-mono text-[30px] tabular-nums tracking-tight text-dash-fg">
                      {mmss(segundos)}
                    </p>
                    <p className="mt-1 text-[11.5px] text-dash-dim">
                      {gravando
                        ? "Gravando. O áudio vai para a fila da Arca ao encerrar."
                        : micIndisponivel
                          ? "Gravação indisponível"
                          : "Pronto para gravar"}
                    </p>

                    {erro && (
                      <div className="mt-4 flex items-start gap-2 rounded-[10px] border border-dash-warn/30 bg-dash-warn/10 px-3 py-2.5 text-left text-[12px] leading-[1.55] text-dash-fg">
                        <IconeAlerta className="mt-[2px] h-4 w-4 shrink-0 text-dash-warn" />
                        <span>{erro}</span>
                      </div>
                    )}

                    <div className="mt-4 flex justify-center">
                      {!gravando ? (
                        <button
                          type="button"
                          onClick={() => void comecarGravacao()}
                          className="flex items-center gap-2 rounded-[10px] bg-dash-brand px-4 py-2.5 text-[13px] font-semibold text-white transition hover:brightness-110"
                        >
                          <IconeMicrofone className="h-4 w-4" />
                          {micIndisponivel ? "Tentar novamente" : "Começar a gravar"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void enviarGravacao()}
                          disabled={enviando}
                          className="rounded-[10px] bg-dash-brand px-4 py-2.5 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
                        >
                          {enviando ? "Enviando…" : "Encerrar e enviar"}
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="mt-3 text-[11.5px] leading-[1.6] text-dash-dim">
                    A transcrição entra no acervo em 05_REUNIOES quando o cano terminar. Custo real de
                    transcrição: cerca de R$ 0,22 por hora.
                  </p>
                </>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[12px] text-dash-dim">Título</label>
                    <input
                      value={tituloLink}
                      onChange={(e) => setTituloLink(e.target.value)}
                      placeholder="Reunião de alinhamento — Speach"
                      className={`mt-1.5 ${campo}`}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[12px] text-dash-dim">Plataforma</label>
                      <select
                        value={plataforma}
                        onChange={(e) => setPlataforma(e.target.value)}
                        className={`mt-1.5 ${campo}`}
                      >
                        {PLATAFORMAS.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[12px] text-dash-dim">Quando</label>
                      <input
                        type="datetime-local"
                        value={quandoReuniao}
                        onChange={(e) => setQuandoReuniao(e.target.value)}
                        className={`mt-1.5 ${campo}`}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[12px] text-dash-dim">Link da reunião (opcional)</label>
                    <input
                      value={link}
                      onChange={(e) => setLink(e.target.value)}
                      placeholder="https://meet.google.com/..."
                      className={`mt-1.5 ${campo}`}
                    />
                  </div>

                  {erro && (
                    <div className="flex items-start gap-2 rounded-[10px] border border-dash-warn/30 bg-dash-warn/10 px-3 py-2.5 text-[12px] leading-[1.55] text-dash-fg">
                      <IconeAlerta className="mt-[2px] h-4 w-4 shrink-0 text-dash-warn" />
                      <span>{erro}</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => void salvarLink()}
                    disabled={enviando || tituloLink.trim().length < 3}
                    className="w-full rounded-[10px] bg-dash-brand px-4 py-2.5 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
                  >
                    {enviando ? "Registrando…" : "Registrar no acervo"}
                  </button>
                  <p className="text-[11.5px] leading-[1.6] text-dash-dim">
                    Registra a reunião no acervo. A gravação e a transcrição continuam no workspace da
                    plataforma — quando forem importadas, entram como nota própria.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
