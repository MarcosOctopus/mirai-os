/**
 * OS AGENTES DO COSMIC AGENT — quem são, o que fazem, e a cor de cada um.
 *
 * A LISTA NÃO É INVENTADA AQUI. Ela é a governança de agentes do ecossistema
 * (SOUL da Mirai: Marcos → Mirai → especialistas → execução). Este arquivo só
 * dá forma de tela ao que já existe: nome, papel e uma linha do que faz.
 *
 * A FOTINHA é pixel art gerada (estilo Metal Slug) e vive em
 * `public/cosmic/<slug>.png`. Enquanto o arquivo não existir, o card mostra um
 * fallback honesto (o bloco de cor + a inicial) — nunca um quadrado quebrado.
 */

export type Agente = {
  /** nome de chamada (é ele que aparece nas falas do canal) */
  nome: string;
  /** o papel, em uma palavra — vira o TEMA em caixa alta no card */
  tema: string;
  /** uma linha do que ele faz (nada de marketing) */
  descricao: string;
  /** cor do card — a área onde a fotinha vive */
  cor: string;
  /** arquivo da fotinha em public/cosmic/ */
  imagem: string;
};

export const AGENTES: Agente[] = [
  {
    nome: "Mirai",
    tema: "Orquestração",
    descricao: "Orquestra o ecossistema: audita, planeja e executa — nesta ordem.",
    cor: "#ff751f",
    imagem: "/cosmic/mirai.png",
  },
  {
    nome: "Kael",
    tema: "Desenvolvimento",
    descricao: "Constrói e prova: código que roda, com execução real no fim.",
    cor: "#3b82f6",
    imagem: "/cosmic/kael.png",
  },
  {
    nome: "Brynn",
    tema: "Pesquisa",
    descricao: "Procura e confere fontes; transforma material bruto em achado.",
    cor: "#8b5cf6",
    imagem: "/cosmic/brynn.png",
  },
  {
    nome: "Zara",
    tema: "Design",
    descricao: "Desenha interface com contenção: luz contida, fundo escuro, enquadrado.",
    cor: "#d946ef",
    imagem: "/cosmic/zara.png",
  },
  {
    nome: "Jax",
    tema: "Negócios",
    descricao: "Cuida de proposta, preço e caminho comercial — sem promessa vazia.",
    cor: "#22c55e",
    imagem: "/cosmic/jax.png",
  },
  {
    nome: "Fen",
    tema: "Infraestrutura",
    descricao: "Mantém servidor, contêiner e porta no ar — e prova com HTTP.",
    cor: "#06b6d4",
    imagem: "/cosmic/fen.png",
  },
  {
    nome: "Fênix",
    tema: "Backup e recuperação",
    descricao: "Garante que dá para voltar: backup, snapshot e restauração testada.",
    cor: "#f97316",
    imagem: "/cosmic/fenix.png",
  },
  {
    nome: "Rocky",
    tema: "Conteúdo",
    descricao: "Toca YouTube e Atomic News: publicação, título, thumb e ritmo.",
    cor: "#eab308",
    imagem: "/cosmic/rocky.png",
  },
];

/** Acha pelo nome de chamada (é o que vem nas falas do canal). */
export function agentePorNome(nome: string): Agente | undefined {
  const alvo = (nome || "").trim().toLowerCase().replace(/^pessoa:/, "");
  return AGENTES.find((a) => a.nome.toLowerCase() === alvo);
}
