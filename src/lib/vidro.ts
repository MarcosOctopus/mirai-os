/* O VIDRO do MIRAI OS — a fonte ÚNICA do "glass" da interface.
 *
 * Este é exatamente o vidro do login (/login): desfoque forte + saturação +
 * véu claro translúcido + aresta viva (o vidro do iOS novo). O painel do
 * formulário em /login usa este objeto; o popup do produto em
 * /dashboard/connect usa O MESMO — não existe um segundo vidro parecido.
 *
 * Módulo puro (sem "use client"): serve para qualquer tela.
 */

import type { CSSProperties } from "react";

export const VIDRO: CSSProperties = {
  background:
    "linear-gradient(165deg, rgba(255,255,255,0.20) 0%, rgba(255,255,255,0.11) 30%, rgba(255,255,255,0.07) 62%, rgba(255,255,255,0.10) 100%)",
  backdropFilter: "blur(42px) saturate(185%)",
  WebkitBackdropFilter: "blur(42px) saturate(185%)",
  boxShadow:
    "inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(255,255,255,0.10), inset 0 0 0 1px rgba(255,255,255,0.10), 0 24px 70px rgba(0,0,0,0.40)",
};
