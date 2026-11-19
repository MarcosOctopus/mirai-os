"use client";

import { useEffect, useState } from "react";

/**
 * SELETOR DE ESCOPO — o mesmo "de quem é este dado" em todas as telas.
 *
 * Regra do dono (18/11/2026): o modelo unificado tem UMA chave (`pessoal-<id>`
 * ou o slug da organização) e ela vale igual em todas as ferramentas do MIRAI
 * OS. Este seletor grava a chave no cookie `mirai_escopo`; quem decide se a
 * pessoa PODE usar aquele escopo é o servidor (`resolverEscopo`), não a tela.
 *
 * Só aparece quando a pessoa tem MAIS DE UM escopo — quem tem só o pessoal não
 * vê escolha nenhuma (o padrão do produto é o espaço pessoal).
 */
type EscopoUI = { id: string; tipo: "pessoal" | "organizacao" | "tudo"; nome: string };

export default function SeletorEscopo() {
  const [escopos, setEscopos] = useState<EscopoUI[]>([]);
  const [ativo, setAtivo] = useState("");

  useEffect(() => {
    let vivo = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vivo || !d?.user) return;
        setEscopos(Array.isArray(d.user.escopos) ? (d.user.escopos as EscopoUI[]) : []);
        setAtivo(String(d.user.escopoAtivo?.id || ""));
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  if (escopos.length < 2) return null;

  function trocar(id: string) {
    if (!id || id === ativo) return;
    // O cookie é só a CHAVE do espaço (não é segredo) e o servidor revalida
    // contra os escopos desta conta. Recarregar garante que TODA tela releia.
    document.cookie = `mirai_escopo=${encodeURIComponent(id)}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
    window.location.reload();
  }

  return (
    <div className="px-3 pb-2 pt-1">
      <p className="mb-1.5 px-1 text-[10px] uppercase tracking-[0.16em] text-dash-muted">espaço</p>
      <div className="flex flex-col gap-1">
        {escopos.map((e) => {
          const ligado = e.id === ativo;
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => trocar(e.id)}
              title={e.tipo === "organizacao" ? "acervo da organização" : "seu espaço pessoal"}
              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] transition-colors ${
                ligado
                  ? "bg-dash-hair/[0.10] text-dash-fg"
                  : "text-dash-muted hover:bg-dash-hair/[0.06] hover:text-dash-fg"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  ligado ? "bg-[#ff7a2f]" : "bg-dash-hair"
                }`}
              />
              <span className="min-w-0 flex-1 truncate">
                {e.tipo === "organizacao" ? e.nome : e.tipo === "tudo" ? "Tudo (pessoal + organizações)" : "Meu espaço"}
              </span>
              {e.tipo === "organizacao" ? (
                <span className="shrink-0 text-[9.5px] uppercase tracking-[0.12em] text-dash-muted">empresa</span>
              ) : e.tipo === "tudo" ? (
                <span className="shrink-0 text-[9.5px] uppercase tracking-[0.12em] text-dash-muted">leitura</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}