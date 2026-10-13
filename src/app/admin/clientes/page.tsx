"use client";

/* /admin/clientes — CLIENTES e PLANOS (só o dono).
 *
 * Duas abas, como o dono pediu (13/10/2026):
 *   1. Clientes — a PESSOA: de onde entra (Google/senha), em que organização
 *      está, em que produto, e o plano posto À MÃO no seletor de cada linha.
 *      Aqui também se ADICIONA um cliente: cria a organização + o convite, sem
 *      inventar usuário nem senha — a conta nasce quando a pessoa entra.
 *   2. Planos — o catálogo inteiro: ver todos, criar, editar nome/preço/estado e
 *      ligar/desligar capacidades.
 *
 * A fonte da verdade é o PLANO DE CONTROLE (identidade); esta tela só mostra e
 * pede. A escrita passa por /api/admin/planos (freio do e-mail autorizado no
 * servidor) e por /api/admin/clientes (só o dono).
 *
 * Padrão Dash: casca (Shell) + kit; Poppins; laranja #ff751f; raios 24/10px;
 * ícones de traço, nunca emoji. */

import { useCallback, useEffect, useMemo, useState } from "react";
import Shell from "@/components/dash/Shell";
import { Card, Secao, Selo, Vazio } from "@/components/dash/kit";
import { IconePlanos, IconeUsuarios } from "@/components/dash/icons";

/* Escopo de agora: só MIRAI OS e CRM são vendidos. Os planos dos outros
 * produtos continuam no catálogo, guardados para quando chegarem na fila. */
const EM_ESCOPO = ["mirai", "saaso"];

const ROTULO_PRODUTO: Record<string, string> = {
  mirai: "MIRAI OS",
  saaso: "CRM",
  darkmatter: "Dark Matter",
  pathfinder: "Pathfinder",
  mediafactory: "Media Factory",
};

function rotuloProduto(id: string): string {
  return ROTULO_PRODUTO[id] || id || "—";
}

function reais(centavos?: number): string {
  if (centavos === undefined || centavos === null) return "—";
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function centavosDe(texto: string): number | null {
  const limpo = texto.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(limpo);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

type OrganizacaoDoCliente = {
  tenant_id: string;
  organizacao: string;
  produto: string;
  plano: string;
  papel: string | null;
  extras: string[];
  convite_email: string | null;
  desde: string | null;
};

type Cliente = {
  id: number;
  nome: string;
  email: string;
  entra_por: "Google" | "senha";
  tenant_local: string | null;
  vinculado: boolean;
  desde: string | null;
  organizacoes: OrganizacaoDoCliente[];
};

type Plano = {
  plan_id: string;
  product_id: string;
  nome: string;
  preco_centavos?: number;
  intervalo?: string;
  ativo?: boolean;
  capacidades?: string[];
  limites?: Record<string, number>;
};

type Capacidade = {
  capability_id: string;
  product_id: string;
  nome?: string;
  area?: string;
};

/* ── chamada às rotas do admin de planos ───────────────────────────────── */
async function apiPlanos(
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
  const d = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
  if (!res.ok) throw new Error(d?.detail || d?.error || `HTTP ${res.status}`);
  return d as Record<string, unknown>;
}

export default function ClientesPage() {
  const [aba, setAba] = useState<"clientes" | "planos">("clientes");
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [orfaos, setOrfaos] = useState<OrganizacaoDoCliente[]>([]);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [capacidades, setCapacidades] = useState<Capacidade[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [nota, setNota] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState("");

  // form: novo cliente
  const [abrirNovoCliente, setAbrirNovoCliente] = useState(false);
  const [nomeCliente, setNomeCliente] = useState("");
  const [emailCliente, setEmailCliente] = useState("");
  const [produtoCliente, setProdutoCliente] = useState("mirai");
  const [planoCliente, setPlanoCliente] = useState("");

  // form: novo plano
  const [abrirNovoPlano, setAbrirNovoPlano] = useState(false);
  const [produtoPlano, setProdutoPlano] = useState("mirai");
  const [nomePlano, setNomePlano] = useState("");
  const [idPlano, setIdPlano] = useState("");
  const [precoPlano, setPrecoPlano] = useState("");
  const [intervaloPlano, setIntervaloPlano] = useState("mensal");

  // edição de um plano (por plan_id)
  const [editando, setEditando] = useState("");
  const [edNome, setEdNome] = useState("");
  const [edPreco, setEdPreco] = useState("");
  const [edAtivo, setEdAtivo] = useState(true);
  const [edCaps, setEdCaps] = useState<string[]>([]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [rc, rp, rcap] = await Promise.all([
        fetch("/api/admin/clientes"),
        fetch("/api/admin/planos?acao=planos"),
        fetch("/api/admin/planos?acao=capabilities"),
      ]);
      if (rc.status === 403) throw new Error("Esta área é do dono da plataforma.");
      if (!rc.ok) throw new Error(`HTTP ${rc.status}`);
      const dc = (await rc.json()) as {
        clientes?: Cliente[];
        orfaos?: OrganizacaoDoCliente[];
        aviso?: string;
      };
      setClientes(dc.clientes || []);
      setOrfaos(dc.orfaos || []);
      setAviso(dc.aviso || "");

      if (rp.ok) {
        const dp = (await rp.json()) as { planos?: Plano[] };
        setPlanos(dp.planos || []);
      }
      if (rcap.ok) {
        const dcap = (await rcap.json()) as { capabilities?: Capacidade[] };
        setCapacidades(dcap.capabilities || []);
      }
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao carregar");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /* Os planos que PODEM ser postos numa organização: os do produto dela, ativos,
   * com o escopo de venda na frente.
   *
   * Se o produto vier VAZIO (serviço antigo), oferecemos o catálogo ativo inteiro
   * em vez de uma lista vazia — e aí o rótulo de cada opção diz de que produto
   * ela é. O servidor recusa plano de outro produto (422), então escolher errado
   * falha com explicação, nunca em silêncio. O plano ATUAL entra sempre, mesmo
   * fora do catálogo: senão o seletor apareceria vazio e pareceria que a conta
   * não tem plano. */
  const planosDe = useCallback(
    (produto: string, atual: string): Plano[] => {
      const meus = planos.filter((p) => p.ativo !== false && (!produto || p.product_id === produto));
      const ordenados = [...meus].sort((a, b) => {
        const ea = EM_ESCOPO.indexOf(a.product_id) >= 0 ? 0 : 1;
        const eb = EM_ESCOPO.indexOf(b.product_id) >= 0 ? 0 : 1;
        if (ea !== eb) return ea - eb;
        return a.product_id.localeCompare(b.product_id) || a.plan_id.localeCompare(b.plan_id);
      });
      if (atual && !ordenados.some((p) => p.plan_id === atual)) {
        const conhecido = planos.find((p) => p.plan_id === atual);
        return [
          ...ordenados,
          conhecido || { plan_id: atual, product_id: produto, nome: atual, ativo: true },
        ];
      }
      return ordenados;
    },
    [planos],
  );

  const trocarPlano = useCallback(
    async (tenantId: string, planId: string, quem: string) => {
      setErro("");
      setNota("");
      setOcupado(tenantId);
      try {
        await apiPlanos("definir_plano_da_org", {
          method: "POST",
          body: { acao: "definir_plano_da_org", tenant_id: tenantId, plan_id: planId },
        });
        setNota(`${quem} agora está no plano ${planId}.`);
        await carregar();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "falha ao trocar plano");
      } finally {
        setOcupado("");
      }
    },
    [carregar],
  );

  const criarCliente = useCallback(async () => {
    setErro("");
    setNota("");
    if (!emailCliente.includes("@")) {
      setErro("Informe um e-mail válido para o cliente.");
      return;
    }
    setOcupado("novo-cliente");
    try {
      const res = await fetch("/api/admin/clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "criar_cliente",
          nome: nomeCliente,
          email: emailCliente,
          produto: produtoCliente,
          plano: planoCliente,
        }),
      });
      const d = (await res.json().catch(() => ({}))) as {
        error?: string;
        detail?: string;
        plano?: string;
      };
      if (!res.ok) throw new Error(d?.detail || d?.error || `HTTP ${res.status}`);
      setNota(
        `Cliente criado: ${emailCliente} já tem espaço em ${rotuloProduto(produtoCliente)} no plano ` +
          `${d?.plano || planoCliente || "free"}. A conta nasce no primeiro acesso dela.`,
      );
      setNomeCliente("");
      setEmailCliente("");
      setPlanoCliente("");
      setAbrirNovoCliente(false);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao criar cliente");
    } finally {
      setOcupado("");
    }
  }, [nomeCliente, emailCliente, produtoCliente, planoCliente, carregar]);

  const criarPlano = useCallback(async () => {
    setErro("");
    setNota("");
    const id = (
      idPlano || `${produtoPlano}_${nomePlano.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`
    )
      .trim()
      .replace(/^_+|_+$/g, "");
    if (!id) {
      setErro("Informe o identificador do plano.");
      return;
    }
    if (!nomePlano.trim()) {
      setErro("Informe o nome do plano.");
      return;
    }
    const cents = precoPlano.trim() ? centavosDe(precoPlano) : null;
    if (precoPlano.trim() && cents === null) {
      setErro("Preço inválido. Ex.: 149,00");
      return;
    }
    setOcupado("novo-plano");
    try {
      await apiPlanos("salvar_plano", {
        method: "POST",
        body: {
          acao: "salvar_plano",
          plan_id: id,
          product_id: produtoPlano,
          nome: nomePlano.trim(),
          preco_centavos: cents ?? undefined,
          intervalo: intervaloPlano,
          ativo: true,
        },
      });
      setNota(`Plano ${id} criado em ${rotuloProduto(produtoPlano)}.`);
      setNomePlano("");
      setIdPlano("");
      setPrecoPlano("");
      setAbrirNovoPlano(false);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao criar plano");
    } finally {
      setOcupado("");
    }
  }, [produtoPlano, nomePlano, idPlano, precoPlano, intervaloPlano, carregar]);

  const abrirEdicao = useCallback((p: Plano) => {
    setEditando(p.plan_id);
    setEdNome(p.nome || "");
    setEdPreco(p.preco_centavos ? String(p.preco_centavos / 100).replace(".", ",") : "");
    setEdAtivo(p.ativo !== false);
    setEdCaps(Array.isArray(p.capacidades) ? [...p.capacidades] : []);
  }, []);

  const salvarEdicao = useCallback(
    async (p: Plano) => {
      setErro("");
      setNota("");
      const cents = edPreco.trim() ? centavosDe(edPreco) : null;
      if (edPreco.trim() && cents === null) {
        setErro("Preço inválido. Ex.: 149,00");
        return;
      }
      setOcupado(p.plan_id);
      try {
        await apiPlanos("editar_plano", {
          method: "PATCH",
          body: {
            acao: "editar_plano",
            plan_id: p.plan_id,
            nome: edNome.trim() || p.plan_id,
            ativo: edAtivo,
            ...(cents !== null ? { preco_centavos: cents } : {}),
          },
        });
        await apiPlanos("definir_capacidades_do_plano", {
          method: "PUT",
          body: { acao: "definir_capacidades_do_plano", plan_id: p.plan_id, capacidades: edCaps },
        });
        setNota(`Plano ${p.plan_id} atualizado.`);
        setEditando("");
        await carregar();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "falha ao salvar plano");
      } finally {
        setOcupado("");
      }
    },
    [edNome, edPreco, edAtivo, edCaps, carregar],
  );

  const resumo = useMemo(() => {
    const contas = new Set(clientes.map((c) => c.email)).size;
    const comOrg = clientes.filter((c) => c.organizacoes.length > 0).length;
    return { contas, linhas: clientes.length, semOrg: clientes.length - comOrg };
  }, [clientes]);

  /* Agrupamento do catálogo: escopo de venda primeiro, produto em ordem. */
  const produtosNoCatalogo = useMemo(() => {
    const ids = [...new Set(planos.map((p) => p.product_id))];
    return ids.sort((a, b) => {
      const ea = EM_ESCOPO.indexOf(a) >= 0 ? 0 : 1;
      const eb = EM_ESCOPO.indexOf(b) >= 0 ? 0 : 1;
      return ea - eb || a.localeCompare(b);
    });
  }, [planos]);

  const Aba = ({
    id,
    rotulo,
    icone,
  }: {
    id: "clientes" | "planos";
    rotulo: string;
    icone: React.ReactNode;
  }) => (
    <button
      onClick={() => setAba(id)}
      className={`inline-flex items-center gap-2 rounded-[10px] px-4 py-2 text-[12px] font-semibold transition ${
        aba === id
          ? "bg-dash-brand text-white"
          : "border border-dash-hair/12 text-dash-muted hover:text-dash-fg"
      }`}
    >
      {icone}
      {rotulo}
    </button>
  );

  return (
    <Shell titulo="Clientes" usuario={{ ehDono: true }}>
      <div className="flex flex-wrap items-center gap-2">
        <Aba id="clientes" rotulo="Clientes" icone={<IconeUsuarios />} />
        <Aba id="planos" rotulo="Planos" icone={<IconePlanos />} />
      </div>

      {erro && (
        <p className="mt-5 rounded-[16px] border border-dash-bad/30 bg-dash-bad/[0.07] px-5 py-4 text-[13px] text-dash-bad">
          {erro}
        </p>
      )}
      {nota && (
        <p className="mt-5 rounded-[16px] border border-dash-ok/30 bg-dash-ok/[0.07] px-5 py-4 text-[13px] text-dash-ok">
          {nota}
        </p>
      )}
      {aviso && (
        <p className="mt-5 rounded-[16px] border border-dash-warn/30 bg-dash-warn/[0.07] px-5 py-4 text-[13px] text-dash-warn">
          {aviso}
        </p>
      )}

      {/* ══════════════════ ABA CLIENTES ══════════════════ */}
      {aba === "clientes" && (
        <>
          <p className="mt-5 max-w-2xl text-[13px] leading-[1.65] text-dash-muted">
            Cada linha é uma <span className="text-dash-fg">pessoa</span> e onde ela está. O plano é
            posto <span className="text-dash-fg">à mão</span>, no seletor de cada linha — nada promove
            ninguém sozinho.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              onClick={() => setAbrirNovoCliente((v) => !v)}
              className="inline-flex items-center gap-2 rounded-[10px] bg-dash-brand px-5 py-2.5 text-[12px] font-semibold text-white transition hover:bg-dash-brandHi"
            >
              {abrirNovoCliente ? "Fechar" : "Adicionar novo cliente"}
            </button>
            {orfaos.length > 0 && (
              <span className="text-[12px] text-dash-dim">
                {orfaos.length} aguardando primeiro acesso
              </span>
            )}
          </div>

          {abrirNovoCliente && (
            <Card className="mt-4">
              <p className="text-[13px] font-semibold text-dash-fg">Novo cliente</p>
              <p className="mt-1 max-w-2xl text-[12px] leading-[1.6] text-dash-muted">
                Cria a <span className="text-dash-fg">organização</span> e o convite do dono. Nada de
                senha: a conta nasce quando a pessoa entrar com esse e-mail — e ela cai direto neste
                espaço, no plano escolhido aqui.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] uppercase tracking-[0.14em] text-dash-dim">Nome</span>
                  <input
                    value={nomeCliente}
                    onChange={(e) => setNomeCliente(e.target.value)}
                    placeholder="Nome da pessoa ou empresa"
                    className="rounded-[10px] border border-dash-hair/10 bg-dash-bg px-3.5 py-2 text-[12px] text-dash-fg outline-none focus:border-dash-brand/60"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] uppercase tracking-[0.14em] text-dash-dim">
                    E-mail (o login dela)
                  </span>
                  <input
                    value={emailCliente}
                    onChange={(e) => setEmailCliente(e.target.value)}
                    placeholder="pessoa@empresa.com"
                    className="rounded-[10px] border border-dash-hair/10 bg-dash-bg px-3.5 py-2 text-[12px] text-dash-fg outline-none focus:border-dash-brand/60"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] uppercase tracking-[0.14em] text-dash-dim">Produto</span>
                  <select
                    value={produtoCliente}
                    onChange={(e) => {
                      setProdutoCliente(e.target.value);
                      setPlanoCliente("");
                    }}
                    className="rounded-[10px] border border-dash-hair/10 bg-dash-bg px-3.5 py-2 text-[12px] text-dash-fg outline-none focus:border-dash-brand/60"
                  >
                    {EM_ESCOPO.map((p) => (
                      <option key={p} value={p}>
                        {rotuloProduto(p)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] uppercase tracking-[0.14em] text-dash-dim">
                    Plano inicial
                  </span>
                  <select
                    value={planoCliente}
                    onChange={(e) => setPlanoCliente(e.target.value)}
                    className="rounded-[10px] border border-dash-hair/10 bg-dash-bg px-3.5 py-2 text-[12px] text-dash-fg outline-none focus:border-dash-brand/60"
                  >
                    <option value="">Free (padrão)</option>
                    {planosDe(produtoCliente, "").map((p) => (
                      <option key={p.plan_id} value={p.plan_id}>
                        {p.nome || p.plan_id}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-4">
                <button
                  onClick={() => void criarCliente()}
                  disabled={ocupado === "novo-cliente"}
                  className="rounded-[10px] bg-dash-brand px-5 py-2.5 text-[12px] font-semibold text-white transition hover:bg-dash-brandHi disabled:opacity-50"
                >
                  {ocupado === "novo-cliente" ? "Criando…" : "Criar cliente"}
                </button>
              </div>
            </Card>
          )}

          <Secao
            titulo="Clientes"
            contagem={
              carregando
                ? "carregando…"
                : `${resumo.contas} conta(s) · ${resumo.linhas} vínculo(s)${resumo.semOrg ? ` · ${resumo.semOrg} sem organização` : ""}`
            }
          >
            {carregando ? (
              <p className="text-[13px] text-dash-dim">Carregando…</p>
            ) : clientes.length === 0 ? (
              <Vazio
                icone={<IconeUsuarios />}
                titulo="Nenhum cliente ainda"
                texto="Quando alguém criar conta no MIRAI OS, aparece aqui — e o plano é posto à mão."
              />
            ) : (
              <div className="flex flex-col gap-3">
                {clientes.map((c, i) => {
                  const org = c.organizacoes[0];
                  const chave = `${c.id}-${org?.tenant_id || `sem-${i}`}`;
                  return (
                    <Card key={chave}>
                      <div className="flex flex-wrap items-start gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-3">
                            <p className="text-[15px] font-semibold text-dash-fg">{c.nome}</p>
                            <Selo tom={c.entra_por === "Google" ? "info" : "ok"}>
                              entra por {c.entra_por}
                            </Selo>
                            {org && c.vinculado && <Selo tom="ok">vinculado</Selo>}
                            {org && !c.vinculado && <Selo tom="alerta">vínculo pendente</Selo>}
                          </div>
                          <p className="mt-1 break-all text-[12px] text-dash-muted">{c.email}</p>
                          <p className="mt-2 text-[12px] text-dash-dim">
                            {org ? (
                              <>
                                {org.organizacao} · {rotuloProduto(org.produto)}
                                {org.papel ? ` · ${org.papel}` : ""}
                              </>
                            ) : (
                              <>Sem organização no plano de controle — ainda não aparece para receber plano.</>
                            )}
                          </p>
                          {org && org.extras.length > 0 && (
                            <p className="mt-2 flex flex-wrap items-center gap-1.5">
                              <span className="text-[11px] uppercase tracking-[0.14em] text-dash-dim">
                                add-ons
                              </span>
                              {org.extras.map((e) => (
                                <span
                                  key={e}
                                  className="rounded-[8px] bg-dash-side px-2 py-0.5 font-mono text-[11px] text-dash-muted"
                                >
                                  {e}
                                </span>
                              ))}
                            </p>
                          )}
                        </div>

                        {org && (
                          <label className="flex shrink-0 flex-col gap-1.5">
                            <span className="text-[11px] uppercase tracking-[0.14em] text-dash-dim">
                              Plano (à mão)
                            </span>
                            <select
                              value={org.plano || ""}
                              disabled={ocupado === org.tenant_id}
                              onChange={(e) => void trocarPlano(org.tenant_id, e.target.value, c.nome)}
                              className="min-w-[190px] rounded-[10px] border border-dash-hair/10 bg-dash-bg px-3.5 py-2 text-[12px] text-dash-fg outline-none focus:border-dash-brand/60 disabled:opacity-50"
                            >
                              {planosDe(org.produto, org.plano).map((p) => (
                                <option key={p.plan_id} value={p.plan_id}>
                                  {org.produto
                                    ? p.nome || p.plan_id
                                    : `${p.nome || p.plan_id} · ${rotuloProduto(p.product_id)}`}
                                </option>
                              ))}
                            </select>
                            <span className="font-mono text-[10px] text-dash-dim">{org.tenant_id}</span>
                          </label>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </Secao>

          {orfaos.length > 0 && (
            <Secao titulo="Aguardando primeiro acesso" contagem={`${orfaos.length}`}>
              <p className="mb-3 max-w-2xl text-[12px] leading-[1.6] text-dash-dim">
                O espaço já existe e o plano já pode ser posto — falta a pessoa entrar. Quando ela
                entrar com o e-mail do convite, cai direto aqui.
              </p>
              <div className="flex flex-col gap-2">
                {orfaos.map((o) => (
                  <Card key={o.tenant_id}>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-dash-fg">{o.organizacao}</p>
                        <p className="mt-1 text-[12px] text-dash-dim">
                          {rotuloProduto(o.produto)}
                          {o.convite_email ? (
                            <>
                              {" · convite para "}
                              <span className="text-dash-muted">{o.convite_email}</span>
                            </>
                          ) : (
                            " · sem conta no MIRAI OS"
                          )}
                        </p>
                        <p className="mt-1 font-mono text-[10px] text-dash-dim">{o.tenant_id}</p>
                      </div>
                      <select
                        value={o.plano || ""}
                        disabled={ocupado === o.tenant_id}
                        onChange={(e) => void trocarPlano(o.tenant_id, e.target.value, o.organizacao)}
                        className="min-w-[190px] rounded-[10px] border border-dash-hair/10 bg-dash-bg px-3.5 py-2 text-[12px] text-dash-fg outline-none focus:border-dash-brand/60 disabled:opacity-50"
                      >
                        {planosDe(o.produto, o.plano).map((p) => (
                          <option key={p.plan_id} value={p.plan_id}>
                            {o.produto
                              ? p.nome || p.plan_id
                              : `${p.nome || p.plan_id} · ${rotuloProduto(p.product_id)}`}
                          </option>
                        ))}
                      </select>
                    </div>
                  </Card>
                ))}
              </div>
            </Secao>
          )}
        </>
      )}

      {/* ══════════════════ ABA PLANOS ══════════════════ */}
      {aba === "planos" && (
        <>
          <p className="mt-5 max-w-2xl text-[13px] leading-[1.65] text-dash-muted">
            O catálogo inteiro. Aqui se cria plano novo e se edita nome, preço e capacidades — o que
            estiver salvo aqui é o que o produto libera para quem está nesse plano.
          </p>

          <div className="mt-6">
            <button
              onClick={() => setAbrirNovoPlano((v) => !v)}
              className="inline-flex items-center gap-2 rounded-[10px] bg-dash-brand px-5 py-2.5 text-[12px] font-semibold text-white transition hover:bg-dash-brandHi"
            >
              {abrirNovoPlano ? "Fechar" : "Adicionar novo plano"}
            </button>
          </div>

          {abrirNovoPlano && (
            <Card className="mt-4">
              <p className="text-[13px] font-semibold text-dash-fg">Novo plano</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] uppercase tracking-[0.14em] text-dash-dim">Produto</span>
                  <select
                    value={produtoPlano}
                    onChange={(e) => {
                      setProdutoPlano(e.target.value);
                      setIdPlano("");
                    }}
                    className="rounded-[10px] border border-dash-hair/10 bg-dash-bg px-3.5 py-2 text-[12px] text-dash-fg outline-none focus:border-dash-brand/60"
                  >
                    {EM_ESCOPO.map((p) => (
                      <option key={p} value={p}>
                        {rotuloProduto(p)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] uppercase tracking-[0.14em] text-dash-dim">Nome</span>
                  <input
                    value={nomePlano}
                    onChange={(e) => setNomePlano(e.target.value)}
                    placeholder="Ex.: Pro, Business"
                    className="rounded-[10px] border border-dash-hair/10 bg-dash-bg px-3.5 py-2 text-[12px] text-dash-fg outline-none focus:border-dash-brand/60"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] uppercase tracking-[0.14em] text-dash-dim">
                    Identificador
                  </span>
                  <input
                    value={idPlano}
                    onChange={(e) => setIdPlano(e.target.value)}
                    placeholder={`${produtoPlano}_nome`}
                    className="rounded-[10px] border border-dash-hair/10 bg-dash-bg px-3.5 py-2 font-mono text-[12px] text-dash-fg outline-none focus:border-dash-brand/60"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] uppercase tracking-[0.14em] text-dash-dim">
                    Preço (R$ / mês)
                  </span>
                  <input
                    value={precoPlano}
                    onChange={(e) => setPrecoPlano(e.target.value)}
                    placeholder="149,00"
                    className="rounded-[10px] border border-dash-hair/10 bg-dash-bg px-3.5 py-2 text-[12px] text-dash-fg outline-none focus:border-dash-brand/60"
                  />
                </label>
              </div>
              <div className="mt-4">
                <button
                  onClick={() => void criarPlano()}
                  disabled={ocupado === "novo-plano"}
                  className="rounded-[10px] bg-dash-brand px-5 py-2.5 text-[12px] font-semibold text-white transition hover:bg-dash-brandHi disabled:opacity-50"
                >
                  {ocupado === "novo-plano" ? "Criando…" : "Criar plano"}
                </button>
              </div>
            </Card>
          )}

          {produtosNoCatalogo.map((prod) => {
            const meus = planos.filter((p) => p.product_id === prod);
            return (
              <Secao key={prod} titulo={rotuloProduto(prod)} contagem={`${meus.length} plano(s)`}>
                <div className="flex flex-col gap-3">
                  {meus.map((p) => {
                    const aberto = editando === p.plan_id;
                    const capsDoProduto = capacidades.filter((c) => c.product_id === prod);
                    return (
                      <Card key={p.plan_id}>
                        <div className="flex flex-wrap items-center gap-3">
                          <p className="text-[15px] font-semibold text-dash-fg">{p.nome || p.plan_id}</p>
                          <span className="rounded-[8px] bg-dash-side px-2 py-0.5 font-mono text-[11px] text-dash-muted">
                            {p.plan_id}
                          </span>
                          {p.ativo === false ? (
                            <Selo tom="erro">inativo</Selo>
                          ) : (
                            <Selo tom="ok">ativo</Selo>
                          )}
                          <span className="text-[12px] text-dash-muted">
                            {p.preco_centavos ? reais(p.preco_centavos) : "sem preço"}
                          </span>
                          <span className="text-[12px] text-dash-dim">
                            {(p.capacidades || []).length} capacidade(s)
                          </span>
                          <span className="ml-auto">
                            <button
                              onClick={() => (aberto ? setEditando("") : abrirEdicao(p))}
                              className="rounded-[10px] border border-dash-hair/12 px-4 py-2 text-[12px] font-semibold text-dash-muted transition hover:text-dash-fg"
                            >
                              {aberto ? "Fechar" : "Editar"}
                            </button>
                          </span>
                        </div>

                        {aberto && (
                          <div className="mt-4 border-t border-dash-hair/[0.07] pt-4">
                            <div className="grid gap-3 sm:grid-cols-3">
                              <label className="flex flex-col gap-1.5">
                                <span className="text-[11px] uppercase tracking-[0.14em] text-dash-dim">
                                  Nome
                                </span>
                                <input
                                  value={edNome}
                                  onChange={(e) => setEdNome(e.target.value)}
                                  className="rounded-[10px] border border-dash-hair/10 bg-dash-bg px-3.5 py-2 text-[12px] text-dash-fg outline-none focus:border-dash-brand/60"
                                />
                              </label>
                              <label className="flex flex-col gap-1.5">
                                <span className="text-[11px] uppercase tracking-[0.14em] text-dash-dim">
                                  Preço (R$)
                                </span>
                                <input
                                  value={edPreco}
                                  onChange={(e) => setEdPreco(e.target.value)}
                                  placeholder="149,00"
                                  className="rounded-[10px] border border-dash-hair/10 bg-dash-bg px-3.5 py-2 text-[12px] text-dash-fg outline-none focus:border-dash-brand/60"
                                />
                              </label>
                              <label className="flex flex-col gap-1.5">
                                <span className="text-[11px] uppercase tracking-[0.14em] text-dash-dim">
                                  Estado
                                </span>
                                <select
                                  value={edAtivo ? "1" : "0"}
                                  onChange={(e) => setEdAtivo(e.target.value === "1")}
                                  className="rounded-[10px] border border-dash-hair/10 bg-dash-bg px-3.5 py-2 text-[12px] text-dash-fg outline-none focus:border-dash-brand/60"
                                >
                                  <option value="1">Ativo</option>
                                  <option value="0">Inativo</option>
                                </select>
                              </label>
                            </div>

                            <p className="mt-4 text-[11px] uppercase tracking-[0.14em] text-dash-dim">
                              Capacidades
                            </p>
                            {capsDoProduto.length === 0 ? (
                              <p className="mt-1.5 text-[12px] text-dash-dim">
                                Nenhuma capacidade cadastrada para {rotuloProduto(prod)}.
                              </p>
                            ) : (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {capsDoProduto.map((c) => {
                                  const marcada = edCaps.includes(c.capability_id);
                                  return (
                                    <button
                                      key={c.capability_id}
                                      onClick={() =>
                                        setEdCaps((atual) =>
                                          marcada
                                            ? atual.filter((x) => x !== c.capability_id)
                                            : [...atual, c.capability_id],
                                        )
                                      }
                                      className={`rounded-[10px] px-3 py-1.5 font-mono text-[11px] transition ${
                                        marcada
                                          ? "bg-dash-brand text-white"
                                          : "border border-dash-hair/12 text-dash-muted hover:text-dash-fg"
                                      }`}
                                    >
                                      {c.capability_id}
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                            <div className="mt-4">
                              <button
                                onClick={() => void salvarEdicao(p)}
                                disabled={ocupado === p.plan_id}
                                className="rounded-[10px] bg-dash-brand px-5 py-2.5 text-[12px] font-semibold text-white transition hover:bg-dash-brandHi disabled:opacity-50"
                              >
                                {ocupado === p.plan_id ? "Salvando…" : "Salvar"}
                              </button>
                            </div>
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </Secao>
            );
          })}
        </>
      )}
    </Shell>
  );
}
