"use client";

// Projetos — o que está sendo construído, em que pé está e o que já foi entregue.
// Ainda não existe: a tela diz isso com clareza, sem inventar projeto nenhum.
import { useEffect, useState } from "react";
import Shell from "@/components/dash/Shell";
import EmConstrucao from "@/components/dash/EmConstrucao";

type Conta = { nome?: string; email?: string; ehDono?: boolean };

export default function ProjetosPage() {
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
    <Shell titulo="Projetos" usuario={conta}>
      <EmConstrucao
        oQueE="Os seus projetos vão morar aqui: cada um com o que é, em que pé está e o que já foi entregue."
        vaiTer={[
          "a lista dos projetos, com dono e estado",
          "o que está andando e o que está parado",
          "as entregas e o histórico de cada projeto",
        ]}
        nota="Nada aqui é dado de exemplo: a página só entra no ar quando os projetos de verdade estiverem ligados."
      />
    </Shell>
  );
}
