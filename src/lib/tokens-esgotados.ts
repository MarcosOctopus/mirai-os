/**
 * A FRANQUIA DE TOKENS ACABOU — o recado, em língua de gente.
 *
 * POR QUE ESTE ARQUIVO EXISTE (dono, 27/11/2026): quando a conta estourava o
 * teto do mês, quem estava no chat via **"Não consegui falar com a Mirai agora
 * (402). Tenta de novo."** — status HTTP na cara do cliente, e "tenta de novo"
 * era conselho errado: tentar de novo nunca resolve, o mês é que virou.
 *
 * A regra da casa: erro cru de servidor na cara do cliente, nunca. O que a
 * pessoa precisa saber é (1) o que aconteceu, com o NÚMERO (usado de teto);
 * (2) que o ACESSO dela continua; (3) o que ela pode fazer agora — subir de
 * plano ou cadastrar a própria chave de IA.
 *
 * Módulo PURO de propósito: o mesmo texto e o mesmo marcador são usados pelo
 * servidor (a rota do chat) e pela tela (o bloco na conversa). Sem importar
 * banco nem `fetch` aqui — assim o componente de cliente pode usar sem arrastar
 * o servidor junto.
 */

/** Marcador que a conversa reconhece (mesmo padrão do `[[arquivo:...]]`).
 *  Formato: `[[limite:tokens|<usado>|<teto>]]`; sem números quando o medidor
 *  não respondeu: `[[limite:tokens]]`. */
export const MARCADOR_LIMITE = "[[limite:tokens";

/** `[[limite:tokens|1250000|1000000]]` — ou só o marcador, sem números. */
export function marcadorDeTokensEsgotados(usado: number | null, teto: number | null): string {
  if (usado !== null && teto !== null) return `[[limite:tokens|${usado}|${teto}]]`;
  return "[[limite:tokens]]";
}

/** Regex do marcador, para quem separa o texto da conversa em partes. */
export const RE_MARCADOR_LIMITE = /(\[\[limite:tokens(?:\|\d+\|\d+)?\]\])/i;

/** `1250000` -> `1.250.000` (o número do jeito que a pessoa lê). */
export function numeroHumano(n: number): string {
  try {
    return new Intl.NumberFormat("pt-BR").format(Math.max(0, Math.trunc(n)));
  } catch {
    return String(n);
  }
}

export const TITULO_TOKENS_ESGOTADOS = "Os tokens de IA do seu plano neste mês acabaram";

/**
 * O recado completo, em parágrafos separados por linha em branco.
 *
 * Sem número quando o medidor não respondeu: dizer "você usou X de Y" com um
 * número inventado seria mentira; o resto do recado continua verdadeiro.
 */
export function mensagemDeTokensEsgotados(usado: number | null, teto: number | null): string {
  const comNumero = usado !== null && teto !== null;
  const situacao = comNumero
    ? `Você usou ${numeroHumano(usado)} dos ${numeroHumano(teto)} tokens de IA incluídos no seu plano neste mês. Por isso a Mirai não responde agora — não é falha e não é bloqueio da sua conta.`
    : "A franquia de IA do seu plano para este mês terminou. Por isso a Mirai não responde agora — não é falha e não é bloqueio da sua conta.";

  return [
    situacao,
    "Seu acesso ao MIRAI OS continua normal: você entra, abre as telas, vê seu acervo, seus projetos e seu CRM. O que fica pausado é só a resposta da IA, até o contador virar no dia 1º.",
    "Para voltar a usar a IA agora, você tem dois caminhos:\n- subir de plano em /planos\n- ou cadastrar a sua própria chave de IA em /dashboard/chaves",
  ].join("\n\n");
}
