"use client";

/**
 * LEVA QUEM NÃO TEM PLANO PARA A PÁGINA DE PLANOS.
 *
 * Dono, 24/11/2026: *"todos os planos o cara só consiga usar qualquer coisa
 * depois que ele pagar"*. A trava de verdade é do SERVIDOR (a porteira em
 * `@/lib/acesso-plano`, usada pelo chat e pelas rotas de uso). Isto aqui é a
 * cortesia: em vez de a pessoa bater num 402 no meio de uma conversa, ela é
 * levada à porta de compra e entende o que aconteceu.
 *
 * Roda uma vez por abertura de tela, sem laço: `/planos` não passa pelo Shell,
 * então não há como voltar para cá em círculo. Falha de rede NÃO arrasta
 * ninguém (a pessoa fica onde está e o servidor decide).
 */
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

export default function GuardaDePlano({ ativo = true }: { ativo?: boolean }) {
  const router = useRouter();
  const caminho = usePathname();

  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    void (async () => {
      try {
        const r = await fetch("/api/acesso", { cache: "no-store" });
        if (!r.ok) return; // sem sessão: quem cuida é o middleware
        const d = (await r.json()) as { pode?: boolean };
        if (vivo && d?.pode === false) router.replace("/planos");
      } catch {
        /* plano de controle/rede fora: o servidor decide; não mexo na tela */
      }
    })();
    return () => {
      vivo = false;
    };
  }, [ativo, caminho, router]);

  return null;
}
