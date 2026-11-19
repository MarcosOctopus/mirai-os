"use client";

import { useEffect, useState } from "react";

/**
 * PILLS DE ESCOPO — "ver tudo" no acervo (dono, 18/11/2026).
 *
 * Pedido, literal: *"consegue um seletor também aí pra mostrar isso? porque
 * quero ver tudo, tanto só eu quanto organizações, ou eles sós."*
 *
 * É a mesma escolha do menu da conta, só que aqui na estante, onde ela é óbvia:
 *   Tudo (pessoal + organizações) · Só eu · <nome da organização>
 *
 * Grava a chave no cookie `mirai_escopo` — que o SERVIDOR revalida contra os
 * escopos da conta (`resolverEscopo`) — e recarrega. Em "tudo" a tela é só
 * leitura: criar/mover/apagar exige escolher um espaço.
 */
type EscopoUI = { id: string; tipo: "pessoal" | "organizacao" | "tudo"; nome: string };

export default function PillsEscopo({ atual }: { atual?: string }) {
  const [escopos, setEscopos] = useState<EscopoUI[]>([]);
  const [ativo, setAtivo] = useState(atual || "");

  useEffect(() => {
    let vivo = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vivo || !d?.user) return;
        const lista = Array.isArray(d.user.escopos) ? (d.user.escopos as EscopoUI[]) : [];
        // a tela só ganha valor quando existe mais de um espaço de verdade
        setEscopos(lista.filter((e) => e.tipo !== "tudo").length >= 2 ? lista : []);
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
    document.cookie = `mirai_escopo=${encodeURIComponent(id)}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
    window.location.reload();
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {escopos.map((e) => {
        const ligado = e.id === ativo;
        const rotulo =
          e.tipo === "tudo" ? "Tudo" : e.tipo === "pessoal" ? "Só eu" : e.nome;
        return (
          <button
            key={e.id}
            type="button"
            onClick={() => trocar(e.id)}
            title={
              e.tipo === "tudo"
                ? "pessoal + organizações na mesma estante (só leitura)"
                : e.tipo === "pessoal"
                  ? "só o seu espaço pessoal"
                  : `só ${e.nome}`
            }
            className={`rounded-full px-2.5 py-[4px] text-[11px] transition-colors ${
              ligado
                ? "bg-dash-brand/[0.16] text-dash-brandHi"
                : "bg-dash-hair/[0.08] text-dash-fg/60 hover:bg-dash-hair/[0.14] hover:text-dash-fg"
            }`}
          >
            {rotulo}
          </button>
        );
      })}
    </div>
  );
}