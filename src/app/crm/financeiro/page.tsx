"use client";

/**
 * /crm/financeiro — desenho do dono (Claude), agora completo (26/11/2026):
 * números grandes em negrito, tabelas com cabeçalho mono, cores ajudando a ler,
 * "Contas que se repetem" com projeção de 30 dias e o cadastro de conta a pagar
 * com vencimento, repetição e o "lançar sozinho".
 *
 * Entradas vêm dos gateways (Asaas BRL, Paddle USD) pelo serviço de cobrança.
 * Contas que se repetem são cadastro do dono e descrevem o FUTURO; movimento é o
 * que já aconteceu.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import Shell from "@/components/dash/Shell";
import {
  CAMPO,
  MONO,
  Numero,
  Painel,
  Pilula,
  Rotulo,
  Segmentado,
  SegmentadoItem,
  dinheiro,
} from "@/components/crm/ui";

type Entrada = {
  id: string;
  gateway: string;
  tipo: string;
  quando: string | null;
  tenant_id: string | null;
  email: string | null;
  pais: string | null;
  valor_centavos: number;
  moeda: string;
};

type Saida = {
  id: number;
  data: string;
  categoria: string;
  descricao: string;
  valor_centavos: number;
  moeda: string;
};

type Conta = {
  id: number;
  tipo: "entrada" | "saida";
  descricao: string;
  categoria: string;
  valor_centavos: number;
  moeda: string;
  vencimento: string;
  repeticao: string;
  automatico: number;
  ativo: number;
  proxima?: string;
};

type Projecao = {
  dias: number;
  a_receber_brl_centavos: number;
  a_pagar_brl_centavos: number;
  saldo_previsto_brl_centavos: number;
};

type Resposta = {
  entradas: Entrada[];
  saidas: Saida[];
  resumo: {
    cambio_usd_brl: number;
    entradas: { brl_centavos: number; usd_centavos: number };
    saidas: { brl_centavos: number; usd_centavos: number };
    resultado_brl_centavos: number;
    resultado_usd_centavos: number;
  };
  aviso?: string | null;
};

const CATEGORIAS = [
  "Infra e servidores",
  "Licenças",
  "APIs de IA",
  "Impostos e taxas",
  "Marketing",
  "Ferramentas e software",
  "Pró-labore e equipe",
  "Assinatura",
  "Gateway e câmbio",
  "Outros",
];

const REPETICOES: { valor: string; rotulo: string }[] = [
  { valor: "mensal", rotulo: "Todo mês, no mesmo dia" },
  { valor: "unica", rotulo: "Só uma vez" },
  { valor: "semanal", rotulo: "Toda semana" },
  { valor: "anual", rotulo: "Todo ano" },
];

const PAISES: Record<string, string> = {
  BR: "Brasil", US: "Estados Unidos", PT: "Portugal", CA: "Canadá", MX: "México",
  AR: "Argentina", CL: "Chile", CO: "Colômbia", ES: "Espanha", GB: "Reino Unido",
  DE: "Alemanha", FR: "França", IT: "Itália", NL: "Holanda", IE: "Irlanda",
  AU: "Austrália", JP: "Japão", IN: "Índia", AE: "Emirados Árabes",
};

function nomePais(c?: string | null) {
  if (!c) return "—";
  return PAISES[c.toUpperCase()] || c.toUpperCase();
}

function dia(iso?: string) {
  if (!iso) return "—";
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export default function FinanceiroPage() {
  const [conta, setConta] = useState<{ nome?: string; email?: string } | null>(null);
  const [dados, setDados] = useState<Resposta | null>(null);
  const [contas, setContas] = useState<Conta[]>([]);
  const [projecao, setProjecao] = useState<Projecao | null>(null);
  const [erro, setErro] = useState("");
  const [aba, setAba] = useState<"todas" | "entradas" | "saidas">("todas");
  const [salvando, setSalvando] = useState(false);

  const [tipo, setTipo] = useState<"entrada" | "saida">("saida");
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState(CATEGORIAS[0]);
  const [vencimento, setVencimento] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [repeticao, setRepeticao] = useState("mensal");
  const [automatico, setAutomatico] = useState(true);
  const [moeda, setMoeda] = useState("BRL");

  const carregar = useCallback(async () => {
    try {
      const [rf, rc] = await Promise.all([
        fetch("/api/financeiro", { cache: "no-store" }),
        fetch("/api/financeiro/contas", { cache: "no-store" }),
      ]);
      if (rf.ok) setDados((await rf.json()) as Resposta);
      if (rc.ok) {
        const d = (await rc.json()) as { contas: Conta[]; projecao: Projecao };
        setContas(d.contas || []);
        setProjecao(d.projecao || null);
      }
      setErro("");
    } catch (e) {
      setErro((e as Error).message);
    }
  }, []);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setConta(d?.conta || d?.usuario || d || null))
      .catch(() => setConta(null));
    void carregar();
  }, [carregar]);

  const resumo = dados?.resumo;
  const cambio = resumo?.cambio_usd_brl || 5;
  const entradas = useMemo(() => dados?.entradas || [], [dados]);
  const saidas = useMemo(() => dados?.saidas || [], [dados]);

  const contagemPorGateway = useMemo(() => {
    const mapa: Record<string, number> = {};
    for (const e of entradas) mapa[e.gateway] = (mapa[e.gateway] || 0) + 1;
    return mapa;
  }, [entradas]);

  const movimentacoes = useMemo(() => {
    const linhas = [
      ...entradas.map((e) => ({
        id: `e-${e.id}`,
        ordenar: e.quando || "",
        data: dia(e.quando?.slice(0, 10)),
        desc: e.email || e.tenant_id || "Cliente sem conta vinculada",
        sub: `${nomePais(e.pais)} · ${e.tipo}`,
        cat: "Assinatura",
        origem: e.gateway,
        valor: e.valor_centavos,
        moeda: e.moeda,
        extra: e.moeda === "USD" ? `≈ ${dinheiro(e.valor_centavos * cambio)}` : "",
        entrada: true,
        idSaida: 0,
      })),
      ...saidas.map((s) => ({
        id: `s-${s.id}`,
        ordenar: s.data,
        data: dia(s.data),
        desc: s.descricao || "Sem descrição",
        sub: s.data,
        cat: s.categoria,
        origem: "manual",
        valor: s.valor_centavos,
        moeda: s.moeda,
        extra: s.moeda === "USD" ? `≈ ${dinheiro(s.valor_centavos * cambio)}` : "",
        entrada: false,
        idSaida: s.id,
      })),
    ];
    return linhas
      .filter((l) => (aba === "todas" ? true : aba === "entradas" ? l.entrada : !l.entrada))
      .sort((a, b) => String(b.ordenar).localeCompare(String(a.ordenar)));
  }, [entradas, saidas, aba, cambio]);

  const totalFiltrado = useMemo(
    () =>
      movimentacoes.reduce(
        (soma, l) => soma + (l.moeda === "USD" ? l.valor * cambio : l.valor) * (l.entrada ? 1 : -1),
        0,
      ),
    [movimentacoes, cambio],
  );

  async function cadastrarConta() {
    const numero = Number(String(valor).replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(numero) || numero <= 0) {
      setErro("valor inválido");
      return;
    }
    if (!descricao.trim()) {
      setErro("dá um nome para a conta");
      return;
    }
    setSalvando(true);
    setErro("");
    try {
      const r = await fetch("/api/financeiro/contas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tipo,
          descricao,
          categoria,
          valor_centavos: Math.round(numero * 100),
          moeda,
          vencimento,
          repeticao,
          automatico,
        }),
      });
      const corpo = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(corpo?.error || `a rota respondeu ${r.status}`);
      setValor("");
      setDescricao("");
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function alternar(id: number, ativo: boolean) {
    await fetch("/api/financeiro/contas", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, ativo }),
    });
    await carregar();
  }

  async function apagarConta(id: number) {
    if (!window.confirm("Apagar esta conta?")) return;
    await fetch(`/api/financeiro/contas?id=${id}`, { method: "DELETE" });
    await carregar();
  }

  const kpis = [
    {
      rotulo: "Entradas em real",
      valor: dinheiro(resumo?.entradas.brl_centavos || 0),
      nota: `Asaas · ${contagemPorGateway.asaas || 0} cobranças`,
      cor: "#34D399",
      destaque: false,
    },
    {
      rotulo: "Entradas em dólar",
      valor: dinheiro(resumo?.entradas.usd_centavos || 0, "USD"),
      nota: `Paddle · ≈ ${dinheiro((resumo?.entradas.usd_centavos || 0) * cambio)}`,
      cor: "#60A5FA",
      destaque: false,
    },
    {
      rotulo: "Saídas",
      valor: dinheiro((resumo?.saidas.brl_centavos || 0) + (resumo?.saidas.usd_centavos || 0) * cambio),
      nota: `${saidas.length} lançamento${saidas.length === 1 ? "" : "s"}`,
      cor: "#F87171",
      destaque: false,
    },
    {
      rotulo: "Resultado",
      valor: dinheiro(resumo?.resultado_brl_centavos || 0),
      nota: "Consolidado em real",
      cor: "#E85002",
      destaque: true,
    },
  ];

  const gradeMov = "90px minmax(200px,2.2fr) 1.1fr 1fr 140px";

  return (
    <Shell titulo="Financeiro" usuario={{ nome: conta?.nome, email: conta?.email, ehDono: true }}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="m-0 max-w-[620px] text-[14px] leading-[1.6] text-[#A7A7A7]">
            Entradas confirmadas pelos gateways e saídas que você lança. Real e dólar separados, consolidado com o
            câmbio de {dinheiro(cambio * 100)} por dólar.
          </p>
          <div className="flex items-center gap-2">
              <a href="/crm/planos" className="inline-flex h-12 items-center rounded-[14px] border border-[#333] px-4 text-[14px] text-[#F9F9F9]">
                Planos
              </a>
              <a href="/crm/clientes" className="inline-flex h-12 items-center rounded-[14px] border border-[#333] px-4 text-[14px] text-[#F9F9F9]">
                Clientes
              </a>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex items-center gap-3.5 rounded-[14px] border border-[#333] px-4 py-3.5">
              <span className="h-2 w-2 rounded-full bg-[#E85002]" />
              <div className="flex flex-col gap-0.5">
                <span className="text-[14px] font-medium text-[#F9F9F9]">Asaas</span>
                <Rotulo>Conectado · {contagemPorGateway.asaas || 0} cobranças</Rotulo>
              </div>
            </div>
            <div className="flex items-center gap-3.5 rounded-[14px] border border-[#333] px-4 py-3.5">
              <span className="h-2 w-2 rounded-full bg-[#E85002]" />
              <div className="flex flex-col gap-0.5">
                <span className="text-[14px] font-medium text-[#F9F9F9]">Paddle</span>
                <Rotulo>Conectado · {contagemPorGateway.paddle || 0} pagamentos</Rotulo>
              </div>
            </div>
            <div className="flex items-center gap-3.5 rounded-[14px] border border-[#333] px-4 py-3.5">
              <div className="flex flex-col gap-0.5">
                <span className="text-[14px] font-medium text-[#F9F9F9]">Câmbio do consolidado</span>
                <Rotulo>US$ 1 = {dinheiro(cambio * 100)} · fixo</Rotulo>
              </div>
            </div>
          </div>

          {erro ? (
            <div className="rounded-[14px] border border-[#E85002] bg-[#111] px-4 py-3 text-[14px] text-[#F9F9F9]">{erro}</div>
          ) : null}
          {dados?.aviso ? (
            <div className="rounded-[14px] border border-[#E85002] bg-[#111] px-4 py-3 text-[14px] text-[#F9F9F9]">{dados.aviso}</div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {kpis.map((k) => (
              <Painel key={k.rotulo} className="flex flex-col gap-3 p-7" fundo={k.destaque ? "#111" : "#111"}>
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: k.cor }} />
                  <Rotulo cor={k.destaque ? "#F9F9F9" : "#A7A7A7"}>{k.rotulo}</Rotulo>
                </span>
                <Numero cor={k.cor} tamanho={36}>{k.valor}</Numero>
                <span className="text-[13px] text-[#A7A7A7]">{k.nota}</span>
              </Painel>
            ))}
          </div>

          <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
            <Painel className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <h2 className="m-0 text-[16px] font-semibold text-[#F9F9F9]">Movimentações</h2>
                <Segmentado>
                  <SegmentadoItem ativo={aba === "todas"} onClick={() => setAba("todas")} contagem={entradas.length + saidas.length}>
                    Todas
                  </SegmentadoItem>
                  <SegmentadoItem ativo={aba === "entradas"} onClick={() => setAba("entradas")} contagem={entradas.length}>
                    Entradas
                  </SegmentadoItem>
                  <SegmentadoItem ativo={aba === "saidas"} onClick={() => setAba("saidas")} contagem={saidas.length}>
                    Saídas
                  </SegmentadoItem>
                </Segmentado>
              </div>

              <div
                className="grid gap-4 px-5 py-3"
                style={{ gridTemplateColumns: gradeMov, fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", color: "#A7A7A7", borderTop: "1px solid #1c1c1c" }}
              >
                <span>Data</span>
                <span>Descrição</span>
                <span>Categoria</span>
                <span>Origem</span>
                <span className="text-right">Valor</span>
              </div>

              {movimentacoes.length === 0 ? (
                <p className="px-5 py-12 text-center text-[14px] text-[#A7A7A7]">Nada por aqui ainda.</p>
              ) : (
                <ul className="m-0 list-none p-0">
                  {movimentacoes.map((l) => (
                    <li key={l.id} className="grid items-center gap-4 border-t border-[#1c1c1c] px-5 py-3.5" style={{ gridTemplateColumns: gradeMov }}>
                      <span style={{ fontFamily: MONO, fontSize: 12, color: "#A7A7A7" }}>{l.data}</span>
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] border border-[#333] text-[13px]"
                          style={{ color: l.entrada ? "#34D399" : "#F87171", background: l.entrada ? "rgba(52,211,153,0.07)" : "rgba(248,113,113,0.07)" }}
                        >
                          {l.entrada ? "↑" : "↓"}
                        </span>
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate text-[14px] font-medium text-[#F9F9F9]">{l.desc}</span>
                          <span className="truncate text-[12px] text-[#A7A7A7]">{l.sub}</span>
                        </div>
                      </div>
                      <span className="truncate text-[13px] text-[#A7A7A7]">{l.cat}</span>
                      <span>
                        <Pilula>{l.origem}</Pilula>
                      </span>
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-[15px] font-semibold" style={{ color: l.entrada ? "#34D399" : "#F87171" }}>
                          {l.entrada ? "+" : "−"} {dinheiro(l.valor, l.moeda)}
                        </span>
                        {l.extra ? <span className="text-[11px] text-[#A7A7A7]">{l.extra}</span> : null}
                        {l.entrada ? null : (
                          <button
                            type="button"
                            onClick={async () => {
                              if (!window.confirm("Apagar este lançamento?")) return;
                              await fetch(`/api/financeiro?id=${l.idSaida}`, { method: "DELETE" });
                              await carregar();
                            }}
                            className="text-[11px] text-[#646464] hover:text-[#F87171]"
                          >
                            apagar
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex items-center justify-between gap-4 border-t border-[#1c1c1c] px-5 py-3.5">
                <Rotulo>
                  {aba === "todas" ? `${movimentacoes.length} MOVIMENTAÇÕES` : aba === "entradas" ? `${movimentacoes.length} ENTRADAS` : `${movimentacoes.length} SAÍDAS`}
                </Rotulo>
                <span className="text-[13px] font-semibold" style={{ color: totalFiltrado >= 0 ? "#34D399" : "#F87171" }}>
                  Saldo {dinheiro(totalFiltrado)}
                </span>
              </div>
            </Painel>

            <Painel className="flex w-full flex-col gap-4 p-6 lg:w-[380px] lg:shrink-0" fundo="#111">
              <h2 className="m-0 text-[16px] font-semibold text-[#F9F9F9]">Cadastrar conta</h2>

              <div className="grid grid-cols-2 gap-1 rounded-[14px] bg-black p-1">
                {(["saida", "entrada"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTipo(t)}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-[10px] text-[13px]"
                    style={{ background: tipo === t ? (t === "saida" ? "#F87171" : "#34D399") : "transparent", color: tipo === t ? "#000" : "#A7A7A7" }}
                  >
                    {t === "saida" ? "Saída" : "Entrada"}
                  </button>
                ))}
              </div>

              <label className="flex flex-col gap-2">
                <Rotulo>Valor</Rotulo>
                <div className="flex h-14 items-center rounded-[14px] border border-[#333] bg-black">
                  <span className="grid px-3.5 text-[14px] text-[#A7A7A7]">{moeda === "USD" ? "US$" : "R$"}</span>
                  <input
                    className="h-full w-full border-0 bg-transparent px-1 text-[17px] font-semibold text-[#F9F9F9] outline-none placeholder:text-[#646464]"
                    placeholder="0,00"
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                  />
                </div>
              </label>

              <div className="grid grid-cols-2 gap-1 rounded-[14px] bg-black p-1">
                {["BRL", "USD"].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMoeda(m)}
                    className="h-10 rounded-[10px] text-[13px]"
                    style={{ background: moeda === m ? "#F9F9F9" : "transparent", color: moeda === m ? "#000" : "#A7A7A7" }}
                  >
                    {m === "BRL" ? "Real" : "Dólar"}
                  </button>
                ))}
              </div>

              <label className="flex flex-col gap-2">
                <Rotulo>Descrição</Rotulo>
                <input className={CAMPO} placeholder="Servidor, licença, imposto" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-2">
                  <Rotulo>Categoria</Rotulo>
                  <select className={CAMPO} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                    {CATEGORIAS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-2">
                  <Rotulo>Vencimento</Rotulo>
                  <input type="date" className={CAMPO} value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
                </label>
              </div>

              <label className="flex flex-col gap-2">
                <Rotulo>Repetição</Rotulo>
                <select className={CAMPO} value={repeticao} onChange={(e) => setRepeticao(e.target.value)}>
                  {REPETICOES.map((r) => (
                    <option key={r.valor} value={r.valor}>{r.rotulo}</option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={() => setAutomatico((v) => !v)}
                className="flex items-center gap-3.5 rounded-[14px] bg-black px-3.5 py-3.5 text-left"
              >
                <span className="flex h-6 w-10 shrink-0 rounded-full p-[3px] transition" style={{ background: automatico ? "#E85002" : "#333" }}>
                  <span
                    className="h-[18px] w-[18px] rounded-full bg-[#F9F9F9] transition-transform"
                    style={{ transform: automatico ? "translateX(16px)" : "translateX(0)" }}
                  />
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-[14px] text-[#F9F9F9]">Lançar sozinho no vencimento</span>
                  <span className="text-[12px] text-[#A7A7A7]">{automatico ? "Entra no financeiro sem você tocar" : "A Mirai te avisa, você decide"}</span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => void cadastrarConta()}
                disabled={salvando}
                className="h-[52px] rounded-[14px] bg-[#E85002] text-[15px] font-semibold text-black disabled:opacity-50"
              >
                {salvando ? "Cadastrando" : tipo === "saida" ? "Cadastrar conta a pagar" : "Cadastrar conta a receber"}
              </button>

              <p className="m-0 text-[13px] leading-relaxed text-[#A7A7A7]">
                O que você cadastra aqui é o que ainda vai acontecer. O que já aconteceu está nas movimentações.
              </p>
            </Painel>
          </div>

          {/* contas que se repetem */}
          <Painel>
            <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
              <div className="flex flex-col gap-1">
                <h2 className="m-0 text-[16px] font-semibold text-[#F9F9F9]">Contas que se repetem</h2>
                <span className="text-[13px] text-[#A7A7A7]">O que estiver ligado entra no financeiro sozinho. Desligado, a Mirai te avisa.</span>
              </div>
              <div className="flex flex-wrap items-center gap-5">
                <span className="flex flex-col gap-0.5">
                  <Rotulo>Próximos {projecao?.dias || 30} dias</Rotulo>
                </span>
                <span className="flex flex-col gap-0.5">
                  <Rotulo>A receber</Rotulo>
                  <span className="text-[14px] font-semibold" style={{ color: "#34D399" }}>
                    ≈ {dinheiro(projecao?.a_receber_brl_centavos || 0)}
                  </span>
                </span>
                <span className="flex flex-col gap-0.5">
                  <Rotulo>A pagar</Rotulo>
                  <span className="text-[14px] font-semibold" style={{ color: "#F87171" }}>
                    ≈ {dinheiro(projecao?.a_pagar_brl_centavos || 0)}
                  </span>
                </span>
                <span className="flex flex-col gap-0.5">
                  <Rotulo>Saldo previsto</Rotulo>
                  <span className="text-[14px] font-semibold" style={{ color: "#E85002" }}>
                    ≈ {dinheiro(projecao?.saldo_previsto_brl_centavos || 0)}
                  </span>
                </span>
              </div>
            </div>

            <div
              className="grid gap-4 px-5 py-3"
              style={{ gridTemplateColumns: "minmax(220px,2fr) 110px 1fr 1.2fr 110px 1.5fr", fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", color: "#A7A7A7", borderTop: "1px solid #1c1c1c" }}
            >
              <span>Conta</span>
              <span>Tipo</span>
              <span>Valor</span>
              <span>Repete</span>
              <span>Próxima</span>
              <span>Lançamento</span>
            </div>

            {contas.length === 0 ? (
              <p className="px-5 py-10 text-center text-[14px] text-[#A7A7A7]">
                Nenhuma conta cadastrada. A primeira que você criar aparece aqui com a data do próximo vencimento.
              </p>
            ) : (
              <ul className="m-0 list-none p-0">
                {contas.map((c) => (
                  <li
                    key={c.id}
                    className="grid items-center gap-4 border-t border-[#1c1c1c] px-5 py-3.5"
                    style={{ gridTemplateColumns: "minmax(220px,2fr) 110px 1fr 1.2fr 110px 1.5fr", opacity: c.ativo ? 1 : 0.5 }}
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-[14px] font-medium text-[#F9F9F9]">{c.descricao}</span>
                      <span className="truncate text-[12px] text-[#A7A7A7]">{c.categoria}</span>
                    </div>
                    <span className="flex items-center gap-2" style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", color: "#A7A7A7" }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.tipo === "entrada" ? "#34D399" : "#F87171" }} />
                      {c.tipo === "entrada" ? "ENTRADA" : "SAÍDA"}
                    </span>
                    <span className="text-[14px] font-semibold" style={{ color: c.tipo === "entrada" ? "#34D399" : "#F87171" }}>
                      {dinheiro(c.valor_centavos, c.moeda)}
                    </span>
                    <span className="text-[13px] text-[#A7A7A7]">
                      {c.repeticao === "mensal" ? "todo mês" : c.repeticao === "semanal" ? "toda semana" : c.repeticao === "anual" ? "todo ano" : "só uma vez"}
                    </span>
                    <span className="text-[12px]" style={{ fontFamily: MONO, color: "#F9F9F9" }}>
                      {dia(c.proxima)}
                    </span>
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => void alternar(c.id, !c.ativo)}
                        className="flex items-center gap-2.5 text-[13px] text-[#A7A7A7]"
                        title={c.ativo ? "Desligar" : "Ligar"}
                      >
                        <span className="flex h-[22px] w-9 shrink-0 rounded-full p-[3px]" style={{ background: c.ativo ? "#E85002" : "#333" }}>
                          <span className="h-4 w-4 rounded-full bg-[#F9F9F9]" style={{ transform: c.ativo ? "translateX(14px)" : "translateX(0)" }} />
                        </span>
                        {c.ativo ? (c.automatico ? "Automático" : "Só avisa") : "Desligada"}
                      </button>
                      <button type="button" onClick={() => void apagarConta(c.id)} className="text-[11px] text-[#646464] hover:text-[#F87171]">
                        apagar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Painel>

          <p className="m-0 text-center" style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", color: "#A7A7A7" }}>
            CÂMBIO DECLARADO NA TELA · NADA É CONVERTIDO EM SILÊNCIO
          </p>
      </div>
    </Shell>
  );
}