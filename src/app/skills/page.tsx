import { redirect } from "next/navigation";

/*
 * /skills — a página do MENU ESQUERDO foi RETIRADA (08/10/2026).
 *
 * Pedido do dono, na letra: "Essa página do menu esquerdo chamada skill tem que
 * sumir. Só existir da Synapse junto com essa do botão de explorar todas as
 * skills."
 *
 * A vitrine de skills passa a viver em DOIS lugares, e só dois:
 *   • a aba SKILLS da Synapse (/dashboard/connect) — o painel do dia a dia;
 *   • a grade completa (/dashboard/skills) — destino do "Ver todas as skills".
 *
 * Esta rota não é apagada, é REDIRECIONADA: link antigo, favorito ou histórico
 * caem na aba certa em vez de dar 404. O menu não aponta mais para cá.
 */
export default function SkillsPage() {
  redirect("/dashboard/connect?aba=skills");
}
