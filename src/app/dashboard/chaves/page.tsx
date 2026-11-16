// ── CHAVES DE API — casca de servidor ────────────────────────────────────────
// Arquivo minúsculo de propósito: a rota é POR PESSOA (o cofre é o da conta) e
// não pode ser guardada em cache — HTML antigo apontando para chunks de outro
// build quebra a hidratação e os botões ficam mortos no clique (defeito já
// medido em rota cliente-pura). A tela interativa vive em ChavesCliente.tsx.
export const dynamic = "force-dynamic";
export const revalidate = 0;

import ChavesCliente from "./ChavesCliente";

export default function Page() {
  return <ChavesCliente />;
}
