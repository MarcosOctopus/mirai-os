/**
 * OS PLANOS QUE SE COMPRAM — e o link de pagamento de cada um.
 *
 * Dono, 24/11/2026: *"gere links de plano por plano pra colocar nos planos da LP"*.
 * Um link POR PLANO, criado no Asaas como assinatura RECORRENTE MENSAL, com o
 * `externalReference` = id do plano. É o MESMO link que a LP usa e que o botão
 * "Assinar" do app usa — um lugar só, sem dois caminhos de cobrança.
 *
 * O que NÃO mora aqui: o preço de verdade (catálogo = `plans.preco_centavos` no
 * plano de controle) e as capacidades de cada plano. Aqui é só o que a TELA
 * precisa para mandar a pessoa ao checkout.
 *
 * Trocar link: crie/edite no painel do Asaas e atualize o `link` aqui. A chave
 * é o id do plano do plano de controle (`plan_id`) — é ele que o `assinar`
 * valida contra o catálogo, então id errado aqui = cobrança não liga.
 */
export type PlanoDoOs = {
  id: string;
  nome: string;
  /** Espelho do catálogo, só para exibir. O valor cobrado vem do Asaas. */
  valorCentavos: number;
  /** Link hospedado do Asaas (assinatura recorrente mensal). */
  link: string;
  /** Uma linha de quem é este plano, em língua de gente. */
  resumo: string;
  destaque?: boolean;
};

export const PLANOS_DO_OS: PlanoDoOs[] = [
  {
    id: "mirai_basico",
    nome: "Básico",
    valorCentavos: 4990,
    link: "https://www.asaas.com/000/c/jyms6hbwp6zvi1vp",
    resumo: "Para começar sozinho: as ferramentas todas, com o uso do dia a dia.",
  },
  {
    id: "mirai_intermediario",
    nome: "Intermediário",
    valorCentavos: 9990,
    link: "https://www.asaas.com/000/c/8qgb2i05elsthyjb",
    resumo: "Para quem já usa todo dia e precisa de mais fôlego.",
    destaque: true,
  },
  {
    id: "mirai_profissional",
    nome: "Profissional",
    valorCentavos: 25000,
    link: "https://www.asaas.com/000/c/nq18pw49mq2rno4x",
    resumo: "Para operação séria: mais volume, mais projetos, mais agentes.",
  },
  {
    id: "mirai_avancado",
    nome: "Avançado",
    valorCentavos: 50000,
    link: "https://www.asaas.com/000/c/jbnrnzq7r204n0jm",
    resumo: "O teto: uso intenso, time inteiro e o que ainda não coube nos outros.",
  },
];

export function planoDoOs(id: string): PlanoDoOs | null {
  return PLANOS_DO_OS.find((p) => p.id === id) || null;
}

export function reais(centavos: number): string {
  return (centavos / 100).toFixed(2).replace(".", ",");
}
