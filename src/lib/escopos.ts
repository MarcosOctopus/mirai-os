/**
 * ESCOPOS — quem pode ser dono de um dado no MIRAI OS (modelo corrigido pelo
 * dono em 13/11/2026).
 *
 * O MODELO ERRADO (que este arquivo existe para não se repetir):
 *   "cada usuário pertence a uma organização; sem organização, ele cai num
 *    escopo pessoal de fallback".
 * Isso transforma a pessoa em apêndice da empresa, e o escopo pessoal em plano
 * B — o que produz código que trata "sem org" como erro, aviso ou modo
 * limitado. Não é o produto.
 *
 * O MODELO CERTO:
 *   - o USUÁRIO é a entidade primária. Sem organização ele faz TUDO: chat,
 *     email, agendamentos, acervo e chaves. O escopo pessoal é o modo PADRÃO,
 *     nunca um consolo;
 *   - a ORGANIZAÇÃO é uma entidade PARALELA, do mesmo nível — "como se fosse
 *     outro usuário": ela executa coisas e tem dados próprios, e pode
 *     ADICIONAR PESSOAS (membros);
 *   - quem TEM organização passa a ter DOIS escopos: o pessoal e o da
 *     organização. A escolha é DELE, explícita. Nada é substituído por baixo;
 *   - dado gravado sempre declara em qual escopo vive. "Org se existir, senão
 *     pessoal" é justamente o implícito que não se faz mais;
 *   - membro da organização enxerga os dados DA ORGANIZAÇÃO, e os dados
 *     pessoais dele continuam privados (o inverso também vale: o escopo
 *     pessoal de um membro NÃO é lido por outro membro nem pela org).
 *
 * Módulo PURO de propósito: o middleware (Edge) pode importar daqui sem
 * arrastar better-sqlite3.
 */

export type TipoEscopo = "pessoal" | "organizacao";

export type Escopo = {
  tipo: TipoEscopo;
  /**
   * A chave do escopo nos dados: `pessoal-<userId>` ou o slug da organização.
   * É o que vai em `agendas_app.org`, no cofre e em qualquer tabela escopada.
   */
  id: string;
  /** Nome humano ("Meu espaço", o nome da empresa). */
  nome: string;
  /**
   * Só no escopo pessoal: o id do usuário dono. Existe para o cofre pessoal
   * continuar onde sempre esteve (`users.platform_config`), sem migração.
   */
  usuarioId?: number;
};

/** A conta mínima que o escopo precisa — evita dependência circular com orgs. */
export type ContaParaEscopo = {
  id: number;
  nome?: string;
  /** A organização "principal" (hoje é a única que o cadastro vincula). */
  org?: { id: string; nome: string; slug: string } | null;
  /**
   * TODAS as organizações de que a pessoa é membro.
   *
   * Existe porque o modelo pode ter mais de uma: quando isso acontecer, o
   * fluxo continua o mesmo (a org se ativa pelo pedido), e a diferença é que o
   * pedido precisa DIZER qual — se não disser, a resolução volta marcada
   * `ambiguo` e o chat pergunta, em vez de escolher por conta própria.
   */
  orgs?: { id: string; nome: string; slug: string }[] | null;
};

/** Tipo de organização mínima usada nos escopos. */
type OrgMinima = { id: string; nome: string; slug: string };

/**
 * As organizações desta conta, na ordem: a lista completa quando existir,
 * senão a única. Fonte única — `escoposDaConta` e `resolverEscopoDaOperacao`
 * leem daqui, então não há duas respostas possíveis para "de que orgs eu sou".
 */
export function orgsDaConta(conta: ContaParaEscopo): OrgMinima[] {
  const lista = Array.isArray(conta.orgs) ? conta.orgs.filter((o) => o && o.slug) : [];
  if (lista.length) return lista;
  return conta.org?.slug ? [conta.org as OrgMinima] : [];
}

/**
 * O escopo pessoal da pessoa. SEMPRE válido — é derivado só do id do usuário e
 * nunca depende de existir (ou não) organização.
 */
export function escopoPessoal(conta: ContaParaEscopo): Escopo {
  return {
    tipo: "pessoal",
    id: `pessoal-${conta.id}`,
    nome: "Meu espaço",
    usuarioId: conta.id,
  };
}

/**
 * Todos os escopos que esta conta pode usar. O pessoal vem SEMPRE primeiro
 * porque é o padrão do produto; a organização entra como IGUAL, não como
 * substituta.
 */
export function escoposDaConta(conta: ContaParaEscopo): Escopo[] {
  const lista: Escopo[] = [escopoPessoal(conta)];
  for (const org of orgsDaConta(conta)) {
    lista.push({ tipo: "organizacao", id: org.slug, nome: org.nome || org.slug });
  }
  return lista;
}

/**
 * Resolve o escopo PEDIDO pela tela/rota.
 *
 * Aceita: "pessoal", `pessoal-<userId>`, o slug ou o id da organização da
 * própria conta. Qualquer outra coisa — inclusive o slug de uma organização da
 * qual a pessoa não é membro — resolve para o PESSOAL. Escolher o padrão é
 * seguro (é o espaço dela); herdar o escopo de terceiro seria vazamento.
 */
export function resolverEscopo(conta: ContaParaEscopo, pedido?: string | null): Escopo {
  const p = (pedido || "").trim().toLowerCase();
  const pessoal = escopoPessoal(conta);
  if (!p || p === "pessoal" || p === pessoal.id.toLowerCase()) return pessoal;

  const org = orgsDaConta(conta).find(
    (o) => o.slug.toLowerCase() === p || (o.id || "").toLowerCase() === p,
  );
  if (org) return { tipo: "organizacao", id: org.slug, nome: org.nome || org.slug };
  // Pedido inválido/desconhecido: o espaço próprio. Nunca erro, nunca bloqueio
  // — "escopo não reconhecido" não é motivo para impedir a pessoa de trabalhar.
  return pessoal;
}

/* ═══ A RESOLUÇÃO DE ESCOPO DE UMA OPERAÇÃO (definição final, 13/11/2026) ═══
 *
 * A organização NÃO tem tela, perfil nem chat próprio. Ela é um ESCOPO que se
 * ATIVA de duas formas:
 *
 *   1. INVOCAÇÃO EXPLÍCITA — a pessoa diz no pedido ("na Time do Futuro, agenda
 *      X", "pela organização, lê os emails", "da empresa"). Aí a operação roda
 *      no escopo da org.
 *   2. ENTENDIMENTO PELO CONTEXTO — o pedido claramente se refere a algo
 *      coletivo ("manda isso pra equipe", "os emails da empresa"). Aqui o sinal
 *      é lexical e conservador de propósito: na dúvida, o escopo é PESSOAL.
 *
 * Sem invocação e sem contexto que aponte para a org, opera-se no escopo
 * PESSOAL. Esse é o padrão — não é fallback, é o modo normal do produto.
 *
 * Se a pessoa tiver MAIS DE UMA organização e o pedido não disser qual, o
 * resultado vem marcado `ambiguo` e quem chamou pergunta. Isso é exceção.
 */

export type ResolucaoDeEscopo = {
  escopo: Escopo;
  /** Por que este escopo: 'pessoal' (padrão), 'invocacao' ou 'contexto'. */
  motivo: "pessoal" | "invocacao" | "contexto";
  /**
   * Mais de uma organização e o pedido não desempatou. Quem chamou deve
   * PERGUNTAR qual — e, até a resposta, operar no escopo pessoal devolvido aqui,
   * nunca escolher uma org por conta própria.
   */
  ambiguo?: boolean;
  /** As organizações que empataram, para a pergunta citar os nomes certos. */
  candidatos?: { id: string; nome: string }[];
};

/** Palavras que apontam para o coletivo sem nomear a organização. */
const PISTAS_DE_ORGANIZACAO = [
  "organização", "organizacao", "empresa", "companhia", "firma",
  "equipe", "time", "coletivo", "corporativo", "institucional",
  "a org", "da org", "na org", "pela org",
];

function normaliza(texto: string): string {
  return (texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Resolve o escopo de UMA operação a partir da conta e do TEXTO do pedido.
 *
 * Função pura e determinística (mesmo texto + mesma conta = mesmo escopo), para
 * o resultado poder ser gravado junto do dado e conferido depois.
 */
export function resolverEscopoDaOperacao(
  conta: ContaParaEscopo,
  texto?: string | null,
): ResolucaoDeEscopo {
  const pessoal = escopoPessoal(conta);
  const orgs = orgsDaConta(conta);

  // Sem organização, não há o que inferir: é sempre o espaço da pessoa.
  if (!orgs.length) return { escopo: pessoal, motivo: "pessoal" };

  const t = normaliza(texto || "");
  if (!t) return { escopo: pessoal, motivo: "pessoal" };

  // 1) INVOCAÇÃO EXPLÍCITA: o nome (ou o slug) da organização no pedido. Com
  //    mais de uma org, o nome DESEMPATA — é por isso que ele é testado antes
  //    de qualquer pista de contexto.
  const citadas = orgs.filter((o) => {
    const nome = normaliza(o.nome || "");
    const slug = normaliza(o.slug).replace(/-/g, " ");
    return (nome && t.includes(nome)) || (slug && t.includes(slug));
  });
  if (citadas.length === 1) {
    const o = citadas[0];
    return { escopo: { tipo: "organizacao", id: o.slug, nome: o.nome || o.slug }, motivo: "invocacao" };
  }
  // Duas orgs citadas no MESMO pedido é ambíguo (e raro): pergunta.
  if (citadas.length > 1) {
    return { escopo: pessoal, motivo: "pessoal", ambiguo: true, candidatos: citadas.map((o) => ({ id: o.slug, nome: o.nome || o.slug })) };
  }

  // 2) CONTEXTO: fala do coletivo. Um sinal basta, porque o custo de errar para
  //    o lado da empresa é baixo (os dois escopos são do mesmo nível) e o custo
  //    de ignorar um pedido explícito ("os emails da empresa") é alto. Com UMA
  //    org só, a inferência é segura; com VÁRIAS, perguntar é o único caminho
  //    honesto — adivinhar mandaria dado para o lugar errado.
  if (PISTAS_DE_ORGANIZACAO.some((p) => t.includes(p))) {
    if (orgs.length === 1) {
      const o = orgs[0];
      return { escopo: { tipo: "organizacao", id: o.slug, nome: o.nome || o.slug }, motivo: "contexto" };
    }
    return { escopo: pessoal, motivo: "pessoal", ambiguo: true, candidatos: orgs.map((o) => ({ id: o.slug, nome: o.nome || o.slug })) };
  }

  return { escopo: pessoal, motivo: "pessoal" };
}

/** O escopo pedido pertence a esta conta? (para recusar escrita cross-tenant) */
export function escopoPertenceA(conta: ContaParaEscopo, pedido?: string | null): boolean {
  const p = (pedido || "").trim().toLowerCase();
  if (!p) return true;
  return escoposDaConta(conta).some((e) => e.id.toLowerCase() === p);
}
