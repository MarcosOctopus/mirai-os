"use client";

/**
 * /crm/planos — desenho do dono (Claude), adaptado à nossa realidade (26/11/2026).
 *
 * Três abas, como no desenho: Planos, Ferramentas e Usuários. TUDO se resolve aqui —
 * criar plano, editar preço e limites, ligar ferramenta e trocar o plano de uma
 * organização. Nenhum botão manda para a tela antiga.
 *
 * Leitura:  /api/admin/planos?acao=planos | capabilities | usuarios | capacidades_do_plano
 * Escrita:  salvar_plano (POST) · editar_plano (PATCH) · definir_capacidades_do_plano (PUT)
 *           definir_plano_da_org (POST) — e a rota exige o e-mail autorizado a mexer em preço.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import Shell from "@/components/dash/Shell";
import { agruparEmModulos, idsDoModulo } from "@/lib/modulos-plano";
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

type Plano = {
  plan_id: string;
  product_id: string;
  nome: string;
  preco_centavos?: number | null;
  intervalo?: string;
  ativo?: boolean;
  limites?: Record<string, number>;
  capacidades?: string[];
};

type Ferramenta = { capability_id: string; product_id: string; nome: string; area?: string; risk?: string };

type Usuario = {
  user_id: string;
  nome: string;
  email: string;
  papel: string;
  tenant_id: string;
  product_id: string;
  tenant_nome: string;
  plan_id: string;
  desde?: string;
};

const LIMITES: { chave: string; rotulo: string; sufixo?: string }[] = [
  { chave: "organizacoes", rotulo: "Organizações" },
  { chave: "tokens_mes", rotulo: "Tokens por mês", sufixo: "M" },
  { chave: "storage_gb", rotulo: "Arca", sufixo: "GB" },
  { chave: "voz_minutos", rotulo: "Voz", sufixo: "min" },
  { chave: "execucoes_mes", rotulo: "Execuções" },
];

const INTERVALOS = [
  { valor: "mensal", rotulo: "por mês" },
  { valor: "anual", rotulo: "por ano" },
];

const GRADE_USUARIOS = "minmax(230px,2fr) 1.4fr 1.2fr 1.3fr 150px";
const GRADE_FERRAMENTAS = "minmax(240px,2.2fr) 1fr 1fr 120px 1.4fr";

function apiJson(caminho: string, init?: RequestInit) {
  return fetch(caminho, { cache: "no-store", ...init }).then(async (r) => {
    const corpo = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(corpo?.error || `a rota respondeu ${r.status}`);
    return corpo;
  });
}

export default function PlanosPage() {
  const [conta, setConta] = useState<{ nome?: string; email?: string } | null>(null);
  const [aba, setAba] = useState<"planos" | "ferramentas" | "usuarios">("planos");
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [ferramentas, setFerramentas] = useState<Ferramenta[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [capacidades, setCapacidades] = useState<Record<string, string[]>>({});
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");

  const [gaveta, setGaveta] = useState<null | "novo" | "editar">(null);
  const [alvo, setAlvo] = useState<Plano | null>(null);
  const [fNome, setFNome] = useState("");
  const [fId, setFId] = useState("");
  const [fProduto, setFProduto] = useState("mirai");
  const [fPreco, setFPreco] = useState("");
  const [fIntervalo, setFIntervalo] = useState("mensal");
  const [fAtivo, setFAtivo] = useState(true);
  const [fLimites, setFLimites] = useState<Record<string, string>>({});
  const [fCapacidades, setFCapacidades] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [recado, setRecado] = useState("");

  const carregar = useCallback(async () => {
    try {
      const [p, c, u] = await Promise.all([
        apiJson("/api/admin/planos?acao=planos"),
        apiJson("/api/admin/planos?acao=capabilities"),
        apiJson("/api/admin/planos?acao=usuarios"),
      ]);
      const lista = ((p?.planos || []) as Plano[]).filter((x) => x?.plan_id);
      setPlanos(lista);
      setFerramentas(((c?.capacidades || []) as Ferramenta[]).filter((x) => x?.capability_id));
      setUsuarios(((u?.usuarios || []) as Usuario[]).filter((x) => x?.user_id));

      const mapa: Record<string, string[]> = {};
      await Promise.all(
        lista.map(async (pl) => {
          try {
            const d = await apiJson(`/api/admin/planos?acao=capacidades_do_plano&plan_id=${encodeURIComponent(pl.plan_id)}`);
            const ids = (d?.capacidades || []).map((x: { capability_id?: string } | string) =>
              typeof x === "string" ? x : x?.capability_id || "",
            );
            mapa[pl.plan_id] = ids.filter(Boolean);
          } catch {
            mapa[pl.plan_id] = [];
          }
        }),
      );
      setCapacidades(mapa);
      setErro("");
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

  const ordenados = useMemo(() => [...planos].sort((a, b) => (a.preco_centavos || 0) - (b.preco_centavos || 0)), [planos]);

  // O plano fala a língua do produto (ORB, Arquiteto, Synapse…), não a lista miúda de ações.
  const modulos = useMemo(() => agruparEmModulos(ferramentas), [ferramentas]);

  const assinantes = useMemo(() => {
    const mapa: Record<string, number> = {};
    for (const u of usuarios) mapa[u.plan_id] = (mapa[u.plan_id] || 0) + 1;
    return mapa;
  }, [usuarios]);

  const ferramentasFiltradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return ferramentas;
    return ferramentas.filter((f) => `${f.nome} ${f.capability_id} ${f.area || ""} ${f.product_id}`.toLowerCase().includes(t));
  }, [ferramentas, busca]);

  const usuariosFiltrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return usuarios;
    return usuarios.filter((u) => `${u.nome} ${u.email} ${u.tenant_nome} ${u.plan_id}`.toLowerCase().includes(t));
  }, [usuarios, busca]);

  function abrirNovo() {
    setGaveta("novo");
    setAlvo(null);
    setFId("");
    setFNome("");
    setFProduto("mirai");
    setFPreco("");
    setFIntervalo("mensal");
    setFAtivo(true);
    setFLimites({});
    setFCapacidades([]);
    setRecado("");
  }

  function abrirEditar(pl: Plano) {
    setGaveta("editar");
    setAlvo(pl);
    setFId(pl.plan_id);
    setFNome(pl.nome || "");
    setFProduto(pl.product_id);
    setFPreco(pl.preco_centavos ? (pl.preco_centavos / 100).toFixed(2).replace(".", ",") : "");
    setFIntervalo(pl.intervalo || "mensal");
    setFAtivo(pl.ativo !== false);
    setFLimites(
      Object.fromEntries(
        Object.entries(pl.limites || {}).map(([k, v]) => [k, v === null || v === undefined ? "" : String(v)]),
      ),
    );
    setFCapacidades(capacidades[pl.plan_id] || []);
    setRecado("");
  }

  async function salvar() {
    const centavos = fPreco.trim()
      ? Math.round(Number(fPreco.replace(/\./g, "").replace(",", ".")) * 100)
      : 0;
    if (!fNome.trim()) {
      setRecado("dá um nome ao plano");
      return;
    }
    if (gaveta === "novo" && !fId.trim()) {
      setRecado("informe o código do plano");
      return;
    }
    if (!Number.isFinite(centavos) || centavos < 0) {
      setRecado("preço inválido");
      return;
    }

    const limites: Record<string, number> = { ...(alvo?.limites || {}) };
    for (const [k, v] of Object.entries(fLimites)) {
      if (v === "") delete limites[k];
      else if (Number.isFinite(Number(v))) limites[k] = Number(v);
    }

    setSalvando(true);
    setRecado("");
    try {
      if (gaveta === "novo") {
        await apiJson("/api/admin/planos", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            acao: "salvar_plano",
            plan_id: fId.trim(),
            product_id: fProduto,
            nome: fNome,
            preco_centavos: centavos,
            intervalo: fIntervalo,
            ativo: fAtivo,
            limites,
          }),
        });
      } else {
        await apiJson("/api/admin/planos", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            acao: "editar_plano",
            plan_id: fId,
            nome: fNome,
            preco_centavos: centavos,
            intervalo: fIntervalo,
            ativo: fAtivo,
            limites,
          }),
        });
      }

      await apiJson("/api/admin/planos", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ acao: "definir_capacidades_do_plano", plan_id: fId.trim(), capacidades: fCapacidades }),
      }).catch(() => null);

      setRecado("Plano salvo.");
      await carregar();
      setTimeout(() => setGaveta(null), 700);
    } catch (e) {
      setRecado((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function apagarPlano(pl: Plano) {
    const ciente = window.confirm(
      `Apagar o plano ${pl.nome} (${pl.plan_id})?\n\n` +
        "É definitivo. Se qualquer assinatura — mesmo antiga — usar este plano, o plano de controle recusa e o caminho é DESATIVAR, não apagar.",
    );
    if (!ciente) return;
    try {
      await apiJson("/api/admin/planos", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ acao: "apagar_plano", plan_id: pl.plan_id }),
      });
      setErro("");
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function trocarPlanoDaOrg(u: Usuario, planId: string) {
    if (planId === u.plan_id) return;
    try {
      await apiJson("/api/admin/planos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ acao: "definir_plano_da_org", tenant_id: u.tenant_id, plan_id: planId }),
      });
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  const grupos = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return modulos
      .map((m) => ({
        modulo: m,
        acoes: m.capacidades.filter((c) => !t || `${c.nome} ${c.capability_id} ${c.area || ""}`.toLowerCase().includes(t)),
      }))
      .filter((g) => g.acoes.length > 0)
      .sort((a, b) => b.acoes.length - a.acoes.length);
  }, [modulos, busca]);

  return (
    <Shell titulo="Planos" usuario={{ nome: conta?.nome, email: conta?.email, ehDono: true }}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="m-0 max-w-[620px] text-[14px] leading-[1.6] text-[#A7A7A7]">
            Cada plano vive no plano de controle e passa a valer nos produtos na hora. Preço e limite só mudam pelo
            e-mail autorizado.
          </p>
          <div className="flex items-center gap-2">
            <label className="flex h-11 w-[240px] max-w-full items-center gap-2.5 rounded-[14px] border border-[#333] bg-black px-3.5">
              <span aria-hidden className="text-[13px] text-[#646464]">⌕</span>
              <input
                className="w-full border-0 bg-transparent text-[14px] text-[#F9F9F9] outline-none placeholder:text-[#646464]"
                placeholder={aba === "usuarios" ? "Buscar pessoa ou empresa" : "Buscar ferramenta"}
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </label>
            <button type="button" onClick={abrirNovo} className="inline-flex h-11 items-center gap-2 rounded-[14px] bg-[#E85002] px-5 text-[15px] font-semibold text-white">
              <span aria-hidden>+</span> Novo plano
            </button>
          </div>
        </div>

        {erro ? (
          <div className="rounded-[14px] border border-[#E85002] bg-[#111] px-4 py-3 text-[14px] text-[#F9F9F9]">{erro}</div>
        ) : null}

        <Segmentado>
          <SegmentadoItem ativo={aba === "planos"} onClick={() => setAba("planos")} contagem={planos.length}>
            Planos
          </SegmentadoItem>
          <SegmentadoItem ativo={aba === "ferramentas"} onClick={() => setAba("ferramentas")} contagem={ferramentas.length}>
            Ferramentas
          </SegmentadoItem>
          <SegmentadoItem ativo={aba === "usuarios"} onClick={() => setAba("usuarios")} contagem={usuarios.length}>
            Usuários
          </SegmentadoItem>
        </Segmentado>

        {carregando ? (
          <p className="text-[14px] text-[#A7A7A7]">Lendo o plano de controle…</p>
        ) : aba === "planos" ? (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {ordenados.map((p, i) => {
              const ligadas = capacidades[p.plan_id] || p.capacidades || [];
              const quantas = modulos.filter((m) => idsDoModulo(m).some((id) => ligadas.includes(id))).length;
              const quantos = assinantes[p.plan_id] || 0;
              return (
                <Painel key={p.plan_id} className="flex flex-col gap-5 p-7">
                  <div className="flex items-start justify-between gap-3">
                    <Rotulo>PLANO {String(i + 1).padStart(2, "0")}</Rotulo>
                    <div className="flex items-center gap-2">
                      <Pilula tracejada cor={p.ativo === false ? "#F87171" : "#A7A7A7"}>{p.ativo === false ? "INATIVO" : "ATIVO"}</Pilula>
                      <button
                        type="button"
                        onClick={() => void apagarPlano(p)}
                        title={`Apagar ${p.nome}`}
                        aria-label={`Apagar plano ${p.nome}`}
                        className="grid h-7 w-7 place-items-center rounded-[8px] border border-[#333] text-[12px] text-[#646464] transition hover:border-[#F87171] hover:text-[#F87171]"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <h2 className="m-0 text-[22px] font-semibold text-[#F9F9F9]">{p.nome}</h2>
                    <div className="flex items-baseline gap-1.5">
                      <Numero tamanho={30}>{dinheiro(p.preco_centavos || 0)}</Numero>
                      <span className="text-[14px] text-[#A7A7A7]">/ {p.intervalo === "anual" ? "ano" : "mês"}</span>
                    </div>
                  </div>

                  <div className="h-px bg-[#333]" />

                  <div className="flex flex-col gap-2.5 text-[14px]">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[#A7A7A7]">Ferramentas</span>
                      <span className="text-[#F9F9F9]">{quantas}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[#A7A7A7]">Assinantes</span>
                      <span className="text-[#F9F9F9]">{quantos}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[#A7A7A7]">Código</span>
                      <span style={{ fontFamily: MONO, fontSize: 12 }} className="truncate text-[#F9F9F9]">{p.plan_id}</span>
                    </div>
                  </div>

                  <div className="mt-auto flex gap-2">
                    <button
                      type="button"
                      onClick={() => abrirEditar(p)}
                      className="inline-flex h-11 flex-1 items-center justify-center rounded-[14px] border border-[#333] text-[14px] text-[#F9F9F9]"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBusca(p.plan_id);
                        setAba("ferramentas");
                      }}
                      className="grid h-11 w-11 place-items-center rounded-[14px] border border-[#333] text-[#A7A7A7]"
                      aria-label={`Ver ferramentas de ${p.nome}`}
                    >
                      ⋯
                    </button>
                  </div>
                </Painel>
              );
            })}

            <button
              type="button"
              onClick={abrirNovo}
              className="flex flex-col items-center justify-center gap-2 rounded-[24px] border border-dashed border-[#333] p-7 text-center transition hover:border-[#646464]"
            >
              <span className="text-[16px] font-medium text-[#F9F9F9]">Monte um plano do zero</span>
              <span className="max-w-[240px] text-[14px] text-[#A7A7A7]">
                Escolha as ferramentas, defina o preço e salve. Ele vale nos produtos na hora.
              </span>
            </button>
          </div>
        ) : aba === "ferramentas" ? (
          <div className="flex flex-col gap-5">
            {grupos.length === 0 ? (
              <p className="text-[14px] text-[#A7A7A7]">Nenhuma ferramenta com esse filtro.</p>
            ) : (
              grupos.map(({ modulo, acoes }) => (
                <Painel key={modulo.chave} className="overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                    <div className="flex flex-col gap-0.5">
                      <h2 className="m-0 text-[16px] font-semibold text-[#F9F9F9]">{modulo.nome}</h2>
                      <span className="text-[13px] text-[#A7A7A7]">{modulo.descricao}</span>
                    </div>
                    <Rotulo>{acoes.length} AÇÃ{acoes.length === 1 ? "O" : "ES"} · {modulo.produto.toUpperCase()}</Rotulo>
                  </div>

                  <div
                    className="grid gap-4 px-5 py-3"
                    style={{ gridTemplateColumns: GRADE_FERRAMENTAS, fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", color: "#A7A7A7", borderTop: "1px solid #1c1c1c" }}
                  >
                    <span>Ferramenta</span>
                    <span>Área</span>
                    <span>Risco</span>
                    <span>Em planos</span>
                    <span>Código</span>
                  </div>

                  <ul className="m-0 list-none p-0">
                    {acoes.map((f) => {
                      const emQuantos = planos.filter((pl) => (capacidades[pl.plan_id] || []).includes(f.capability_id)).length;
                      return (
                        <li key={f.capability_id} className="grid items-center gap-4 border-t border-[#1c1c1c] px-5 py-3.5" style={{ gridTemplateColumns: GRADE_FERRAMENTAS }}>
                          <span className="truncate text-[14px] font-medium text-[#F9F9F9]">{f.nome}</span>
                          <span className="truncate text-[13px] text-[#A7A7A7]">{f.area || "—"}</span>
                          <span>
                            <Pilula tracejada cor={f.risk === "R5" || f.risk === "R4" ? "#F87171" : "#A7A7A7"}>{f.risk || "—"}</Pilula>
                          </span>
                          <span className="text-[14px]" style={{ color: emQuantos ? "#34D399" : "#646464" }}>{emQuantos}</span>
                          <span className="truncate text-[12px] text-[#A7A7A7]" style={{ fontFamily: MONO }}>{f.capability_id}</span>
                        </li>
                      );
                    })}
                  </ul>
                </Painel>
              ))
            )}
          </div>
        ) : (
          <Painel className="overflow-hidden">
            <div
              className="grid gap-4 px-5 py-3"
              style={{ gridTemplateColumns: GRADE_USUARIOS, fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", color: "#A7A7A7" }}
            >
              <span>Pessoa</span>
              <span>Organização</span>
              <span>Produto</span>
              <span>Plano</span>
              <span>Papel</span>
            </div>

            <ul className="m-0 list-none p-0">
              {usuariosFiltrados.map((u) => (
                <li key={u.user_id} className="grid items-center gap-4 border-t border-[#1c1c1c] px-5 py-3.5" style={{ gridTemplateColumns: GRADE_USUARIOS }}>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-[14px] font-medium text-[#F9F9F9]">{u.nome || u.email}</span>
                    <span className="truncate text-[12px] text-[#A7A7A7]">{u.email}</span>
                  </div>
                  <span className="truncate text-[13px] text-[#A7A7A7]">{u.tenant_nome || u.tenant_id}</span>
                  <span className="truncate text-[13px] text-[#A7A7A7]">{u.product_id}</span>
                  <select
                    className={`${CAMPO} !h-10`}
                    value={u.plan_id}
                    onChange={(e) => void trocarPlanoDaOrg(u, e.target.value)}
                  >
                    {planos.filter((p) => p.product_id === u.product_id).map((p) => (
                      <option key={p.plan_id} value={p.plan_id}>{p.nome}</option>
                    ))}
                    {planos.some((p) => p.plan_id === u.plan_id) ? null : <option value={u.plan_id}>{u.plan_id}</option>}
                  </select>
                  <span className="text-[13px]" style={{ color: u.papel === "owner" || u.papel === "dono" ? "#E85002" : "#A7A7A7" }}>{u.papel}</span>
                </li>
              ))}
            </ul>

            {usuariosFiltrados.length === 0 ? (
              <p className="px-5 py-10 text-center text-[14px] text-[#A7A7A7]">Ninguém com esse filtro.</p>
            ) : null}
          </Painel>
        )}
      </div>

      {/* gaveta de plano — criar ou editar, sem sair da tela */}
      {gaveta ? (
        <div className="fixed inset-0 z-[80] flex justify-end" role="dialog" aria-modal="true">
          <button type="button" aria-label="Fechar" onClick={() => setGaveta(null)} className="absolute inset-0 bg-black/60" />
          <aside className="relative flex h-full w-full max-w-[480px] flex-col gap-4 overflow-y-auto border-l border-[#333] p-6" style={{ background: "#111" }}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <h2 className="m-0 text-[18px] font-semibold text-[#F9F9F9]">{gaveta === "novo" ? "Novo plano" : "Editar plano"}</h2>
                <span className="text-[13px] text-[#A7A7A7]">
                  {gaveta === "novo" ? "Nasce ativo e passa a valer na hora." : `Código ${fId}`}
                </span>
              </div>
              <button type="button" onClick={() => setGaveta(null)} className="grid h-9 w-9 place-items-center rounded-[10px] border border-[#333] text-[#A7A7A7]">✕</button>
            </div>

            {recado ? <div className="rounded-[14px] border border-[#E85002] px-3.5 py-2.5 text-[13px] text-[#F9F9F9]">{recado}</div> : null}

            {gaveta === "novo" ? (
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-2">
                  <Rotulo>Código</Rotulo>
                  <input className={CAMPO} placeholder="mirai_essencial" value={fId} onChange={(e) => setFId(e.target.value)} />
                </label>
                <label className="flex flex-col gap-2">
                  <Rotulo>Produto</Rotulo>
                  <select className={CAMPO} value={fProduto} onChange={(e) => setFProduto(e.target.value)}>
                    {[...new Set(["mirai", ...planos.map((p) => p.product_id)])].map((pf) => (
                      <option key={pf} value={pf}>{pf}</option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}

            <label className="flex flex-col gap-2">
              <Rotulo>Nome</Rotulo>
              <input className={CAMPO} value={fNome} onChange={(e) => setFNome(e.target.value)} />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-2">
                <Rotulo>Preço</Rotulo>
                <div className="flex h-12 items-center rounded-[14px] border border-[#333] bg-black">
                  <span className="grid px-3.5 text-[14px] text-[#A7A7A7]">R$</span>
                  <input
                    className="h-full w-full border-0 bg-transparent px-1 text-[15px] text-[#F9F9F9] outline-none placeholder:text-[#646464]"
                    placeholder="0,00"
                    value={fPreco}
                    onChange={(e) => setFPreco(e.target.value)}
                  />
                </div>
              </label>
              <label className="flex flex-col gap-2">
                <Rotulo>Intervalo</Rotulo>
                <select className={CAMPO} value={fIntervalo} onChange={(e) => setFIntervalo(e.target.value)}>
                  {INTERVALOS.map((i) => (
                    <option key={i.valor} value={i.valor}>{i.rotulo}</option>
                  ))}
                </select>
              </label>
            </div>

            <button type="button" onClick={() => setFAtivo((v) => !v)} className="flex items-center gap-3.5 rounded-[14px] bg-black px-3.5 py-3.5 text-left">
              <span className="flex h-6 w-10 shrink-0 rounded-full p-[3px]" style={{ background: fAtivo ? "#E85002" : "#333" }}>
                <span className="h-[18px] w-[18px] rounded-full bg-[#F9F9F9]" style={{ transform: fAtivo ? "translateX(16px)" : "translateX(0)" }} />
              </span>
              <span className="text-[14px] text-[#F9F9F9]">{fAtivo ? "Ativo, vende agora" : "Inativo, some da vitrine"}</span>
            </button>

            <div className="flex flex-col gap-3">
              <Rotulo>Limites</Rotulo>
              <div className="grid grid-cols-2 gap-3">
                {LIMITES.map((l) => (
                  <label key={l.chave} className="flex flex-col gap-2">
                    <span className="text-[12px] text-[#A7A7A7]">{l.rotulo}{l.sufixo ? ` (${l.sufixo})` : ""}</span>
                    <input
                      className={CAMPO}
                      inputMode="numeric"
                      placeholder="—"
                      value={fLimites[l.chave] ?? ""}
                      onChange={(e) => setFLimites((m) => ({ ...m, [l.chave]: e.target.value }))}
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <Rotulo>Ferramentas do plano</Rotulo>
                <span className="text-[12px] text-[#A7A7A7]">
                  {modulos.filter((m) => m.produto === fProduto && idsDoModulo(m).some((id) => fCapacidades.includes(id))).length} de{" "}
                  {modulos.filter((m) => m.produto === fProduto).length} ligados
                </span>
              </div>
              <div className="flex max-h-[260px] flex-col gap-1 overflow-y-auto rounded-[14px] border border-[#333] p-2">
                {modulos
                  .filter((m) => m.produto === fProduto)
                  .map((m) => {
                    const ids = idsDoModulo(m);
                    const ligadas = ids.filter((id) => fCapacidades.includes(id));
                    const tudoOuNada = ligadas.length === ids.length;
                    const parcial = ligadas.length > 0 && !tudoOuNada;
                    return (
                      <button
                        key={m.chave}
                        type="button"
                        onClick={() =>
                          setFCapacidades((atual) =>
                            tudoOuNada ? atual.filter((x) => !ids.includes(x)) : [...new Set([...atual, ...ids])],
                          )
                        }
                        className="flex items-start gap-2.5 rounded-[10px] px-2.5 py-2.5 text-left hover:bg-white/5"
                      >
                        <span
                          className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-[6px] border text-[11px]"
                          style={{
                            borderColor: tudoOuNada || parcial ? "#E85002" : "#333",
                            background: tudoOuNada ? "#E85002" : "transparent",
                            color: tudoOuNada ? "#fff" : parcial ? "#E85002" : "#646464",
                          }}
                        >
                          {tudoOuNada ? "✓" : parcial ? "–" : ""}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-[13px] font-medium text-[#F9F9F9]">{m.nome}</span>
                          <span className="truncate text-[12px] text-[#A7A7A7]">{m.descricao}</span>
                        </span>
                        <span className="shrink-0 text-[11px] text-[#646464]" style={{ fontFamily: MONO }}>
                          {ids.length}
                        </span>
                      </button>
                    );
                  })}
                {modulos.filter((m) => m.produto === fProduto).length === 0 ? (
                  <span className="px-2.5 py-3 text-[13px] text-[#A7A7A7]">Nenhum módulo desse produto.</span>
                ) : null}
              </div>
            </div>

            <button type="button" onClick={() => void salvar()} disabled={salvando} className="h-[52px] rounded-[14px] bg-[#E85002] text-[15px] font-semibold text-white disabled:opacity-50">
              {salvando ? "Salvando" : gaveta === "novo" ? "Criar plano" : "Salvar plano"}
            </button>

            <p className="m-0 text-[13px] leading-relaxed text-[#A7A7A7]">
              Quem muda preço é só o e-mail autorizado. O resto do acesso vê, mas não altera.
            </p>
          </aside>
        </div>
      ) : null}
    </Shell>
  );
}