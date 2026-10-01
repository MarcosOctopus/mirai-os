"use client";

import { useEffect } from "react";

// Auto-atualização do app.
//
// Problema real (30/09): o dono abriu o app no celular, eu publiquei a correção,
// e ele continuou vendo a versão quebrada — porque o JavaScript que já está
// rodando na aba NÃO muda quando o servidor muda. Só recarregando. Ele não tem
// como adivinhar isso, e no celular (PWA instalado) forçar recarga é chato.
//
// Solução: o layout grava o build em `<meta name="x-build">`; aqui eu comparo
// com o build que o servidor informa em `/version` e recarrego se divergir.
//
// Travas: no máximo 3 recargas por aba (sessionStorage) — se algo der errado, não
// vira loop; e só recarrego com a tela visível, para não atrapalhar quem está
// digitando.
export default function AtualizadorAutomatico() {
  useEffect(() => {
    const meu = document
      .querySelector('meta[name="x-build"]')
      ?.getAttribute("content");
    if (!meu) return;

    let parado = false;

    async function checar() {
      if (parado || !meu) return;
      try {
        const r = await fetch("/version", { cache: "no-store" });
        if (!r.ok) return;
        const { build } = (await r.json()) as { build?: string };
        if (!build) return;

        if (build === meu) {
          // estamos no build atual: zera o contador de recargas desta aba
          sessionStorage.removeItem("mirai-recargas");
          return;
        }

        const recargas = Number(sessionStorage.getItem("mirai-recargas") ?? "0");
        if (recargas >= 3) return; // trava anti-loop
        if (document.visibilityState !== "visible") return; // tenta no próximo ciclo

        sessionStorage.setItem("mirai-recargas", String(recargas + 1));
        parado = true;
        window.location.reload();
      } catch {
        // rede/adblock: sem versão do servidor, segue como está
      }
    }

    // usado pelos testes (e por diagnóstico manual no console)
    (window as unknown as Record<string, unknown>).__miraiConfereVersao = checar;

    void checar();
    const timer = window.setInterval(() => void checar(), 60000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
