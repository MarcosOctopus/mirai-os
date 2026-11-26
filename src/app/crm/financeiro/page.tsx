"use client";

/* /crm/financeiro — o FINANCEIRO da empresa (só o dono), dentro do menu CRM.
 *
 * Duas fontes, nunca misturadas:
 *   • ENTRADAS — o que os gateways confirmaram (Asaas em BRL, Paddle em USD). Vem do
 *     serviço de cobrança pela rota /api/financeiro; esta tela não inventa número.
 *   • SAÍDAS — lançamentos do dono com categoria. Ficam no SQLite do app.
 *
 * BRL e USD aparecem SEPARADOS, e o consolidado usa o câmbio escrito na tela —
 * esconder a taxa dentro do número é o jeito mais fácil de mentir sobre margem.
 *
 * Padrão Dash: casca (Shell) + Poitons; laranja #ff751f; raios 24/10px; texto com
 * inicial maiúscula e sem travessão.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import Shell from "@/components/dash/Shell";

type Entrada = {
  id: string;
  gateway: "asaas" | "paddle" | string;
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
  "APIs de IA",
  "Impostos e taxas",
  "Marketing",
  "Ferramentas e software",
  "Pró-labore e equipe",
  "Gateway e câmbio",
  "Outros",
];

const PAISES: Record<string, string> = {
  BR: "Brasil", US: "Estados Unidos", PT: "Portugal", CA: "Canadá", MX: "México",
  AR: "Argentina", CL: "Chile", CO: "Colômbia", ES: "Espanha", GB: "Reino Unido",
  DE: "Alemanha", FR: "França", IT: "Itália", NL: "Holanda", IE: "Irlanda",
  AU: "Austrália", NZ: "Nova Zelândia", JP: "Japão", IN: "Índia", AE: "Emirados Árabes",
  CH: "Suíça", SE: "Suécia", NO: "Noruega", DK: "Dinamarca", ZA: "África do Sul",
};

function nomePais(codigo?: string | null) {
  if (!codigo) return "Não informado";
  return PAISES[codigo.toUpperCase()] || codigo.toUpperCase();
}

function bandeira(codigo?: string | null) {
  const c = (codigo || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return "🌐";
  return String.fromCodePoint(...[...c].map((l) => 0x1f1e6 + l.charCodeAt(0) - 65));
}

function dinheiro(centavos: number, moeda: string) {
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: moeda === "USD" ? "USD" : "BRL",
    maximumFractionDigits: 2,
  });
}

function quando(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function FinanceiroPage() {
  const [conta, setConta] = useState<{ nome?: string; email?: string } | null>(null);
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [categoria, setCategoria] = useState(CATEGORIAS[0]);
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [moeda, setMoeda] = useState("BRL");

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch("/api/financeiro", { cache: "no-store" });
      if (!r.ok) throw new Error(`rota respondeu ${r.status}`);
      setDados((await r.json()) as Resposta);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setConta(d?.conta || d?.usuario || d || null))
      .catch(() => setConta(null));
    void carregar();
  }, [carregar]);

  const lancar = useCallback(
    async (evento: React.FormEvent) => {
      evento.preventDefault();
      const reais = Number(String(valor).replace(/\./g, "").replace(",", "."));
      if (!Number.isFinite(reais) || reais <= 0) {
        setErro("valor inválido");
        return;
      }
      setSalvando(true);
      setErro(null);
      try {
        const r = await fetch("/api/financeiro", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ data, categoria, descricao, valor_centavos: Math.round(reais * 100), moeda }),
        });
        const corpo = await r.json();
        if (!r.ok) throw new Error(corpo?.error || `rota respondeu ${r.status}`);
        setValor("");
        setDescricao("");
        await carregar();
      } catch (e) {
        setErro((e as Error).message);
      } finally {
        setSalvando(false);
      }
    },
    [data, categoria, descricao, valor, moeda, carregar],
  );

  const apagar = useCallback(
    async (id: number) => {
      if (!window.confirm("Apagar este lançamento?")) return;
      await fetch(`/api/financeiro?id=${id}`, { method: "DELETE" });
      await carregar();
    },
    [carregar],
  );

  const resumo = dados?.resumo;
  const cambio = resumo?.cambio_usd_brl || 5;
  const entradas = useMemo(() => dados?.entradas || [], [dados]);
  const saidas = useMemo(() => dados?.saidas || [], [dados]);

  const campo =
    "rounded-[10px] border border-dash-hair/10 bg-dash-bg px-3 py-2 text-[13px] text-dash-fg outline-none placeholder:text-dash-dim focus:border-dash-brand/60";
  const rotulo = "mb-1 block text-[11px] uppercase tracking-[0.18em] text-dash-dim";

  return (
    <Shell titulo="Financeiro" usuario={{ nome: conta?.nome, email: conta?.email, ehDono: true }}>
      <main className="mx-auto w-full max-w-[1180px] px-5 pb-16 pt-6">
        <header className="mb-6">
          <p className="text-[11px] uppercase tracking-[0.28em] text-dash-dim">CRM</p>
          <h1 className="mt-1 text-[26px] font-semibold text-dash-fg">Financeiro</h1>
          <p className="mt-1 max-w-[640px] text-[13px] leading-relaxed text-dash-dim">
            Entradas confirmadas pelos gateways e saídas lançadas por você. Dólar e real ficam separados,
            e o consolidado usa o câmbio de {dinheiro(cambio * 100, "BRL")} por dólar.
          </p>
        </header>

        {/* números */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { titulo: "Entradas em real", valor: dinheiro(resumo?.entradas.brl_centavos || 0, "BRL"), nota: "Asaas" },
            { titulo: "Entradas em dólar", valor: dinheiro(resumo?.entradas.usd_centavos || 0, "USD"), nota: "Paddle" },
            {
              titulo: "Saídas totais",
              valor: dinheiro(
                (resumo?.saidas.brl_centavos || 0) + (resumo?.saidas.usd_centavos || 0) * cambio,
                "BRL",
              ),
              nota: `${saidas.length} lançamento${saidas.length === 1 ? "" : "s"}`,
            },
            {
              titulo: "Resultado",
              valor: dinheiro(resumo?.resultado_brl_centavos || 0, "BRL"),
              nota: "consolidado em real",
            },
          ].map((n) => (
            <div key={n.titulo} className="rounded-[18px] border border-dash-hair/10 bg-dash-panel/40 px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.16em] text-dash-dim">{n.titulo}</p>
              <p className="mt-2 text-[22px] font-semibold text-dash-fg">{n.valor}</p>
              <p className="mt-1 text-[11px] text-dash-dim">{n.nota}</p>
            </div>
          ))}
        </section>

        {dados?.aviso ? (
          <p className="mt-4 rounded-[10px] border border-dash-brand/30 bg-dash-brand/10 px-3 py-2 text-[12px] text-dash-fg">
            {dados.aviso}
          </p>
        ) : null}
        {erro ? (
          <p className="mt-4 rounded-[10px] border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-dash-fg">
            {erro}
          </p>
        ) : null}

        {/* lançar saída */}
        <section className="mt-6 rounded-[18px] border border-dash-hair/10 bg-dash-panel/30 p-4">
          <h2 className="text-[13px] font-semibold text-dash-fg">Lançar saída</h2>
          <form onSubmit={lancar} className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-6">
            <div>
              <label className={rotulo} htmlFor="data">Data</label>
              <input id="data" type="date" className={`${campo} w-full`} value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            <div className="lg:col-span-2">
              <label className={rotulo} htmlFor="categoria">Categoria</label>
              <select id="categoria" className={`${campo} w-full`} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className={rotulo} htmlFor="descricao">Descrição</label>
              <input id="descricao" className={`${campo} w-full`} placeholder="Servidor, licença, imposto" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
            </div>
            <div>
              <label className={rotulo} htmlFor="valor">Valor</label>
              <input id="valor" className={`${campo} w-full`} placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value)} />
            </div>
            <div>
              <label className={rotulo} htmlFor="moeda">Moeda</label>
              <select id="moeda" className={`${campo} w-full`} value={moeda} onChange={(e) => setMoeda(e.target.value)}>
                <option value="BRL">Real</option>
                <option value="USD">Dólar</option>
              </select>
            </div>
            <div className="col-span-2 flex items-end lg:col-span-6">
              <button
                type="submit"
                disabled={salvando}
                className="rounded-[10px] bg-dash-brand px-4 py-2 text-[13px] font-semibold text-black disabled:opacity-50"
              >
                {salvando ? "Lançando" : "Lançar saída"}
              </button>
            </div>
          </form>
        </section>

        {/* saídas */}
        <section className="mt-6">
          <h2 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-dash-fg">
            Saídas
            <span className="text-[11px] font-normal text-dash-dim">{saidas.length}</span>
          </h2>
          <div className="overflow-hidden rounded-[18px] border border-dash-hair/10">
            {carregando && !saidas.length ? (
              <p className="px-4 py-6 text-[13px] text-dash-dim">Carregando</p>
            ) : saidas.length === 0 ? (
              <p className="px-4 py-6 text-[13px] text-dash-dim">Nenhuma saída lançada ainda.</p>
            ) : (
              <ul className="divide-y divide-dash-hair/10">
                {saidas.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <span className="w-[86px] text-[12px] text-dash-dim">{new Date(`${s.data}T12:00:00`).toLocaleDateString("pt-BR")}</span>
                    <span className="rounded-full border border-dash-hair/15 px-2 py-0.5 text-[11px] text-dash-dim">{s.categoria}</span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-dash-fg">{s.descricao || "Sem descrição"}</span>
                    <span className="text-[13px] font-semibold text-dash-fg">{dinheiro(s.valor_centavos, s.moeda)}</span>
                    <button
                      type="button"
                      onClick={() => apagar(s.id)}
                      className="rounded-[8px] border border-dash-hair/15 px-2 py-1 text-[11px] text-dash-dim hover:border-red-500/40 hover:text-red-400"
                    >
                      Apagar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* entradas */}
        <section className="mt-8">
          <h2 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-dash-fg">
            Entradas confirmadas
            <span className="text-[11px] font-normal text-dash-dim">{entradas.length}</span>
          </h2>
          <div className="overflow-hidden rounded-[18px] border border-dash-hair/10">
            {entradas.length === 0 ? (
              <p className="px-4 py-6 text-[13px] text-dash-dim">Nenhuma entrada confirmada ainda.</p>
            ) : (
              <ul className="divide-y divide-dash-hair/10">
                {entradas.map((e) => (
                  <li key={`${e.gateway}-${e.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <span className="w-[110px] text-[12px] text-dash-dim">{quando(e.quando)}</span>
                    <span className="text-[15px]" title={nomePais(e.pais)}>{bandeira(e.pais)}</span>
                    <span className="w-[92px] text-[12px] text-dash-dim">{nomePais(e.pais)}</span>
                    <span className="rounded-full border border-dash-hair/15 px-2 py-0.5 text-[11px] uppercase tracking-[0.12em] text-dash-dim">
                      {e.gateway}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12px] text-dash-dim">
                      {e.email || e.tenant_id || "Cliente sem conta vinculada"}
                    </span>
                    <span className="text-[13px] font-semibold text-dash-fg">{dinheiro(e.valor_centavos, e.moeda)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-dash-dim">
            O país vem do gateway: no Asaas é sempre Brasil, na Paddle é o endereço de cobrança do comprador.
            Nada é perguntado duas vezes à pessoa.
          </p>
        </section>
      </main>
    </Shell>
  );
}