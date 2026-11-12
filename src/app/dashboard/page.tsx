// ── DASHBOARD — a PÁGINA PRINCIPAL do painel (casca de servidor) ─────────────
// Pedido do dono (11/11/2026): a página de Integrações vira o Dashboard, como
// CÓPIA — porque a página de Integração vai ser mexida e a principal não pode
// mudar junto. A tela vive em ./DashboardCliente.tsx (cópia de connect/page.tsx)
// e este arquivo é só a casca da rota.
//
// POR QUE CASCA DE SERVIDOR: a rota era um componente de cliente puro e o HTML
// dela estava vindo do cache com os JS de outro build — os botões das três abas
// apareciam na tela mas SEM o `onClick` do React (medido: sem props de React no
// elemento; no `/dashboard/connect` a mesma peça respondia). `force-dynamic` +
// `revalidate = 0` fazem esta rota responder `no-store`, que é a cura que este
// app já usou na casca do Cosmic Agent.
import DashboardCliente from "./DashboardCliente";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function Page() {
  return <DashboardCliente />;
}
