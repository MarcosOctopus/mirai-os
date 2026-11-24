// PROTOCOLO DARK MATTER — montado e DESLIGADO (dono, 24/11/2026):
//   "Faz o protocolo dark matter mas deixa inativo. Guarda só as animações
//    mais pra frente."
//
// O que isso quer dizer na prática: a capacidade está no lugar e pronta, com o
// interruptor em `false`. Nada dispara sozinho, nada muda na tela. Quando o dono
// chamar, é UMA linha para ligar — e as animações da transição já vêm prontas do
// motor do pacote (`MiraiOrb.jsx`): buraco negro, disco brilhante, estrelas
// distorcidas pela gravidade e a lente com a cor do fundo.
//
// COMO LIGAR (quando for a hora):
//   1. Aqui: `PROTOCOLO_ATIVO = true`.
//   2. Onde a fala do usuário vira texto (o transcrito do reconhecimento de voz
//      em `MiraiApp`), chamar:
//          const novo = modoPorTexto(transcrito, modoAtual);
//          if (novo !== modoAtual) setModo(novo);
//   3. Passar o estado até o orb:  <OrbVivo mode={modo} ... />
//      (`OrbVivo` já aceita a prop `mode` e repassa ao motor.)
//
// Ordem importa: `modoPorTexto` checa PRIMEIRO o comando de sair. "Sair do
// protocolo normal" contém "protocolo" e "normal"; se a ordem invertesse, a
// frase de saída poderia ser lida como de entrada. O pacote já traz os dois
// reconhecedores; aqui eles são usados na ordem certa.

import { isDarkMatterCommand, isNormalModeCommand } from "@/components/orb/MiraiOrb";

export type Modo = "normal" | "dark";

/** Interruptor geral. `false` = protocolo montado e inativo. */
export const PROTOCOLO_ATIVO = false;

/** Frases que o motor reconhece hoje (documentadas no LEIAME do pacote):
 *  entrada — "vamos rodar o Dark Matter", "Protocolo Dark Matter", "matéria escura"
 *  saída   — "sair do Dark Matter", "protocolo normal", "voltar ao normal" */
export function modoPorTexto(texto: string, atual: Modo): Modo {
  // O interruptor vem primeiro: com o protocolo inativo, NENHUM texto troca o
  // modo — nem por engano, nem por brincadeira.
  if (!PROTOCOLO_ATIVO) return atual;
  if (isNormalModeCommand(texto)) return "normal";
  if (isDarkMatterCommand(texto)) return "dark";
  return atual;
}
