/**
 * OS TRÊS MODOS DO CHAT.
 *
 * ─── O que o dono pediu (14/10/2026, verbatim) ───────────────────────────────
 *
 *   "Queria o Modo Leve que é um pensamento mais rápido, outro de pesquisa que
 *    usa o observador e o de pesquisa profunda que é o Sr. Xi... um dropdown com
 *    icone... Ali do lado do icone de microfone de dictar no chat. Sempre deixa
 *    a base como leve de inicio. Se o cliente quiser ir aumentando no chat com
 *    chamado 'busque mais a fundo, quero saber tudo...' vc troca automatico."
 *
 * ─── A régua que organiza os três ────────────────────────────────────────────
 *
 * O que separa um modo do outro não é "qualidade" — é O QUE ELE FAZ COM A
 * PERGUNTA:
 *
 *   LEVE       pensa e responde com o que já sabe. Não sai de casa.
 *   OBSERVADOR sai e varre as fontes curadas (Hacker News, Google News,
 *              Techmeme, GitHub) — "o que está acontecendo sobre isto".
 *   PROFUNDO   sai, insiste em rodadas, ABRE as páginas e sintetiza um
 *              dossiê — "quero entender isto de verdade".
 *
 * A BASE É LEVE. Sempre. Quem não escolhe nada não paga tempo por nada: a
 * resposta rápida é o padrão, e a profundidade é um pedido — não um imposto.
 *
 * ─── A escalada automática ───────────────────────────────────────────────────
 *
 * Pedir "busque mais a fundo, quero saber tudo" no meio da conversa TEM de
 * subir o modo — senão o cliente teria de saber que existe um dropdown. O
 * gatilho é no TEXTO da mensagem, e sobe UM degrau (ou direto ao topo, quando o
 * pedido é explicitamente de profundidade). Nunca desce sozinho: rebaixar a
 * pesquisa de quem pediu profundidade seria desobedecer.
 */

export type ModoId = "leve" | "observador" | "profundo";

export type Modo = {
  id: ModoId;
  rotulo: string;
  /** Uma linha, para o dropdown. Diz o que ele FAZ, não como se chama. */
  resumo: string;
  /** O que acontece quando o cliente escolhe — em linguagem de quem usa. */
  detalhe: string;
  /** O degrau: 0 leve, 1 observador, 2 profundo. É o que a escalada usa. */
  degrau: number;
};

export const MODOS: Modo[] = [
  {
    id: "leve",
    rotulo: "Leve",
    resumo: "Resposta rápida, sem sair para a web",
    detalhe: "A Mirai responde com o que já sabe. É o mais rápido — use para o dia a dia.",
    degrau: 0,
  },
  {
    id: "observador",
    rotulo: "Observador",
    resumo: "Varre as fontes e traz o que saiu agora",
    detalhe:
      "A Mirai consulta Hacker News, Google News, Techmeme e GitHub na hora e volta com o que está acontecendo, com data e link.",
    degrau: 1,
  },
  {
    id: "profundo",
    rotulo: "Sr. Xi (Profundo)",
    resumo: "Investiga em rodadas e monta um dossiê",
    detalhe:
      "O Sr. Xi pergunta por vários ângulos, abre as páginas e cruza as fontes. Leva mais tempo e entrega um relatório com as referências.",
    degrau: 2,
  },
];

export const MODO_PADRAO: ModoId = "leve";

export function modoPorId(id: string | undefined | null): Modo {
  return MODOS.find((m) => m.id === id) ?? MODOS[0];
}

/** O texto pede que a Mirai SAIA e busque (mas não necessariamente fundo). */
const PEDE_BUSCA: RegExp[] = [
  /\b(bus[qc]ue|buscar|pesquis[ea]|pesquisar|procur[ea]|procure|procura)\b/i,
  /\b(na internet|na web|no google|online|d[êe] uma olhada)\b/i,
  /\b(not[íi]cias?|manchetes?|o que est[áa] acontecendo|novidades|aconteceu)\b/i,
  /\b(me atualiz[ea]|atualizado|de hoje|recente|recentes|[úu]ltim[oa]s?)\b/i,
  /\b(fontes?|refer[êe]ncias?|com link|com links)\b/i,
  // O modo pelo NOME — o seletor saiu da tela, então chamar pelo nome é a porta.
  /\b(observador|modo observador|usa[r]? o observador|chama[r]? o observador|com o observador)\b/i,
];

/** O texto pede PROFUNDIDADE — o pedido explícito do dono mora aqui. */
const PEDE_PROFUNDO: RegExp[] = [
  /\b(mais a fundo|a fundo|profund[ao]|profundidade|aprofunda\w*|dossi[êe])\b/i,
  /\b(quero saber tudo|tudo sobre|tudo o que|saber tudo|complet[oa]|exaustiv[ao])\b/i,
  /\b(investig\w+|investiga[çc][ãa]o|relat[óo]rio completo|an[áa]lise profunda)\b/i,
  /\b(n[ãa]o deixa nada de fora|o m[áa]ximo que|bem detalhad[oa])\b/i,
  // O modo pelo NOME (Sr. Xi) — mesma razão de cima.
  /\b(sr\.?\s*xi|seu xi|modo profundo|usa[r]? o sr\.?\s*xi|chama[r]? o sr\.?\s*xi|com o sr\.?\s*xi)\b/i,
];

export type Escalada = {
  /** O modo que de fato vai rodar. */
  modo: ModoId;
  /** O modo que o cliente tinha escolhido no dropdown. */
  escolhido: ModoId;
  /** Subiu sozinho por causa do texto? */
  escalou: boolean;
  /** Qual regra disparou — para o chat poder dizer "subi o modo, porque...". */
  porque?: string;
};

/**
 * Decide o modo de UMA mensagem: o escolhido no dropdown, ou o degrau acima
 * quando o próprio texto pede. Só sobe — nunca desce.
 */
export function modoDaMensagem(escolhido: string | undefined | null, texto: string): Escalada {
  const base = modoPorId(escolhido);
  const t = (texto || "").slice(0, 600);

  const pedeProfundo = PEDE_PROFUNDO.find((r) => r.test(t));
  if (pedeProfundo && base.degrau < 2) {
    return {
      modo: "profundo",
      escolhido: base.id,
      escalou: true,
      porque: "o seu pedido foi de profundidade",
    };
  }

  const pedeBusca = PEDE_BUSCA.find((r) => r.test(t));
  if (pedeBusca && base.degrau < 1) {
    return { modo: "observador", escolhido: base.id, escalou: true, porque: "o seu pedido foi de busca" };
  }

  return { modo: base.id, escolhido: base.id, escalou: false };
}

/**
 * O que o modelo precisa saber para se comportar no modo.
 *
 * Vai no prompt do sistema. Cada modo diz o que PODE afirmar e o que NÃO pode —
 * porque o risco real não é responder pouco: é o modo leve dar a impressão de
 * ter pesquisado, e o profundo tratar "não achei" como "não existe".
 */
export function regraDoModo(modo: ModoId): string {
  switch (modo) {
    case "observador":
      return [
        "MODO OBSERVADOR — você tem fontes ao vivo.",
        "· Antes de responder, CHAME `fontes_curadas` com o tema. É obrigatório: neste modo a resposta vem do que as fontes trouxeram agora.",
        "· Se precisar de mais, `buscar_na_web` e `ler_pagina` também estão disponíveis.",
        "· Cite SEMPRE a fonte e a data de cada achado (ex.: \"Techmeme, 14/10\").",
        "· Se uma fonte não respondeu, diga qual — não esconda o buraco.",
        "· NUNCA invente título, número ou data: se não veio da ferramenta, não existe.",
      ].join("\n");
    case "profundo":
      return [
        "MODO PROFUNDO (Sr. Xi) — você investiga em rodadas.",
        "· CHAME `pesquisar_a_fundo` com o tema. Ela pergunta por vários ângulos, abre as páginas e devolve um dossiê.",
        "· Se o tema tiver lados distintos, chame mais de uma vez (ex.: o mercado e a tecnologia; o custo e o risco).",
        "· Entregue um RELATÓRIO: o que foi apurado, os números com a fonte, o que é divergente entre as fontes, e o que NÃO foi possível confirmar.",
        "· Toda afirmação carrega a referência (link). Sem link, é opinião — e você diz que é.",
        "· Se a pesquisa não achou, diga o que tentou e o que faltou. \"Não encontrei\" é uma resposta legítima; inventar não é.",
      ].join("\n");
    default:
      return [
        "MODO LEVE — resposta rápida.",
        "· Responda com o que você já sabe. NÃO chame ferramentas de busca neste modo.",
        "· Se a resposta depender de algo atual (notícia, preço, versão, \"hoje\"), diga que precisa buscar e ofereça o modo Observador ou Profundo — não chute.",
      ].join("\n");
  }
}
