"use client";

// Botão "copiar" reutilizável (dono, 09/10/2026: o fluxo de domínio tem de
// entregar TUDO pronto — registro, mensagem e link — sem ninguém digitar nada à
// mão). Copia por `navigator.clipboard` e, se o navegador recusar (contexto sem
// permissão), cai no `textarea` + `execCommand` antigo — nunca falha calado.
import { useState } from "react";

export function CopiarTexto({
  texto,
  rotulo = "copiar",
  rotuloCopiado = "copiado!",
  className,
  dataAttr,
}: {
  texto: string;
  rotulo?: string;
  rotuloCopiado?: string;
  className?: string;
  dataAttr?: string;
}) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(texto);
      ok = true;
    } catch {
      try {
        const t = document.createElement("textarea");
        t.value = texto;
        t.style.position = "fixed";
        t.style.opacity = "0";
        document.body.appendChild(t);
        t.select();
        ok = document.execCommand("copy");
        document.body.removeChild(t);
      } catch {
        ok = false;
      }
    }
    setCopiado(ok);
    if (ok) setTimeout(() => setCopiado(false), 2200);
  }

  return (
    <button
      type="button"
      onClick={copiar}
      className={
        className ??
        "shrink-0 rounded-full border border-dash-line px-2.5 py-1 text-[10.5px] font-medium text-dash-muted transition hover:border-dash-accent hover:text-dash-text"
      }
      {...(dataAttr ? { [dataAttr]: "1" } : {})}
    >
      {copiado ? rotuloCopiado : rotulo}
    </button>
  );
}
