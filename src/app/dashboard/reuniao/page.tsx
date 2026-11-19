// ── REUNIÃO — casca de servidor ──────────────────────────────────────────────
// Arquivo minúsculo de propósito: a lista é POR PESSOA (a Arca responde com a org
// do token/sessão) e um HTML guardado em cache apontando para chunks de outro
// build deixa os botões mortos no clique — defeito já medido em rota
// cliente-pura. A tela interativa vive em ReuniaoCliente.tsx.
export const dynamic = "force-dynamic";
export const revalidate = 0;

import ReuniaoCliente from "./ReuniaoCliente";

export default function Page() {
  return <ReuniaoCliente />;
}