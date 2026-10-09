"use client";

// Explorar — o mapa do que a Mirai faz: capacidades, ferramentas e integrações.
// A tela principal diz, honestamente, que o catálogo geral ainda está por vir —
// e, abaixo, mostra o que JÁ dá para ver hoje: as SKILLS reais do ecossistema,
// lidas do disco pelo mesmo componente da aba /skills (SkillsCatalogo). Nada é
// substituído: a área de skills ACRESCENTA ao que já existia aqui.
import { useEffect, useState } from "react";
import Shell from "@/components/dash/Shell";
import EmConstrucao from "@/components/dash/EmConstrucao";
import SkillsCatalogo from "@/components/dash/SkillsCatalogo";

type Conta = { nome?: string; email?: string; ehDono?: boolean };

export default function ExplorarPage() {
  const [conta, setConta] = useState<Conta | null>(null);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) =>
        d?.user && setConta({ nome: d.user.name, email: d.user.email, ehDono: Boolean(d.user.ehDono) }),
      )
      .catch(() => {});
  }, []);

  return (
    <Shell titulo="Explorar" usuario={conta}>
      <EmConstrucao
        oQueE="Explorar é o mapa do que a Mirai faz: as capacidades, as ferramentas e as integrações, num lugar só."
        vaiTer={[
          "o catálogo do que já dá para fazer hoje",
          "as ferramentas e integrações disponíveis",
          "exemplos de uso para começar rápido",
        ]}
        nota="Sem vitrine vazia: cada item só aparece quando a capacidade estiver realmente disponível."
      />

      {/* Já disponível de verdade: as skills do ecossistema (mesmo componente da
          aba /skills). Fica DENTRO de Explorar, sem tirar nada do que havia. */}
      <SkillsCatalogo />
    </Shell>
  );
}
