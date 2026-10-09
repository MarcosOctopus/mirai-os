"use client";

/* TELA DE TETO DO PLANO — entra quando a organização estoura o limite de
 * acessos simultâneos do plano (modelo "faixa de pico",
 * docs/PLANOS-E-CAPACIDADES.md §4.1).
 *
 * Decisão do dono (06/out/2026): no estouro entra ESTA tela, com a logo da Mirai
 * e a frase "Desculpe, você chegou no limite do seu plano." — erro cru de
 * servidor na cara do cliente, nunca.
 *
 * Sem CAIXA (decisão do dono, 06/out/2026, vendo o print): logo, frase e botão
 * direto no fundo escuro. O retângulo com borda dava "cara de IA" e foi removido.
 *
 * Ela é PÚBLICA de propósito (src/middleware.ts -> PUBLIC_PATHS): quem estourou
 * o teto pode estar com sessão estranha, e a tela precisa aparecer de qualquer
 * jeito. O número do teto chega por `?limite=`, e vem do plano de controle —
 * se não vier, cai no padrão 200 e a tela diz isso.
 */

import { useEffect, useState } from "react";

const TETO_PADRAO = 200;

export default function LimitePage() {
  const [limite, setLimite] = useState<number | null>(null);

  useEffect(() => {
    const bruto = new URLSearchParams(window.location.search).get("limite");
    const n = Number(bruto);
    setLimite(Number.isFinite(n) && n > 0 ? n : TETO_PADRAO);
  }, []);

  return (
    <main
      className="grid min-h-[100dvh] place-items-center bg-dash-bg px-6 py-10"
      style={{ fontFamily: "var(--fonte-poppins), Poppins, system-ui, sans-serif" }}
    >
      <div className="w-full max-w-[520px] text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-mirai.png"
          alt="Mirai"
          className="mx-auto h-[26px] w-auto max-w-none object-contain"
        />

        <h1 className="mt-8 text-[19px] font-semibold leading-[1.45] text-white">
          Desculpe, você chegou no limite do seu plano.
        </h1>

        <p className="mt-4 text-[13px] leading-[1.7] text-dash-muted">
          {limite === null ? (
            "…"
          ) : (
            <>
              O seu plano inclui{" "}
              <span className="text-white">{limite} acessos simultâneos</span>. Assim que a
              concorrência baixar, é só tentar de novo.
            </>
          )}
        </p>

        <button
          onClick={() => window.location.reload()}
          className="mt-8 rounded-[10px] bg-dash-brand px-5 py-2.5 text-[13px] font-semibold text-white transition hover:bg-dash-brandHi"
        >
          Tentar de novo
        </button>
      </div>
    </main>
  );
}
