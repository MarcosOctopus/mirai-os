"use client";

/**
 * REUNIÃO — a lista vem do ACERVO, não de um banco próprio.
 *
 * Duas entradas, dois custos (decisão do dono, 18/11/2026):
 *  · "Colar link" (Meet/Zoom/Teams) — a plataforma grava e transcreve; nós
 *    REGISTRAMOS a reunião. Custo zero.
 *  · "Gravar agora" — o microfone grava e o cano transcreve. Custo REAL medido:
 *    cerca de R$ 0,22 por hora (Groq whisper-large-v3). O comentário antigo dizia
 *    R$ 1/h e estava errado — corrigido em 25/11/2026.
 *
 * Regra: nunca transcrever de novo o que a plataforma já transcreveu.
 *
 * VISUAL (25/11/2026) — o dono mostrou a ideia dele e pediu no nosso padrão:
 *  · entrou: filtro por origem, busca, "Histórico de reuniões", tabela com
 *    colunas, seta por linha e o selo "Gravação indisponível" na tela nova.
 *  · NÃO entrou: a coluna "Duração" mostra "—" porque o acervo não guarda tempo
 *    de reunião. Número inventado na tela é mentira. Quando o cano gravar a
 *    duração na nota, a coluna passa a ter valor.
 *  · NÃO entrou: o checkbox "Transcrição ao vivo pelo navegador" — é recurso de
 *    verdade (SpeechRecognition), não enfeite. Fica para quando o dono pedir.
 *
 * Visual: o mesmo do painel (dash-bg/fg/muted, rounded-[10px], chips
 * rounded-full, sem emoji, sem cor inventada).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Shell from "@/components/dash/Shell";
import { IconeAlerta, IconeBusca, IconeCheck, IconeMicrofone, IconeRelogio } from "@/components/dash/icons";

type Reuniao = { caminho: string; titulo: string; tags: string[]; modificado: string };

const PLATAFORMAS = ["Google Meet", "Zoom", "Microsoft Teams", "Presencial"] as const;

/** Origens do filtro. "Mirai" = gravada aqui, pelo microfone. */
const ORIGENS = ["Todas", "Google Meet", "Microsoft Teams", "Zoom", "Mirai"] as const;

function quando(v: string): string {
  if (!v) return "—";
  const d = new Date(v.length <= 16 ? `${v}:00` : v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
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
  const [busca, setBusca] = useState("");

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
  const [quandoReuniao, setQuandoReuniao] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch("/api/reuniao", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      setReunioes(Array.isArray(d?.reunioes) ? d.reunioes : []);
      setErro("");
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
            ? "Permita o microfone nas configurações deste site. Se o app abriu dentro de uma prévia, use uma aba do navegador."
            : "Permita o microfone nas configurações deste site e tente de novo."
          : "Não foi possível abrir o microfone neste dispositivo.",
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
      setErro("A gravação saiu vazia. Confira o microfone.");
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
      await carregar();
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
          quando: quandoReuniao ? quandoReuniao.replace("T", " ") : undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      setAviso("Reunião registrada no acervo.");
      setModal(false);
      setTituloLink("");
      setQuandoReuniao("");
      await carregar();
    } catch (e) {
      setErro(String(e instanceof Error ? e.message : e));
    } finally {
      setEnviando(false);
    }
  }

  const campo =
    "w-full rounded-[10px] border border-dash-line bg-dash-raise px-3 py-2 text-[13px] text-dash-fg outline-none placeholder:text-dash-dim focus:border-dash-brand/60";

  const contagens = useMemo(() => {
    const c: Record<string, number> = { Todas: reunioes.length };
    for (const r of reunioes) {
      const o = origemDe(r);
      c[o] = (c[o] || 0) + 1;
    }
    return c;
  }, [reunioes]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return reunioes.filter((r) => {
      const okOrigem = filtro === "Todas" || origemDe(r) === filtro;
      const okBusca =
        !termo || r.titulo.toLowerCase().includes(termo) || r.tags.some((t) => t.toLowerCase().includes(termo));
      return okOrigem && okBusca;
    });
  }, [reunioes, filtro, busca]);

  return (
    <Shell titulo="Reuniões">
      <div className="mx-auto w-full max-w-[1000px] px-5 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[24px] font-semibold tracking-tight text-dash-fg">Reuniões</h1>
            <p className="mt-1 text-[13px] text-dash-muted">Encontre e transcreva reuniões em um só lugar.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setModal(true);
              setAba("gravar");
              setErro("");
              setMicIndisponivel(false);
            }}
            className="flex items-center gap-2 rounded-[10px] bg-dash-brand px-4 py-2.5 text-[13px] font-semibold text-white transition hover:brightness-110"
          >
            <IconeMicrofone className="h-4 w-4" />
            Gravar nova reunião
          </button>
        </div>

        {aviso && (
          <div className="mt-5 flex items-start gap-2 rounded-[10px] border border-dash-ok/30 bg-dash-ok/10 px-4 py-3 text-[12.5px] text-dash-fg">
            <IconeCheck className="mt-0.5 h-4 w-4 shrink-0 text-dash-ok" />
            <span>{aviso}</span>
          </div>
        )}
        {erro && !modal && (
          <div className="mt-5 flex items-start gap-2 rounded-[10px] border border-dash-warn/30 bg-dash-warn/10 px-4 py-3 text-[12.5px] text-dash-fg">
            <IconeAlerta className="mt-0.5 h-4 w-4 shrink-0 text-dash-warn" />
            <span>{erro}</span>
          </div>
        )}

        <div className="mt-7">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold text-dash-fg">Histórico de reuniões</h2>
              <p className="mt-0.5 text-[12px] text-dash-dim">
                {reunioes.length} {reunioes.length === 1 ? "reunião" : "reuniões"}
              </p>
            </div>
            <div className="relative w-full sm:w-[260px]">
              <IconeBusca className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dash-dim" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar reunião"
                className="w-full rounded-[10px] border border-dash-line bg-dash-card py-2 pl-9 pr-3 text-[13px] text-dash-fg outline-none placeholder:text-dash-dim focus:border-dash-brand/60"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {ORIGENS.map((o) => {
              const n = contagens[o] || 0;
              const ativo = filtro === o;
              return (
                <button
                  key={o}
                  type="button"
                  onClick={() => setFiltro(o)}
                  className={`rounded-full border px-3.5 py-1.5 text-[12px] transition ${
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

          <div className="mt-4 overflow-hidden rounded-[12px] border border-dash-line bg-dash-card">
            <div className="hidden grid-cols-[1fr_170px_130px_110px_36px] items-center gap-3 border-b border-dash-hair/[0.08] px-4 py-2.5 md:grid">
              {["Reunião", "Origem", "Data", "Duração", ""].map((h, i) => (
                <span key={i} className="text-[10.5px] uppercase tracking-[0.14em] text-dash-dim">
                  {h}
                </span>
              ))}
            </div>

            {carregando ? (
              <div className="px-4 py-8 text-[12.5px] text-dash-muted">Lendo as reuniões…</div>
            ) : visiveis.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <IconeRelogio className="mx-auto h-5 w-5 text-dash-dim" />
                <p className="mt-2 text-[13px] text-dash-muted">
                  {busca.trim()
                    ? "Nenhuma reunião encontrada nessa busca."
                    : filtro === "Todas"
                      ? "Nenhuma reunião no acervo ainda."
                      : `Nenhuma reunião de ${filtro}.`}
                </p>
                <p className="mt-1 text-[12px] text-dash-dim">
                  Grave uma reunião ou registre uma que já aconteceu.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-dash-hair/[0.07]">
                {visiveis.map((r) => {
                  const origem = origemDe(r);
                  return (
                    <li
                      key={r.caminho}
                      className="grid grid-cols-[1fr_36px] items-center gap-3 px-4 py-3 transition hover:bg-dash-hair/[0.03] md:grid-cols-[1fr_170px_130px_110px_36px]"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-medium text-dash-fg">{r.titulo}</p>
                        <p className="mt-0.5 truncate text-[11.5px] text-dash-dim md:hidden">
                          {origem !== "—" ? `${origem} · ` : ""}
                          {quando(r.modificado)}
                        </p>
                      </div>
                      <div className="hidden md:block">
                        {origem === "—" ? (
                          <span className="text-[12px] text-dash-dim">—</span>
                        ) : (
                          <span className="inline-flex rounded-full border border-dash-line px-2.5 py-0.5 text-[11px] text-dash-muted">
                            {origem}
                          </span>
                        )}
                      </div>
                      <div className="hidden text-[12px] text-dash-muted md:block">{quando(r.modificado)}</div>
                      <div className="hidden text-[12px] text-dash-dim md:block">—</div>
                      <a
                        href={`/dashboard/arca?nota=${encodeURIComponent(r.caminho)}`}
                        className="grid h-7 w-7 place-items-center rounded-full border border-dash-line text-dash-muted transition hover:border-dash-brand/50 hover:text-dash-fg"
                        title="Abrir no acervo"
                      >
                        <span aria-hidden className="text-[14px] leading-none">
                          ›
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <p className="mt-2.5 text-[11px] leading-[1.6] text-dash-dim">
            A duração aparece quando o cano de transcrição gravar o tempo na nota. A seta abre a reunião no
            acervo.
          </p>
        </div>
      </div>

      {modal && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-dash-scrim/55 p-4 backdrop-blur-md">
          <div className="w-full max-w-[520px] overflow-hidden rounded-[14px] border border-dash-line bg-dash-card">
            <div className="flex items-center justify-between gap-3 border-b border-dash-hair/[0.08] px-5 py-3">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-dash-brand/15">
                  <IconeMicrofone className="h-4 w-4 text-dash-brand" />
                </span>
                <h2 className="text-[14px] font-semibold text-dash-fg">Nova reunião</h2>
              </div>
              <span
                className={`rounded-full border px-2.5 py-1 text-[11px] ${
                  micIndisponivel
                    ? "border-dash-warn/40 bg-dash-warn/10 text-dash-warn"
                    : "border-dash-line text-dash-muted"
                }`}
              >
                {micIndisponivel ? "Gravação indisponível" : "Microfone pronto"}
              </span>
            </div>

            <div className="flex gap-2 px-5 pt-4">
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
                  className={`rounded-full border px-3 py-1.5 text-[12px] transition disabled:opacity-40 ${
                    aba === id
                      ? "border-dash-brand bg-dash-brand text-white"
                      : "border-dash-line text-dash-muted hover:text-dash-fg"
                  }`}
                >
                  {id === "gravar" ? "Gravar agora" : "Colar link"}
                </button>
              ))}
            </div>

            <div className="px-5 py-4">
              {aba === "gravar" ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-[11.5px] text-dash-dim">Título</label>
                    <input
                      value={tituloGravacao}
                      onChange={(e) => setTituloGravacao(e.target.value)}
                      placeholder="Reunião com o cliente X"
                      className={`mt-1.5 ${campo}`}
                      disabled={gravando}
                    />
                  </div>

                  <div className="rounded-[10px] border border-dash-line bg-dash-raise px-4 py-4 text-center">
                    <div className="flex h-8 items-end justify-center gap-1">
                      {[10, 18, 26, 16, 30, 22, 12, 20, 28, 14, 24, 18].map((h, i) => (
                        <span
                          key={i}
                          className={`w-1 rounded-full transition-all ${gravando ? "bg-dash-brand" : "bg-dash-line"}`}
                          style={{ height: `${gravando ? h : 4}px` }}
                        />
                      ))}
                    </div>
                    <p className="mt-2 font-mono text-[28px] tabular-nums text-dash-fg">{mmss(segundos)}</p>
                    <p className="mt-0.5 text-[11.5px] text-dash-dim">
                      {gravando
                        ? "Gravando. O áudio entra no acervo ao encerrar."
                        : micIndisponivel
                          ? "Gravação indisponível"
                          : "Pronto para gravar"}
                    </p>
                  </div>

                  {erro && (
                    <div className="flex items-start gap-2 rounded-[10px] border border-dash-warn/30 bg-dash-warn/10 px-3 py-2.5 text-[11.5px] text-dash-fg">
                      <IconeAlerta className="mt-0.5 h-3.5 w-3.5 shrink-0 text-dash-warn" />
                      <span>{erro}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (gravando) return;
                        setModal(false);
                        setErro("");
                        setMicIndisponivel(false);
                      }}
                      className="rounded-[10px] border border-dash-line px-3.5 py-2 text-[12px] text-dash-muted transition hover:text-dash-fg"
                    >
                      Voltar
                    </button>
                    {gravando ? (
                      <button
                        type="button"
                        onClick={() => void enviarGravacao()}
                        disabled={enviando}
                        className="rounded-[10px] bg-dash-brand px-4 py-2 text-[12px] font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
                      >
                        {enviando ? "Enviando…" : "Parar e enviar"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void comecarGravacao()}
                        className="rounded-[10px] bg-dash-brand px-4 py-2 text-[12px] font-semibold text-white transition hover:brightness-110"
                      >
                        {micIndisponivel ? "Tentar novamente" : "Gravar"}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="text-[11.5px] text-dash-dim">Título</label>
                    <input
                      value={tituloLink}
                      onChange={(e) => setTituloLink(e.target.value)}
                      placeholder="Reunião de alinhamento"
                      className={`mt-1.5 ${campo}`}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11.5px] text-dash-dim">Origem</label>
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
                      <label className="text-[11.5px] text-dash-dim">Quando</label>
                      <input
                        type="datetime-local"
                        value={quandoReuniao}
                        onChange={(e) => setQuandoReuniao(e.target.value)}
                        className={`mt-1.5 ${campo}`}
                      />
                    </div>
                  </div>

                  {erro && (
                    <div className="flex items-start gap-2 rounded-[10px] border border-dash-warn/30 bg-dash-warn/10 px-3 py-2.5 text-[11.5px] text-dash-fg">
                      <IconeAlerta className="mt-0.5 h-3.5 w-3.5 shrink-0 text-dash-warn" />
                      <span>{erro}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setModal(false);
                        setErro("");
                      }}
                      className="rounded-[10px] border border-dash-line px-3.5 py-2 text-[12px] text-dash-muted transition hover:text-dash-fg"
                    >
                      Voltar
                    </button>
                    <button
                      type="button"
                      onClick={() => void salvarLink()}
                      disabled={enviando || tituloLink.trim().length < 3}
                      className="rounded-[10px] bg-dash-brand px-4 py-2 text-[12px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
                    >
                      {enviando ? "Registrando…" : "Registrar"}
                    </button>
                  </div>
                  <p className="text-[11px] leading-[1.6] text-dash-dim">
                    A plataforma grava e transcreve. Aqui fica só o índice no acervo.
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
