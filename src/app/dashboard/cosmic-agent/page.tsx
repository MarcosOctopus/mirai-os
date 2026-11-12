// ── COSMIC AGENT — porta para a aba ─────────────────────────────────────────
// A tela do Cosmic Agent mora na SYNAPSE (`/dashboard/connect?aba=cosmic`), onde
// ela é a PRIMEIRA aba, ao lado de Integrações e Skills — pedido do dono
// (11/11/2026): "deixa junto no synapse… coloca ela em primeiro".
//
// Esta rota continua existindo porque já foi divulgada e link antigo não pode
// morrer: ela só APONTA para a aba, igual `/dashboard/acervo` → `/dashboard/arca`.
// Uma tela, uma implementação — nada de duas grades parecidas divergindo.
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function Page() {
  redirect("/dashboard/connect?aba=cosmic");
}
