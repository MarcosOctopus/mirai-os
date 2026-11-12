import { redirect } from "next/navigation";

/**
 * /dashboard/acervo → /dashboard/arca (10/11/2026).
 *
 * O nome é A ARCA, não "o acervo" (palavra do dono). O endereço antigo continua
 * existindo como porta: quem tem o link salvo ou um atalho no celular não cai em
 * 404 — chega na Arca. Rota interna e API continuam em /api/acervo (nome técnico,
 * invisível para quem usa).
 */
export default function AcervoAntigo() {
  redirect("/dashboard/arca");
}
