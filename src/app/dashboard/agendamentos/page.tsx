// ── AGENDAMENTOS — casca de servidor ─────────────────────────────────────────
// Arquivo minúsculo de propósito: declara que a rota é POR PESSOA e não pode ser
// guardada em cache (mesma razão da Arca: HTML antigo apontando para chunks de
// outro build quebra a hidratação no navegador). A tela interativa vive em
// AgendamentosCliente.tsx.
export const dynamic = "force-dynamic";
export const revalidate = 0;

import AgendamentosCliente from "./AgendamentosCliente";

export default function Page() {
  return <AgendamentosCliente />;
}
