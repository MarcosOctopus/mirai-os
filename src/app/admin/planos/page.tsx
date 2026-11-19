"use client";

/* /admin/planos — o painel de PLANOS do MIRAI OS (só o dono).
 *
 * Mostra e edita, mas NÃO guarda plano nenhum: a fonte da verdade é o plano de
 * controle (serviço de identidade). O navegador só fala com /api/admin/planos;
 * é essa rota que carrega o segredo e fala com o plano de controle server-side.
 *
 * Três abas:
 *   1. Planos          — lista, detalhe com capacidades por área (liga/desliga),
 *                        limites e os dois freios que já existem de verdade.
 *   2. Quem tem o quê  — organização por organização, com conceder/revogar.
 *   3. Usuários        — todo mundo do ecossistema (nome, e-mail, tenant, papel,
 *                        plano, add-ons, desde) + status de pagamento reservado.
 *
 * Padrão Dash: casca (Shell) + kit; Poppins; laranja #ff751f; raios 24/10px;
 * ícones de traço, nunca emoji. */


/* Escopo de agora: só MIRAI OS e CRM são vendidos.
 * Os planos dos outros produtos (Dark Matter, Pathfinder, Media Factory)
 * continuam no registry, guardados para quando chegarem na fila. */
const EM_ESCOPO = ["mirai", "saaso"];
const noEscopo = (id?: string) => EM_ESCOPO.includes((id || "").toLowerCase());

import { useCallback, useEffect, useMemo, useState } from "react";
import Shell from "@/components/dash/Shell";
import { Chip, Secao, Vazio } from "@/components/dash/kit";
import {
  IconeBusca,
  IconePlanos,
  IconeUsuarios,
} from "@/components/dash/icons";
import { FERRAMENTAS_OS, ferramentasDeCapacidades } from "@/lib/ferramentas-os";
import type { FerramentaOS } from "@/lib/ferramentas-os";
import { iconeDaFerramenta } from "@/components/admin/icones-ferramentas";
import JanelaPlano from "@/components/admin/JanelaPlano";
import type { DadosPlano } from "@/components/admin/JanelaPlano";

/* ── Tipos (alinhados ao contrato; campos tolerantes a variação de nome) ─── */
interface Plano {
  plan_id: string;
  product_id: string;
  nome: string;
  preco_centavos: number;
  intervalo: string;
  ativo: boolean;
  capacidades: string[];
  limites: Record<string, number>;
}

interface Capacidade {
  capability_id: string;
  product_id: string;
  nome: string;
  area: string;
}

interface Organizacao {
  tenant_id: string;
  nome: string;
  plan_id: string;
  capacidades_extras: string[];
  desde?: string;
}

interface Usuario {
  user_id?: string;
  id?: string;
  nome?: string;
  name?: string;
  email: string;
  tenant_id?: string;
  organizacao?: string;
  org_nome?: string;
  /** o /v1/admin/usuarios devolve o nome do espaço assim (`tenant_nome`) */
  tenant_nome?: string;
  product_id?: string;
  papel?: string;
  role?: string;
  plan_id?: string;
  plano?: string;
  capacidades_extras?: string[];
  extras?: string[];
  desde?: string;
  criado_em?: string;
  status_pagamento?: string;
}

  "rounded-[10px] border border-dash-hair/10 bg-dash-bg px-4 py-2.5 text-[13px] text-dash-fg outline-none placeholder:text-dash-dim focus:border-dash-brand/60";

/* ── Apoio ──────────────────────────────────────────────────────────────── */
/** Limites do plano, sem susto de undefined. */
function limitesDoPlano(p: Plano): Record<string, number> {
  return (p.limites || {}) as Record<string, number>;
}

/** A franquia é o que separa um plano do outro — vira etiqueta legível no cartão. */
function franquiasDoPlano(p: Plano): [string, string][] {
  const L = limitesDoPlano(p);
  const itens: [string, string | undefined][] = [
    ["organizações", L.organizacoes ? String(L.organizacoes) : undefined],
    ["tokens/mês", L.tokens_mes ? `${L.tokens_mes}M` : undefined],
    ["Arca", L.storage_gb ? `${L.storage_gb} GB` : undefined],
    ["reuniões", L.reuniao_horas ? `${L.reuniao_horas} h` : undefined],
    ["voz", L.voz_trocas ? `${L.voz_trocas} trocas` : undefined],
    ["execuções", L.execucoes_mes ? String(L.execucoes_mes) : undefined],
  ];
  return itens.filter((x) => x[1] !== undefined) as [string, string][];
}
/** Nome de gente para o produto — o id técnico não é linguagem de quem lê a tela. */
const PRODUTOS: Record<string, string> = {
  mirai: "MIRAI OS",
  saaso: "Saaso CRM",
  darkmatter: "Dark Matter",
  mediafactory: "Media Factory",
  pathfinder: "Pathfinder",
};
const nomeProduto = (id?: string) => PRODUTOS[id || ""] || id || "";

function reais(centavos?: number | null): string {
  const n = (centavos || 0) / 100;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Primeiro valor que existe de verdade — o plano de controle varia nome de campo. */
function primeiro(...vals: (string | number | undefined | null)[]): string {
  const v = vals.find((x) => x !== undefined && x !== null && String(x).trim() !== "");
  return v === undefined ? "" : String(v);
}

/** Chama a rota de admin do plano de controle. */
async function api(
  acao: string,
  opts?: { method?: string; body?: unknown; params?: Record<string, string> },
): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams({ acao });
  if (opts?.params) for (const [k, v] of Object.entries(opts.params)) qs.set(k, v);
  const res = await fetch(`/api/admin/planos?${qs.toString()}`, {
    method: opts?.method || "GET",
    headers: opts?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const d = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(d?.error || `HTTP ${res.status}`);
  return d as Record<string, unknown>;
}

/* ── Tela ────────────────────────────────────────────────────────────────── */
export default function PlanosPage() {
  const [aba, setAba] = useState<"planos" | "ferramentas" | "usuarios">("planos");
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [capacidades, setCapacidades] = useState<Capacidade[]>([]);
  const [orgs, setOrgs] = useState<Organizacao[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [conta, setConta] = useState<{ nome?: string; email?: string }>({});

  const [busca, setBusca] = useState("");
  const [filtroPlano, setFiltroPlano] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/auth/me");
        if (r.ok) {
          const d = (await r.json()) as { user?: { name?: string; email?: string } };
          setConta({ nome: d?.user?.name, email: d?.user?.email });
        }
      } catch {
        /* a casca segue com o que tiver */
      }
    })();
  }, []);

  const carregarTudo = useCallback(async () => {
    setCarregando(true);
    setErro("");
    const falhas: string[] = [];
    const carrega = async <T,>(
      fn: () => Promise<Record<string, unknown>>,
      chave: string,
    ): Promise<T[]> => {
      try {
        const d = await fn();
        return (d[chave] as T[]) || [];
      } catch (e) {
        falhas.push(e instanceof Error ? e.message : "falha");
        return [];
      }
    };
    const [p, c, o, u] = await Promise.all([
      carrega<Plano>(() => api("planos"), "planos"),
      carrega<Capacidade>(() => api("capabilities"), "capacidades"),
      carrega<Organizacao>(() => api("organizacoes"), "organizacoes"),
      carrega<Usuario>(() => api("usuarios"), "usuarios"),
    ]);
    setPlanos(p.filter((x) => noEscopo(x.product_id)));
    setCapacidades(c.filter((x) => noEscopo(x.product_id || x.capability_id.split(".")[0])));
    setOrgs(o);
    setUsuarios(u);
    if (falhas.length) setErro(falhas[0]);
    // Preço de add-on mora no APP (não no plano de controle): falha aqui não pode
    // derrubar a tela nem apagar o que já chegou.
    try {
      const rp = await fetch("/api/admin/ferramentas");
      if (rp.ok) {
        const dp = (await rp.json().catch(() => ({}))) as { precos?: Record<string, number> };
        setPrecosFerramentas(dp.precos || {});
      }
    } catch {
      /* sem preço salvo: a tela mostra 0,00 e o dono preenche */
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    carregarTudo();
  }, [carregarTudo]);


  const orgsPorPlano = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of orgs) m.set(o.plan_id, (m.get(o.plan_id) || 0) + 1);
    return m;
  }, [orgs]);

  /* Produtos que existem no catálogo — é o que o seletor da janela oferece.
     (Antes daqui saía um agrupamento por área para desenhar o construtor inline; com o
     construtor na janela, o que a página ainda precisa é só a lista de produtos.) */
  const produtosDisponiveis = useMemo(() => {
    const s = new Set<string>();
    for (const c of capacidades) {
      const produto = c.product_id || c.capability_id.split(".")[0];
      if (produto) s.add(produto);
    }
    return Array.from(s).sort();
  }, [capacidades]);

  /* ── janela de plano (criar/editar) ───────────────────────────────────────
     O dono pediu (19/11/2026): "quero que abra a nova janela na hora de criar".
     Tudo que é montar/editar mora aqui dentro; a página só lista. */
  const [janela, setJanela] = useState<{ modo: "novo" | "editar"; plano: Plano | null } | null>(
    null,
  );
  const [erroJanela, setErroJanela] = useState("");

  /* ── preço adicional de cada ferramenta (aba Ferramentas) ──────────────────
     Mora no app (`/api/admin/ferramentas` → plataforma_config, cifrado), não no plano de
     controle: preço de add-on é dado comercial nosso, e mexer no serviço de identidade só
     para isso seria desproporcional. */
  const [precosFerramentas, setPrecosFerramentas] = useState<Record<string, number>>({});
  const [ferramentaAberta, setFerramentaAberta] = useState("");
  /** Pessoa aberta na aba Usuários (uma linha por PESSOA, não por vínculo). */
  const [usuarioAberto, setUsuarioAberto] = useState("");

  const salvarPrecoFerramenta = useCallback(async (ferramentaId: string) => {
    const centavos = precosFerramentas[ferramentaId] ?? 0;
    setErro("");
    setAviso("");
    try {
      const r = await fetch("/api/admin/ferramentas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ferramenta_id: ferramentaId, preco_centavos: centavos }),
      });
      const d = (await r.json().catch(() => ({}))) as { error?: string; precos?: Record<string, number> };
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      if (d.precos) setPrecosFerramentas(d.precos);
      setAviso(`Valor de ${ferramentaId} salvo: ${reais(centavos)}.`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao salvar o valor da ferramenta");
    }
  }, [precosFerramentas]);

  /** Ligar/desligar TODAS as capacidades de uma ferramenta numa organização. */
  const concederFerramenta = useCallback(
    async (org: Organizacao, ferramenta: FerramentaOS, conceder: boolean) => {
      if (!ferramenta.capacidades.length) {
        setErro(`${ferramenta.nome} é tela de gestão: não há add-on para conceder.`);
        return;
      }
      setErro("");
      setAviso("");
      try {
        for (const c of ferramenta.capacidades) {
          await api("definir_capacidade_da_org", {
            method: "POST",
            body: {
              acao: "definir_capacidade_da_org",
              tenant_id: org.tenant_id,
              capability_id: c,
              conceder,
            },
          });
        }
        setAviso(
          conceder
            ? `${ferramenta.nome} concedida a ${org.nome || org.tenant_id}.`
            : `${ferramenta.nome} revogada de ${org.nome || org.tenant_id}.`,
        );
        await carregarTudo();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "falha ao mudar add-on");
      }
    },
    [carregarTudo],
  );

  const salvarDaJanela = useCallback(
    async (dados: DadosPlano) => {
      const editando = janela?.modo === "editar";
      setSalvando(true);
      setErro("");
      setErroJanela("");
      try {
        if (editando) {
          await api("editar_plano", {
            method: "PATCH",
            body: {
              acao: "editar_plano",
              plan_id: dados.plan_id,
              nome: dados.nome,
              preco_centavos: dados.preco_centavos,
              intervalo: dados.intervalo,
              ativo: dados.ativo,
              limites: dados.limites,
            },
          });
          await api("definir_capacidades_do_plano", {
            method: "PUT",
            body: {
              acao: "definir_capacidades_do_plano",
              plan_id: dados.plan_id,
              capacidades: dados.capacidades,
            },
          });
          setAviso(`Plano ${dados.plan_id} atualizado.`);
        } else {
          await api("salvar_plano", {
            method: "POST",
            body: {
              acao: "salvar_plano",
              plan_id: dados.plan_id,
              product_id: dados.product_id,
              nome: dados.nome,
              preco_centavos: dados.preco_centavos,
              intervalo: dados.intervalo,
              ativo: dados.ativo,
            },
          });
          // As ferramentas entram DEPOIS de o plano existir (FK), e falha aqui não
          // esconde que o plano nasceu — o aviso diz exatamente o que faltou.
          if (dados.capacidades.length) {
            try {
              await api("definir_capacidades_do_plano", {
                method: "PUT",
                body: {
                  acao: "definir_capacidades_do_plano",
                  plan_id: dados.plan_id,
                  capacidades: dados.capacidades,
                },
              });
            } catch {
              setAviso(
                `Plano ${dados.plan_id} criado, mas as ferramentas não entraram — abra o plano e ligue uma a uma.`,
              );
              setJanela(null);
              await carregarTudo();
              return;
            }
          }
          setAviso(`Plano ${dados.plan_id} criado com ${dados.capacidades.length} ferramenta(s).`);
        }
        setJanela(null);
        await carregarTudo();
      } catch (e) {
        setErroJanela(e instanceof Error ? e.message : "falha ao salvar plano");
      } finally {
        setSalvando(false);
      }
    },
    [janela, carregarTudo],
  );

  /* ── escritas ──────────────────────────────────────────────────────────── */
            /* ── usuários: busca + filtro por plano ────────────────────────────────── */
  const planosParaFiltro = useMemo(() => {
    const s = new Set<string>();
    for (const p of planos) s.add(p.plan_id);
    for (const u of usuarios) {
      const v = primeiro(u.plan_id, u.plano);
      if (v) s.add(v);
    }
    return Array.from(s).sort();
  }, [planos, usuarios]);

  const usuariosFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return usuarios.filter((u) => {
      const alvo = `${primeiro(u.nome, u.name)} ${u.email} ${primeiro(
        u.organizacao,
        u.org_nome,
      )} ${primeiro(u.tenant_id)}`.toLowerCase();
      if (q && !alvo.includes(q)) return false;
      if (filtroPlano && primeiro(u.plan_id, u.plano) !== filtroPlano) return false;
      return true;
    });
  }, [usuarios, busca, filtroPlano]);

  const pessoasDaAba = useMemo(() => {
    const mapa = new Map<
      string,
      { chave: string; nome: string; email: string; papel: string; espacos: Usuario[] }
    >();
    for (const u of usuariosFiltrados) {
      const email = u.email || "";
      const chave = email || primeiro(u.user_id, u.id) || `${mapa.size}`;
      const atual = mapa.get(chave);
      if (atual) {
        atual.espacos.push(u);
      } else {
        mapa.set(chave, {
          chave,
          nome: primeiro(u.nome, u.name) || email,
          email,
          papel: primeiro(u.papel, u.role) || "",
          espacos: [u],
        });
      }
    }
    return Array.from(mapa.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [usuariosFiltrados]);

  return (
    <Shell titulo="Planos" usuario={{ nome: conta.nome, email: conta.email, ehDono: true }}>
      <p className="max-w-2xl text-[13px] leading-[1.65] text-dash-muted">
        Cada plano vive no <span className="text-dash-fg">plano de controle</span> e passa a valer
        nos produtos na hora. Preço e plano só mudam pelo e-mail autorizado.
      </p>

      {erro && (
        <p className="mt-5 rounded-[16px] border border-dash-bad/30 bg-dash-bad/[0.07] px-5 py-4 text-[13px] text-dash-bad">
          {erro}
        </p>
      )}
      {aviso && (
        <p className="mt-5 rounded-[16px] border border-dash-ok/30 bg-dash-ok/[0.06] px-5 py-4 text-[13px] text-dash-ok">
          {aviso}
        </p>
      )}

      {/* ─── Abas ─────────────────────────────────────────────────────── */}
      <div className="mt-6 flex flex-wrap gap-2">
        <Chip ativo={aba === "planos"} onClick={() => setAba("planos")}>
          Planos
        </Chip>
        <Chip ativo={aba === "ferramentas"} onClick={() => setAba("ferramentas")}>
          Ferramentas
        </Chip>
        <Chip ativo={aba === "usuarios"} onClick={() => setAba("usuarios")}>
          Usuários
        </Chip>
      </div>

      {carregando && <p className="mt-6 text-[12px] text-dash-dim">Carregando do plano de controle...</p>}

      {/* ═══════════════ ABA PLANOS ═══════════════ */}
      {aba === "planos" && !carregando && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[12.5px] text-dash-muted">
              {planos.length} plano(s) no plano de controle
            </p>
            <button
              type="button"
              onClick={() => setJanela({ modo: "novo", plano: null })}
              className="ml-auto flex items-center gap-2 rounded-[10px] bg-dash-brand px-4 py-2.5 text-[12px] font-semibold text-white shadow-[0_10px_30px_-16px_rgb(255_117_31/0.9)] transition hover:bg-dash-brandHi"
            >
              <span className="text-[14px] leading-none">＋</span> Novo plano
            </button>
          </div>

          {planos.length === 0 ? (
            <div className="mt-4">
              <Vazio
                icone={<IconePlanos className="h-7 w-7" />}
                titulo="Nenhum plano ainda"
                texto="Crie o primeiro: escolha as ferramentas, defina o preço e salve. Ele nasce no plano de controle e passa a valer nos produtos na hora."
              />
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {planos.map((p) => {
                const feitas = ferramentasDeCapacidades(p.capacidades || []);
                const quantasOrgs = orgsPorPlano.get(p.plan_id) || 0;
                return (
                  <article
                    key={p.plan_id}
                    className="flex flex-col rounded-[20px] border border-dash-hair/[0.07] bg-dash-card p-5 transition hover:border-dash-hair/[0.16]"
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-semibold text-dash-fg">
                          {p.nome || p.plan_id}
                        </p>
                        <p className="mt-0.5 truncate font-mono text-[10.5px] text-dash-dim">
                          {p.plan_id}
                        </p>
                      </div>
                      <span
                        className={`ml-auto shrink-0 rounded-full px-2.5 py-[3px] text-[9.5px] uppercase tracking-[0.14em] ${
                          p.ativo
                            ? "bg-dash-brand/[0.12] text-dash-brand"
                            : "bg-dash-raise text-dash-dim"
                        }`}
                      >
                        {p.ativo ? "ativo" : "inativo"}
                      </span>
                    </div>

                    <div className="mt-4 flex items-baseline gap-2">
                      <span className="public-sans text-[22px] font-semibold text-dash-fg">
                        {reais(p.preco_centavos)}
                      </span>
                      <span className="text-[11.5px] text-dash-muted">
                        / {p.intervalo || "mensal"}
                      </span>
                    </div>

                    {/* Ferramenta virou igual para todos (19/11/2026): o cartão mostra a FRANQUIA,
                        que é o que de fato separa um plano do outro. */}
                    <p className="mt-3 flex flex-wrap items-center gap-2 text-[11.5px] text-dash-muted">
                      <span className="rounded-full bg-dash-brand/[0.12] px-2 py-[2px] text-[10px] text-dash-brand">
                        OS inteiro
                      </span>
                      <span>{feitas.length} ferramenta(s)</span>
                      {limitesDoPlano(p).ferramentas_travadas === 1 && (
                        <span className="text-dash-dim">· travadas</span>
                      )}
                      <span className="text-dash-dim">· {quantasOrgs} em uso</span>
                    </p>

                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {franquiasDoPlano(p).length === 0 ? (
                        <span className="text-[10.5px] text-dash-dim">sem franquia definida</span>
                      ) : (
                        franquiasDoPlano(p).map(([rotulo, valor]) => (
                          <span
                            key={rotulo}
                            className="rounded-full border border-dash-hair/[0.1] px-2 py-[3px] text-[10px] text-dash-muted"
                          >
                            <span className="public-sans text-dash-fg">{valor}</span> {rotulo}
                          </span>
                        ))
                      )}
                    </div>

                    {limitesDoPlano(p).excedente_token_reais !== undefined && (
                      <p className="mt-2.5 text-[10.5px] text-dash-dim">
                        excedente: 1M de tokens {reais((limitesDoPlano(p).excedente_token_reais || 0) * 100)} ·
                        hora de reunião {reais((limitesDoPlano(p).excedente_reuniao_reais || 0) * 100)}
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={() => setJanela({ modo: "editar", plano: p })}
                      className="mt-4 self-start rounded-full bg-dash-raise/50 px-3.5 py-1.5 text-[11.5px] text-dash-muted transition hover:text-dash-fg"
                    >
                      Editar
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ═══════════════ ABA FERRAMENTAS ═══════════════
          Pedido do dono (19/11/2026): "troque a aba Quem tem o quê para aba Ferramentas, que
          TODAS as ferramentas entrem lá listadas e coloque o valor adicional delas
          individualmente". Cada ferramenta: quanto custa por fora do plano, em que planos ela já
          entra e quem tem por add-on. */}
      {aba === "ferramentas" && !carregando && (
        <Secao titulo="Ferramentas" contagem={`${FERRAMENTAS_OS.length} ferramenta(s)`}>
          <p className="max-w-[70ch] text-[12.5px] leading-relaxed text-dash-muted">
            Cada ferramenta tem o seu <span className="text-dash-fg">valor adicional</span>, cobrado
            por fora do plano. Quem já tem a ferramenta incluída no plano não paga de novo.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {FERRAMENTAS_OS.map((f) => {
              const Icone = iconeDaFerramenta(f.id);
              const centavos = precosFerramentas[f.id] ?? 0;
              // Ferramenta sem capacidade é PRODUTO incluso (o CRM): vale em todo plano.
              const nosPlanos = f.semCapacidade
                ? planos
                : planos.filter((p) => f.capacidades.some((c) => (p.capacidades || []).includes(c)));
              const comAddOn = orgs.filter((o) =>
                f.capacidades.some((c) => (o.capacidades_extras || []).includes(c)),
              );
              const aberta = ferramentaAberta === f.id;
              const semAddOn = orgs.filter(
                (o) => !comAddOn.some((x) => x.tenant_id === o.tenant_id),
              );
              return (
                <article
                  key={f.id}
                  className="flex flex-col rounded-[20px] border border-dash-hair/[0.07] bg-dash-card p-4"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-dash-brand/[0.12] text-dash-brand ring-1 ring-dash-brand/25">
                      <Icone className="h-[15px] w-[15px]" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-medium text-dash-fg">{f.nome}</p>
                      <p className="mt-0.5 text-[11.5px] leading-snug text-dash-muted">
                        {f.descricao}
                      </p>
                      {f.semCapacidade && (
                        <p className="mt-1 text-[10px] text-dash-dim">
                          tela de gestão — não liga capacidade técnica
                        </p>
                      )}
                    </div>
                    <label className="ml-auto flex shrink-0 flex-col items-end gap-1">
                      <span className="text-[10px] uppercase tracking-[0.14em] text-dash-dim">
                        valor adicional
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="text-[12px] text-dash-muted">R$</span>
                        <input
                          value={(centavos / 100).toFixed(2).replace(".", ",")}
                          onChange={(e) =>
                            setPrecosFerramentas((s) => ({
                              ...s,
                              [f.id]: Math.round(
                                parseFloat(e.target.value.replace(",", ".") || "0") * 100,
                              ),
                            }))
                          }
                          onBlur={() => void salvarPrecoFerramenta(f.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          }}
                          inputMode="decimal"
                          className="public-sans w-[88px] rounded-[10px] border border-dash-hair/10 bg-dash-bg px-2.5 py-1.5 text-right text-[13px] text-dash-fg outline-none focus:border-dash-brand/60"
                        />
                      </span>
                    </label>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10.5px] text-dash-dim">no plano:</span>
                    {nosPlanos.length === 0 ? (
                      <span className="text-[10.5px] text-dash-dim">nenhum</span>
                    ) : (
                      nosPlanos.map((p) => (
                        <span
                          key={p.plan_id}
                          className="rounded-full border border-dash-hair/[0.1] px-2 py-[2px] text-[10px] text-dash-muted"
                        >
                          {p.nome || p.plan_id}
                        </span>
                      ))
                    )}
                    <button
                      type="button"
                      onClick={() => setFerramentaAberta(aberta ? "" : f.id)}
                      className="ml-auto text-[10.5px] text-dash-dim transition hover:text-dash-fg"
                    >
                      {comAddOn.length} com add-on {aberta ? "▴" : "▾"}
                    </button>
                  </div>

                  {aberta && (
                    <div className="mt-3 rounded-[14px] bg-dash-bg p-3">
                      {comAddOn.length === 0 ? (
                        <p className="text-[11px] text-dash-dim">
                          nenhuma organização com esta ferramenta por add-on.
                        </p>
                      ) : (
                        <ul className="flex flex-col gap-1.5">
                          {comAddOn.map((o) => (
                            <li key={o.tenant_id} className="flex items-center gap-2">
                              <span className="truncate text-[11.5px] text-dash-fg">
                                {o.nome || o.tenant_id}
                              </span>
                              <button
                                type="button"
                                onClick={() => void concederFerramenta(o, f, false)}
                                className="ml-auto text-[10.5px] text-dash-dim transition hover:text-dash-fg"
                              >
                                revogar
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        <select
                          id={`ferr-${f.id}`}
                          defaultValue=""
                          className="min-w-[190px] flex-1 rounded-[10px] border border-dash-hair/10 bg-dash-card px-3 py-2 text-[11.5px] text-dash-fg outline-none focus:border-dash-brand/60"
                        >
                          <option value="">+ conceder a uma organização…</option>
                          {semAddOn.map((o) => (
                            <option key={o.tenant_id} value={o.tenant_id}>
                              {o.nome || o.tenant_id}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            const sel = document.getElementById(
                              `ferr-${f.id}`,
                            ) as HTMLSelectElement | null;
                            const org = orgs.find((o) => o.tenant_id === sel?.value);
                            if (org) void concederFerramenta(org, f, true);
                          }}
                          className="rounded-[10px] border border-dash-hair/[0.12] px-4 py-2 text-[11.5px] font-semibold text-dash-muted transition hover:text-dash-fg"
                        >
                          Conceder
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </Secao>
      )}

      {/* ═══════════════ ABA USUÁRIOS ═══════════════ */}
      {/* ═══════════════ ABA USUÁRIOS ═══════════════
          Mostra PESSOA, não vínculo: a mesma pessoa em dois produtos era DUAS linhas na
          tabela antiga e a leitura virava bagunça. Agora é uma linha por pessoa, e os
          espaços dela (com plano e add-ons) abrem ao clicar. */}
      {aba === "usuarios" && !carregando && (
        <Secao titulo="Usuários" contagem={`${pessoasDaAba.length} pessoa(s)`}>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex min-w-[240px] flex-1 items-center gap-2 rounded-[10px] border border-dash-hair/10 bg-dash-bg px-4 py-2.5">
              <IconeBusca className="h-[16px] w-[16px] text-dash-dim" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome, e-mail ou organização"
                className="w-full bg-transparent text-[13px] text-dash-fg outline-none placeholder:text-dash-dim"
              />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setFiltroPlano("")}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-[11.5px] transition ${
                filtroPlano === ""
                  ? "bg-dash-raise text-dash-fg"
                  : "text-dash-dim hover:text-dash-muted"
              }`}
            >
              Todos os planos
            </button>
            {planosParaFiltro.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setFiltroPlano(p)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-[11.5px] transition ${
                  filtroPlano === p
                    ? "bg-dash-raise text-dash-fg"
                    : "text-dash-dim hover:text-dash-muted"
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          {usuarios.length === 0 ? (
            <div className="mt-4">
              <Vazio
                icone={<IconeUsuarios className="h-7 w-7" />}
                titulo="Nenhum usuário retornado"
                texto="O plano de controle ainda não expôs GET /v1/admin/usuarios, ou não há contas cadastradas."
              />
            </div>
          ) : pessoasDaAba.length === 0 ? (
            <p className="mt-4 text-[12.5px] text-dash-dim">Nenhuma pessoa neste filtro.</p>
          ) : (
            <div className="mt-4 flex flex-col gap-2">
              {pessoasDaAba.map((pessoa) => {
                const aberta = usuarioAberto === pessoa.chave;
                const iniciais = (pessoa.nome || "?")
                  .trim()
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((x) => x[0])
                  .join("")
                  .toUpperCase();
                const planosDaPessoa = Array.from(
                  new Set(pessoa.espacos.map((u) => primeiro(u.plan_id, u.plano) || "free")),
                );
                return (
                  <article
                    key={pessoa.chave}
                    className={`rounded-[18px] border bg-dash-card transition ${
                      aberta
                        ? "border-dash-brand/35"
                        : "border-dash-hair/[0.07] hover:border-dash-hair/[0.16]"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setUsuarioAberto(aberta ? "" : pessoa.chave)}
                      className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-dash-brand/[0.12] text-[12px] font-semibold text-dash-brand ring-1 ring-dash-brand/25">
                        {iniciais}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-[14px] font-semibold text-dash-fg">
                            {pessoa.nome}
                          </span>
                          {pessoa.papel && (
                            <span className="rounded-full bg-dash-raise px-2 py-[2px] text-[9.5px] uppercase tracking-[0.12em] text-dash-muted">
                              {pessoa.papel}
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block truncate text-[11.5px] text-dash-muted">
                          {pessoa.email}
                        </span>
                      </span>

                      <span className="hidden shrink-0 items-center gap-1.5 sm:flex">
                        {planosDaPessoa.map((p) => (
                          <span
                            key={p}
                            className="rounded-full border border-dash-hair/[0.1] px-2 py-[2px] text-[10px] text-dash-muted"
                          >
                            {p}
                          </span>
                        ))}
                      </span>

                      <span className="shrink-0 text-right">
                        <span className="public-sans block text-[12px] text-dash-muted">
                          {pessoa.espacos.length} espaço{pessoa.espacos.length > 1 ? "s" : ""}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 text-[12px] text-dash-dim transition ${
                          aberta ? "rotate-180" : ""
                        }`}
                        aria-hidden
                      >
                        ▾
                      </span>
                    </button>

                    {aberta && (
                      <div className="border-t border-dash-hair/[0.07] px-4 py-3.5">
                        <div className="flex flex-col gap-2">
                          {pessoa.espacos.map((u, i) => {
                            const extras = u.capacidades_extras || u.extras || [];
                            const desde = primeiro(u.desde, u.criado_em);
                            return (
                              <div
                                key={primeiro(u.tenant_id, u.organizacao, u.user_id) || `e${i}`}
                                className="flex flex-wrap items-center gap-3 rounded-[12px] bg-dash-bg px-3 py-2.5"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="flex flex-wrap items-center gap-2 text-[12.5px] text-dash-fg">
                                    <span className="font-semibold">
                                      {primeiro(u.tenant_nome, u.organizacao, u.org_nome, u.tenant_id) ||
                                        "—"}
                                    </span>
                                    {u.product_id && (
                                      <span className="rounded-full border border-dash-hair/[0.1] px-2 py-[2px] text-[10px] text-dash-muted">
                                        {nomeProduto(u.product_id)}
                                      </span>
                                    )}
                                    <span className="rounded-full bg-dash-brand/[0.12] px-2 py-[2px] text-[10px] text-dash-brand">
                                      {primeiro(u.plan_id, u.plano) || "free"}
                                    </span>
                                  </p>
                                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[10.5px] text-dash-dim">
                                    {desde && <span>desde {desde.slice(0, 10)}</span>}
                                    {u.status_pagamento && <span>· {u.status_pagamento}</span>}
                                    {extras.length > 0 ? (
                                      extras.slice(0, 3).map((x) => (
                                        <span
                                          key={x}
                                          className="rounded-[8px] bg-dash-raise px-2 py-0.5 font-mono text-[10px] text-dash-muted"
                                        >
                                          +{x}
                                        </span>
                                      ))
                                    ) : (
                                      <span>· núcleo do plano</span>
                                    )}
                                    {extras.length > 3 && (
                                      <span className="text-dash-dim">+{extras.length - 3}</span>
                                    )}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </Secao>
      )}
      <JanelaPlano
        aberto={!!janela}
        plano={janela?.plano ?? null}
        produtos={produtosDisponiveis}
        salvando={salvando}
        erro={erroJanela}
        aoFechar={() => {
          setJanela(null);
          setErroJanela("");
        }}
        aoSalvar={(dados) => void salvarDaJanela(dados)}
      />

    </Shell>
  );
}
