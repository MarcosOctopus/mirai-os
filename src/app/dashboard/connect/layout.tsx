/* Segmento /dashboard/connect — renderização SEMPRE dinâmica.
 *
 * Sem isto, a Next.js PRÉ-RENDERIZA a casca desta página no build e a serve com
 * `Cache-Control: s-maxage=31536000` (um ANO, para cache compartilhado) e
 * `x-nextjs-cache: HIT`. Foi assim que a tela continuou "aparecendo" com o
 * estado velho depois de um build novo: um cache intermediário ou o próprio
 * navegador segue entregando a casca ANTIGA, que aponta para chunks já
 * substituídos. Esta página é POR CONTA e só faz sentido dinamicamente —
 * renderizar a cada requisição garante que a casca servida é sempre a do build
 * atual e que nenhum cache longo guarda uma tela contraditória.
 */
export const dynamic = "force-dynamic";

import type { ReactNode } from "react";

export default function ConnectLayout({ children }: { children: ReactNode }) {
  return children;
}
