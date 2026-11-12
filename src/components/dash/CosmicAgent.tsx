"use client";

/**
 * COSMIC AGENT — a peça, sem casca. (pedido do dono, 11/11/2026)
 *
 * "usa esse padrão nosso já do nosso painel MIRAI OS. coloca a fotinha no lugar
 *  da marca. uma fotinha full screen estilo metal slug. deixa junto no synapse:
 *  Integrações, Skills e Cosmic Agent. faz uma cópia exata da página de Skills
 *  para o Cosmic Agent e só adapta. coloca ela em primeiro."
 *
 * UMA PEÇA, DUAS SUPERFÍCIES (princípio do próprio app, igual `SkillsEspelho`):
 * esta seção é desenhada na aba do Synapse e na página `/dashboard/cosmic-agent`.
 * Por isso ela NÃO traz `Shell` nem busca o usuário — quem entra já tem os dois.
 *
 * COPIADO da página de Skills: cabeçalho com contagem, busca em pílula, chips de
 * filtro, a MESMA grade (`repeat(auto-fill,minmax(214px,1fr))`) e o detalhe por
 * cima. ADAPTADO: o card é o do painel (moldura do template + área de cor + faixa
 * escura) e onde ele mostra a MARCA entra a FOTINHA do agente — pixel art estilo
 * Metal Slug em `public/cosmic/<slug>.png`, com `imageRendering: pixelated`.
 *
 * O DADO é o rastro de verdade (`/api/canais`). Agente sem fala diz "sem falas
 * ainda": a tela não inventa atividade.
 */

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { A, ARTES_CARD } from "@/components/dash/integracao-cards";
import { IconeFechar } from "@/components/dash/icons";
import { VIDRO } from "@/lib/vidro";
import { AGENTES, agentePorNome, type Agente } from "@/lib/cosmic-agentes";

type Fala = {
  id: number;
  de_quem: string;
  para_quem?: string;
  texto: string;
  criado_em: string;
};

const TODOS = "todos";

export default function CosmicAgent() {
  const [falas, setFalas] = useState<Fala[]>([]);
  const [canais, setCanais] = useState<number>(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [tema, setTema] = useState<string>(TODOS);
  const [aberto, setAberto] = useState<Agente | null>(null);
  const [falhas, setFalhas] = useState<Record<string, boolean>>({});

  // C3 — FOREMAN: do objetivo ao time. O cliente descreve o que precisa e recebe uma
  // PROPOSTA; nada é criado até ele aprovar. Propor e aprovar são atos separados — é a
  // regra da casa virando tela: objetivo não é autorização.
  type PapelProposto = { papel: string; identidade: string; ferramentas: string[]; limite: string; exige_aprovacao: string[] };
  type Proposta = { id: string; objetivo: string; papeis: PapelProposto[]; aviso?: string };
  const [objetivo, setObjetivo] = useState("");
  const [proposta, setProposta] = useState<Proposta | null>(null);
  const [foremanRecado, setForemanRecado] = useState("");
  const [foremanOcupado, setForemanOcupado] = useState(false);

  // C4 — o time aprovado e o trabalho dele. `time` guarda a proposta aprovada (id + papéis)
  // para o cliente poder MANDAR trabalhar sem recarregar a página.
  type Time = { id: string; papeis: PapelProposto[] };
  type ResultadoTarefa = { acao: string; status: string; papel?: string; motivo?: string; http?: number };
  const [time, setTime] = useState<Time | null>(null);
  const [tarefaAcao, setTarefaAcao] = useState("");
  const [tarefaArgs, setTarefaArgs] = useState("");
  const [despacho, setDespacho] = useState<{ executadas: number; recusadas: number; resultados: ResultadoTarefa[] } | null>(null);
  const [agendaMin, setAgendaMin] = useState("0");
  const [agendaCriada, setAgendaCriada] = useState<{ id: string; proxima_em?: string | null } | null>(null);
  const [trabalhando, setTrabalhando] = useState(false);

  async function proporTime() {
    const texto = objetivo.trim();
    if (texto.length < 8) {
      setForemanRecado("Descreva o objetivo em uma frase.");
      return;
    }
    setForemanOcupado(true);
    setForemanRecado("");
    setProposta(null);
    try {
      const r = await fetch("/api/canais", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foreman: "propor", objetivo: texto }),
      });
      const d = await r.json();
      if (!r.ok) {
        setForemanRecado(d?.detail || d?.erro || "não consegui propor agora");
        return;
      }
      const p = (d?.proposta || null) as Proposta | null;
      setProposta(p);
      if (!p?.papeis?.length) {
        setForemanRecado(
          p?.aviso ||
            "Nenhum papel casou com esse objetivo — tente as palavras do trabalho (acervo, nota, buscar, canal, publicar).",
        );
      }
    } catch {
      setForemanRecado("falha de rede ao propor");
    } finally {
      setForemanOcupado(false);
    }
  }

  async function aprovarTime() {
    if (!proposta) return;
    setForemanOcupado(true);
    setForemanRecado("");
    try {
      const r = await fetch("/api/canais", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foreman: "aprovar", proposta: proposta.id }),
      });
      const d = await r.json();
      if (!r.ok) {
        setForemanRecado(d?.detail || d?.erro || "não consegui aprovar agora");
        return;
      }
      const n = (d?.criados || []).length;
      const sens = (d?.nao_concedido_por_ser_sensitive || []) as string[];
      setForemanRecado(
        `Time criado: ${n} papel(is).` +
          (sens.length ? ` Sensível fica de fora e pede aprovação a cada chamada: ${sens.join(", ")}.` : ""),
      );
      setProposta(null);
      setObjetivo("");
      // guarda o time aprovado: é ele que recebe as tarefas logo abaixo
      setTime({ id: proposta.id, papeis: proposta.papeis });
      setTarefaAcao(proposta.papeis.flatMap((p) => p.ferramentas)[0] || "");
    } catch {
      setForemanRecado("falha de rede ao aprovar");
    } finally {
      setForemanOcupado(false);
    }
  }

  const ferramentasDoTime = time ? Array.from(new Set(time.papeis.flatMap((p) => p.ferramentas))) : [];

  async function despacharTarefa() {
    if (!time || !tarefaAcao) return;
    setTrabalhando(true);
    setDespacho(null);
    setForemanRecado("");
    try {
      let argumentos: Record<string, unknown> = {};
      if (tarefaArgs.trim()) {
        try {
          argumentos = JSON.parse(tarefaArgs) as Record<string, unknown>;
        } catch {
          setForemanRecado("Os argumentos precisam ser JSON válido.");
          return;
        }
      }
      const r = await fetch("/api/canais", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          foreman: "despachar",
          proposta: time.id,
          tarefas: [{ acao: tarefaAcao, argumentos }],
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        setForemanRecado(d?.detail || d?.erro || "não consegui despachar agora");
        return;
      }
      setDespacho(d);
    } catch {
      setForemanRecado("falha de rede ao despachar");
    } finally {
      setTrabalhando(false);
    }
  }

  async function agendarTime() {
    if (!time || !tarefaAcao) return;
    setTrabalhando(true);
    setAgendaCriada(null);
    setForemanRecado("");
    try {
      const r = await fetch("/api/canais", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          foreman: "agendar",
          proposta: time.id,
          tarefas: [{ acao: tarefaAcao, argumentos: {} }],
          intervalo_min: Number(agendaMin) || 0,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        setForemanRecado(d?.detail || d?.erro || "não consegui agendar agora");
        return;
      }
      setAgendaCriada(d);
    } catch {
      setForemanRecado("falha de rede ao agendar");
    } finally {
      setTrabalhando(false);
    }
  }

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const rc = await fetch("/api/canais", { cache: "no-store" });
      if (rc.status === 401) {
        setErro("Entre na sua conta para ver o Cosmic Agent.");
        return;
      }
      const dc = (await rc.json().catch(() => null)) as { canais?: { id: string }[] } | null;
      const lista = Array.isArray(dc?.canais) ? dc!.canais! : [];
      setCanais(lista.length);

      const todas: Fala[] = [];
      for (const c of lista.slice(0, 3)) {
        const r = await fetch(`/api/canais?canal=${encodeURIComponent(c.id)}`, { cache: "no-store" });
        if (!r.ok) continue;
        const d = (await r.json().catch(() => null)) as { mensagens?: Fala[] } | null;
        if (Array.isArray(d?.mensagens)) todas.push(...d.mensagens);
      }
      setFalas(todas);
    } catch {
      setErro("Caiu a conexão ao ler o canal.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
    // o rastro é vivo: recarrega de tempos em tempos enquanto a aba está aberta
    const t = setInterval(() => void carregar(), 15000);
    return () => clearInterval(t);
  }, [carregar]);

  /** quantas falas cada agente tem no rastro (pelo nome de chamada). */
  const porAgente = useMemo(() => {
    const m: Record<string, Fala[]> = {};
    for (const f of falas) {
      const a = agentePorNome(f.de_quem);
      const chave = a?.nome || f.de_quem.replace(/^pessoa:/, "");
      (m[chave] = m[chave] || []).push(f);
    }
    return m;
  }, [falas]);

  /** os agentes que JÁ FALARAM no rastro — é o que "usados" quer dizer. Ordenado
   *  por uso: quem falou mais aparece primeiro. Agente sem fala NÃO entra na
   *  tabela (a tela não inventa atividade). */
  const usados = useMemo(() => {
    return AGENTES.map((a) => ({ a, dele: porAgente[a.nome] || [] }))
      .filter((x) => x.dele.length > 0)
      .sort((x, y) => y.dele.length - x.dele.length);
  }, [porAgente]);

  /** a faixa dos principais é um CARROSSEL: anda pro lado UMA PEÇA por vez, sozinho.
   *  O passo é a largura de uma peça + o vão — medido do DOM, não chutado. */
  const faixaRef = useRef<HTMLDivElement | null>(null);
  const pausadoRef = useRef(false);

  const passo = useCallback(() => {
    const el = faixaRef.current;
    if (!el) return 0;
    const card = el.firstElementChild as HTMLElement | null;
    if (!card) return el.clientWidth;
    const vao = parseFloat(getComputedStyle(el).columnGap || "12") || 12;
    return card.getBoundingClientRect().width + vao;
  }, []);

  const rolarFaixa = useCallback(
    (dir: number) => {
      const el = faixaRef.current;
      if (!el) return;
      el.scrollBy({ left: dir * passo(), behavior: "smooth" });
    },
    [passo],
  );

  /** AUTOMÁTICO: uma peça por vez, a cada 3,8s, voltando ao começo no fim. Pausa
   *  quando o mouse entra, quando algo recebe foco ou quando o dedo toca — quem
   *  está olhando manda. E respeita "movimento reduzido": sem automático. */
  useEffect(() => {
    const el = faixaRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => {
      if (pausadoRef.current) return;
      const fim = el.scrollWidth - el.clientWidth;
      if (el.scrollLeft >= fim - 4) {
        el.scrollTo({ left: 0, behavior: "smooth" });
      } else {
        el.scrollBy({ left: passo(), behavior: "smooth" });
      }
    }, 3800);
    return () => clearInterval(t);
  }, [passo]);

  const temas = useMemo(() => Array.from(new Set(AGENTES.map((a) => a.tema))), []);

  const filtrados = useMemo(() => {
    const semAcento = (t: string) =>
      t
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
    const termos = semAcento(busca).split(/\s+/).filter(Boolean);
    return AGENTES.filter((a) => {
      if (termos.length) {
        const alvo = semAcento(`${a.nome} ${a.tema} ${a.descricao}`);
        return termos.every((t) => alvo.includes(t));
      }
      return tema === TODOS || a.tema === tema;
    });
  }, [busca, tema]);

  return (
    <section data-cosmic-agent className="mt-[27px]">
      {/* ── O SLIDE — o MODELO DO SITE que o dono mandou, medido no print dele: a
          faixa ocupa a LARGURA INTEIRA, de ponta a ponta (x=0 a 1266 de 1280), com
          4 peças de 0,80 de proporção (largura/altura) e vão curto entre elas. Nada
          de card solto no meio, nada de quadrado, nada de rótulo em cima. A foto
          fica à esquerda e a barra laranja à direita com o nome girado. A GRADE
          ABAIXO FICA COMO ESTAVA. ───────────────────────────────────────── */}
      {/* C3 — FOREMAN: o cliente descreve o objetivo e vê o time PROPOSTO. Nada é criado
          até ele aprovar — e a tela diz isso com todas as letras. */}
      <div data-cosmic-foreman className="mb-[30px] rounded-[24px] border border-dash-hair/10 bg-dash-card p-[18px]">
        <div className="mb-[10px] flex flex-wrap items-center gap-[10px]">
          <span className="rounded-full border border-dash-brand/30 px-[10px] py-[3px] text-[11px] font-semibold uppercase tracking-[0.12em] text-dash-brand">
            Super Nova
          </span>
          <span className="text-[12.5px] text-dash-muted">
            Descreva o objetivo. Ele propõe o time — e só cria quando você aprovar.
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-[10px]">
          <input
            value={objetivo}
            onChange={(e) => setObjetivo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void proporTime();
            }}
            placeholder="Ex.: organizar as notas do acervo e achar o que ja escrevi sobre precos"
            className="min-w-[240px] flex-1 rounded-[10px] border border-dash-hair/15 bg-dash-bg px-[12px] py-[9px] text-[13px] text-dash-fg outline-none placeholder:text-dash-muted/60 focus:border-dash-brand/50"
          />
          <button
            type="button"
            onClick={() => void proporTime()}
            disabled={foremanOcupado}
            className="rounded-[10px] bg-dash-brand px-[16px] py-[9px] text-[13px] font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            {foremanOcupado ? "Trabalhando…" : "Propor time"}
          </button>
        </div>

        {foremanRecado ? <p className="mt-[10px] text-[12.5px] text-dash-muted">{foremanRecado}</p> : null}

        {proposta ? (
          <div data-foreman-proposta={proposta.id} className="mt-[14px]">
            <p className="mb-[10px] text-[12.5px] text-dash-muted">
              Proposta para: <span className="text-dash-fg">{proposta.objetivo}</span> · nada foi criado ainda
            </p>
            <div className="grid gap-[10px] md:grid-cols-2">
              {proposta.papeis.map((p) => (
                <div key={p.identidade} className="rounded-[10px] border border-dash-hair/10 bg-dash-bg/40 p-[12px]">
                  <div className="flex items-center justify-between gap-[8px]">
                    <span className="text-[13.5px] font-semibold text-dash-fg">{p.papel}</span>
                    <span className="rounded-full border border-dash-hair/20 px-[9px] py-[2px] text-[11px] text-dash-muted">
                      {p.limite}
                    </span>
                  </div>
                  <p className="mt-[6px] text-[11.5px] text-dash-muted">{p.identidade}</p>
                  <p className="mt-[8px] text-[12px] text-dash-fg/80">{p.ferramentas.slice(0, 8).join(" · ")}</p>
                  {p.exige_aprovacao.length ? (
                    <p className="mt-[8px] text-[11.5px] text-dash-muted">
                      Sensível (aprovação a cada chamada): {p.exige_aprovacao.join(", ")}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void aprovarTime()}
              disabled={foremanOcupado}
              className="mt-[14px] rounded-[10px] bg-dash-brand px-[18px] py-[10px] text-[13px] font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              Aprovar e criar time
            </button>
          </div>
        ) : null}
      </div>

      {time ? (
        <div data-cosmic-trabalho className="mb-[30px] rounded-[24px] border border-dash-hair/10 bg-dash-card p-[18px]">
          <div className="mb-[10px] flex flex-wrap items-center gap-[10px]">
            <span className="rounded-full border border-dash-brand/30 px-[10px] py-[3px] text-[11px] font-semibold uppercase tracking-[0.12em] text-dash-brand">
              Time
            </span>
            <span className="text-[12.5px] text-dash-muted">
              Mande o time trabalhar. Cada tarefa passa pelo grant e deixa recibo.
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-[10px]">
            <select
              value={tarefaAcao}
              onChange={(e) => setTarefaAcao(e.target.value)}
              className="min-w-[200px] rounded-[10px] border border-dash-hair/15 bg-dash-bg px-[12px] py-[9px] text-[13px] text-dash-fg outline-none focus:border-dash-brand/50"
            >
              <option value="">Escolha a ferramenta…</option>
              {ferramentasDoTime.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <input
              value={tarefaArgs}
              onChange={(e) => setTarefaArgs(e.target.value)}
              placeholder='argumentos em JSON (opcional): {"caminho":"notas"}'
              className="min-w-[220px] flex-1 rounded-[10px] border border-dash-hair/15 bg-dash-bg px-[12px] py-[9px] text-[13px] text-dash-fg outline-none placeholder:text-dash-muted/60 focus:border-dash-brand/50"
            />
            <button
              type="button"
              onClick={() => void despacharTarefa()}
              disabled={trabalhando || !tarefaAcao}
              className="rounded-[10px] bg-dash-brand px-[16px] py-[9px] text-[13px] font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              {trabalhando ? "Executando…" : "Despachar"}
            </button>
          </div>

          <div className="mt-[10px] flex flex-wrap items-center gap-[10px]">
            <span className="text-[12px] text-dash-muted">Repetir a cada</span>
            <input
              value={agendaMin}
              onChange={(e) => setAgendaMin(e.target.value)}
              inputMode="numeric"
              className="w-[70px] rounded-[10px] border border-dash-hair/15 bg-dash-bg px-[10px] py-[7px] text-[13px] text-dash-fg outline-none focus:border-dash-brand/50"
            />
            <span className="text-[12px] text-dash-muted">min (0 = só quando eu pedir)</span>
            <button
              type="button"
              onClick={() => void agendarTime()}
              disabled={trabalhando || !tarefaAcao}
              className="rounded-[10px] border border-dash-hair/20 px-[14px] py-[8px] text-[12.5px] font-semibold text-dash-fg transition hover:border-dash-brand/40 disabled:opacity-50"
            >
              Agendar
            </button>
          </div>

          {agendaCriada ? (
            <p className="mt-[10px] text-[12.5px] text-dash-muted">
              Agenda criada: {agendaCriada.id}
              {agendaCriada.proxima_em ? ` · próxima ${agendaCriada.proxima_em}` : " · manual"}
            </p>
          ) : null}

          {despacho ? (
            <div className="mt-[12px]">
              <p className="text-[12.5px] text-dash-muted">
                {despacho.executadas} executada(s) · {despacho.recusadas} recusada(s)
              </p>
              <div className="mt-[8px] grid gap-[8px]">
                {despacho.resultados.map((r, i) => (
                  <div
                    key={`${r.acao}-${i}`}
                    className="rounded-[10px] border border-dash-hair/10 bg-dash-bg/40 p-[10px]"
                  >
                    <div className="flex items-center justify-between gap-[8px]">
                      <span className="text-[12.5px] font-semibold text-dash-fg">{r.acao}</span>
                      <span className="rounded-full border border-dash-hair/20 px-[9px] py-[2px] text-[11px] text-dash-muted">
                        {r.status}
                      </span>
                    </div>
                    {r.papel ? <p className="mt-[4px] text-[11.5px] text-dash-muted">por {r.papel}</p> : null}
                    {r.motivo ? <p className="mt-[4px] text-[11.5px] text-dash-muted">{r.motivo}</p> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div data-cosmic-slide className="mb-[30px]">
        {/* as setas do carrossel — sem rótulo em cima, só o comando */}
        <div className="mb-[9px] flex justify-end gap-2">
          <button
            type="button"
            onClick={() => rolarFaixa(-1)}
            aria-label="Anterior"
            className="grid h-[28px] w-[28px] place-items-center rounded-full border border-dash-hair/12 text-[15px] leading-none text-dash-muted transition hover:border-dash-brand/40 hover:text-dash-fg"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => rolarFaixa(1)}
            aria-label="Próximo"
            className="grid h-[28px] w-[28px] place-items-center rounded-full border border-dash-hair/12 text-[15px] leading-none text-dash-muted transition hover:border-dash-brand/40 hover:text-dash-fg"
          >
            ›
          </button>
        </div>
        <div
          ref={faixaRef}
          data-cosmic-faixa
          onMouseEnter={() => {
            pausadoRef.current = true;
          }}
          onMouseLeave={() => {
            pausadoRef.current = false;
          }}
          onFocus={() => {
            pausadoRef.current = true;
          }}
          onBlur={() => {
            pausadoRef.current = false;
          }}
          onTouchStart={() => {
            pausadoRef.current = true;
          }}
          onTouchEnd={() => {
            setTimeout(() => {
              pausadoRef.current = false;
            }, 2500);
          }}
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {AGENTES.map((a, i) => {
            const dele = porAgente[a.nome] || [];
            return (
              <article
                key={a.nome}
                data-slide-agente={a.nome}
                role="button"
                tabIndex={0}
                aria-label={`Ver ${a.nome}`}
                onClick={() => setAberto(a)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setAberto(a);
                  }
                }}
                style={{ animationDelay: `${i * 90}ms` }}
                className="cosmic-reveal group relative aspect-[7/10] w-[calc(50%-6px)] shrink-0 snap-start cursor-pointer overflow-hidden rounded-[10px] border border-dash-hair/10 bg-dash-card transition duration-300 hover:-translate-y-[3px] hover:shadow-[0_22px_46px_-16px_rgba(255,117,31,0.45)] focus:outline-none focus-visible:ring-2 focus-visible:ring-dash-brand/60 md:w-[calc(25%-9px)]"
              >
                {/* a luz que atravessa a peça — o "vivo" do site, contido */}
                <span
                  aria-hidden
                  className="cosmic-sheen pointer-events-none absolute inset-y-0 left-0 z-10 w-1/3 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                />
                <div className="flex h-full">
                  <div className="relative min-w-0 flex-1" style={{ backgroundColor: a.cor }}>
                    {!falhas[a.nome] ? (
                      <img
                        src={a.imagem}
                        alt={a.nome}
                        loading="lazy"
                        onError={() => setFalhas((f) => ({ ...f, [a.nome]: true }))}
                        className="h-full w-full transition-transform duration-700 ease-out group-hover:scale-[1.06]"
                        style={{ imageRendering: "pixelated", objectFit: "contain", padding: "28px" }}
                      />
                    ) : (
                      <span
                        className="grid h-full w-full place-items-center text-[36px] font-bold text-black/40"
                        aria-hidden
                      >
                        {a.nome.charAt(0)}
                      </span>
                    )}
                  </div>
                  <div className="flex w-[16%] min-w-[34px] shrink-0 flex-col items-center justify-between bg-dash-brand py-[12px]">
                    <div className="flex flex-col items-center gap-[4px] text-[10px] leading-none text-black/55" aria-hidden>
                      <span>★</span>
                      <span>★</span>
                    </div>
                    <span
                      className="whitespace-nowrap text-[12.5px] font-bold uppercase tracking-[0.14em] text-white"
                      style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                    >
                      {a.nome}
                    </span>
                    <span
                      className="grid h-[22px] w-[22px] place-items-center rounded-full text-[9px] leading-none text-white"
                      style={{ backgroundColor: dele.length ? "rgba(0,0,0,0.42)" : "rgba(0,0,0,0.22)" }}
                      title={dele.length ? `${dele.length} fala(s) no rastro` : "sem falas ainda"}
                      aria-hidden
                    >
                      ●
                    </span>
                    <span className="text-[10px] leading-none text-black/55" aria-hidden>
                      ★
                    </span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-5">
        <h2 className="text-[20px] font-bold text-dash-fg">Agentes</h2>
        <span data-cosmic-contagem className="text-[13px] text-dash-muted">
          {carregando ? "lendo…" : `${filtrados.length} de ${AGENTES.length}`}
          {canais ? ` · ${canais} ${canais === 1 ? "canal" : "canais"}` : ""}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <label className="hidden h-[30px] w-[209px] items-center rounded-full bg-dash-side px-4 md:flex">
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar"
              className="min-w-0 flex-1 bg-transparent text-[10px] italic text-dash-fg outline-none placeholder:text-dash-muted"
            />
            <img src={`${A}/3c6cf.svg`} alt="" className="h-[13px] w-[13px]" />
          </label>
        </div>
      </div>

      {/* chips: os temas dos agentes, na mesma pílula da página de Skills */}
      <div className="mt-5 flex gap-5 overflow-x-auto pb-2">
        <button
          onClick={() => setTema(TODOS)}
          data-tema="todos"
          className={`shrink-0 rounded-full px-2.5 py-[5px] text-[10px] transition ${
            tema === TODOS ? "bg-dash-brand text-dash-fg" : "bg-dash-raise text-dash-muted hover:text-dash-fg"
          }`}
        >
          <img src={`${A}/4006b.svg`} alt="" className="mr-1 inline h-[9px] w-[6px]" />
          Todos
        </button>
        {temas.map((c) => (
          <button
            key={c}
            onClick={() => setTema(c)}
            data-tema={c}
            className={`shrink-0 rounded-full px-2.5 py-[5px] text-[10px] capitalize transition ${
              tema === c ? "bg-dash-brand text-dash-fg" : "bg-dash-raise text-dash-muted hover:text-dash-fg"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {erro ? (
        <p data-cosmic-erro className="mt-[27px] text-[12.5px] text-dash-bad">
          {erro}
        </p>
      ) : (
        <div
          data-cosmic-visiveis={filtrados.length}
          className="mt-[27px] grid justify-items-center gap-[18px] [grid-template-columns:repeat(auto-fill,minmax(214px,1fr))]"
        >
          {filtrados.map((a, i) => {
            const dele = porAgente[a.nome] || [];
            const arte = ARTES_CARD[i % ARTES_CARD.length];
            return (
              <article
                key={a.nome}
                data-agente={a.nome}
                role="button"
                tabIndex={0}
                aria-label={`Abrir ${a.nome}`}
                onClick={() => setAberto(a)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setAberto(a);
                  }
                }}
                className="group relative h-[159px] w-[153px] shrink-0 cursor-pointer transition duration-200 hover:-translate-y-[2px] focus:outline-none focus-visible:ring-2 focus-visible:ring-dash-brand/60"
              >
                <img src={`${A}/${arte}`} alt="" className="absolute inset-0 h-[159px] w-[153px]" />

                {/* A ÁREA DA MARCA — agora é a área da FOTINHA: onde o painel mostra
                    o logo, entra o agente. */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute left-0 top-0 h-[98px] w-[153px] overflow-hidden"
                  style={{
                    backgroundColor: a.cor,
                    WebkitMaskImage: `url("${A}/${arte}")`,
                    maskImage: `url("${A}/${arte}")`,
                    WebkitMaskSize: "153px 159px",
                    maskSize: "153px 159px",
                    WebkitMaskRepeat: "no-repeat",
                    maskRepeat: "no-repeat",
                  }}
                />
                {!falhas[a.nome] ? (
                  <img
                    src={a.imagem}
                    alt={a.nome}
                    loading="lazy"
                    onError={() => setFalhas((f) => ({ ...f, [a.nome]: true }))}
                    className="pointer-events-none absolute left-0 top-0 h-[98px] w-[153px] object-contain"
                    style={{ imageRendering: "pixelated" }}
                  />
                ) : (
                  <span
                    className="pointer-events-none absolute left-0 top-0 grid h-[98px] w-[153px] place-items-center text-[30px] font-bold text-black/40"
                    aria-hidden
                  >
                    {a.nome.charAt(0)}
                  </span>
                )}

                {/* a faixa escura de baixo: nome, papel e estado — igual ao painel */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 px-[13px] pb-[9px] pt-[6px]">
                  <p className="truncate text-[13px] font-semibold text-[#ff751f]">{a.nome}</p>
                  <p className="truncate text-[9px] uppercase tracking-[0.12em] text-dash-muted">{a.tema}</p>
                  <p className="mt-[2px] flex items-center gap-[5px] truncate text-[9.5px] text-dash-muted">
                    <span
                      className="inline-block h-[5px] w-[5px] shrink-0 rounded-full"
                      style={{ backgroundColor: dele.length ? "#22c55e" : "#6b7280" }}
                    />
                    {dele.length ? `${dele.length} ${dele.length === 1 ? "fala" : "falas"}` : "sem falas ainda"}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* ── MEUS AGENTES USADOS (espelho de "Minhas integrações" e "Minhas skills"):
          título + contagem REAL + "atualizar" + a tabela dos agentes que já falaram
          no rastro. Pedido do dono, 11/11/2026: "tem que ser meus agentes usados
          ou algo assim". Ordenado por uso; agente sem fala não aparece aqui.─── */}
      <section data-agentes-usados className="mt-[30px]">
        <div className="mb-[19px] flex flex-wrap items-center gap-5">
          <h2 className="text-[20px] font-bold text-dash-fg">Meus agentes usados</h2>
          <span data-usados-contagem className="text-[13px] text-dash-muted">
            {carregando ? "lendo…" : `${usados.length} de ${AGENTES.length}`}
          </span>
          <div className="ml-auto flex items-center gap-3">
            <button
              type="button"
              onClick={() => void carregar()}
              className="rounded-[10px] border border-dash-hair/12 px-4 py-2 text-[12px] text-dash-muted transition hover:text-dash-fg"
            >
              atualizar
            </button>
          </div>
        </div>

        {carregando && !usados.length ? (
          <p className="text-[12px] text-dash-dim">Lendo o rastro dos agentes…</p>
        ) : usados.length === 0 ? (
          <div className="rounded-[16px] border border-dash-hair/10 bg-dash-side px-5 py-6">
            <p className="text-[13px] font-semibold text-dash-fg">Nenhum agente usado ainda</p>
            <p className="mt-1 text-[12px] leading-[1.6] text-dash-muted">
              Quando um agente falar num dos seus canais, ele aparece aqui com o que disse.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[16px] border border-dash-hair/10">
            <div className="hidden grid-cols-[1.1fr_0.9fr_0.5fr_1.6fr_auto] gap-4 border-b border-dash-hair/10 bg-dash-side px-5 py-[10px] text-[10.5px] uppercase tracking-[0.12em] text-dash-dim md:grid">
              <span>Agente</span>
              <span>Papel</span>
              <span>Falas</span>
              <span>Última fala</span>
              <span className="text-right">Ação</span>
            </div>
            {usados.map(({ a, dele }) => {
              const ultima = dele[dele.length - 1];
              return (
                <div
                  key={a.nome}
                  data-agente-usado={a.nome}
                  className="grid grid-cols-1 gap-2 border-b border-dash-hair/10 px-5 py-[13px] last:border-b-0 md:grid-cols-[1.1fr_0.9fr_0.5fr_1.6fr_auto] md:items-center md:gap-4"
                >
                  <span className="flex items-center gap-2 text-[13px] font-semibold text-dash-fg">
                    <span
                      className="inline-block h-[7px] w-[7px] shrink-0 rounded-full"
                      style={{ backgroundColor: a.cor }}
                    />
                    {a.nome}
                  </span>
                  <span className="text-[12px] text-dash-muted">{a.tema}</span>
                  <span className="text-[12px] text-dash-muted">{dele.length}</span>
                  <span className="truncate text-[12px] text-dash-muted">
                    {ultima ? `${ultima.texto.slice(0, 90)}${ultima.texto.length > 90 ? "…" : ""}` : "—"}
                  </span>
                  <span className="md:text-right">
                    <button
                      type="button"
                      onClick={() => setAberto(a)}
                      className="rounded-[10px] border border-dash-hair/12 px-3 py-[6px] text-[11.5px] text-dash-muted transition hover:text-dash-fg"
                    >
                      abrir
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* O DETALHE DO AGENTE — MESMO PADRÃO do modal de integração (`ModalProduto`
          em /dashboard/connect): overlay com desfoque, diálogo `rounded-[30px]` com
          VIDRO, foto em destaque sobre a cor do agente (96px, como a marca lá),
          nome em 22px, o par de chips (papel + rastro) e as ações à direita.
          Dono, 11/11/2026: "quando abre o modal tem que ser exato no padrão de
          quando abre uma integração". */}
      {aberto ? (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setAberto(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setAberto(null);
          }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-dash-scrim/55 px-4 backdrop-blur-md"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${aberto.nome} — informações do agente`}
            data-agente-detalhe={aberto.nome}
            className="relative max-h-[90vh] w-full max-w-[520px] overflow-y-auto rounded-[30px] border border-dash-hair/[0.18] p-7 text-dash-fg"
            style={VIDRO}
          >
            <button
              type="button"
              onClick={() => setAberto(null)}
              aria-label="Fechar"
              className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-[10px] text-dash-fg/70 transition hover:bg-dash-hair/[0.14] hover:text-dash-fg"
            >
              <IconeFechar className="h-4 w-4" />
            </button>

            {/* a FOTO em destaque, sobre a cor do agente — o mesmo critério do modal
                de integração, que põe a marca branca sobre a cor da marca. */}
            <div className="flex items-center gap-5 pr-10">
              <span
                className="grid h-[96px] w-[96px] shrink-0 place-items-center overflow-hidden rounded-[24px]"
                style={{ backgroundColor: aberto.cor }}
              >
                {!falhas[aberto.nome] ? (
                  <img
                    src={aberto.imagem}
                    alt={aberto.nome}
                    className="h-full w-full"
                    style={{ imageRendering: "pixelated", objectFit: "contain", padding: "8px" }}
                  />
                ) : (
                  <span className="text-[30px] font-bold text-black/40">{aberto.nome.charAt(0)}</span>
                )}
              </span>
              <div className="min-w-0">
                <h3 className="truncate text-[22px] font-semibold text-dash-fg">{aberto.nome}</h3>
                <p className="mt-1 truncate text-[13px] text-dash-fg/70">{aberto.tema}</p>
              </div>
            </div>

            {/* PAPEL + RASTRO — o mesmo par de chips do modal de integração. */}
            <div className="mt-6 flex flex-wrap items-center gap-2.5">
              <span className="rounded-full bg-dash-hair/[0.16] px-3 py-[5px] text-[11px] font-semibold uppercase tracking-[0.14em] text-dash-fg/85">
                {aberto.tema}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-dash-hair/[0.08] px-3 py-[5px] text-[11px] text-dash-fg/85">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    (porAgente[aberto.nome] || []).length ? "bg-dash-ok" : "bg-[#ff2d55]"
                  }`}
                />
                {(porAgente[aberto.nome] || []).length
                  ? `${(porAgente[aberto.nome] || []).length} fala(s) no rastro`
                  : "sem rastro ainda"}
              </span>
            </div>

            <p className="mt-5 text-[13.5px] leading-[1.6] text-dash-fg/90">{aberto.descricao}</p>
            <p className="mt-4 text-[11.5px] leading-[1.5] text-dash-fg/60">
              O rastro abaixo vem do canal, não de exemplo: se o agente ainda não falou, a lista fica vazia.
            </p>

            <ul className="mt-6 space-y-3">
              {(porAgente[aberto.nome] || []).slice(-12).map((f) => (
                <li key={f.id} className="border-l-2 border-dash-hair/10 pl-3">
                  <p className="text-[10px] text-dash-fg/55">{f.para_quem ? `→ ${f.para_quem}` : "→ todos"}</p>
                  <p className="mt-[2px] text-[13px] leading-relaxed text-dash-fg/90">{f.texto}</p>
                </li>
              ))}
              {(porAgente[aberto.nome] || []).length === 0 ? (
                <li className="text-[12.5px] text-dash-fg/55">
                  Ainda não falou no canal. Quando falar, aparece aqui — vindo do rastro.
                </li>
              ) : null}
            </ul>

            <div className="mt-7 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setAberto(null)}
                className="rounded-[10px] border border-dash-hair/[0.20] px-5 py-2.5 text-[12px] font-semibold text-dash-fg/80 transition hover:text-dash-fg"
              >
                fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
