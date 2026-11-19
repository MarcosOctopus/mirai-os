"use client";

/**
 * REUNIÃO — a lista vem do ACERVO, não de um banco do app.
 *
 * Duas entradas, dois custos (decisão do dono, 18/11/2026):
 *   · "Colar link" (Meet/Zoom/Teams): a plataforma grava e transcreve; nós
 *     REGISTRAMOS a reunião. Custo zero.
 *   · "Gravar agora" (microfone): o áudio vai para a fila da Arca e o cano único
 *     transcreve no motor de qualidade. Custo ~R$1 por hora de reunião.
 *
 * Regra: nunca transcrever de novo o que a plataforma já transcreveu.
 * Visual: o mesmo do painel (dash-bg/fg/muted, rounded-[10px], chips
 * rounded-full, sem emoji, sem cor inventada).
 */
import { useCallback, useEffect, useRef, useState } from "react";

import Shell from "@/components/dash/Shell";
import { IconeAlerta, IconeCheck, IconeMicrofone, IconeRelogio } from "@/components/dash/icons";

type Reuniao = { caminho: string; titulo: string; tags: string[]; modificado: string };

const PLATAFORMAS = ["Google Meet", "Zoom", "Microsoft Teams", "Presencial"] as const;

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
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function ReuniaoCliente() {
  const [reunioes, setReunioes] = useState<Reuniao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  const [modal, setModal] = useState(false);
  const [aba, setAba] = useState<"gravar" | "link">("gravar");

  // gravação
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [tituloGravacao, setTituloGravacao] = useState("");
  const [enviando, setEnviando] = useState(false);
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
      setErro(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "O navegador bloqueou o microfone. Libere o acesso ao microfone e tente de novo."
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

  return (
    <Shell titulo="Reunião">
      <div className="mx-auto w-full max-w-[900px] px-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-semibold tracking-tight text-dash-fg">Reunião</h1>
            <p className="mt-1 max-w-[520px] text-[13px] leading-[1.6] text-dash-muted">
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
        {erro && (
          <div className="mt-5 flex items-start gap-2 rounded-[12px] border border-dash-warn/30 bg-dash-warn/10 px-4 py-3 text-[13px] text-dash-fg">
            <IconeAlerta className="mt-[2px] h-4 w-4 shrink-0 text-dash-warn" />
            <span>{erro}</span>
          </div>
        )}

        {/* DUAS NATUREZAS, ditos na tela — é o que explica a conta no fim do mês */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[14px] border border-dash-line bg-dash-card px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.16em] text-dash-dim">Importada do workspace</p>
            <p className="mt-1 text-[13px] leading-[1.55] text-dash-muted">
              Meet, Zoom e Teams gravam e transcrevem por conta deles. <span className="text-dash-fg">Custo zero</span> — nós
              só guardamos no acervo.
            </p>
          </div>
          <div className="rounded-[14px] border border-dash-line bg-dash-card px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.16em] text-dash-dim">Gravada aqui</p>
            <p className="mt-1 text-[13px] leading-[1.55] text-dash-muted">
              Reunião presencial ou sem plataforma: o microfone grava e o acervo transcreve.{" "}
              <span className="text-dash-fg">~R$1 por hora</span>.
            </p>
          </div>
        </div>

        <h2 className="mt-9 text-[12px] uppercase tracking-[0.18em] text-dash-dim">No acervo</h2>

        {carregando && <p className="mt-3 text-[13px] text-dash-muted">Lendo o acervo…</p>}

        {!carregando && !erro && reunioes.length === 0 && (
          <div className="mt-3 rounded-[14px] border border-dashed border-dash-line px-5 py-8 text-center">
            <p className="text-[13.5px] text-dash-muted">Nenhuma reunião no acervo ainda.</p>
            <p className="mt-1 text-[12.5px] text-dash-dim">
              Grave uma pelo microfone ou registre o link — as duas caem em 05_REUNIOES.
            </p>
          </div>
        )}

        {reunioes.length > 0 && (
          <ul className="mt-3 divide-y divide-dash-hair/[0.08] overflow-hidden rounded-[14px] border border-dash-line bg-dash-card">
            {reunioes.map((r) => (
              <li key={r.caminho} className="px-5 py-4 transition hover:bg-dash-hair/[0.03]">
                <div className="flex items-start gap-3">
                  <IconeRelogio className="mt-[3px] h-4 w-4 shrink-0 text-dash-brand" />
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium text-dash-fg">{r.titulo}</p>
                    <p className="mt-1 text-[12px] text-dash-dim">
                      {quando(r.modificado)} · {r.caminho}
                    </p>
                    {r.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {r.tags.slice(0, 6).map((t) => (
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
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-dash-scrim/55 p-4 backdrop-blur-md">
          <div className="w-full max-w-[520px] rounded-[24px] border border-dash-line bg-dash-card p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-[18px] font-semibold text-dash-fg">Nova reunião</h3>
              <button
                type="button"
                onClick={() => {
                  if (gravando) return;
                  setModal(false);
                }}
                className="text-[13px] text-dash-muted hover:text-dash-fg"
              >
                fechar
              </button>
            </div>

            <div className="mt-4 flex gap-2">
              {(["gravar", "link"] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  disabled={gravando}
                  onClick={() => setAba(id)}
                  className={`rounded-full px-3.5 py-1.5 text-[12.5px] transition ${
                    aba === id
                      ? "bg-dash-brand text-white"
                      : "border border-dash-line text-dash-muted hover:text-dash-fg"
                  }`}
                >
                  {id === "gravar" ? "Gravar agora" : "Colar link"}
                </button>
              ))}
            </div>

            {aba === "gravar" ? (
              <div className="mt-5">
                <label className="block text-[12px] text-dash-dim">Título</label>
                <input
                  value={tituloGravacao}
                  onChange={(e) => setTituloGravacao(e.target.value)}
                  placeholder="Reunião com o cliente X"
                  className={`mt-1.5 ${campo}`}
                  disabled={gravando}
                />
                <p className="mt-2 text-[12px] leading-[1.5] text-dash-dim">
                  Grava o microfone deste dispositivo. A transcrição entra no acervo em 05_REUNIOES.
                </p>

                <div className="mt-4 flex items-center gap-3">
                  {!gravando ? (
                    <button
                      type="button"
                      onClick={() => void comecarGravacao()}
                      className="flex items-center gap-2 rounded-[10px] bg-dash-brand px-4 py-2.5 text-[13.5px] font-semibold text-white hover:brightness-110"
                    >
                      <IconeMicrofone className="h-4 w-4" />
                      Começar a gravar
                    </button>
                  ) : (
                    <>
                      <span className="font-mono text-[15px] text-dash-fg">{mmss(segundos)}</span>
                      <button
                        type="button"
                        onClick={() => void enviarGravacao()}
                        disabled={enviando}
                        className="rounded-[10px] bg-dash-brand px-4 py-2.5 text-[13.5px] font-semibold text-white hover:brightness-110 disabled:opacity-60"
                      >
                        {enviando ? "Enviando…" : "Parar e enviar"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-5 space-y-3">
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
                <p className="text-[12px] leading-[1.5] text-dash-dim">
                  Registra a reunião no acervo. A gravação e a transcrição continuam no workspace da
                  plataforma — quando forem importadas, entram como nota própria.
                </p>
                <button
                  type="button"
                  onClick={() => void salvarLink()}
                  disabled={enviando || tituloLink.trim().length < 3}
                  className="w-full rounded-[10px] bg-dash-brand px-4 py-2.5 text-[13.5px] font-semibold text-white hover:brightness-110 disabled:opacity-50"
                >
                  {enviando ? "Registrando…" : "Registrar no acervo"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </Shell>
  );
}