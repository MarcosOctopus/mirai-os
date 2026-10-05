"use client";

// Tela principal do produto (Orb) — agora DENTRO da casca do padrão.
//
// O Orb em si é o componente `MiraiApp` (tela cheia, wake-word "Hey Mirai",
// microfone). Ele não mudou: o que mudou é onde ele vive. Antes ele ocupava o
// navegador inteiro, sem sidebar e sem topbar — e por isso parecia outro
// produto. Agora ele entra como CONTEÚDO, igual ao Chat: casca do padrão em
// volta, Orb no meio. A experiência de voz continua a mesma.
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import Shell from "@/components/dash/Shell";

const MiraiApp = dynamic(() => import("./MiraiApp"), { ssr: false });

type Conta = { nome?: string; email?: string; ehDono?: boolean };

export default function Page() {
  const [conta, setConta] = useState<Conta | null>(null);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) =>
        d?.user &&
        setConta({
          nome: d.user.name,
          email: d.user.email,
          ehDono: Boolean(d.user.ehDono),
        }),
      )
      .catch(() => {
        /* sem conta: o Orb continua, só o menu de dono não aparece */
      });
  }, []);

  return (
    <Shell titulo="Orb" usuario={conta} recolhidaInicial cheio>
      {/* tela cheia: sem caixa e sem margem nas laterais; altura explícita do miolo */}
      <div className="-mx-5 -mb-5 h-[calc(100dvh-100px)] min-h-[420px] overflow-hidden bg-dash-bg sm:-mx-8 lg:-mx-[44px]">
        <MiraiApp />
      </div>
    </Shell>
  );
}
