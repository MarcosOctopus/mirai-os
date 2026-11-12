// ── A ARCA — casca de servidor ────────────────────────────────────────────────
// Arquivo MINÚSCULO de propósito: ele existe só para declarar que esta rota é
// POR PESSOA e não pode ser guardada em cache.
//
// MEDIDO 10/11/2026: a rota vinha com `cache-control: s-maxage=31536000` (um
// ano!). Depois de cada publicação, o HTML guardado aponta para os arquivos JS
// daquele build antigo — o navegador mistura HTML velho com app novo, o cliente
// quebra com "Application error" e o dono fica preso no bundle velho mesmo com a
// correção publicada. Era exatamente o que ele via.
//
// `force-dynamic` + `revalidate = 0` fazem a rota responder `no-store`.
// A tela em si (toda interativa, com 3D e sessão) vive em ArcaCliente.tsx.
export const dynamic = "force-dynamic";
export const revalidate = 0;

import ArcaCliente from "./ArcaCliente";

export default function Page() {
  return <ArcaCliente />;
}
