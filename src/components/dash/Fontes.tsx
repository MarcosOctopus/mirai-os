"use client";

import { useCallback, useEffect, useState } from "react";

import DrivesConectados from "@/components/dash/DrivesConectados";

/**
 * FONTES — o que está ligado TRAZENDO coisa para a Arca.
 *
 * POR QUE EXISTE (18/11/2026): o dono ligou a fonte viva do Google Drive ("fica rodando buscando
 * novidades") e pediu a tela. Fonte sem tela é ligação cega: ninguém vê o que entrou, o que ficou
 * DE FORA (com motivo) nem consegue pedir uma rodada na hora.
 *
 * DESENHO — o dono olhou a primeira versão e disse "melhora essa página aí pelo amor de deus"
 * (18/11/2026). O que estava ruim e o que mudou:
 *   1. ZEROS repetidos ("0 vistos · 0 fora · 0 desistiram") enchiam a tela de caixinha vazia.
 *      Agora NÚMERO ZERO NÃO SE MOSTRA: se não há número, é uma linha só — "nenhum arquivo ainda".
 *   2. Botões desciam em diagonal. Agora cada fonte é UMA linha de leitura: ponto de estado + nome
 *      + a ação sempre no mesmo lugar (à direita, na mesma linha).
 *   3. O MESMO Drive aparecia duas vezes (a fonte do ecossistema e a conexão da pessoa). Aqui em
 *      cima fica só o que é trabalho de coleta; o Drive de gente vive no bloco de baixo, que é a
 *      MESMA peça da Synapse.
 *   4. Dois parágrafos explicativos no pé viraram um. Fonte que ainda não está ligada desce para o
 *      fim, discreta, para não competir com o que já funciona.
 * Vocabulário visual da Synapse (`dash-hair`, `dash-ok`, `dash-fg/…`), como o dono pediu.
 */

type Fonte = {
  id: string;
  nome: string;
  estado: string;
  cadencia: string;
  escopo: string;
  ultimaRodada: string;
  ultimoResumo: string;
  rodando: boolean;
  configurada?: boolean;
  guia?: string;
  numeros: { rastreados: number; noAcervo: number; fora: number; desistiram: number };
  recentes: { nome: string; nota: string; quando: number }[];
  motivosFora: { motivo: string; quantos: number }[];
};

function quando(ms: number): string {
  if (!ms) return "";
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.round(h / 24)} d`;
}

export default function Fontes({ onAbrirNota }: { onAbrirNota?: (caminho: string) => void }) {
  const [fontes, setFontes] = useState<Fonte[]>([]);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [disparando, setDisparando] = useState("");
  const [recado, setRecado] = useState("");

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/acervo/fontes", { cache: "no-store" });
      const d = await r.json().catch(() => null);
      if (!r.ok) {
        setErro((d?.error as string) || `não consegui ler as fontes (HTTP ${r.status})`);
        return;
      }
      setErro("");
      setFontes((d?.fontes as Fonte[]) || []);
    } catch (e) {
      setErro(`falha de rede: ${e instanceof Error ? e.message : "?"}`);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Enquanto houver rodada em curso, a tela acompanha — senão a pessoa aperta de novo e acha
  // que travou. Para sozinha quando a rodada termina.
  const algumaRodando = fontes.some((f) => f.rodando);
  useEffect(() => {
    if (!algumaRodando && !disparando) return;
    const t = setInterval(() => void carregar(), 8000);
    return () => clearInterval(t);
  }, [algumaRodando, disparando, carregar]);

  const sincronizar = useCallback(
    async (id: string) => {
      setDisparando(id);
      setRecado("");
      setErro("");
      try {
        const r = await fetch("/api/acervo/fontes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acao: "sincronizar", fonte: id }),
        });
        const d = await r.json().catch(() => null);
        if (!r.ok) {
          setErro((d?.error as string) || `não consegui disparar (HTTP ${r.status})`);
          return;
        }
        setRecado(
          d?.jaRodando
            ? "já existe uma rodada em curso — a atual continua."
            : (d?.mensagem as string) || "rodada disparada.",
        );
        await carregar();
      } catch (e) {
        setErro(`falha ao disparar: ${e instanceof Error ? e.message : "?"}`);
      } finally {
        setDisparando("");
      }
    },
    [carregar],
  );

  if (carregando) {
    return <p className="px-5 py-6 text-[12.5px] text-dash-fg/55">lendo as fontes…</p>;
  }

  const ligadas = fontes.filter((f) => f.configurada !== false);
  const paradas = fontes.filter((f) => f.configurada === false);

  return (
    <div className="mx-auto w-full max-w-[820px] px-5 pb-10 pt-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <p className="text-[10.5px] uppercase tracking-[0.18em] text-dash-fg/45">fontes</p>
        <span className="rounded-full bg-dash-hair/[0.12] px-2.5 py-[3px] text-[10.5px] text-dash-fg/60">
          {ligadas.length} ligada{ligadas.length === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          onClick={() => void carregar()}
          className="ml-auto rounded-[10px] border border-dash-hair/[0.18] px-3 py-2 text-[11.5px] text-dash-fg/85 transition hover:border-dash-brand/40 hover:text-dash-fg"
        >
          recarregar
        </button>
      </div>

      {erro ? <p className="mt-3 text-[11.5px] text-dash-bad">{erro}</p> : null}
      {recado ? <p className="mt-2 text-[11.5px] text-dash-fg/70">{recado}</p> : null}

      {/* ── O que já está ligado ─────────────────────────────────────────────── */}
      {ligadas.map((fonte) => {
        const rodando = fonte.rodando || disparando === fonte.id;
        const n = fonte.numeros;
        const temNumero = n.noAcervo > 0 || n.rastreados > 0 || n.fora > 0 || n.desistiram > 0;
        return (
          <section
            key={fonte.id}
            data-fonte={fonte.id}
            className="mt-6 border-t border-dash-hair/[0.12] pt-5"
          >
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
              <span
                className={
                  "h-1.5 w-1.5 shrink-0 rounded-full " +
                  (rodando ? "animate-pulse bg-dash-brandHi" : n.noAcervo > 0 ? "bg-dash-ok" : "bg-dash-hair")
                }
                aria-hidden
              />
              <p className="text-[12.5px] font-medium text-dash-fg">{fonte.nome}</p>
              {rodando ? (
                <span className="rounded-full bg-dash-brandHi/[0.14] px-2 py-[2px] text-[10px] text-dash-brandHi">
                  sincronizando
                </span>
              ) : null}
              <button
                type="button"
                data-fontes-sincronizar={fonte.id}
                onClick={() => void sincronizar(fonte.id)}
                disabled={rodando}
                className="ml-auto rounded-[10px] border border-dash-hair/[0.18] px-3 py-2 text-[11.5px] text-dash-fg/85 transition hover:border-dash-brand/40 hover:text-dash-fg disabled:opacity-40"
              >
                {rodando ? "sincronizando…" : "sincronizar agora"}
              </button>
            </div>

            <p className="mt-1.5 text-[11px] text-dash-fg/45">
              {fonte.cadencia} · {fonte.escopo}
              {fonte.ultimaRodada ? ` · última rodada ${fonte.ultimaRodada}` : " · ainda não rodou"}
            </p>

            {temNumero ? (
              <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                {n.noAcervo > 0 ? (
                  <span className="flex items-baseline gap-1.5">
                    <span className="text-[16px] leading-none text-dash-fg tabular-nums">{n.noAcervo}</span>
                    <span className="text-[10.5px] text-dash-fg/45">no acervo</span>
                  </span>
                ) : null}
                {n.rastreados > 0 ? (
                  <span className="flex items-baseline gap-1.5">
                    <span className="text-[13px] leading-none text-dash-fg/75 tabular-nums">
                      {n.rastreados}
                    </span>
                    <span className="text-[10.5px] text-dash-fg/45">arquivos vistos</span>
                  </span>
                ) : null}
                {n.fora > 0 ? (
                  <span className="flex items-baseline gap-1.5">
                    <span className="text-[13px] leading-none text-dash-fg/75 tabular-nums">{n.fora}</span>
                    <span className="text-[10.5px] text-dash-fg/45">ficaram de fora</span>
                  </span>
                ) : null}
                {n.desistiram > 0 ? (
                  <span className="flex items-baseline gap-1.5">
                    <span className="text-[13px] leading-none text-dash-fg/75 tabular-nums">
                      {n.desistiram}
                    </span>
                    <span className="text-[10.5px] text-dash-fg/45">desistiram</span>
                  </span>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 text-[11.5px] text-dash-fg/45">
                nenhum arquivo ainda — “sincronizar agora” faz a primeira leitura.
              </p>
            )}

            {!!fonte.recentes.length && (
              <ul className="mt-3 space-y-1">
                {fonte.recentes.slice(0, 4).map((x) => (
                  <li
                    key={x.nota || x.nome}
                    className="flex items-center gap-3 rounded-[14px] bg-dash-hair/[0.06] px-3.5 py-2.5"
                  >
                    <span className="h-1 w-1 shrink-0 rounded-full bg-dash-ok/70" aria-hidden />
                    <button
                      type="button"
                      onClick={() => onAbrirNota?.(x.nota)}
                      title={x.nota}
                      className="min-w-0 flex-1 truncate text-left text-[12px] text-dash-fg/85 transition hover:text-dash-brandHi"
                    >
                      {x.nome || x.nota}
                    </button>
                    <span className="shrink-0 text-[10.5px] text-dash-fg/35 tabular-nums">
                      {quando(x.quando)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {!!fonte.motivosFora.length && (
              <p className="mt-2.5 text-[11px] leading-[1.5] text-dash-fg/40">
                fora:{" "}
                {fonte.motivosFora.map((m, i) => (
                  <span key={m.motivo}>
                    {i ? " · " : ""}
                    {m.quantos}× {m.motivo}
                  </span>
                ))}
              </p>
            )}
          </section>
        );
      })}

      {/* ── Drive de cada pessoa — a MESMA peça da Synapse ───────────────────── */}
      <DrivesConectados />

      {/* ── O que ainda não está ligado: discreto, no fim ────────────────────── */}
      {paradas.map((fonte) => (
        <section key={fonte.id} data-fonte={fonte.id} className="mt-6 border-t border-dash-hair/[0.12] pt-5">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-dash-hair" aria-hidden />
            <p className="text-[12.5px] text-dash-fg/70">{fonte.nome}</p>
            <span className="text-[11px] text-dash-fg/40">não ligada</span>
          </div>
          <p className="mt-1.5 text-[11.5px] leading-[1.55] text-dash-fg/45">
            Falta o aplicativo no Microsoft Azure e a autorização do administrador do tenant. O passo
            a passo está na Arca em{" "}
            <span className="text-dash-fg/70">{fonte.guia || "03_PROJETOS/arca/"}</span>.
          </p>
        </section>
      ))}

      <p className="mt-8 text-[10.5px] leading-[1.5] text-dash-fg/35">
        A Mirai lê só estas fontes, com o token que cada pessoa autorizou. O que entra vira nota
        catalogada pela Arca.
      </p>
    </div>
  );
}
