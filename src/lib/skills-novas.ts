/*
 * SKILLS NOVAS — a CURADORIA do dono (regra FINAL, 08/10/2026).
 *
 *   "Vai sair todas as skills base da Mirai de lá. Isso aí a gente deixa
 *    escondido. ... não vai ficar vazio se você tá procurando novas skills pra
 *    colocar no lugar. Só vai desaparecer do painel ali as skills que são a base
 *    da Mirai."
 *
 * MECANISMO (o mais limpo): uma LISTA DE CURADORIA de skills VISÍVEIS. O
 * catálogo do lado Skills da Synapse (/dashboard/connect) lista SÓ as skills
 * cujo `nome` (o `id` real, o mesmo do SKILL.md) está em SKILLS_NOVAS. As skills
 * BASE da Mirai (as ~157 lidas do disco) continuam existindo, carregadas e
 * funcionando por baixo — o assistente usa, o /api/skills/base continua copiando
 * — mas NÃO são exibidas nem achadas pela busca deste painel.
 *
 * HOJE A LISTA ESTÁ VAZIA, de propósito: as skills novas (design / front-end /
 * programação) ainda estão sendo montadas por um operador com o Observador e
 * vão chegar como SKILL.md reais em /opt/data/skills/ com uma MARCA de curadoria
 * (a ser passada pelo dono). Enquanto isso, o estado honesto da seção é VAZIO —
 * com um texto claro em PT-BR ("As novas skills da Mirai aparecem aqui."), sem
 * contagem falsa e sem as 157 fantasma.
 *
 * COMO ACRESCENTAR UMA NOVA (próximos passos):
 *   • Opção A (imedata): acrescente o `nome` da skill ao array SKILLS_NOVAS.
 *   • Opção B (quando a MARCA de curadoria existir): troque o corpo de
 *     `ehSkillNova` por uma checagem da marca no SKILL.md (a skills-lista.ts
 *     precisará expor esse campo). O resto da tela não muda — a contagem, a
 *     busca, a fachada e "Ver todas" se ajustam ao conjunto visível sozinhos.
 *
 * Fora da Synapse (/skills e /explorar) esta lista NÃO é usada: lá as 157 seguem
 * visíveis como sempre (decisão do dono: fica para depois).
 */

/** Nomes (ids reais) das skills NOVAS curadas que devem aparecer na Synapse. */
export const SKILLS_NOVAS: readonly string[] = [
  /* ── A BIBLIOTECA DO ARQUITETO (08/10/2026) ──
     O padrão que o construtor segue ao tirar um app do zero: escopo → arquitetura
     de informação → DADOS primeiro (dono do dado e isolamento por conta) → telas
     com os quatro estados → acabamento. Os SKILL.md vivem em
     /opt/data/skills/arquiteto-craft/<nome>/SKILL.md e trazem a fonte de cada
     regra (a BIBLIOTECA DO ARQUITETO). Acrescentar aqui é o que faz o card
     aparecer neste painel — a base (~157) segue fora, como o dono mandou. */
  "arquiteto-padrao-de-construcao",
  "arquiteto-design-de-interface",
  "arquiteto-frontend-senior",
  "arquiteto-backend-e-dados",
  "arquiteto-bibliotecas-confiaveis",

  /* ── A LEVA DO OBSERVADOR (08/10/2026) ──
     O dono mandou trazer para dentro o que o Observador achou. As skills vieram
     do profile dele (/opt/data/profiles/observador/skills) e agora vivem na
     biblioteca do ecossistema. Só as que AJUDAM entram na vitrine:
     `verificacao-de-credenciais` fica fora por ser operação interna (está em
     src/lib/skills-ocultas.ts) — ela existe, o assistente usa, o cliente não vê. */
  "github-repo-curadoria",
];

/** A skill (pelo nome/id real) faz parte da curadoria visível da Synapse? */
export function ehSkillNova(nome: string): boolean {
  const n = (nome || "").trim().toLowerCase();
  return SKILLS_NOVAS.some((s) => s.trim().toLowerCase() === n);
}
