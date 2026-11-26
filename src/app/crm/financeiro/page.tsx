"use client";

/**
 * /crm/financeiro — desenho do dono (feito no Claude), seguido à risca.
 *
 * Entradas vêm dos gateways (Asaas em BRL, Paddle em USD) pelo serviço de cobrança.
 * Saídas são lançadas aqui. Real e dólar separados; consolidado com o câmbio escrito
 * na tela. Nada de número inventado: o que não existe aparece como vazio honesto.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import Shell from "@/components/dash/Shell";
import {
  Apoio,
  CAMPO,
  CORPO,
  Filete,
  MONO,
  Numero,
  Painel,
  Pilula,
  Rotulo,
  Segmentado,
  SegmentadoItem,
  Titulo,
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
  "Impostos",
  "Marketing",
  "Pró-labore",
  "Gateway e câmbio",
  "Outros",
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

export default function FinanceiroPage() {
  const [conta, setConta] = useState<{ nome?: string; email?: string } | null>(null);
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState("");
  const [aba, setAba] = useState<"todas" | "entradas" | "saidas">("todas");
  const [salvando, setSalvando] = useState(false);

  const [tipo, setTipo] = useState<"entrada" | "saida">("saida");
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState(CATEGORIAS[0]);
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [moeda, setMoeda] = useState("BRL");

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/financeiro", { cache: "no-store" });
      if (!r.ok) throw new Error(`a rota respondeu ${r.status}`);
      setDados((await r.json()) as Resposta);
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
        data: e.quando ? new Date(e.quando).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : "—",
        desc: e.email || e.tenant_id || "Cliente sem conta vinculada",
        sub: `${nomePais(e.pais)} · ${e.tipo}`,
        cat: "Receita",
        origem: e.gateway,
        valor: e.valor_centavos,
        moeda: e.moeda,
        entrada: true,
        idSaida: 0,
      })),
      ...saidas.map((s) => ({
        id: `s-${s.id}`,
        ordenar: s.data,
        data: new Date(`${s.data}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
        desc: s.descricao || "Sem descrição",
        sub: s.data,
        cat: s.categoria,
        origem: "manual",
        valor: s.valor_centavos,
        moeda: s.moeda,
        entrada: false,
        idSaida: s.id,
      })),
    ];
    return linhas
      .filter((l) => (aba === "todas" ? true : aba === "entradas" ? l.entrada : !l.entrada))
      .sort((a, b) => String(b.ordenar).localeCompare(String(a.ordenar)));
  }, [entradas, saidas, aba]);

  async function lancar() {
    const numero = Number(String(valor).replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(numero) || numero <= 0) {
      setErro("valor inválido");
      return;
    }
    setSalvando(true);
    setErro("");
    try {
      const r = await fetch("/api/financeiro", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          data,
          categoria,
          descricao,
          valor_centavos: Math.round(numero * 100),
          moeda: tipo === "entrada" ? moeda : "BRL",
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

  async function apagar(id: number) {
    if (!window.confirm("Apagar este lançamento?")) return;
    await fetch(`/api/financeiro?id=${id}`, { method: "DELETE" });
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

  return (
    <Shell titulo="Financeiro" usuario={{ nome: conta?.nome, email: conta?.email, ehDono: true }}>
      <main className="flex flex-col pb-16" style={{ background: "#000", fontFamily: CORPO }}>
        <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-7 px-6 pt-8 lg:px-10">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="flex max-w-[680px] flex-col gap-3">
              <Filete texto="02 — CRM" />
              <Titulo>Financeiro</Titulo>
              <Apoio>
                Entradas confirmadas pelos gateways e saídas que você lança. Real e dólar ficam separados, e o
                consolidado usa o câmbio de {dinheiro(cambio * 100)} por dólar.
              </Apoio>
            </div>
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
            <div className="rounded-[14px] border border-[#E85002] bg-[#0A0A0A] px-4 py-3 text-[14px] text-[#F9F9F9]">{erro}</div>
          ) : null}
          {dados?.aviso ? (
            <div className="rounded-[14px] border border-[#E85002] bg-[#0A0A0A] px-4 py-3 text-[14px] text-[#F9F9F9]">{dados.aviso}</div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {kpis.map((k) => (
              <Painel key={k.rotulo} className="flex flex-col gap-3.5 p-7" fundo={k.destaque ? "#111" : "#0A0A0A"}>
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: k.cor }} />
                  <Rotulo cor={k.destaque ? "#F9F9F9" : "#A7A7A7"}>{k.rotulo}</Rotulo>
                </span>
                <Numero cor={k.cor}>{k.valor}</Numero>
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
                style={{
                  gridTemplateColumns: "90px minmax(180px,2fr) 1.2fr 1fr 150px",
                  fontFamily: MONO,
                  fontSize: 11,
                  letterSpacing: "0.14em",
                  color: "#A7A7A7",
                }}
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
                    <li
                      key={l.id}
                      className="grid items-center gap-4 border-t border-[#1c1c1c] px-5 py-3.5"
                      style={{ gridTemplateColumns: "90px minmax(180px,2fr) 1.2fr 1fr 150px" }}
                    >
                      <span style={{ fontFamily: MONO, fontSize: 12, color: "#A7A7A7" }}>{l.data}</span>
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] border border-[#333] text-[13px]"
                          style={{ color: l.entrada ? "#34D399" : "#F87171" }}
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
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-[14px] font-semibold" style={{ color: l.entrada ? "#34D399" : "#F87171" }}>
                          {l.entrada ? "+" : "−"} {dinheiro(l.valor, l.moeda)}
                        </span>
                        {l.entrada ? null : (
                          <button
                            type="button"
                            onClick={() => apagar(l.idSaida)}
                            className="rounded-[8px] border border-[#333] px-2 py-1 text-[11px] text-[#A7A7A7] hover:border-[#F87171] hover:text-[#F87171]"
                          >
                            Apagar
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
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
                    style={{
                      background: tipo === t ? (t === "saida" ? "#F87171" : "#34D399") : "transparent",
                      color: tipo === t ? "#000" : "#A7A7A7",
                    }}
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
                    className="h-full w-full border-0 bg-transparent px-1 text-[15px] text-[#F9F9F9] outline-none placeholder:text-[#646464]"
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
                    disabled={tipo === "saida"}
                    className="h-10 rounded-[10px] text-[13px] disabled:opacity-40"
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
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-2">
                  <Rotulo>Data</Rotulo>
                  <input type="date" className={CAMPO} value={data} onChange={(e) => setData(e.target.value)} />
                </label>
              </div>

              <button
                type="button"
                onClick={() => void lancar()}
                disabled={salvando}
                className="h-[52px] rounded-[14px] bg-[#E85002] text-[15px] font-semibold text-black disabled:opacity-50"
              >
                {salvando ? "Lançando" : "Lançar no financeiro"}
              </button>

              <p className="m-0 text-[13px] leading-relaxed text-[#A7A7A7]">
                Entrada manual serve para o que não passa por gateway. O que o Asaas e a Paddle confirmam entra sozinho.
              </p>
            </Painel>
          </div>

          <p className="m-0 text-center" style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", color: "#A7A7A7" }}>
            CÂMBIO DECLARADO NA TELA · NADA É CONVERTIDO EM SILÊNCIO
          </p>
        </div>
      </main>
    </Shell>
  );
}