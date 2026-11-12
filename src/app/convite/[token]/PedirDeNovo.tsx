"use client";

/**
 * "PEDIR NOVO LINK" — o botão da tela de convite morto.
 *
 * A tela já dizia "peça um novo link a quem compartilhou" e não havia como pedir.
 * Aqui o gesto existe: um clique avisa o dono da pasta (o pedido aparece no painel
 * de compartilhar dele, com o e-mail de quem pediu) — e a pessoa vê que o pedido
 * saiu, em vez de ficar no escuro.
 */
import { useState } from "react";

export function PedirDeNovo({ token, pasta }: { token: string; pasta?: string }) {
  const [estado, setEstado] = useState<"parado" | "indo" | "feito" | "erro">("parado");
  const [recado, setRecado] = useState<string | null>(null);

  const pedir = async () => {
    setEstado("indo");
    setRecado(null);
    try {
      const r = await fetch("/api/convite/pedido", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, pasta: pasta || "" }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setEstado("erro");
        setRecado(String(d?.error || "não deu agora — tente de novo"));
        return;
      }
      setEstado("feito");
      setRecado("pedido enviado: quem compartilhou vai ver que você quer um link novo.");
    } catch {
      setEstado("erro");
      setRecado("não deu agora — tente de novo");
    }
  };

  return (
    <div className="mt-5 flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => void pedir()}
        disabled={estado === "indo" || estado === "feito"}
        data-convite-pedir="sim"
        className={
          "inline-flex items-center rounded-[10px] bg-dash-brand px-5 py-2.5 text-[12px] font-semibold text-white transition " +
          (estado === "feito" ? "cursor-default opacity-70" : "hover:bg-dash-brandHi")
        }
      >
        {estado === "indo" ? "enviando…" : estado === "feito" ? "pedido enviado" : "pedir novo link"}
      </button>
      {recado && (
        <p
          data-convite-recado={estado}
          className={
            "max-w-[46ch] text-center text-[11.5px] leading-snug " +
            (estado === "erro" ? "text-dash-bad" : "text-dash-muted")
          }
        >
          {recado}
        </p>
      )}
    </div>
  );
}
