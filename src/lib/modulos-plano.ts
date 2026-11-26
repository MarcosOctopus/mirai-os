/**
 * MÓDULOS DO PLANO (26/11/2026) — pedido do dono: a vitrine de ferramentas de um plano
 * tem de falar a língua do produto (Synapse, Arquiteto, ORB, Agendamento…), não a
 * lista miúda de ações ("Analisar negócios", "Gerar código").
 *
 * Cada módulo é um conjunto de áreas do catálogo de capacidades. Ligar o módulo liga
 * todas as ações dele; desligar tira todas. A granularidade fina continua existindo
 * no plano de controle — aqui ela só não aparece como se fosse produto.
 *
 * Nada aqui é inventado: o módulo só existe se o catálogo tiver ao menos uma ação
 * daquelas áreas. O que sobrar sem casa cai em "Outros" (e fica VISÍVEL, para o
 * catálogo não sumir silenciosamente).
 */

export type CapacidadeDoCatalogo = {
  capability_id: string;
  product_id: string;
  nome: string;
  area?: string;
  risk?: string;
};

export type Modulo = {
  chave: string;
  nome: string;
  descricao: string;
  produto: string;
  areas: string[];
  capacidades: CapacidadeDoCatalogo[];
};

type Regra = { chave: string; produto: string; nome: string; descricao: string; areas: string[] };

const REGRAS: Regra[] = [
  // ── MIRAI OS ────────────────────────────────────────────────────────────
  { chave: "mirai.conversa", produto: "mirai", nome: "ORB", descricao: "Conversa com a Mirai, por texto e por voz", areas: ["chat", "voz"] },
  { chave: "mirai.arquiteto", produto: "mirai", nome: "Arquiteto", descricao: "Constrói o projeto junto, do plano ao arquivo", areas: ["arquiteto"] },
  { chave: "mirai.agentes", produto: "mirai", nome: "Agentes e automação", descricao: "Orquestra agentes, roda automação e cria projeto", areas: ["agent", "automation", "project"] },
  { chave: "mirai.memoria", produto: "mirai", nome: "Memória e acervo", descricao: "Ingere e busca no acervo da Arca", areas: ["memory"] },
  { chave: "mirai.codigo", produto: "mirai", nome: "Código e dados", descricao: "Gera código e consulta banco de dados", areas: ["code", "database"] },
  { chave: "mirai.documento", produto: "mirai", nome: "Documentos", descricao: "Abre, cria e edita documento ao lado do chat", areas: ["documento"] },
  { chave: "mirai.synapse", produto: "mirai", nome: "Synapse", descricao: "Integrações ligadas e mensagem por Telegram", areas: ["integration", "telegram"] },
  { chave: "mirai.infra", produto: "mirai", nome: "Infra e deploy", descricao: "Vê a infraestrutura e faz deploy", areas: ["infra", "service"] },
  { chave: "mirai.seguranca", produto: "mirai", nome: "Segurança e backup", descricao: "Scan de segurança e backup do ambiente", areas: ["security", "backup"] },
  { chave: "mirai.negocios", produto: "mirai", nome: "Negócios", descricao: "Analisa o negócio e o caixa", areas: ["business"] },

  // ── PATHFINDER ──────────────────────────────────────────────────────────
  { chave: "pathfinder.busca", produto: "pathfinder", nome: "Inteligência de busca", descricao: "SEO, GEO e auditoria de site", areas: ["seo", "geo", "site"] },
  { chave: "pathfinder.pesquisa", produto: "pathfinder", nome: "Pesquisa de mercado", descricao: "Concorrentes, palavras-chave e tendência", areas: ["competitor", "keyword", "trend"] },

  // ── MEDIA FACTORY ───────────────────────────────────────────────────────
  { chave: "mediafactory.conteudo", produto: "mediafactory", nome: "Conteúdo", descricao: "Newsletter, notícia e texto", areas: ["content", "publish"] },
  { chave: "mediafactory.criativo", produto: "mediafactory", nome: "Criativo", descricao: "Design, imagem, vídeo e thumbnail", areas: ["design", "image", "video", "thumbnail"] },
  { chave: "mediafactory.audio", produto: "mediafactory", nome: "Áudio", descricao: "Gera áudio e transcreve fala", areas: ["audio", "speech"] },
  { chave: "mediafactory.youtube", produto: "mediafactory", nome: "YouTube", descricao: "Automatiza o canal", areas: ["youtube"] },

  // ── DARK MATTER ─────────────────────────────────────────────────────────
  { chave: "darkmatter.operacao", produto: "darkmatter", nome: "Operação ofensiva", descricao: "Varredura, vulnerabilidade e relatório", areas: ["scan", "vulnerability", "report"] },
  { chave: "darkmatter.achados", produto: "darkmatter", nome: "Alvos e achados", descricao: "Lista alvos autorizados e achados", areas: ["assets", "findings"] },
];

const AREAS_CONHECIDAS = new Set(REGRAS.flatMap((r) => r.areas.map((a) => `${r.produto}:${a}`)));

/** Agrupa o catálogo em módulos legíveis. */
export function agruparEmModulos(capacidades: CapacidadeDoCatalogo[]): Modulo[] {
  const porArea = new Map<string, CapacidadeDoCatalogo[]>();
  for (const c of capacidades) {
    const chave = `${c.product_id}:${(c.area || "").toLowerCase()}`;
    const lista = porArea.get(chave) || [];
    lista.push(c);
    porArea.set(chave, lista);
  }

  const modulos: Modulo[] = [];
  for (const regra of REGRAS) {
    const capacidadesDoModulo: CapacidadeDoCatalogo[] = [];
    for (const area of regra.areas) {
      const achadas = porArea.get(`${regra.produto}:${area}`) || [];
      capacidadesDoModulo.push(...achadas);
    }
    if (capacidadesDoModulo.length === 0) continue;
    modulos.push({
      chave: regra.chave,
      nome: regra.nome,
      descricao: regra.descricao,
      produto: regra.produto,
      areas: regra.areas,
      capacidades: capacidadesDoModulo,
    });
  }

  // O que não casou com nenhuma regra não pode desaparecer.
  const orfas = capacidades.filter((c) => !AREAS_CONHECIDAS.has(`${c.product_id}:${(c.area || "").toLowerCase()}`));
  const porProduto = new Map<string, CapacidadeDoCatalogo[]>();
  for (const c of orfas) {
    const lista = porProduto.get(c.product_id) || [];
    lista.push(c);
    porProduto.set(c.product_id, lista);
  }
  for (const [produto, lista] of porProduto) {
    modulos.push({
      chave: `${produto}.outros`,
      nome: `Outros de ${produto}`,
      descricao: "Ações do catálogo que ainda não têm módulo",
      produto,
      areas: [],
      capacidades: lista,
    });
  }

  return modulos;
}

/** Ids de capacidade de um módulo, pronto para o PUT de capacidades do plano. */
export function idsDoModulo(modulo: Modulo): string[] {
  return modulo.capacidades.map((c) => c.capability_id);
}