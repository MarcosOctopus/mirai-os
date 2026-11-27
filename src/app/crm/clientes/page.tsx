"use client";

/**
 * /crm/clientes, desenho do dono (Claude), adaptado à nossa realidade (26/11/2026).
 *
 * Uma linha por PESSOA (o e-mail é a chave): quem tem conta em dois produtos aparece
 * uma vez só, e dentro dela ficam os vínculos. Fonte: /api/admin/clientes.
 *
 * 27/11/2026, três pedidos do dono nesta tela:
 *   (1) o PLANO de cada cliente é um seletor que grava de verdade, pela rota
 *       /api/admin/planos (ação definir_plano_da_org). A troca é otimista: a tela
 *       mostra na hora e volta atrás se o plano de controle recusar.
 *   (2) DUAS barras finas por cliente, empilhadas: tokens do mês (laranja neon) e
 *       espaço usado (verde água neon). Plano sem teto e conta sem leitura não
 *       viram barra cheia: viram barra neutra com o motivo escrito.
 *   (3) clicar no cliente abre o card com todos os dados dele.
 *
 * País e gateway ainda não existem nesta fonte (vivem nos eventos de cobrança); onde
 * não há dado, aparece o traço em vez de invenção. O país real está no Financeiro.
 */

import { useEffect, useMemo, useState } from "react";

import Shell from "@/components/dash/Shell";
import {
  BOTAO_CONTORNO,
  BOTAO_MARCA,
  CAMPO,
  MONO,
  Numero,
  Painel,
  Pilula,
  Rotulo,
  Segmentado,
  SegmentadoItem,
} from "@/components/crm/ui";

type OrganizacaoDoCliente = {
  tenant_id: string;
  organizacao: string;
  produto: string;
  plano: string;
  papel: string | null;
  extras: string[];
  convite_email: string | null;
  desde: string | null;
  limites?: Record<string, number>;
};

type Pessoa = {
  email: string;
  nome: string;
  entra_por: string;
  conta_id: number | null;
  tenant_local: string | null;
  vinculado: boolean;
  desde: string | null;
  organizacoes: OrganizacaoDoCliente[];
};

type LeituraDeTokens =
  | { leitura: "ok"; usado: number; teto: number | null }
  | { leitura: "sem_leitura"; motivo: string };

type Consumo = {
  tokens: Record<string, LeituraDeTokens>;
  espaco: Record<string, { bytes: number; arquivos: number }>;
};

type Resposta = {
  ok?: boolean;
  contas?: number;
  organizacoes?: number;
  aviso?: string | null;
  pessoas: Pessoa[];
  consumo?: Consumo;
};

type PlanoDoCatalogo = { plan_id: string; product_id: string; nome: string };

type Recado = { tipo: "ok" | "erro"; texto: string } | null;

const LARANJA = "#FF6A1A";
const VERDE_AGUA = "#3BF0C0";

const NOME_PLANO: Record<string, string> = {
  mirai_free: "Free",
  mirai_basico: "Básico",
  mirai_intermediario: "Intermediário",
  mirai_profissional: "Profissional",
  mirai_avancado: "Avançado",
};

const PAPEIS = ["dono", "admin", "membro"];

function iniciais(nome: string, email: string) {
  const base = (nome || email || "?").trim();
  const partes = base.split(/[\s@._-]+/).filter(Boolean);
  if (partes.length >= 2) return (partes[0][0] + partes[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

/** Bytes em unidade legível, com vírgula decimal. */
function tamanhoLegivel(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${Math.round(bytes / 1024)} KB`;
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0).replace(".", ",")} MB`;
  return `${(mb / 1024).toFixed(2).replace(".", ",")} GB`;
}

/** Tokens em milhares ou milhões, que é como o plano fala. */
function tokensLegivel(tokens: number) {
  if (!Number.isFinite(tokens) || tokens <= 0) return "0";
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(tokens >= 10_000_000 ? 0 : 2).replace(".", ",")}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(tokens >= 10_000 ? 0 : 1).replace(".", ",")}k`;
  return String(Math.round(tokens));
}

/**
 * Barra fina de consumo. `fracao` nula significa leitura ausente ou plano sem
 * teto: a barra fica neutra e tracejada, nunca cheia.
 */
function BarraDeConsumo({
  rotulo,
  detalhe,
  fracao,
  cor,
}: {
  rotulo: string;
  detalhe: string;
  fracao: number | null;
  cor: string;
}) {
  const neutra = fracao === null;
  const largura = neutra ? 0 : Math.min(100, Math.max(0, fracao * 100));
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.12em", color: "#646464" }} className="uppercase">
          {rotulo}
        </span>
        <span className="truncate text-[11px]" style={{ color: neutra ? "#646464" : "#A7A7A7" }}>
          {detalhe}
        </span>
      </div>
      <div
        className="h-[3px] w-full overflow-hidden rounded-full"
        style={{ background: neutra ? "transparent" : "#1c1c1c", border: neutra ? "1px dashed #3a3a3a" : "none" }}
      >
        {neutra ? null : (
          <span
            className="block h-full rounded-full"
            style={{
              width: `${largura}%`,
              background: cor,
              boxShadow: `0 0 9px ${cor}88`,
              transition: "width 240ms ease",
            }}
          />
        )}
      </div>
    </div>
  );
}

export default function ClientesPage() {
  const [conta, setConta] = useState<{ nome?: string; email?: string } | null>(null);
  const [dados, setDados] = useState<Resposta | null>(null);
  const [planos, setPlanos] = useState<PlanoDoCatalogo[]>([]);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [produto, setProduto] = useState<"todos" | string>("todos");
  const [plano, setPlano] = useState("todos");

  const [gaveta, setGaveta] = useState(false);
  const [novoEmail, setNovoEmail] = useState("");
  const [novoNome, setNovoNome] = useState("");
  const [novoProduto, setNovoProduto] = useState("mirai");
  const [novoPlano, setNovoPlano] = useState("");
  const [novoPapel, setNovoPapel] = useState("dono");
  const [salvando, setSalvando] = useState(false);
  const [recado, setRecado] = useState<Recado>(null);

  /** e-mails com troca de plano em curso (o seletor fica travado) */
  const [trocando, setTrocando] = useState<string[]>([]);
  /** pessoa aberta no card */
  const [card, setCard] = useState<string | null>(null);

  async function carregar() {
    try {
      const r = await fetch("/api/admin/clientes?consumo=1", { cache: "no-store" });
      if (!r.ok) throw new Error(`a rota respondeu ${r.status}`);
      setDados((await r.json()) as Resposta);
      setErro("");
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setConta(d?.conta || d?.usuario || d || null))
      .catch(() => setConta(null));

    void carregar();

    fetch("/api/admin/planos?acao=planos", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setPlanos(((d?.planos || []) as PlanoDoCatalogo[]).filter((p) => p?.plan_id)))
      .catch(() => setPlanos([]));
  }, []);

  const pessoas = useMemo(() => dados?.pessoas || [], [dados]);
  const consumo = dados?.consumo;
  const semOrganizacao = useMemo(() => pessoas.filter((p) => !p.organizacoes.length).length, [pessoas]);
  const vinculos = useMemo(() => pessoas.reduce((s, p) => s + p.organizacoes.length, 0), [pessoas]);

  const nomeDoPlano = (planId: string) => {
    const achado = planos.find((p) => p.plan_id === planId);
    return achado?.nome || NOME_PLANO[planId] || planId || "sem plano";
  };

  const produtos = useMemo(() => {
    const mapa: Record<string, number> = {};
    for (const p of pessoas) for (const o of p.organizacoes) mapa[o.produto] = (mapa[o.produto] || 0) + 1;
    return mapa;
  }, [pessoas]);

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return pessoas.filter((p) => {
      if (t && !`${p.nome} ${p.email}`.toLowerCase().includes(t)) return false;
      if (produto !== "todos" && !p.organizacoes.some((o) => o.produto === produto)) return false;
      if (plano !== "todos") {
        const nomes = p.organizacoes.map((o) => NOME_PLANO[o.plano] || o.plano);
        if (plano === "sem" ? p.organizacoes.length > 0 : !nomes.includes(plano)) return false;
      }
      return true;
    });
  }, [pessoas, busca, produto, plano]);

  const pessoaDoCard = useMemo(() => pessoas.find((p) => p.email === card) || null, [pessoas, card]);

  async function adicionar() {
    if (!novoEmail.includes("@")) {
      setRecado({ tipo: "erro", texto: "Informe um e-mail válido." });
      return;
    }
    setSalvando(true);
    setRecado(null);
    try {
      const r = await fetch("/api/admin/clientes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          acao: "criar_cliente",
          email: novoEmail,
          nome: novoNome,
          produto: novoProduto,
          plano: novoPlano || undefined,
          papel: novoPapel,
        }),
      });
      const corpo = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(corpo?.error || `a rota respondeu ${r.status}`);
      setRecado({ tipo: "ok", texto: "Cliente entrou. O convite sai no próximo acesso dele." });
      setNovoEmail("");
      setNovoNome("");
      setNovoPlano("");
      await carregar();
    } catch (e) {
      setRecado({ tipo: "erro", texto: (e as Error).message });
    } finally {
      setSalvando(false);
    }
  }

  /**
   * Troca o plano de UMA organização do cliente e grava no plano de controle.
   * Otimista: a tela assume o novo plano na hora, e volta ao anterior se a rota
   * recusar (403 sem o e-mail autorizado, 422 plano de outro produto, 5xx).
   */
  async function trocarPlano(pessoa: Pessoa, org: OrganizacaoDoCliente, novo: string) {
    const anterior = org.plano;
    if (!novo || novo === anterior) return;

    setTrocando((t) => [...t, pessoa.email]);
    setRecado(null);
    setDados((atual) => {
      if (!atual) return atual;
      return {
        ...atual,
        pessoas: atual.pessoas.map((p) =>
          p.email !== pessoa.email
            ? p
            : {
                ...p,
                organizacoes: p.organizacoes.map((o) => (o.tenant_id === org.tenant_id ? { ...o, plano: novo } : o)),
              },
        ),
      };
    });

    try {
      const r = await fetch("/api/admin/planos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          acao: "definir_plano_da_org",
          tenant_id: org.tenant_id,
          plan_id: novo,
          plano_anterior: anterior,
        }),
      });
      const corpo = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(corpo?.error || corpo?.detail || `a rota respondeu ${r.status}`);
      setRecado({
        tipo: "ok",
        texto: `${pessoa.nome || pessoa.email} passou de ${nomeDoPlano(anterior)} para ${nomeDoPlano(novo)}.`,
      });
      await carregar();
    } catch (e) {
      setDados((atual) => {
        if (!atual) return atual;
        return {
          ...atual,
          pessoas: atual.pessoas.map((p) =>
            p.email !== pessoa.email
              ? p
              : {
                  ...p,
                  organizacoes: p.organizacoes.map((o) =>
                    o.tenant_id === org.tenant_id ? { ...o, plano: anterior } : o,
                  ),
                },
          ),
        };
      });
      setRecado({ tipo: "erro", texto: `O plano não mudou: ${(e as Error).message}` });
    } finally {
      setTrocando((t) => t.filter((e) => e !== pessoa.email));
    }
  }

  const kpis = [
    { rotulo: "Pessoas", valor: String(pessoas.length), nota: "uma linha por e-mail" },
    { rotulo: "Vínculos a produtos", valor: String(vinculos), nota: "onde cada pessoa está" },
    { rotulo: "Sem organização", valor: String(semOrganizacao), nota: "conta sem espaço ainda" },
  ];

  const grade = "minmax(190px,1.6fr) 116px 150px minmax(150px,1.35fr) minmax(120px,1fr) 34px";

  /** Opções do seletor: só planos do MESMO produto da organização. */
  function planosDoProduto(prod: string, atual: string) {
    const lista = planos.filter((p) => p.product_id === prod);
    if (atual && !lista.some((p) => p.plan_id === atual)) {
      return [{ plan_id: atual, product_id: prod, nome: nomeDoPlano(atual) }, ...lista];
    }
    return lista;
  }

  /** Tokens e espaço desta pessoa, já no formato das duas barras. */
  function barrasDe(p: Pessoa) {
    const principal = p.organizacoes[0] || null;
    const leitura = principal ? consumo?.tokens?.[principal.tenant_id] : undefined;

    let barraTokens: { detalhe: string; fracao: number | null };
    if (!principal) {
      barraTokens = { detalhe: "sem organização", fracao: null };
    } else if (!leitura) {
      barraTokens = { detalhe: "sem leitura", fracao: null };
    } else if (leitura.leitura === "sem_leitura") {
      barraTokens = { detalhe: leitura.motivo, fracao: null };
    } else if (leitura.teto === null) {
      barraTokens = { detalhe: `${tokensLegivel(leitura.usado)}, sem teto`, fracao: null };
    } else {
      barraTokens = {
        detalhe: `${tokensLegivel(leitura.usado)} de ${tokensLegivel(leitura.teto)}`,
        fracao: leitura.usado / leitura.teto,
      };
    }

    const tetoGb = Number(principal?.limites?.storage_gb);
    const espaco = p.conta_id !== null ? consumo?.espaco?.[String(p.conta_id)] : undefined;
    let barraEspaco: { detalhe: string; fracao: number | null };
    if (!principal) {
      barraEspaco = { detalhe: "sem organização", fracao: null };
    } else if (p.conta_id === null) {
      barraEspaco = { detalhe: "sem conta local", fracao: null };
    } else if (!Number.isFinite(tetoGb) || tetoGb <= 0) {
      barraEspaco = { detalhe: "plano sem teto de espaço", fracao: null };
    } else if (!espaco) {
      barraEspaco = { detalhe: "sem leitura", fracao: null };
    } else {
      barraEspaco = {
        detalhe: `${tamanhoLegivel(espaco.bytes)} de ${tetoGb} GB`,
        fracao: espaco.bytes / (tetoGb * 1024 * 1024 * 1024),
      };
    }

    return { barraTokens, barraEspaco };
  }

  return (
    <Shell titulo="Clientes" usuario={{ nome: conta?.nome, email: conta?.email, ehDono: true }}>
      <div className="mx-auto flex w-full max-w-[960px] flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="m-0 max-w-[620px] text-[14px] leading-[1.6] text-[#A7A7A7]">
            Uma linha por pessoa. Quem tem conta em dois produtos aparece uma vez só, porque é a mesma conta.
          </p>
          <button type="button" onClick={() => { setGaveta(true); setRecado(null); }} className={BOTAO_MARCA}>
            <span aria-hidden>+</span> Adicionar cliente
          </button>
        </div>

        {erro ? (
          <div className="rounded-[14px] border border-[#E85002] bg-[#111] px-4 py-3 text-[14px] text-[#F9F9F9]">{erro}</div>
        ) : null}
        {dados?.aviso ? (
          <div className="rounded-[14px] border border-[#E85002] bg-[#111] px-4 py-3 text-[14px] text-[#F9F9F9]">{dados.aviso}</div>
        ) : null}
        {recado ? (
          <div
            className="rounded-[14px] border px-4 py-3 text-[14px] text-[#F9F9F9]"
            style={{ borderColor: recado.tipo === "ok" ? VERDE_AGUA : "#E85002", background: "#111" }}
          >
            {recado.texto}
          </div>
        ) : null}

        <div className="grid gap-0 overflow-hidden rounded-[24px] border border-[#333] sm:grid-cols-3" style={{ background: "#111" }}>
          {kpis.map((k, i) => (
            <div key={k.rotulo} className="flex flex-col gap-2.5 px-7 py-6" style={{ borderLeft: i === 0 ? "none" : "1px solid #333" }}>
              <Rotulo>{k.rotulo}</Rotulo>
              <Numero>{k.valor}</Numero>
              <span className="text-[13px] text-[#A7A7A7]">{k.nota}</span>
            </div>
          ))}
        </div>

        <Painel className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <Segmentado>
              <SegmentadoItem ativo={produto === "todos"} onClick={() => setProduto("todos")} contagem={vinculos}>
                Todos
              </SegmentadoItem>
              {Object.entries(produtos).map(([nome, quantos]) => (
                <SegmentadoItem key={nome} ativo={produto === nome} onClick={() => setProduto(nome)} contagem={quantos}>
                  {nome === "mirai" ? "MIRAI OS" : nome.toUpperCase()}
                </SegmentadoItem>
              ))}
            </Segmentado>

            <div className="flex flex-wrap items-center gap-2">
              <label className="flex h-11 w-[240px] max-w-full items-center gap-2.5 rounded-[14px] border border-[#333] bg-black px-3.5">
                <span aria-hidden className="text-[13px] text-[#646464]">⌕</span>
                <input
                  className="w-full border-0 bg-transparent text-[14px] text-[#F9F9F9] outline-none placeholder:text-[#646464]"
                  placeholder="Buscar pessoa ou e-mail"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </label>
              <select className={`${CAMPO} !h-11 w-[160px]`} value={plano} onChange={(e) => setPlano(e.target.value)}>
                <option value="todos">Todos os planos</option>
                {Object.values(NOME_PLANO).map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
                <option value="sem">Sem plano</option>
              </select>
            </div>
          </div>

          <div
            className="grid gap-4 px-5 py-3"
            style={{ gridTemplateColumns: grade, fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", color: "#A7A7A7", borderTop: "1px solid #1c1c1c" }}
          >
            <span>Pessoa</span>
            <span>Origem</span>
            <span>Plano</span>
            <span>Consumo</span>
            <span>Organização</span>
            <span />
          </div>

          {carregando ? (
            <p className="px-5 py-12 text-center text-[14px] text-[#A7A7A7]">Lendo as contas…</p>
          ) : filtradas.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-5 py-14 text-center">
              <span className="text-[16px] font-medium text-[#F9F9F9]">Ninguém por aqui</span>
              <span className="max-w-[380px] text-[14px] text-[#A7A7A7]">
                Vínculos aparecem quando a pessoa entra no produto ou quando o plano de controle responde.
              </span>
            </div>
          ) : (
            <ul className="m-0 list-none p-0">
              {filtradas.map((p) => {
                const principal = p.organizacoes[0];
                const { barraTokens, barraEspaco } = barrasDe(p);
                const emTroca = trocando.includes(p.email);
                return (
                  <li
                    key={p.email}
                    onClick={() => setCard(p.email)}
                    className="grid cursor-pointer items-center gap-4 border-t border-[#1c1c1c] px-5 py-4 transition hover:bg-white/[0.02]"
                    style={{ gridTemplateColumns: grade }}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border border-[#333] text-[12px] font-medium" style={{ background: "#0b0b0b", color: "#E85002" }}>
                        {iniciais(p.nome, p.email)}
                      </span>
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate text-[14px] font-medium text-[#F9F9F9]">{p.nome || p.email}</span>
                        <span className="truncate text-[12px] text-[#A7A7A7]">{p.email}</span>
                        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.12em", color: "#646464" }}>
                          ENTRA POR {(p.entra_por || "sem conta local").toUpperCase()}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="grid h-7 w-7 place-items-center rounded-[6px] border border-[#333] text-[11px] text-[#F9F9F9]" style={{ fontFamily: MONO }} title="O país nasce do pagamento e aparece no Financeiro">
                        -
                      </span>
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-[13px] text-[#F9F9F9]">{p.vinculado ? "Vinculado" : "Sem vínculo"}</span>
                        <span className="truncate text-[11px] text-[#A7A7A7]">{p.desde ? `desde ${p.desde}` : "sem data"}</span>
                      </div>
                    </div>

                    <div className="min-w-0" onClick={(e) => e.stopPropagation()}>
                      {principal ? (
                        <select
                          className={`${CAMPO} !h-9 !rounded-[10px] !px-2.5 !text-[13px] ${emTroca ? "opacity-40" : ""}`}
                          value={principal.plano}
                          disabled={emTroca}
                          aria-label={`Plano de ${p.nome || p.email}`}
                          onChange={(e) => void trocarPlano(p, principal, e.target.value)}
                        >
                          {planosDoProduto(principal.produto, principal.plano).map((op) => (
                            <option key={op.plan_id} value={op.plan_id}>{op.nome}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-[13px] text-[#646464]">Sem plano</span>
                      )}
                    </div>

                    <div className="flex min-w-0 flex-col gap-2">
                      <BarraDeConsumo rotulo="Tokens do mês" detalhe={barraTokens.detalhe} fracao={barraTokens.fracao} cor={LARANJA} />
                      <BarraDeConsumo rotulo="Espaço" detalhe={barraEspaco.detalhe} fracao={barraEspaco.fracao} cor={VERDE_AGUA} />
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {p.organizacoes.length === 0 ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setNovoEmail(p.email);
                            setNovoNome(p.nome || "");
                            setGaveta(true);
                            setRecado(null);
                          }}
                          className="rounded-[10px] border border-dashed border-[#646464] px-3 py-1.5 text-[13px] text-[#F9F9F9]"
                        >
                          Vincular
                        </button>
                      ) : (
                        p.organizacoes.slice(0, 1).map((o) => (
                          <span key={o.tenant_id} className="max-w-[130px] truncate rounded-full border border-[#333] px-2.5 py-1 text-[11px] text-[#A7A7A7]">
                            {o.organizacao}
                          </span>
                        ))
                      )}
                      {p.organizacoes.length > 1 ? (
                        <span className="rounded-full border border-[#333] px-2.5 py-1 text-[11px] text-[#646464]">+{p.organizacoes.length - 1}</span>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCard(p.email);
                      }}
                      className="grid h-9 w-9 place-items-center rounded-[10px] text-[#A7A7A7] hover:text-[#F9F9F9]"
                      aria-label={`Abrir ${p.email}`}
                    >
                      ⋯
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="border-t border-[#1c1c1c] px-5 py-3.5">
            <Rotulo>
              {filtradas.length} PESSOA{filtradas.length === 1 ? "" : "S"} · {vinculos} VÍNCULO{vinculos === 1 ? "" : "S"} · {semOrganizacao} SEM ORGANIZAÇÃO
            </Rotulo>
          </div>
        </Painel>
      </div>

      {/* ── card do cliente: todos os dados dele, num lugar só ─────────── */}
      {pessoaDoCard ? (
        <div className="fixed inset-0 z-[90] grid place-items-center p-4" role="dialog" aria-modal="true">
          <button type="button" aria-label="Fechar" onClick={() => setCard(null)} className="absolute inset-0 bg-black/70" />
          <div
            className="relative flex max-h-[88vh] w-full max-w-[560px] flex-col gap-5 overflow-y-auto rounded-[24px] border border-[#333] p-6"
            style={{ background: "#111" }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <span className="grid h-11 w-11 place-items-center rounded-[12px] border border-[#333] text-[14px] font-medium" style={{ background: "#0b0b0b", color: "#E85002" }}>
                  {iniciais(pessoaDoCard.nome, pessoaDoCard.email)}
                </span>
                <div className="flex flex-col gap-0.5">
                  <h2 className="m-0 text-[18px] font-semibold text-[#F9F9F9]">{pessoaDoCard.nome || pessoaDoCard.email}</h2>
                  <span className="text-[13px] text-[#A7A7A7]">{pessoaDoCard.email}</span>
                </div>
              </div>
              <button type="button" onClick={() => setCard(null)} className="grid h-9 w-9 place-items-center rounded-[10px] border border-[#333] text-[#A7A7A7]">
                ✕
              </button>
            </div>

            {(() => {
              const p = pessoaDoCard;
              const principal = p.organizacoes[0];
              const leitura = principal ? consumo?.tokens?.[principal.tenant_id] : undefined;
              const espaco = p.conta_id !== null ? consumo?.espaco?.[String(p.conta_id)] : undefined;
              const tetoGb = Number(principal?.limites?.storage_gb);
              const { barraTokens, barraEspaco } = barrasDe(p);
              return (
                <>
                  <section className="grid gap-4 rounded-[16px] border border-[#1c1c1c] p-4">
                    <div className="flex flex-col gap-2">
                      <Rotulo>Tokens do mês corrente</Rotulo>
                      <BarraDeConsumo rotulo="Consumo" detalhe={barraTokens.detalhe} fracao={barraTokens.fracao} cor={LARANJA} />
                      <span className="text-[12px] text-[#A7A7A7]">
                        {leitura && leitura.leitura === "ok"
                          ? `Teto do plano: ${leitura.teto === null ? "sem teto declarado" : `${tokensLegivel(leitura.teto)} de tokens`}.`
                          : "O medidor central não devolveu leitura para esta conta."}
                      </span>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Rotulo>Espaço usado</Rotulo>
                      <BarraDeConsumo rotulo="Arquivos" detalhe={barraEspaco.detalhe} fracao={barraEspaco.fracao} cor={VERDE_AGUA} />
                      <span className="text-[12px] text-[#A7A7A7]">
                        {Number.isFinite(tetoGb) && tetoGb > 0 ? `Teto do plano: ${tetoGb} GB.` : "Plano sem teto de espaço declarado."}{" "}
                        {espaco ? `${espaco.arquivos} arquivo${espaco.arquivos === 1 ? "" : "s"} enviado${espaco.arquivos === 1 ? "" : "s"}, ${tamanhoLegivel(espaco.bytes)}.` : "Sem leitura de arquivos."}
                      </span>
                    </div>
                  </section>

                  <section className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                      <Rotulo>Entra por</Rotulo>
                      <span className="text-[14px] text-[#F9F9F9]">{p.entra_por || "sem conta local"}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Rotulo>Conta local</Rotulo>
                      <span className="text-[14px] text-[#F9F9F9]">{p.conta_id !== null ? `#${p.conta_id}` : "não existe"}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Rotulo>Espaço local</Rotulo>
                      <span className="truncate text-[14px] text-[#F9F9F9]">{p.tenant_local || "sem espaço local"}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Rotulo>Entrou em</Rotulo>
                      <span className="text-[14px] text-[#F9F9F9]">{p.desde || "sem data"}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Rotulo>Vínculo com o plano</Rotulo>
                      <span className="text-[14px] text-[#F9F9F9]">{p.vinculado ? "vinculado" : "sem vínculo"}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Rotulo>Arquivos</Rotulo>
                      <span className="text-[14px] text-[#F9F9F9]">{espaco ? String(espaco.arquivos) : "sem leitura"}</span>
                    </div>
                  </section>

                  <section className="flex flex-col gap-3">
                    <Rotulo>Organizações e planos</Rotulo>
                    {p.organizacoes.length === 0 ? (
                      <span className="text-[13px] text-[#A7A7A7]">Nenhum vínculo com produto ainda.</span>
                    ) : (
                      <ul className="m-0 flex list-none flex-col gap-2 p-0">
                        {p.organizacoes.map((o) => {
                          const emTroca = trocando.includes(p.email);
                          return (
                            <li key={o.tenant_id} className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-[#1c1c1c] px-3.5 py-3">
                              <div className="flex min-w-0 flex-col gap-0.5">
                                <span className="truncate text-[14px] text-[#F9F9F9]">{o.organizacao}</span>
                                <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.12em", color: "#646464" }}>
                                  {String(o.produto).toUpperCase()} · {o.papel || "membro"} · {o.desde || "sem data"}
                                </span>
                                <span className="text-[11px] text-[#A7A7A7]">
                                  Teto: {Number(o.limites?.storage_gb) > 0 ? `${o.limites?.storage_gb} GB` : "sem espaço declarado"},{" "}
                                  {Number(o.limites?.tokens_mes) > 0 ? `${o.limites?.tokens_mes}M de tokens` : "sem tokens declarados"}
                                </span>
                              </div>
                              <select
                                className={`${CAMPO} !h-9 w-[150px] !rounded-[10px] !px-2.5 !text-[13px] ${emTroca ? "opacity-40" : ""}`}
                                value={o.plano}
                                disabled={emTroca}
                                aria-label={`Plano de ${o.organizacao}`}
                                onChange={(e) => void trocarPlano(p, o, e.target.value)}
                              >
                                {planosDoProduto(o.produto, o.plano).map((op) => (
                                  <option key={op.plan_id} value={op.plan_id}>{op.nome}</option>
                                ))}
                              </select>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>

                  {p.organizacoes.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {p.organizacoes.flatMap((o) =>
                        (o.extras || []).map((x) => (
                          <Pilula key={`${o.tenant_id}-${x}`} cor="#F9F9F9">{x}</Pilula>
                        )),
                      )}
                    </div>
                  ) : null}
                </>
              );
            })()}

            <button type="button" onClick={() => setCard(null)} className={`${BOTAO_CONTORNO} justify-center`}>
              Fechar
            </button>
          </div>
        </div>
      ) : null}

      {/* gaveta de adicionar cliente, tudo aqui, sem mandar para a tela antiga */}
      {gaveta ? (
        <div className="fixed inset-0 z-[80] flex justify-end" role="dialog" aria-modal="true">
          <button type="button" aria-label="Fechar" onClick={() => setGaveta(false)} className="absolute inset-0 bg-black/60" />
          <aside className="relative flex h-full w-full max-w-[440px] flex-col gap-4 overflow-y-auto border-l border-[#333] p-6" style={{ background: "#111" }}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <h2 className="m-0 text-[18px] font-semibold text-[#F9F9F9]">Adicionar cliente</h2>
                <span className="text-[13px] text-[#A7A7A7]">Ele nasce com organização, plano e convite.</span>
              </div>
              <button type="button" onClick={() => setGaveta(false)} className="grid h-9 w-9 place-items-center rounded-[10px] border border-[#333] text-[#A7A7A7]">
                ✕
              </button>
            </div>

            {recado ? (
              <div
                className="rounded-[14px] border px-3.5 py-2.5 text-[13px] text-[#F9F9F9]"
                style={{ borderColor: recado.tipo === "ok" ? VERDE_AGUA : "#E85002" }}
              >
                {recado.texto}
              </div>
            ) : null}

            <label className="flex flex-col gap-2">
              <Rotulo>E-mail</Rotulo>
              <input className={CAMPO} placeholder="pessoa@empresa.com" value={novoEmail} onChange={(e) => setNovoEmail(e.target.value)} />
            </label>

            <label className="flex flex-col gap-2">
              <Rotulo>Nome</Rotulo>
              <input className={CAMPO} placeholder="Como ela se chama" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-2">
                <Rotulo>Produto</Rotulo>
                <select className={CAMPO} value={novoProduto} onChange={(e) => setNovoProduto(e.target.value)}>
                  {[...new Set(["mirai", ...planos.map((p) => p.product_id)])].map((pf) => (
                    <option key={pf} value={pf}>{pf}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2">
                <Rotulo>Papel</Rotulo>
                <select className={CAMPO} value={novoPapel} onChange={(e) => setNovoPapel(e.target.value)}>
                  {PAPEIS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="flex flex-col gap-2">
              <Rotulo>Plano</Rotulo>
              <select className={CAMPO} value={novoPlano} onChange={(e) => setNovoPlano(e.target.value)}>
                <option value="">Plano inicial do produto</option>
                {planos.filter((p) => p.product_id === novoProduto).map((p) => (
                  <option key={p.plan_id} value={p.plan_id}>{p.nome}</option>
                ))}
              </select>
            </label>

            <button type="button" onClick={() => void adicionar()} disabled={salvando} className={`${BOTAO_MARCA} h-12 justify-center disabled:opacity-50`}>
              {salvando ? "Adicionando" : "Adicionar cliente"}
            </button>

            <p className="m-0 text-[13px] leading-relaxed text-[#A7A7A7]">
              Quem entra por aqui ganha organização própria no plano escolhido e um convite pendente. Nada de
              mexer no banco à mão.
            </p>

            <button type="button" onClick={() => setGaveta(false)} className={BOTAO_CONTORNO}>
              Fechar
            </button>
          </aside>
        </div>
      ) : null}
    </Shell>
  );
}
