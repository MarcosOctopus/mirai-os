"use client";

/**
 * /crm/clientes — desenho do dono (Claude), seguido à risca.
 *
 * Uma linha por PESSOA (o e-mail é a chave): quem tem conta em dois produtos aparece
 * uma vez só, e dentro dela ficam os vínculos. Fonte: /api/admin/clientes, que junta
 * o banco do app com o plano de controle.
 *
 * País e gateway ainda não existem nessa fonte (vivem nos eventos de cobrança). Aqui
 * aparece "—" em vez de invenção; o país real está no Financeiro, por pagamento.
 */

import { useEffect, useMemo, useState } from "react";

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

type Resposta = {
  ok?: boolean;
  contas?: number;
  organizacoes?: number;
  aviso?: string | null;
  pessoas: Pessoa[];
};

function iniciais(nome: string, email: string) {
  const base = (nome || email || "?").trim();
  const partes = base.split(/[\s@._-]+/).filter(Boolean);
  if (partes.length >= 2) return (partes[0][0] + partes[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

const NOME_PLANO: Record<string, string> = {
  mirai_free: "Free",
  mirai_basico: "Básico",
  mirai_intermediario: "Intermediário",
  mirai_profissional: "Profissional",
  mirai_avancado: "Avançado",
};

export default function ClientesPage() {
  const [conta, setConta] = useState<{ nome?: string; email?: string } | null>(null);
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [produto, setProduto] = useState<"todos" | string>("todos");
  const [plano, setPlano] = useState("todos");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setConta(d?.conta || d?.usuario || d || null))
      .catch(() => setConta(null));

    fetch("/api/admin/clientes", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`a rota respondeu ${r.status}`);
        return (await r.json()) as Resposta;
      })
      .then((d) => setDados(d))
      .catch((e) => setErro((e as Error).message))
      .finally(() => setCarregando(false));
  }, []);

  const pessoas = useMemo(() => dados?.pessoas || [], [dados]);
  const semOrganizacao = useMemo(() => pessoas.filter((p) => !p.organizacoes.length).length, [pessoas]);
  const vinculos = useMemo(() => pessoas.reduce((s, p) => s + p.organizacoes.length, 0), [pessoas]);

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

  const kpis = [
    { rotulo: "Pessoas", valor: String(pessoas.length), nota: "uma linha por e-mail" },
    { rotulo: "Vínculos a produtos", valor: String(vinculos), nota: "onde cada pessoa está" },
    { rotulo: "Sem organização", valor: String(semOrganizacao), nota: "conta sem espaço ainda" },
  ];

  return (
    <Shell titulo="Clientes" usuario={{ nome: conta?.nome, email: conta?.email, ehDono: true }}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="m-0 max-w-[620px] text-[14px] leading-[1.6] text-[#A7A7A7]">
            Uma linha por pessoa. Quem tem conta em dois produtos aparece uma vez só, porque é a mesma conta.
          </p>
          <a
              href="/admin/clientes"
              className="inline-flex h-12 items-center gap-2.5 rounded-[14px] bg-[#E85002] px-5 text-[15px] font-semibold text-white"
            >
              <span aria-hidden>+</span> Adicionar cliente
            </a>
          </div>

          {erro ? (
            <div className="rounded-[14px] border border-[#E85002] bg-[#111] px-4 py-3 text-[14px] text-[#F9F9F9]">{erro}</div>
          ) : null}
          {dados?.aviso ? (
            <div className="rounded-[14px] border border-[#E85002] bg-[#111] px-4 py-3 text-[14px] text-[#F9F9F9]">{dados.aviso}</div>
          ) : null}

          <div className="grid gap-0 overflow-hidden rounded-[24px] border border-[#333] sm:grid-cols-3" style={{ background: "#111" }}>
            {kpis.map((k, i) => (
              <div
                key={k.rotulo}
                className="flex flex-col gap-2.5 px-7 py-6"
                style={{ borderLeft: i === 0 ? "none" : "1px solid #333" }}
              >
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
                <label className="flex h-11 w-[260px] max-w-full items-center gap-2.5 rounded-[14px] border border-[#333] bg-black px-3.5">
                  <span aria-hidden className="text-[13px] text-[#646464]">⌕</span>
                  <input
                    className="w-full border-0 bg-transparent text-[14px] text-[#F9F9F9] outline-none placeholder:text-[#646464]"
                    placeholder="Buscar pessoa ou e-mail"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                  />
                </label>
                <select className={`${CAMPO} !h-11 w-[170px]`} value={plano} onChange={(e) => setPlano(e.target.value)}>
                  <option value="todos">Todos os planos</option>
                  {Object.values(NOME_PLANO).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                  <option value="sem">Sem plano</option>
                </select>
              </div>
            </div>

            <div
              className="grid gap-4 px-5 py-3"
              style={{
                gridTemplateColumns: "minmax(240px,2.2fr) 1.1fr 130px 1.3fr 1.4fr 44px",
                fontFamily: MONO,
                fontSize: 11,
                letterSpacing: "0.14em",
                color: "#A7A7A7",
              }}
            >
              <span>Pessoa</span>
              <span>Origem</span>
              <span>Gateway</span>
              <span>Plano</span>
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
                  return (
                    <li
                      key={p.email}
                      className="grid items-center gap-4 border-t border-[#1c1c1c] px-5 py-4"
                      style={{ gridTemplateColumns: "minmax(240px,2.2fr) 1.1fr 130px 1.3fr 1.4fr 44px" }}
                    >
                      <div className="flex min-w-0 items-center gap-3.5">
                        <span
                          className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] border border-[#333] text-[13px] font-medium"
                          style={{ background: "#111", color: "#E85002" }}
                        >
                          {iniciais(p.nome, p.email)}
                        </span>
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate text-[15px] font-medium text-[#F9F9F9]">{p.nome || p.email}</span>
                          <span className="truncate text-[13px] text-[#A7A7A7]">{p.email}</span>
                          <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", color: "#646464" }}>
                            ENTRA POR {(p.entra_por || "—").toUpperCase()}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <span
                          className="grid h-8 w-8 place-items-center rounded-[6px] border border-[#333] text-[11px]"
                          style={{ fontFamily: MONO, color: "#F9F9F9" }}
                          title="O país nasce do pagamento e aparece no Financeiro"
                        >
                          —
                        </span>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[14px] text-[#F9F9F9]">{p.vinculado ? "Vinculado" : "Sem vínculo"}</span>
                          <span className="text-[12px] text-[#A7A7A7]">{p.tenant_local || "sem espaço local"}</span>
                        </div>
                      </div>

                      <div className="flex flex-col items-start gap-1">
                        <Pilula ponto="#E85002" tracejada={!principal}>
                          {principal ? (principal.produto === "asaas" ? "asaas" : "—") : "sem pagamento"}
                        </Pilula>
                        <span className="text-[12px] text-[#A7A7A7]">{p.desde ? `desde ${p.desde}` : ""}</span>
                      </div>

                      <div className="flex flex-col gap-0.5">
                        <span className="text-[14px] font-medium text-[#F9F9F9]">
                          {principal ? NOME_PLANO[principal.plano] || principal.plano : "Sem plano"}
                        </span>
                        <span className="text-[12px]" style={{ color: principal ? "#34D399" : "#A7A7A7" }}>
                          {principal ? (principal.papel || "membro") : "conta livre"}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {p.organizacoes.length === 0 ? (
                          <a href="/admin/clientes" className="rounded-[10px] border border-dashed border-[#646464] px-3 py-1.5 text-[13px] text-[#F9F9F9]">
                            Vincular
                          </a>
                        ) : (
                          p.organizacoes.slice(0, 2).map((o) => (
                            <span key={o.tenant_id} className="rounded-full border border-[#333] px-2.5 py-1 text-[12px] text-[#A7A7A7]">
                              {o.organizacao}
                            </span>
                          ))
                        )}
                        {p.organizacoes.length > 2 ? (
                          <span className="rounded-full border border-[#333] px-2.5 py-1 text-[12px] text-[#646464]">
                            +{p.organizacoes.length - 2}
                          </span>
                        ) : null}
                      </div>

                      <a
                        href="/admin/clientes"
                        className="grid h-10 w-10 place-items-center rounded-[10px] text-[#A7A7A7] hover:text-[#F9F9F9]"
                        aria-label={`Abrir ${p.email}`}
                      >
                        ⋯
                      </a>
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
    </Shell>
  );
}