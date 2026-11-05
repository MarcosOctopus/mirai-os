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
import { Card, CardTitulo, Chip, Secao, Tabela, Vazio } from "@/components/dash/kit";
import type { Coluna } from "@/components/dash/kit";
import { IconeBusca, IconePlanos, IconeUsuarios } from "@/components/dash/icons";

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

const LIMITES: { chave: string; rotulo: string; nota?: string }[] = [
  { chave: "usuarios", rotulo: "Usuários" },
  { chave: "contatos", rotulo: "Contatos / leads" },
  { chave: "canais", rotulo: "Canais / números" },
  { chave: "mensagens_mes", rotulo: "Mensagens / mês" },
  {
    chave: "ia_teto_mensal_centavos",
    rotulo: "Teto de gasto de IA (centavos/mês)",
    nota: "ai_budgets.monthly_limit_cents",
  },
  {
    chave: "envio_diario_por_numero",
    rotulo: "Teto diário de envio por número",
    nota: "channel_sessions.daily_message_limit",
  },
  // ── Espaço, projetos de fora e bancos (dono, 15/10/2026) ──────────────────
  // "Projetos aqui dentro do Mirai OS ele pode ter quanto quiser ate bater os 3gb
  //  dele, porem de fora como git e server coloca um limite por plano."
  // Logo: `storage_gb` é o teto de ESPAÇO (vale para tudo, inclusive interno) e
  // `projetos_externos` é o teto de QUANTIDADE — que só existe para o que vem de
  // fora. Projeto criado aqui dentro não tem teto de quantidade nenhum.
  {
    chave: "storage_gb",
    rotulo: "Espaço (GB)",
    nota: "teto de espaço da conta no Arquiteto · ex.: 3 = 3 GB",
  },
  {
    chave: "projetos_externos",
    rotulo: "Projetos de fora (git/servidor)",
    nota: "só os trazidos de fora · criado aqui dentro não tem teto de quantidade · ex.: 3",
  },
  {
    chave: "bancos",
    rotulo: "Bancos de dados",
    nota: "quantos bancos a conta pode ter · ex.: 5",
  },
  // ── Acesso simultâneo + faixa de pico (decidido por Marcos, 06/out/2026) ──
  // O preço é editado AQUI e vive em `limites` (JSONB no plano de controle —
  // zero migration). Modelo e faixas: docs/PLANOS-E-CAPACIDADES.md §4.1.
  {
    chave: "acessos_simultaneos",
    rotulo: "Acessos simultâneos inclusos",
    nota: "teto base do plano — ex.: 200",
  },
  {
    chave: "simultaneos_faixa1_centavos",
    rotulo: "Faixa 201–500 · preço do MÊS (centavos)",
    nota: "a FAIXA inteira no mês — NÃO é por acesso · ex.: 14900 = R$ 149,00",
  },
  {
    chave: "simultaneos_faixa2_centavos",
    rotulo: "Faixa 501–1.000 · preço do MÊS (centavos)",
    nota: "a FAIXA inteira no mês — NÃO é por acesso · ex.: 39900 = R$ 399,00",
  },
  {
    chave: "simultaneos_faixa3_centavos",
    rotulo: "Faixa 1.001–2.500 · preço do MÊS (centavos)",
    nota: "a FAIXA inteira no mês — NÃO é por acesso · acima de 2.500: sob consulta",
  },
];

/* ── util ────────────────────────────────────────────────────────────────── */
function reais(centavos?: number): string {
  return ((centavos ?? 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function primeiro(...vals: (string | undefined | null)[]): string {
  for (const v of vals) {
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
  }
  return "";
}

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

/* ── chave liga/desliga (traço, sem emoji) ───────────────────────────────── */
function Chave({
  ligado,
  onToggle,
  desabilitado,
}: {
  ligado: boolean;
  onToggle: () => void;
  desabilitado?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      disabled={desabilitado}
      onClick={onToggle}
      title={ligado ? "Ligado — clique para desligar" : "Desligado — clique para ligar"}
      className={`inline-flex h-[22px] w-[40px] shrink-0 items-center rounded-full border px-[3px] transition disabled:opacity-50 ${
        ligado ? "border-dash-brand/70 bg-dash-brand/25" : "border-dash-hair/15 bg-dash-raise"
      }`}
    >
      <span
        className={`h-[15px] w-[15px] rounded-full transition-transform ${
          ligado ? "translate-x-[19px] bg-dash-brand" : "translate-x-0 bg-dash-muted"
        }`}
      />
    </button>
  );
}

const campoClasse =
  "rounded-[10px] border border-dash-hair/10 bg-dash-bg px-4 py-2.5 text-[13px] text-dash-fg outline-none placeholder:text-dash-dim focus:border-dash-brand/60";

/* ── Tela ────────────────────────────────────────────────────────────────── */
export default function PlanosPage() {
  const [aba, setAba] = useState<"planos" | "orgs" | "usuarios">("planos");
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [capacidades, setCapacidades] = useState<Capacidade[]>([]);
  const [orgs, setOrgs] = useState<Organizacao[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [selecionado, setSelecionado] = useState<string>("");
  const [capsDoPlano, setCapsDoPlano] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [salvandoCaps, setSalvandoCaps] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [conta, setConta] = useState<{ nome?: string; email?: string }>({});

  const [form, setForm] = useState({
    plan_id: "",
    product_id: "mirai",
    nome: "",
    preco: "",
    intervalo: "mensal",
    ativo: true,
  });
  const [edicao, setEdicao] = useState({
    nome: "",
    preco: "0.00",
    intervalo: "mensal",
    ativo: true,
    limites: {} as Record<string, number>,
  });

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
    setCarregando(false);
  }, []);

  useEffect(() => {
    carregarTudo();
  }, [carregarTudo]);

  const selecionar = useCallback(
    async (plano: Plano) => {
      setSelecionado(plano.plan_id);
      setEdicao({
        nome: plano.nome || "",
        preco: ((plano.preco_centavos ?? 0) / 100).toFixed(2),
        intervalo: plano.intervalo || "mensal",
        ativo: plano.ativo !== false,
        limites: { ...(plano.limites || {}) },
      });
      try {
        const d = await api("capacidades_do_plano", { params: { plan_id: plano.plan_id } });
        setCapsDoPlano((d.capacidades as string[]) || plano.capacidades || []);
      } catch {
        setCapsDoPlano(plano.capacidades || []);
      }
    },
    [],
  );

  useEffect(() => {
    if (!selecionado && planos.length) void selecionar(planos[0]);
  }, [planos, selecionado, selecionar]);

  const planoAtual = useMemo(
    () => planos.find((p) => p.plan_id === selecionado) || null,
    [planos, selecionado],
  );

  const orgsPorPlano = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of orgs) m.set(o.plan_id, (m.get(o.plan_id) || 0) + 1);
    return m;
  }, [orgs]);

  /* capacidades agrupadas por produto e por área */
  const grupos = useMemo(() => {
    const mapa = new Map<string, Map<string, Capacidade[]>>();
    for (const c of capacidades) {
      const produto = c.product_id || c.capability_id.split(".")[0] || "outros";
      const area = c.area || c.capability_id.split(".")[1] || "geral";
      if (!mapa.has(produto)) mapa.set(produto, new Map());
      const areas = mapa.get(produto) as Map<string, Capacidade[]>;
      if (!areas.has(area)) areas.set(area, []);
      (areas.get(area) as Capacidade[]).push(c);
    }
    return Array.from(mapa.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [capacidades]);

  /* ── escritas ──────────────────────────────────────────────────────────── */
  const alternarCapacidade = useCallback(
    async (id: string) => {
      if (!selecionado) return;
      const antes = capsDoPlano;
      const novo = antes.includes(id) ? antes.filter((x) => x !== id) : [...antes, id];
      setCapsDoPlano(novo);
      setSalvandoCaps(true);
      setErro("");
      setAviso("");
      try {
        await api("definir_capacidades_do_plano", {
          method: "PUT",
          body: {
            acao: "definir_capacidades_do_plano",
            plan_id: selecionado,
            capacidades: novo,
          },
        });
        setAviso(`Capacidades de ${selecionado} atualizadas.`);
      } catch (e) {
        setCapsDoPlano(antes);
        setErro(e instanceof Error ? e.message : "falha ao salvar capacidade");
      } finally {
        setSalvandoCaps(false);
      }
    },
    [capsDoPlano, selecionado],
  );

  const salvarEdicao = useCallback(async () => {
    if (!selecionado) return;
    setSalvando(true);
    setErro("");
    setAviso("");
    try {
      await api("editar_plano", {
        method: "PATCH",
        body: {
          acao: "editar_plano",
          plan_id: selecionado,
          nome: edicao.nome,
          preco_centavos: Math.round(parseFloat(edicao.preco.replace(",", ".") || "0") * 100),
          intervalo: edicao.intervalo,
          ativo: edicao.ativo,
          limites: edicao.limites,
        },
      });
      setAviso(`Plano ${selecionado} atualizado.`);
      await carregarTudo();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao salvar plano");
    } finally {
      setSalvando(false);
    }
  }, [selecionado, edicao, carregarTudo]);

  const criarPlano = useCallback(async () => {
    if (!form.plan_id.trim() || !form.nome.trim()) {
      setErro("Informe o id e o nome do plano.");
      return;
    }
    setSalvando(true);
    setErro("");
    setAviso("");
    try {
      await api("salvar_plano", {
        method: "POST",
        body: {
          acao: "salvar_plano",
          plan_id: form.plan_id.trim(),
          product_id: form.product_id.trim(),
          nome: form.nome.trim(),
          preco_centavos: Math.round(parseFloat(form.preco.replace(",", ".") || "0") * 100),
          intervalo: form.intervalo,
          ativo: form.ativo,
        },
      });
      setAviso(`Plano ${form.plan_id.trim()} criado.`);
      setForm({ plan_id: "", product_id: "mirai", nome: "", preco: "", intervalo: "mensal", ativo: true });
      await carregarTudo();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao criar plano");
    } finally {
      setSalvando(false);
    }
  }, [form, carregarTudo]);

  const mudarPlanoDaOrg = useCallback(
    async (org: Organizacao, planId: string) => {
      setErro("");
      setAviso("");
      try {
        await api("definir_plano_da_org", {
          method: "POST",
          body: { acao: "definir_plano_da_org", tenant_id: org.tenant_id, plan_id: planId },
        });
        setAviso(`${org.nome} agora é ${planId}.`);
        await carregarTudo();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "falha ao trocar plano");
      }
    },
    [carregarTudo],
  );

  const mudarCapacidadeDaOrg = useCallback(
    async (org: Organizacao, capabilityId: string, conceder: boolean) => {
      setErro("");
      setAviso("");
      try {
        await api("definir_capacidade_da_org", {
          method: "POST",
          body: {
            acao: "definir_capacidade_da_org",
            tenant_id: org.tenant_id,
            capability_id: capabilityId,
            conceder,
          },
        });
        setAviso(conceder ? `${capabilityId} concedida a ${org.nome}.` : `${capabilityId} revogada de ${org.nome}.`);
        await carregarTudo();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "falha ao mudar add-on");
      }
    },
    [carregarTudo],
  );

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

  const colunasUsuarios: Coluna[] = [
    { chave: "nome", titulo: "Nome", fracao: "1.2fr" },
    { chave: "email", titulo: "E-mail", fracao: "1.6fr" },
    { chave: "organizacao", titulo: "Organização", fracao: "1.1fr" },
    { chave: "papel", titulo: "Papel", fracao: "0.7fr" },
    { chave: "plano", titulo: "Plano", fracao: "0.7fr" },
    { chave: "extras", titulo: "Extras (add-ons)", fracao: "1.3fr" },
    { chave: "desde", titulo: "Desde", fracao: "0.7fr" },
    { chave: "pagamento", titulo: "Pagamento", fracao: "0.8fr" },
  ];

  const linhasUsuarios = usuariosFiltrados.map((u, i) => {
    const extras = u.capacidades_extras || u.extras || [];
    const desde = primeiro(u.desde, u.criado_em);
    return {
      chave: primeiro(u.user_id, u.id, u.email) || `u${i}`,
      celulas: {
        nome: <span className="text-dash-fg">{primeiro(u.nome, u.name) || "—"}</span>,
        email: <span className="truncate">{u.email || "—"}</span>,
        organizacao: (
          <span className="text-dash-fg">
            {primeiro(u.organizacao, u.org_nome, u.tenant_id) || "—"}
          </span>
        ),
        papel: (
          <span className="rounded-full bg-dash-raise px-2.5 py-[3px] text-[10px] uppercase tracking-[0.12em] text-dash-muted">
            {primeiro(u.papel, u.role) || "—"}
          </span>
        ),
        plano: <span className="text-dash-brand">{primeiro(u.plan_id, u.plano) || "free"}</span>,
        extras:
          extras.length > 0 ? (
            <span className="flex flex-wrap gap-1">
              {extras.slice(0, 4).map((x) => (
                <span
                  key={x}
                  className="rounded-full border border-dash-hair/12 px-2 py-[2px] text-[10px] text-dash-muted"
                >
                  {x}
                </span>
              ))}
              {extras.length > 4 && (
                <span className="text-[10px] text-dash-dim">+{extras.length - 4}</span>
              )}
            </span>
          ) : (
            <span className="text-dash-dim">núcleo do plano</span>
          ),
        desde: <span className="text-dash-muted">{desde ? desde.slice(0, 10) : "—"}</span>,
        pagamento: <span className="text-dash-dim">{u.status_pagamento || "—"}</span>,
      },
    };
  });

  return (
    <Shell titulo="Planos" usuario={{ nome: conta.nome, email: conta.email, ehDono: true }}>
      <p className="max-w-2xl text-[13px] leading-[1.65] text-dash-muted">
        O plano vive no <span className="text-dash-fg">plano de controle</span> (identidade) — aqui só
        se mostra e se edita. Só o e-mail autorizado muda preço e plano; conceder e revogar add-on
        também passa por ele.
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
        <Chip ativo={aba === "orgs"} onClick={() => setAba("orgs")}>
          Quem tem o quê
        </Chip>
        <Chip ativo={aba === "usuarios"} onClick={() => setAba("usuarios")}>
          Usuários
        </Chip>
      </div>

      {carregando && <p className="mt-6 text-[12px] text-dash-dim">Carregando do plano de controle...</p>}

      {/* ═══════════════ ABA PLANOS ═══════════════ */}
      {aba === "planos" && !carregando && (
        <>
          <Secao titulo="Planos" contagem={`${planos.length}`}>
            {planos.length === 0 ? (
              <Vazio
                icone={<IconePlanos className="h-7 w-7" />}
                titulo="Nenhum plano ainda"
                texto="Crie o primeiro plano abaixo. Ele nasce no plano de controle e passa a valer nos produtos na hora."
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,340px)_1fr]">
                {/* lista */}
                <div className="flex flex-col gap-3">
                  {planos.map((p) => {
                    const ativo = p.plan_id === selecionado;
                    return (
                      <button
                        key={p.plan_id}
                        onClick={() => void selecionar(p)}
                        className={`rounded-[24px] border p-5 text-left transition ${
                          ativo
                            ? "border-dash-brand/60 bg-dash-card"
                            : "border-dash-hair/[0.07] bg-dash-card hover:border-dash-hair/15"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <p className="text-[15px] font-semibold text-dash-fg">{p.nome || p.plan_id}</p>
                          {!p.ativo && (
                            <span className="rounded-full bg-dash-raise px-2.5 py-[3px] text-[10px] uppercase tracking-[0.14em] text-dash-dim">
                              inativo
                            </span>
                          )}
                        </div>
                        <p className="mt-1 font-mono text-[11px] text-dash-dim">{p.plan_id}</p>
                        <div className="mt-3 flex items-baseline gap-2">
                          <span className="text-[20px] font-semibold text-dash-fg">
                            {reais(p.preco_centavos)}
                          </span>
                          <span className="text-[12px] text-dash-muted">
                            / {p.intervalo || "mensal"}
                          </span>
                        </div>
                        <p className="mt-3 text-[12px] text-dash-muted">
                          {p.capacidades?.length || 0} capacidades ·{" "}
                          {orgsPorPlano.get(p.plan_id) || 0} organização(ões)
                        </p>
                      </button>
                    );
                  })}
                </div>

                {/* detalhe */}
                <Card>
                  {!planoAtual ? (
                    <p className="text-[13px] text-dash-muted">Escolha um plano à esquerda.</p>
                  ) : (
                    <>
                      <CardTitulo rotulo="Detalhe do plano" titulo={planoAtual.nome || planoAtual.plan_id} />

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="flex flex-col gap-1.5 text-[12px] text-dash-muted">
                          Nome
                          <input
                            value={edicao.nome}
                            onChange={(e) => setEdicao((s) => ({ ...s, nome: e.target.value }))}
                            className={campoClasse}
                          />
                        </label>
                        <label className="flex flex-col gap-1.5 text-[12px] text-dash-muted">
                          Preço (R$)
                          <input
                            value={edicao.preco}
                            onChange={(e) => setEdicao((s) => ({ ...s, preco: e.target.value }))}
                            inputMode="decimal"
                            className={campoClasse}
                          />
                        </label>
                        <label className="flex flex-col gap-1.5 text-[12px] text-dash-muted">
                          Intervalo
                          <select
                            value={edicao.intervalo}
                            onChange={(e) => setEdicao((s) => ({ ...s, intervalo: e.target.value }))}
                            className={campoClasse}
                          >
                            <option value="mensal">mensal</option>
                            <option value="anual">anual</option>
                            <option value="unico">único</option>
                          </select>
                        </label>
                        <div className="flex items-center gap-3 pt-6 text-[12px] text-dash-muted">
                          <Chave
                            ligado={edicao.ativo}
                            onToggle={() => setEdicao((s) => ({ ...s, ativo: !s.ativo }))}
                          />
                          {edicao.ativo ? "plano ativo" : "plano inativo"}
                        </div>
                      </div>

                      {/* limites */}
                      <p className="mt-6 text-[11px] uppercase tracking-[0.18em] text-dash-dim">
                        Limites
                      </p>
                      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {LIMITES.map((l) => (
                          <label
                            key={l.chave}
                            className="flex flex-col gap-1.5 text-[12px] text-dash-muted"
                          >
                            {l.rotulo}
                            <input
                              value={edicao.limites[l.chave] ?? ""}
                              onChange={(e) =>
                                setEdicao((s) => ({
                                  ...s,
                                  limites: {
                                    ...s.limites,
                                    [l.chave]: e.target.value === "" ? 0 : Number(e.target.value),
                                  },
                                }))
                              }
                              inputMode="numeric"
                              placeholder="—"
                              className={campoClasse}
                            />
                            {l.nota && <span className="text-[10.5px] text-dash-dim">{l.nota}</span>}
                          </label>
                        ))}
                      </div>

                      <button
                        onClick={salvarEdicao}
                        disabled={salvando}
                        className="mt-5 rounded-[10px] bg-dash-brand px-5 py-2.5 text-[12px] font-semibold text-white transition hover:bg-dash-brandHi disabled:opacity-40"
                      >
                        {salvando ? "Salvando..." : "Salvar plano"}
                      </button>

                      {/* capacidades */}
                      <div className="mt-8 flex items-center gap-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-dash-dim">
                          Capacidades
                        </p>
                        {salvandoCaps && <span className="text-[11px] text-dash-muted">salvando...</span>}
                        <span className="ml-auto text-[11px] text-dash-muted">
                          {capsDoPlano.length} ligada(s)
                        </span>
                      </div>

                      {grupos.length === 0 ? (
                        <p className="mt-3 text-[12px] text-dash-dim">
                          O plano de controle não devolveu o catálogo de capacidades.
                        </p>
                      ) : (
                        grupos.map(([produto, areas]) => (
                          <div key={produto} className="mt-5">
                            <p className="text-[12.5px] font-semibold text-dash-fg">{produto}</p>
                            {Array.from(areas.entries()).map(([area, caps]) => (
                              <div key={area} className="mt-3">
                                <p className="text-[11px] uppercase tracking-[0.14em] text-dash-dim">
                                  {area}
                                </p>
                                <ul className="mt-2 flex flex-col gap-1.5">
                                  {caps.map((c) => (
                                    <li
                                      key={c.capability_id}
                                      className="flex items-center justify-between gap-3 rounded-[12px] bg-dash-bg px-3.5 py-2.5"
                                    >
                                      <div className="min-w-0">
                                        <p className="truncate text-[13px] text-dash-fg">
                                          {c.nome || c.capability_id}
                                        </p>
                                        <p className="truncate font-mono text-[11px] text-dash-dim">
                                          {c.capability_id}
                                        </p>
                                      </div>
                                      <Chave
                                        ligado={capsDoPlano.includes(c.capability_id)}
                                        desabilitado={salvandoCaps}
                                        onToggle={() => alternarCapacidade(c.capability_id)}
                                      />
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                          </div>
                        ))
                      )}
                    </>
                  )}
                </Card>
              </div>
            )}
          </Secao>

          {/* novo plano */}
          <Secao titulo="Novo plano">
            <Card>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-[12px] text-dash-muted">
                  Id do plano
                  <input
                    value={form.plan_id}
                    onChange={(e) => setForm((s) => ({ ...s, plan_id: e.target.value }))}
                    placeholder="ex.: mirai-os_pro"
                    className={campoClasse}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-[12px] text-dash-muted">
                  Produto
                  <input
                    value={form.product_id}
                    onChange={(e) => setForm((s) => ({ ...s, product_id: e.target.value }))}
                    placeholder="mirai-os"
                    className={campoClasse}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-[12px] text-dash-muted">
                  Nome
                  <input
                    value={form.nome}
                    onChange={(e) => setForm((s) => ({ ...s, nome: e.target.value }))}
                    placeholder="Ex.: MIRAI OS Pro"
                    className={campoClasse}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-[12px] text-dash-muted">
                  Preço (R$)
                  <input
                    value={form.preco}
                    onChange={(e) => setForm((s) => ({ ...s, preco: e.target.value }))}
                    inputMode="decimal"
                    placeholder="0.00"
                    className={campoClasse}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-[12px] text-dash-muted">
                  Intervalo
                  <select
                    value={form.intervalo}
                    onChange={(e) => setForm((s) => ({ ...s, intervalo: e.target.value }))}
                    className={campoClasse}
                  >
                    <option value="mensal">mensal</option>
                    <option value="anual">anual</option>
                    <option value="unico">único</option>
                  </select>
                </label>
                <div className="flex items-center gap-3 pt-6 text-[12px] text-dash-muted">
                  <Chave ligado={form.ativo} onToggle={() => setForm((s) => ({ ...s, ativo: !s.ativo }))} />
                  {form.ativo ? "nascer ativo" : "nascer inativo"}
                </div>
              </div>
              <button
                onClick={criarPlano}
                disabled={salvando}
                className="mt-4 rounded-[10px] bg-dash-brand px-5 py-2.5 text-[12px] font-semibold text-white transition hover:bg-dash-brandHi disabled:opacity-40"
              >
                {salvando ? "Criando..." : "Criar plano"}
              </button>
            </Card>
          </Secao>
        </>
      )}

      {/* ═══════════════ ABA QUEM TEM O QUÊ ═══════════════ */}
      {aba === "orgs" && !carregando && (
        <Secao titulo="Quem tem o quê" contagem={`${orgs.length} organização(ões)`}>
          {orgs.length === 0 ? (
            <Vazio
              titulo="Nenhuma organização no plano de controle"
              texto="Quando uma organização nascer, ela aparece aqui com o plano e os add-ons."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {orgs.map((org) => {
                const extras = org.capacidades_extras || [];
                const disponiveis = capacidades.filter((c) => !extras.includes(c.capability_id));
                return (
                  <article
                    key={org.tenant_id}
                    className="rounded-[24px] border border-dash-hair/[0.07] bg-dash-card p-5"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-[15px] font-semibold text-dash-fg">{org.nome || org.tenant_id}</p>
                      <span className="font-mono text-[11px] text-dash-dim">{org.tenant_id}</span>
                      <span className="ml-auto text-[11px] text-dash-muted">
                        desde {org.desde ? org.desde.slice(0, 10) : "—"}
                      </span>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <span className="text-[12px] text-dash-muted">Plano</span>
                      <select
                        value={org.plan_id || ""}
                        onChange={(e) => void mudarPlanoDaOrg(org, e.target.value)}
                        className="rounded-[10px] border border-dash-hair/10 bg-dash-bg px-3.5 py-2 text-[12px] text-dash-fg outline-none focus:border-dash-brand/60"
                      >
                        {!planos.some((p) => p.plan_id === org.plan_id) && org.plan_id && (
                          <option value={org.plan_id}>{org.plan_id}</option>
                        )}
                        {planos.map((p) => (
                          <option key={p.plan_id} value={p.plan_id}>
                            {p.nome || p.plan_id}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="mt-4">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-dash-dim">
                        Capacidades extras (add-ons)
                      </p>
                      {extras.length === 0 ? (
                        <p className="mt-1.5 text-[12px] text-dash-dim">
                          só o que vem do plano — nenhum add-on avulso.
                        </p>
                      ) : (
                        <ul className="mt-1.5 flex flex-wrap gap-2">
                          {extras.map((c) => (
                            <li
                              key={c}
                              className="flex items-center gap-2 rounded-full border border-dash-hair/12 px-3 py-1 text-[11px] text-dash-fg"
                            >
                              {c}
                              <button
                                onClick={() => void mudarCapacidadeDaOrg(org, c, false)}
                                className="text-dash-bad/80 transition hover:text-dash-bad"
                                title="Revogar add-on"
                              >
                                revogar
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <select
                        id={`add-${org.tenant_id}`}
                        defaultValue=""
                        className="min-w-[240px] flex-1 rounded-[10px] border border-dash-hair/10 bg-dash-bg px-3.5 py-2 text-[12px] text-dash-fg outline-none focus:border-dash-brand/60"
                      >
                        <option value="">+ conceder add-on…</option>
                        {disponiveis.map((c) => (
                          <option key={c.capability_id} value={c.capability_id}>
                            {c.nome || c.capability_id}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => {
                          const sel = document.getElementById(`add-${org.tenant_id}`) as HTMLSelectElement | null;
                          if (sel?.value) void mudarCapacidadeDaOrg(org, sel.value, true);
                        }}
                        className="rounded-[10px] border border-dash-hair/12 px-5 py-2.5 text-[12px] font-semibold text-dash-muted transition hover:text-dash-fg"
                      >
                        Conceder
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </Secao>
      )}

      {/* ═══════════════ ABA USUÁRIOS ═══════════════ */}
      {aba === "usuarios" && !carregando && (
        <Secao titulo="Usuários" contagem={`${usuariosFiltrados.length} de ${usuarios.length}`}>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <label className="flex flex-1 items-center gap-2 rounded-[10px] border border-dash-hair/10 bg-dash-bg px-4 py-2.5">
              <IconeBusca className="h-[16px] w-[16px] text-dash-dim" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome, e-mail ou organização"
                className="w-full bg-transparent text-[13px] text-dash-fg outline-none placeholder:text-dash-dim"
              />
            </label>
            <select
              value={filtroPlano}
              onChange={(e) => setFiltroPlano(e.target.value)}
              className="rounded-[10px] border border-dash-hair/10 bg-dash-bg px-4 py-2.5 text-[12px] text-dash-fg outline-none focus:border-dash-brand/60"
            >
              <option value="">Todos os planos</option>
              {planosParaFiltro.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {usuarios.length === 0 ? (
            <Vazio
              icone={<IconeUsuarios className="h-7 w-7" />}
              titulo="Nenhum usuário retornado"
              texto="O plano de controle ainda não expôs GET /v1/admin/usuarios, ou não há contas cadastradas."
            />
          ) : (
            <Tabela colunas={colunasUsuarios} linhas={linhasUsuarios} />
          )}

          <p className="mt-3 text-[11px] text-dash-dim">
            A coluna <span className="text-dash-muted">Pagamento</span> fica reservada: o status vem
            do AbacatePay depois e preenche esta mesma coluna, sem refazer o layout.
          </p>
        </Secao>
      )}
    </Shell>
  );
}
