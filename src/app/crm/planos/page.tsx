"use client";

/**
 * /crm/planos — desenho do dono (Claude), seguido à risca.
 *
 * Os planos vivem no plano de controle (serviço de identidade). Esta tela lê e mostra;
 * a EDIÇÃO continua na tela de admin (que já tem o freio do e-mail autorizado), e o
 * botão "Editar" leva para lá em vez de reimplementar escrita em outro lugar.
 */

import { useEffect, useMemo, useState } from "react";

import Shell from "@/components/dash/Shell";
import {
  MONO,
  Numero,
  Painel,
  Pilula,
  Rotulo,
  TITULO,
  dinheiro,
} from "@/components/crm/ui";

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

export default function PlanosPage() {
  const [conta, setConta] = useState<{ nome?: string; email?: string } | null>(null);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setConta(d?.conta || d?.usuario || d || null))
      .catch(() => setConta(null));

    fetch("/api/admin/planos?acao=planos", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`o plano de controle respondeu ${r.status}`);
        const d = await r.json();
        const lista = Array.isArray(d) ? d : d.planos || d.data || [];
        setPlanos(lista as Plano[]);
      })
      .catch((e) => setErro((e as Error).message))
      .finally(() => setCarregando(false));
  }, []);

  const ordenados = useMemo(
    () => [...planos].sort((a, b) => (a.preco_centavos || 0) - (b.preco_centavos || 0)),
    [planos],
  );

  return (
    <Shell titulo="Planos" usuario={{ nome: conta?.nome, email: conta?.email, ehDono: true }}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="m-0 max-w-[620px] text-[14px] leading-[1.6] text-[#A7A7A7]">
            Cada plano vive no plano de controle e passa a valer nos produtos na hora. Preço e limite só mudam pelo
            e-mail autorizado.
          </p>
          <div className="flex items-center gap-2">
              <a href="/admin/planos" className="inline-flex h-12 items-center rounded-[14px] border border-[#333] px-4 text-[14px] text-[#F9F9F9]">
                Ferramentas
              </a>
              <a href="/admin/planos" className="inline-flex h-12 items-center gap-2.5 rounded-[14px] bg-[#E85002] px-5 text-[15px] font-semibold text-white">
                <span aria-hidden>+</span> Novo plano
              </a>
            </div>
          </div>

          {erro ? (
            <div className="flex flex-wrap items-center gap-4 rounded-[14px] border border-[#E85002] bg-[#111] px-5 py-3.5">
              <div className="flex flex-col gap-0.5 text-[14px] text-[#F9F9F9]">
                <span className="font-medium">Não conseguimos falar com o plano de controle.</span>
                <span className="text-[#A7A7A7]">A lista abaixo pode estar incompleta.</span>
              </div>
              <Pilula tracejada>{erro.toUpperCase().slice(0, 40)}</Pilula>
              <a href="/admin/planos" className="ml-auto inline-flex h-11 items-center rounded-[14px] border border-[#333] px-4 text-[14px] text-[#F9F9F9]">
                Tentar de novo
              </a>
            </div>
          ) : null}

          {carregando ? (
            <p className="text-[14px] text-[#A7A7A7]">Lendo os planos…</p>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {ordenados.map((p, i) => {
                const limites = p.limites || {};
                const linhas: [string, string][] = [
                  ["organizações", limites.organizacoes ? String(limites.organizacoes) : ""],
                  ["tokens/mês", limites.tokens_mes ? `${limites.tokens_mes}M` : ""],
                  ["Arca", limites.storage_gb ? `${limites.storage_gb} GB` : ""],
                  ["voz", limites.voz_minutos ? `${limites.voz_minutos} min` : ""],
                  ["execuções", limites.execucoes_mes ? String(limites.execucoes_mes) : ""],
                ].filter(([, v]) => v) as [string, string][];

                return (
                  <Painel key={p.plan_id} className="flex flex-col gap-5 p-7" fundo="#111">
                    <div className="flex items-start justify-between gap-3">
                      <Rotulo>PLANO {String(i + 1).padStart(2, "0")}</Rotulo>
                      <Pilula tracejada cor={p.ativo === false ? "#F87171" : "#A7A7A7"}>
                        {p.ativo === false ? "INATIVO" : "ATIVO"}
                      </Pilula>
                    </div>

                    <div className="flex flex-col gap-2">
                      <h2
                        className="m-0 text-[#F9F9F9]"
                        style={{ fontFamily: TITULO, fontSize: 22, fontWeight: 500, letterSpacing: "-0.02em" }}
                      >
                        {p.nome}
                      </h2>
                      <div className="flex items-baseline gap-1.5">
                        <Numero>{dinheiro(p.preco_centavos || 0)}</Numero>
                        <span className="text-[14px] text-[#A7A7A7]">/{p.intervalo === "YEARLY" ? "ano" : "mês"}</span>
                      </div>
                    </div>

                    <div className="h-px bg-[#333]" />

                    <div className="flex flex-col gap-2.5 text-[14px]">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[#A7A7A7]">Ferramentas</span>
                        <span className="text-[#F9F9F9]">{p.capacidades?.length || 0}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[#A7A7A7]">Código do produto</span>
                        <span style={{ fontFamily: MONO, fontSize: 12 }} className="text-[#F9F9F9]">
                          {p.product_id}
                        </span>
                      </div>
                      {linhas.length ? (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {linhas.map(([nome, valor]) => (
                            <span
                              key={nome}
                              className="rounded-full border border-[#333] px-2.5 py-1 text-[12px] text-[#A7A7A7]"
                            >
                              {valor} {nome}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-auto flex gap-2">
                      <a
                        href="/admin/planos"
                        className="inline-flex h-11 flex-1 items-center justify-center rounded-[14px] border border-[#333] text-[14px] text-[#F9F9F9]"
                      >
                        Editar
                      </a>
                      <a
                        href="/admin/planos"
                        className="grid h-11 w-11 place-items-center rounded-[14px] border border-[#333] text-[#A7A7A7]"
                        aria-label={`Abrir ${p.nome}`}
                      >
                        ⋯
                      </a>
                    </div>
                  </Painel>
                );
              })}

              <a
                href="/admin/planos"
                className="flex flex-col items-center justify-center gap-2 rounded-[24px] border border-dashed border-[#333] p-7 text-center transition hover:border-[#646464]"
              >
                <span className="text-[16px] font-medium text-[#F9F9F9]">Monte um plano do zero</span>
                <span className="max-w-[240px] text-[14px] text-[#A7A7A7]">
                  Escolha as ferramentas, defina o preço e salve. Ele vale nos produtos na hora.
                </span>
              </a>
            </div>
          )}

          <p className="m-0" style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", color: "#A7A7A7" }}>
            MUDANÇA DE PREÇO PEDE CONFIRMAÇÃO NO E-MAIL AUTORIZADO
          </p>
      </div>
    </Shell>
  );
}