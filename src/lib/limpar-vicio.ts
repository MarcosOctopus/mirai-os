/**
 * O filtro de saída: tira o vício de escrita da IA antes de chegar na tela.
 *
 * Por que filtro e não pedido no prompt: pedir "não use travessão" no system
 * prompt falha de vez em quando, e o defeito volta. Filtro não volta. Esta peça
 * roda no texto que sai do modelo, seja resposta de chat, título, resumo ou
 * legenda — o mesmo vício não pode escapar por outra porta.
 *
 * Regra desta peça: **só pontuação e espaçamento**. Nada de reescrever frase,
 * trocar palavra ou "melhorar" o sentido. Se a limpeza exigisse escolher
 * palavras, ela sairia daqui e viraria outra coisa.
 *
 * O que ela corrige:
 *   • travessão (— e –) usado como pausa: vira vírgula, ou dois-pontos quando
 *     abre linha (o traço de diálogo);
 *   • reticências unicode (…) viram três pontos;
 *   • aspas curvas viram retas;
 *   • espaço antes de pontuação, espaço duplo e espaço no fim de linha;
 *   • linha que é só pontuação solta (ponto perdido de streaming).
 */

const TRAVESSAO = /[\u2014\u2013]/g;
const RETICENCIAS = /\u2026/g;
const ASPAS_CURVAS = /[\u201C\u201D\u2018\u2019]/g;

/** A limpeza vale por trecho: o texto pode chegar quebrado em vários pedaços. */
export function limparVicio(texto: string): string {
  if (!texto) return texto;

  let t = texto;

  // Travessão no começo da linha é diálogo: sai o traço, fica o texto.
  t = t.replace(/^[ \t]*[\u2014\u2013]+[ \t]*/gm, "");

  // Travessão no meio da frase é pausa: vira vírgula (sem duplicar a que já existe).
  t = t.replace(/[ \t]*[\u2014\u2013]+[ \t]*/g, ", ");

  t = t.replace(RETICENCIAS, "...");
  t = t.replace(ASPAS_CURVAS, '"');

  // Espaço antes de pontuação e sobras de espaço.
  t = t.replace(/[ \t]+([,.;:!?])/g, "$1");
  // Vírgula colada na palavra seguinte ganha espaço — mas NUNCA no meio de um
  // número: "5,00" é decimal e viraria "5, 00" (erro que já apareceu no teste).
  t = t.replace(/(?<!\d)([,;:])(?=[^\d\s])/g, "$1 ");
  t = t.replace(/ {2,}/g, " ");
  t = t.replace(/[ \t]+$/gm, "");

  // Linha que ficou só com pontuação solta (acontece em fim de stream).
  t = t.replace(/^\s*[,;:]+\s*$/gm, "");

  return t;
}

/**
 * O mesmo, para o dia em que a limpeza precisar ver o texto inteiro (não só o
 * pedaço). A regra continua a mesma: pontuação, nunca sentido.
 */
export function limparVicioDeTextoInteiro(texto: string): string {
  return limparVicio(texto).replace(/\n{3,}/g, "\n\n");
}

export const REGRAS_DO_FILTRO = ["travessao", "reticencias", "aspas", "espacos"] as const;
