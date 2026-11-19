"use client";

/**
 * JANELA DE PLANO — montar/editar plano numa janela de verdade.
 *
 * Pedido do dono, 19/11/2026: *"quero que abra a nova janela na hora de criar e fica com a
 * qualidade e design da minha referência (...) quero fechadinho e bem feito; do jeito que você
 * deixou ficou uma bagunça do cacete"*. O construtor inline saiu da página: a lista de planos
 * ficou limpa e TUDO que é montar/editar acontece aqui dentro.
 *
 * Duas etapas, na ordem do gesto: FERRAMENTAS (carrinho) -> PREÇO. Quem escolhe vê ferramenta
 * com nome de gente; o que SALVA é a capacidade técnica (`src/lib/ferramentas-os.ts`).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { IconeFechar } from "@/components/dash/icons";
import { IconeCarrinho, iconeDaFerramenta } from "@/components/admin/icones-ferramentas";
import {
  AREAS_FERRAMENTAS,
  FERRAMENTAS_OS,
  capacidadesDeFerramentas,
  ferramentasDeCapacidades,
} from "@/lib/ferramentas-os";

export interface DadosPlano {
  plan_id: string;
  product_id: string;
  nome: string;
  preco_centavos: number;
  intervalo: string;
  ativo: boolean;
  capacidades: string[];
  limites: Record<string, number>;
}

export interface PlanoParaEditar {
  plan_id: string;
  product_id?: string;
  nome?: string;
  preco_centavos?: number | null;
  intervalo?: string;
  ativo?: boolean;
  limites?: Record<string, number> | null;
  capacidades?: string[];
}

/**
 * FRANQUIAS do plano. Decisão do dono (19/11/2026): todo plano tem TODAS as ferramentas —
 * o que muda entre planos é organização, token e espaço (mais as franquias operacionais).
 */
const FRANQUIAS: { chave: string; rotulo: string }[] = [
  { chave: "organizacoes", rotulo: "Organizações" },
  { chave: "tokens_mes", rotulo: "Tokens de IA / mês (milhões)" },
  { chave: "storage_gb", rotulo: "Espaço na Arca (GB)" },
  { chave: "reuniao_horas", rotulo: "Reuniões (horas / mês)" },
  { chave: "voz_trocas", rotulo: "Voz do Orb (trocas / mês)" },
  { chave: "execucoes_mes", rotulo: "Execuções de agendamento / mês" },
];

/** O que o cliente paga ao passar da franquia — em reais, por unidade. */
const EXCEDENTES: { chave: string; rotulo: string }[] = [
  { chave: "excedente_token_reais", rotulo: "1M de tokens (R$)" },
  { chave: "excedente_reuniao_reais", rotulo: "Hora de reunião (R$)" },
  { chave: "excedente_voz_reais", rotulo: "Troca de voz (R$)" },
  { chave: "excedente_gb_reais", rotulo: "GB de Arca (R$)" },
  { chave: "excedente_execucao_reais", rotulo: "Execução (R$)" },
];

const campo =
  "rounded-[10px] border border-dash-hair/10 bg-dash-bg px-3.5 py-2.5 text-[13px] text-dash-fg outline-none placeholder:text-dash-dim focus:border-dash-brand/60";

function reais(centavos?: number | null): string {
  const n = (centavos || 0) / 100;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function slug(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function Chave({ ligado, onToggle }: { ligado: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      onClick={onToggle}
      className={`relative h-[22px] w-[40px] shrink-0 rounded-full transition ${
        ligado ? "bg-dash-brand" : "bg-dash-raise"
      }`}
    >
      <span
        className={`absolute top-[3px] h-4 w-4 rounded-full bg-white transition-all ${
          ligado ? "left-[21px]" : "left-[3px]"
        }`}
      />
    </button>
  );
}

export default function JanelaPlano({
  aberto,
  plano,
  produtos,
  salvando,
  erro,
  aoFechar,
  aoSalvar,
  ferramentasDoPlano,
}: {
  aberto: boolean;
  /** null = criar novo */
  plano: PlanoParaEditar | null;
  produtos: string[];
  salvando: boolean;
  erro: string;
  aoFechar: () => void;
  aoSalvar: (dados: DadosPlano) => void;
  /** capacidades reais do plano quando se edita (a lista traz o resumo) */
  ferramentasDoPlano?: string[];
}) {
  const [passo, setPasso] = useState<"ferramentas" | "preco">("ferramentas");
  const [ferramentas, setFerramentas] = useState<string[]>([]);
  const [nome, setNome] = useState("");
  const [planId, setPlanId] = useState("");
  const [idTravado, setIdTravado] = useState(false);
  const [preco, setPreco] = useState("");
  const [intervalo, setIntervalo] = useState("mensal");
  const [ativo, setAtivo] = useState(true);
  const [produto, setProduto] = useState("mirai");
  const [limites, setLimites] = useState<Record<string, number>>({});
  /**
   * TRAVA DAS FERRAMENTAS — pedido do dono (19/11/2026): *"quando o cara for comprar, já
   * selecionado e não descelecionável"*. No modo cliente todo plano nasce com todas as
   * ferramentas e ninguém desmarca; o admin destrava para montar plano especial.
   */
  const [travadas, setTravadas] = useState(true);
  /** Portal só depois de montar: no servidor não existe document.body. */
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  const editando = !!plano;

  /* Abriu: preenche (edição) ou limpa (novo). */
  useEffect(() => {
    if (!aberto) return;
    setPasso("ferramentas");
    if (plano) {
      setNome(plano.nome || "");
      setPlanId(plano.plan_id);
      setIdTravado(true);
      setPreco(
        plano.preco_centavos ? (plano.preco_centavos / 100).toFixed(2).replace(".", ",") : "",
      );
      setIntervalo(plano.intervalo || "mensal");
      setAtivo(plano.ativo !== false);
      setProduto(plano.product_id || "mirai");
      setLimites({ ...(plano.limites || {}) });
      setTravadas(plano.limites?.ferramentas_travadas !== 0);
      const caps = ferramentasDoPlano?.length ? ferramentasDoPlano : plano.capacidades || [];
      setFerramentas(ferramentasDeCapacidades(caps).map((f) => f.id));
    } else {
      setNome("");
      setPlanId("");
      setIdTravado(false);
      setPreco("");
      setIntervalo("mensal");
      setAtivo(true);
      setProduto(produtos[0] || "mirai");
      setLimites({});
      setFerramentas(FERRAMENTAS_OS.map((f) => f.id));
      setTravadas(true);
    }
  }, [aberto, plano, produtos, ferramentasDoPlano]);

  /* Esc fecha; enquanto aberta, o fundo não rola. */
  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFechar();
    };
    document.addEventListener("keydown", aoTeclar);
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = antes;
    };
  }, [aberto, aoFechar]);

  const alternar = useCallback(
    (id: string) => {
      if (travadas) return; // modo cliente: nada é desmarcado
      setFerramentas((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    },
    [travadas],
  );

  const capacidades = useMemo(() => capacidadesDeFerramentas(ferramentas), [ferramentas]);
  const centavos = Math.round(parseFloat(preco.replace(",", ".") || "0") * 100);

  const salvar = () => {
    aoSalvar({
      plan_id: (planId || `${produto}_${slug(nome)}`).trim(),
      product_id: produto,
      nome: nome.trim() || planId,
      preco_centavos: centavos,
      intervalo,
      ativo,
      capacidades,
      limites: { ...limites, ferramentas_travadas: travadas ? 1 : 0 },
    });
  };

  if (!aberto || !montado) return null;

  const podeSalvar = !!nome.trim() && !salvando;

  /* Vai para o <body> por PORTAL, de propósito: a barra lateral do Shell tem `transform`
     (translate-x) e `transform` prende `position: fixed` — a janela ficaria presa no
     contêiner de conteúdo. E a camada é z-[100], acima do popover do menu (z-[70]),
     para nada flutuar por cima da janela. */
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* fundo: escurece sem virar preto chapado (luz contida) */}
      <button
        type="button"
        aria-label="fechar"
        onClick={aoFechar}
        className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-[2px]"
      />

      <div className="relative flex h-[min(880px,90vh)] w-[min(1120px,95vw)] flex-col overflow-hidden rounded-[24px] border border-dash-hair/[0.09] bg-dash-card shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]">
        {/* ── cabeçalho ── */}
        <header className="flex items-center gap-3 border-b border-dash-hair/[0.07] px-6 py-4">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-dash-fg">
              {editando ? "Editar plano" : "Montar plano"}
            </p>
            <p className="mt-0.5 truncate text-[11.5px] text-dash-muted">
              {editando
                ? `${plano?.nome || plano?.plan_id} · ${plano?.plan_id}`
                : "Escolha as ferramentas, defina o preço e salve."}
            </p>
          </div>

          {/* duas etapas, na ordem do gesto */}
          <div className="ml-auto flex items-center gap-1 rounded-full bg-dash-bg p-1">
            {(["ferramentas", "preco"] as const).map((p, i) => (
              <button
                key={p}
                type="button"
                onClick={() => (p === "preco" && ferramentas.length ? setPasso("preco") : setPasso(p))}
                className={`rounded-full px-3.5 py-1.5 text-[11.5px] transition ${
                  passo === p
                    ? "bg-dash-raise text-dash-fg"
                    : "text-dash-dim hover:text-dash-muted"
                }`}
              >
                {i + 1}. {p === "ferramentas" ? "Ferramentas" : "Preço"}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={aoFechar}
            className="ml-1 flex h-8 w-8 items-center justify-center rounded-full text-dash-dim transition hover:bg-dash-raise/60 hover:text-dash-fg"
            title="fechar (Esc)"
          >
            <IconeFechar className="h-4 w-4" />
          </button>
        </header>

        {/* ── corpo ── */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {erro && (
            <p className="mb-4 rounded-[12px] border border-dash-brand/30 bg-dash-brand/[0.08] px-3.5 py-2.5 text-[12px] text-dash-fg">
              {erro}
            </p>
          )}

          {passo === "ferramentas" ? (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
              {/* corredores */}
              <div className="lg:col-span-2">
                <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-dash-hair/[0.09] bg-dash-bg/60 px-3.5 py-3">
                  <Chave ligado={travadas} onToggle={() => setTravadas((v) => !v)} />
                  <span className="text-[12px] text-dash-fg">
                    {travadas ? "Todas as ferramentas, travadas" : "Livre para escolher"}
                  </span>
                  <span className="text-[11px] leading-relaxed text-dash-dim">
                    {travadas
                      ? "cliente recebe o OS inteiro e não desmarca nada — só aumenta quantidade"
                      : "modo admin: plano especial, pode tirar ferramenta"}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setTravadas(true);
                      setFerramentas(FERRAMENTAS_OS.map((f) => f.id));
                    }}
                    className="ml-auto rounded-[100px] px-3 py-1.5 text-[11px] text-dash-muted transition hover:text-dash-fg"
                  >
                    marcar todas
                  </button>
                </div>
              </div>
              <div>
                {AREAS_FERRAMENTAS.map((area) => {
                  const doCorredor = FERRAMENTAS_OS.filter((f) => f.area === area);
                  if (!doCorredor.length) return null;
                  return (
                    <section key={area} className="mb-6 last:mb-0">
                      <p className="text-[10.5px] uppercase tracking-[0.18em] text-dash-dim">
                        {area}
                      </p>
                      <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                        {doCorredor.map((f) => {
                          const dentro = ferramentas.includes(f.id);
                          const Icone = iconeDaFerramenta(f.id);
                          return (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() => alternar(f.id)}
                              className={`flex flex-col gap-2.5 rounded-[16px] border p-3.5 text-left transition ${
                                dentro
                                  ? "border-dash-brand/40 bg-dash-brand/[0.06]"
                                  : "border-dash-hair/[0.07] bg-dash-bg/60 hover:border-dash-hair/[0.16]"
                              }`}
                            >
                              <span className="flex items-center gap-2.5">
                                <span
                                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] ring-1 transition ${
                                    dentro
                                      ? "bg-dash-brand/15 text-dash-brand ring-dash-brand/30"
                                      : "bg-dash-raise/40 text-dash-muted ring-dash-hair/[0.06]"
                                  }`}
                                >
                                  <Icone className="h-[14px] w-[14px]" />
                                </span>
                                <span className="text-[13px] font-medium text-dash-fg">
                                  {f.nome}
                                </span>
                                <span
                                  className={`ml-auto text-[11px] ${
                                    dentro ? "text-dash-brand" : "text-dash-dim"
                                  }`}
                                >
                                  {dentro ? "✓" : "+"}
                                </span>
                              </span>
                              <span className="text-[11.5px] leading-snug text-dash-muted">
                                {f.descricao}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>

              {/* carrinho */}
              <aside className="h-fit lg:sticky lg:top-0">
                <div className="rounded-[18px] border border-dash-hair/[0.07] bg-dash-bg p-3.5">
                  <div className="flex items-center gap-2.5">
                    <span className="text-dash-brand">
                      <IconeCarrinho />
                    </span>
                    <p className="text-[13px] font-semibold text-dash-fg">Seu carrinho</p>
                    <span className="public-sans ml-auto flex h-[21px] min-w-[21px] items-center justify-center rounded-full bg-dash-brand px-1.5 text-[10.5px] font-semibold text-white">
                      {ferramentas.length}
                    </span>
                  </div>

                  {ferramentas.length === 0 ? (
                    <p className="mt-3 text-[11.5px] leading-relaxed text-dash-dim">
                      Nada escolhido ainda. Toque nas ferramentas ao lado.
                    </p>
                  ) : (
                    <ul className="mt-3 flex flex-col gap-1.5">
                      {ferramentas.map((id) => {
                        const f = FERRAMENTAS_OS.find((x) => x.id === id);
                        if (!f) return null;
                        const Icone = iconeDaFerramenta(f.id);
                        return (
                          <li
                            key={id}
                            className="flex items-center gap-2.5 rounded-[11px] bg-dash-card px-2.5 py-2"
                          >
                            <span className="text-dash-brand">
                              <Icone className="h-[12px] w-[12px]" />
                            </span>
                            <span className="truncate text-[11.5px] text-dash-fg">{f.nome}</span>
                            <button
                              type="button"
                              onClick={() => alternar(f.id)}
                              title="tirar do carrinho"
                              className="ml-auto rounded-full px-1.5 text-[13px] leading-none text-dash-dim transition hover:text-dash-fg"
                            >
                              ×
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  <p className="mt-3.5 text-[10.5px] leading-relaxed text-dash-dim">
                    O preço é definido para o plano inteiro.
                  </p>
                </div>
              </aside>
            </div>
          ) : (
            /* ── 2. PREÇO ── */
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <label className="flex flex-col gap-1.5 text-[11.5px] text-dash-muted md:col-span-2">
                  Nome do plano
                  <input
                    value={nome}
                    onChange={(e) => {
                      const v = e.target.value;
                      setNome(v);
                      if (!idTravado) setPlanId(`${produto}_${slug(v)}`);
                    }}
                    placeholder="Ex.: Essencial, Pro, Business"
                    className={campo}
                    autoFocus
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-[11.5px] text-dash-muted">
                  Id (técnico)
                  <input
                    value={planId}
                    onChange={(e) => {
                      setPlanId(e.target.value);
                      setIdTravado(true);
                    }}
                    disabled={editando}
                    placeholder="mirai_essencial"
                    className={`${campo} public-sans disabled:opacity-60`}
                  />
                  <span className="text-[10px] text-dash-dim">
                    {editando ? "não muda: quebra assinatura existente" : "nasce do nome"}
                  </span>
                </label>
                <label className="flex flex-col gap-1.5 text-[11.5px] text-dash-muted">
                  Preço (R$ por {intervalo})
                  <input
                    value={preco}
                    onChange={(e) => setPreco(e.target.value)}
                    inputMode="decimal"
                    placeholder="0,00"
                    className={`${campo} public-sans`}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-[11.5px] text-dash-muted">
                  Cobrança
                  <select
                    value={intervalo}
                    onChange={(e) => setIntervalo(e.target.value)}
                    className={campo}
                  >
                    <option value="mensal">mensal (recorrente)</option>
                    <option value="anual">anual (recorrente)</option>
                    <option value="unico">único</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-[11.5px] text-dash-muted">
                  Produto
                  <select
                    value={produto}
                    onChange={(e) => setProduto(e.target.value)}
                    disabled={editando}
                    className={`${campo} disabled:opacity-60`}
                  >
                    {(produtos.length ? produtos : ["mirai"]).map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div>
                <p className="text-[10.5px] uppercase tracking-[0.18em] text-dash-dim">
                  Franquias do plano
                </p>
                <div className="mt-2.5 grid grid-cols-2 gap-3 md:grid-cols-3">
                  {FRANQUIAS.map((l) => (
                    <label key={l.chave} className="flex flex-col gap-1.5 text-[11.5px] text-dash-muted">
                      {l.rotulo}
                      <input
                        value={limites[l.chave] ?? ""}
                        onChange={(e) =>
                          setLimites((s) => ({
                            ...s,
                            [l.chave]: e.target.value === "" ? 0 : Number(e.target.value),
                          }))
                        }
                        inputMode="numeric"
                        placeholder="0"
                        className={`${campo} public-sans`}
                      />
                    </label>
                  ))}
                </div>
                <p className="mt-3 text-[10.5px] uppercase tracking-[0.18em] text-dash-dim">
                  Excedente — o que ele paga ao passar da franquia
                </p>
                <div className="mt-2.5 grid grid-cols-2 gap-3 md:grid-cols-3">
                  {EXCEDENTES.map((l) => (
                    <label key={l.chave} className="flex flex-col gap-1.5 text-[11.5px] text-dash-muted">
                      {l.rotulo}
                      <input
                        value={limites[l.chave] ?? ""}
                        onChange={(e) =>
                          setLimites((s) => ({
                            ...s,
                            [l.chave]: e.target.value === "" ? 0 : Number(e.target.value),
                          }))
                        }
                        inputMode="decimal"
                        placeholder="0,00"
                        className={`${campo} public-sans`}
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[10.5px] uppercase tracking-[0.18em] text-dash-dim">
                  Ferramentas deste plano
                </p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {ferramentas.length === 0 ? (
                    <span className="text-[11.5px] text-dash-dim">
                      nenhuma — volte para escolher
                    </span>
                  ) : (
                    ferramentas.map((id) => {
                      const f = FERRAMENTAS_OS.find((x) => x.id === id);
                      if (!f) return null;
                      return (
                        <span
                          key={id}
                          className="rounded-full border border-dash-hair/[0.1] px-2.5 py-[3px] text-[11px] text-dash-muted"
                        >
                          {f.nome}
                        </span>
                      );
                    })
                  )}
                </div>
                {capacidades.length > 0 && (
                  <p className="mt-2 text-[10px] leading-relaxed text-dash-dim">
                    libera por baixo:{" "}
                    <span className="public-sans">{capacidades.join(" · ")}</span>
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── rodapé ── */}
        <footer className="flex items-center gap-4 border-t border-dash-hair/[0.07] px-6 py-4">
          <div className="flex items-center gap-3">
            <Chave ligado={ativo} onToggle={() => setAtivo((v) => !v)} />
            <span className="text-[11.5px] text-dash-muted">
              {ativo ? "nasce ativo" : "nasce inativo"}
            </span>
          </div>

          <span className="public-sans ml-auto text-[12.5px] text-dash-muted">
            {ferramentas.length} ferramenta(s) ·{" "}
            <span className="text-dash-fg">{reais(centavos)}</span> / {intervalo}
          </span>

          {passo === "preco" && (
            <button
              type="button"
              onClick={() => setPasso("ferramentas")}
              className="rounded-[10px] px-3.5 py-2.5 text-[12px] text-dash-muted transition hover:text-dash-fg"
            >
              voltar
            </button>
          )}

          {passo === "ferramentas" ? (
            <button
              type="button"
              onClick={() => setPasso("preco")}
              disabled={ferramentas.length === 0}
              className="flex items-center gap-2 rounded-[10px] bg-dash-brand px-5 py-2.5 text-[12px] font-semibold text-white shadow-[0_10px_30px_-16px_rgb(255_117_31/0.9)] transition hover:bg-dash-brandHi disabled:cursor-not-allowed disabled:opacity-35 disabled:shadow-none"
            >
              Definir preço <span aria-hidden>→</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={salvar}
              disabled={!podeSalvar}
              className="rounded-[10px] bg-dash-brand px-5 py-2.5 text-[12px] font-semibold text-white shadow-[0_10px_30px_-16px_rgb(255_117_31/0.9)] transition hover:bg-dash-brandHi disabled:cursor-not-allowed disabled:opacity-35 disabled:shadow-none"
            >
              {salvando ? "Salvando..." : editando ? "Salvar alterações" : "Salvar plano"}
            </button>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
