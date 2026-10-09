/**
 * SKILLS — os TEMAS do catálogo (organização pedida pelo dono, 08/10/2026).
 *
 * O dono pediu que o catálogo de skills fosse organizado por TEMAS e que a
 * busca achasse QUALQUER assunto. Este arquivo é a ÚNICA fonte dessa
 * organização: um mapa determinístico de skill -> tema, montado a partir do
 * dado REAL (o `name` do frontmatter, a pasta de origem — a "categoria" que
 * skills-lista.ts já calcula — e, quando ajuda, a descrição). Nada é inventado:
 * todo tema abaixo tem, no mínimo, uma skill de verdade atrás dele; skill cujo
 * tema não dá para determinar honestamente cai em "Sem tema".
 *
 * COMO O TEMA É DERIVADO (nesta ordem):
 *   1. POR NOME — um punhado de skills cujo assunto NÃO é o da pasta (ex.:
 *      `kanban-*` mora em devops mas é AGENTES; `geo-aeo-optimization` mora em
 *      mirai mas é GEO/SEO; `openhue` mora em smart-home mas é INTEGRAÇÃO).
 *      O nome é único no catálogo (a lista deduplica por nome), então a tabela
 *      por nome é segura.
 *   2. POR PASTA — o resto segue a pasta de 1º nível.
 *   3. SEM TEMA — se nada bate, devolve "Sem tema" (nunca um chute).
 *
 * A ordem canônica (TEMAS_ORDEM) começa pelos SETE temas que o dono nomeou
 * (design, criar aplicação, conversa, agentes, integração, inteligência, dados)
 * e continua com os que o dado real exige (segurança, geo/seo, mídia,
 * infraestrutura, produtividade, memória). Os chips da tela só mostram os temas
 * que existem de fato no catálogo, nesta ordem.
 *
 * BUSCA: `textoBuscaSkill` monta o texto sobre o qual a busca roda — nome,
 * descrição, tema, os APELIDOS do tema (sinônimos que o dono usaria, ex.:
 * "pen test" para segurança; "pathfinder" para geo/seo) e a pasta. E
 * `normalizarBusca` tira acento e caixa, para "segurança" e "seguranca" darem
 * o mesmo resultado.
 */

import { tituloDaSkill } from "@/lib/skills-titulo";

/** Os temas, na ordem em que aparecem na tela. */
export const TEMAS_ORDEM: readonly string[] = [
  // ── os sete que o dono nomeou ──
  "design",
  "criar aplicação",
  "conversa",
  "agentes",
  "integração",
  "inteligência",
  "dados",
  // ── os que o dado real exige ──
  "segurança",
  "geo/seo",
  "mídia",
  "infraestrutura",
  "produtividade",
  "memória",
];

/** Onde cai a skill cujo tema não dá para determinar honestamente. */
export const SEM_TEMA = "Sem tema";

/**
 * RÓTULO do tema para a TELA — o valor cru continua sendo a CHAVE de filtro.
 * O dono reclamou (08/10/2026) que os chips saíam em minúsculas ("design",
 * "criar aplicação", "dados"). Mapa EXPLÍCITO, não title-case automático: sigla
 * como GEO/SEO o automático estraga. Tema novo que não esteja aqui cai numa
 * capitalização simples da primeira letra.
 */
export const ROTULO_TEMA: Record<string, string> = {
  design: "Design",
  "criar aplicação": "Criar Aplicação",
  conversa: "Conversa",
  agentes: "Agentes",
  integração: "Integração",
  inteligência: "Inteligência",
  dados: "Dados",
  segurança: "Segurança",
  "geo/seo": "GEO/SEO",
  mídia: "Mídia",
  infraestrutura: "Infraestrutura",
  produtividade: "Produtividade",
  memória: "Memória",
  [SEM_TEMA]: "Sem tema",
};

/** Tema -> rótulo de tela. Nunca devolve string vazia. */
export function rotuloTema(tema?: string | null): string {
  const t = (tema || "").trim();
  if (!t) return ROTULO_TEMA[SEM_TEMA];
  return ROTULO_TEMA[t] ?? t.charAt(0).toUpperCase() + t.slice(1);
}

/** Tema padrão por PASTA de 1º nível (a "categoria" do catálogo). */
const POR_PASTA: Record<string, string> = {
  creative: "design",
  "software-development": "criar aplicação",
  github: "criar aplicação",
  web: "criar aplicação",
  email: "conversa",
  "social-media": "conversa",
  "data-science": "dados",
  mlops: "dados",
  research: "inteligência",
  security: "segurança",
  "red-teaming": "segurança",
  "mirai-dark-matter": "segurança",
  "note-taking": "memória",
  devops: "infraestrutura",
  productivity: "produtividade",
  apple: "produtividade",
  "autonomous-ai-agents": "agentes",
  media: "mídia",
  "arquiteto-craft": "criar aplicação",
};

/**
 * Exceções por NOME (minúsculo). São skills cujo assunto real difere da pasta,
 * OU skills da pasta `Geral` (que não tem tema próprio) e da pasta `mirai`
 * (heterogênea por natureza).
 */
const POR_NOME: Record<string, string> = {
  // ── Geral (pasta heterogênea: cada uma vai pelo próprio assunto) ──
  "browser-asset-extraction": "integração",
  dogfood: "criar aplicação",
  "github-workflow": "criar aplicação",
  "mapa-paper": "criar aplicação",
  "mirai-dark-matter": "segurança",
  "mirai-hub-sync": "integração",
  "mirai-identidade-primeiro-login": "infraestrutura",
  "youtube-automation": "mídia",
  yuanbao: "conversa",

  // ── apple (iMessage é conversa; o resto segue produtividade) ──
  imessage: "conversa",

  // ── creative: o que GERA imagem/vídeo/áudio é mídia, não design ──
  comfyui: "mídia",
  "higgsfield-mcp": "mídia",
  "ascii-video": "mídia",
  "manim-video": "mídia",
  "songwriting-and-ai-music": "mídia",

  // ── devops: nem tudo é infraestrutura ──
  "kanban-orchestrator": "agentes",
  "kanban-worker": "agentes",
  "kanban-workflow": "agentes",
  "sdlc-review": "agentes",
  "social-platform-oauth": "integração",
  "mirai-os-app": "criar aplicação",
  "saaso-uilocal-proof": "design",

  // ── mirai (pasta heterogênea: cada skill vai pelo próprio assunto) ──
  "decisao-tipada": "inteligência",
  "ecosystem-service-catalog": "integração",
  "geo-aeo-optimization": "geo/seo",
  "mcp-center": "integração",
  "mcp-por-produto": "integração",
  "mirai-arca-v2": "memória",
  "mirai-autonomous-research": "inteligência",
  "mirai-boot": "agentes",
  "mirai-criador": "design",
  "mirai-observador": "inteligência",
  "mirai-os-awareness": "agentes",
  "mirai-os-primeira-tela": "criar aplicação",
  "mirai-platform-control-plane": "criar aplicação",
  "mirai-pocket-firmware": "infraestrutura",
  "mirai-pocket-gateway": "infraestrutura",
  "mirai-reality-audit": "inteligência",
  "mirai-soul-governance": "segurança",
  "mitrasheet-extractor": "dados",
  "observador-bot": "inteligência",
  "pathfinder-intelligence": "geo/seo",
  "saas-teardown": "inteligência",

  // ── productivity: o que é memória/agentes/mídia sai do balde geral ──
  "arca-drive-ingestion": "memória",
  "arca-memory": "memória",
  "rocky-daily-pipeline": "mídia",
  "ecosystem-governance": "agentes",
  "skill-library-hygiene": "agentes",

  // ── smart-home: controlar um aparelho por API é integração ──
  openhue: "integração",

  // ── software-development: design, agentes, infra e MCP saem do dev-puro ──
  "design-system-conformance": "design",
  "esp32-firmware-build-ota": "infraestrutura",
  franky: "agentes",
  "hermes-agent-skill-authoring": "agentes",
  "mapa-paper-ops": "infraestrutura",
  "nextjs-site-ops": "infraestrutura",
  "mcp-development": "integração",

  // ── arquiteto-craft: a BIBLIOTECA DO ARQUITETO (08/10/2026) ──
  // a pasta inteira é CRIAR APLICAÇÃO (ver POR_PASTA abaixo); os dois que têm
  // assunto próprio saem do balde: design de interface é DESIGN e o de
  // back-end/dados é DADOS.
  "arquiteto-design-de-interface": "design",
  "arquiteto-backend-e-dados": "dados",

  // ── web: SEO/GEO não é "criar aplicação" ──
  "seo-geo-nextjs": "geo/seo",
};

/**
 * APELIDOS de busca por tema: as palavras que a pessoa REALMENTE usaria e que
 * não estão no nome de nenhuma skill. É uma tabela EXPLÍCITA e auditável (nada
 * de adivinhação automática) — existe para cumprir o pedido do dono de que
 * "segurança / pen test" e "GEO / pathfinder" ACHEM. Não aparece na tela: só
 * entra no texto da busca.
 */
const APELIDOS: Record<string, string[]> = {
  design: ["visual", "arte", "layout", "ui", "ux", "diagrama", "mockup", "estilo", "criativo"],
  "criar aplicação": ["app", "aplicacao", "codigo", "programacao", "desenvolvimento", "dev", "software", "frontend", "backend", "site"],
  conversa: ["chat", "mensagem", "mensagens", "email", "comunicacao", "bot", "conversar", "social", "rede social"],
  agentes: ["agente", "agents", "autonomo", "autonomia", "orquestracao", "multiagente", "kanban", "ia"],
  integração: ["integracao", "api", "apis", "mcp", "oauth", "conexao", "conector", "credencial", "servico", "webhook"],
  inteligência: ["inteligencia", "pesquisa", "research", "analise", "monitoramento", "noticias", "observador", "osint", "mercado", "intel"],
  dados: ["data", "banco", "sql", "machine learning", "ml", "modelo", "dataset", "estatistica", "analytics", "planilha"],
  segurança: ["security", "pen test", "pentest", "pen-test", "hacking", "ofensivo", "red team", "auditoria", "vulnerabilidade", "jailbreak", "recon", "dark matter", "exploit", "bypass"],
  "geo/seo": ["seo", "geo", "aeo", "serp", "ranqueamento", "palavra-chave", "palavras-chave", "keyword", "keywords", "backlink", "pathfinder", "citacao", "busca organica"],
  mídia: ["media", "video", "imagem", "audio", "musica", "youtube", "gif", "podcast", "filme", "transcricao"],
  infraestrutura: ["infra", "servidor", "servidores", "vps", "docker", "deploy", "container", "firmware", "devops", "producao", "rede", "topologia", "nginx", "dominio"],
  produtividade: ["documento", "office", "word", "excel", "pdf", "nota", "tarefa", "agenda", "arquivo", "automacao", "reuniao", "relatorio"],
  memória: ["memory", "arca", "conhecimento", "lembrar", "vault", "historico", "obsidian", "ingestao"],
};

/** Deriva o TEMA de uma skill a partir do nome e da pasta (categoria) reais. */
export function temaDaSkill(nome: string, categoria: string): string {
  const porNome = POR_NOME[(nome || "").trim().toLowerCase()];
  if (porNome) return porNome;
  const porPasta = POR_PASTA[(categoria || "").trim().toLowerCase()];
  if (porPasta) return porPasta;
  return SEM_TEMA;
}

/** minúsculas, sem acento — "segurança" e "seguranca" batem igual. */
export function normalizarBusca(texto: string): string {
  return (texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** O texto inteiro que a busca varre para UMA skill (nome + TÍTULO humano +
 *  descrição + tema + apelidos do tema + pasta), já pronto para `normalizarBusca`.
 *
 *  Incluir o TÍTULO é o que faz a busca casar dos DOIS jeitos: o slug cru
 *  (`apple-notes`) continua achando (vem do `nome`), e a forma legível
 *  (`Apple Notes`) também acha (vem do título). Ver src/lib/skills-titulo.ts. */
export function textoBuscaSkill(s: {
  nome: string;
  descricao: string | null;
  categoria: string;
  tema?: string;
}): string {
  const tema = s.tema || SEM_TEMA;
  return [
    s.nome,
    tituloDaSkill(s.nome),
    s.descricao || "",
    tema,
    (APELIDOS[tema] || []).join(" "),
    s.categoria,
  ].join(" ");
}
