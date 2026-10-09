/*
 * SKILLS FORA DA VISTA — a regra do dono (08/10/2026).
 *
 *   "skills como dark matter, pathfinder e outros produtos tira da visualização.
 *    pq irei vender como Saas separado depois."
 *   "se for skill que ajuda blz."
 *
 * O CRITÉRIO, em uma frase: o catálogo do cliente mostra o que AJUDA A CONSTRUIR;
 * não mostra produto que o dono vende à parte, nem a operação interna do
 * ecossistema, nem o método próprio dele.
 *
 * A MECÂNICA: lista de EXCLUSÃO aplicada no /api/skills (o ÚNICO ponto que
 * alimenta /skills, /explorar e a aba Skills da Synapse). Esconder aqui NÃO
 * apaga nada do disco: a skill continua carregada, funcionando e usável pelo
 * assistente; e `/api/skills/base` continua copiando normalmente. Só não
 * aparece e não é achada pela busca do painel.
 *
 * As skills do RUNTIME (as que ensinam a mexer no Hermes por dentro) entram
 * aqui também: elas não ajudam o cliente e denunciariam a máquina por baixo.
 *
 * Não usar este arquivo para a curadoria de VISIBILIDADE POSITIVA do painel —
 * essa é `skills-novas.ts` (a lista de quem APARECE na aba Skills da Synapse).
 */

/** Produto que o dono vende (ou vai vender) como SaaS separado. */
const PRODUTOS: readonly string[] = [
  /* Dark Matter — segurança ofensiva */
  "mirai-dark-matter",
  "dark-matter-elite-hunt",
  "authorization-requirements",
  "defesa-anti-vazamento-chat",
  "supabase-edge-function-s3-bypass",
  "godmode",
  "web-recon-techniques",
  "security-engagement-authorization",
  /* Pathfinder — inteligência de busca (SEO/GEO/AEO) */
  "pathfinder-intelligence",
  "geo-aeo-optimization",
  "seo-geo-nextjs",
  /* Saaso / DeskcommCRM */
  "saaso-crm-operacao",
  "saaso-uilocal-proof",
  /* Mapa Paper — portal editorial */
  "mapa-paper",
  "mapa-paper-ops",
  "nextjs-site-ops",
  /* Media Factory */
  "media-factory-dev",
  "social-platform-oauth",
  /* Mirai Pocket — o device */
  "mirai-pocket-gateway",
  "mirai-pocket-firmware",
  /* MIRAI OS — o próprio app */
  "mirai-os-app",
  "mirai-os-awareness",
  "mirai-os-primeira-tela",
  "mirai-service-topology",
  /* Observador / Atomic News */
  "mirai-observador",
  "observador-bot",
  "mirai-autonomous-research",
  "rocky-daily-pipeline",
];

/** Operação interna do ecossistema e método próprio do dono. */
const INTERNAS: readonly string[] = [
  /* runtime (o que ensina a máquina por dentro — não ajuda o cliente e denuncia) */
  "hermes-agent",
  "hermes-agent-skill-authoring",
  "inspecting-hermes-desktop-dom",
  "infrastructure-configuration",
  "plan",
  "mcp-development",
  "teams-meeting-pipeline",
  /* operação do ecossistema */
  "mirai-multitenant",
  "mirai-vps-deploy",
  "mirai-boot",
  "mirai-hub-sync",
  "mirai-identidade-primeiro-login",
  "mirai-platform-control-plane",
  "mirai-arca-v2",
  "mirai-criador",
  "mirai-reality-audit",
  "mirai-soul-governance",
  "mirai-telegram-bots",
  "ecosystem-governance",
  "ecosystem-service-catalog",
  "mcp-center",
  "mcp-por-produto",
  "arca-memory",
  "arca-drive-ingestion",
  "verificacao-de-credenciais",
  "mitrasheet-extractor",
  "franky",
  /* método próprio do dono */
  "skill-library-hygiene",
  "llm-generation-routes",
  "saas-teardown",
  "decisao-tipada",
];

/** Famílias inteiras que saem por prefixo (evita lista que envelhece). */
const PREFIXOS: readonly string[] = [
  "mirai-",
  "arca-",
  "dark-matter-",
  "pathfinder-",
  "saaso-",
  "mapa-paper",
  "media-factory-",
  "mitrasheet-",
  "observador-",
  "ecosystem-",
  "hermes-",
  "inspecting-hermes-",
  "rocky-",
  "kanban-",
];

const OCULTAS = new Set([...PRODUTOS, ...INTERNAS].map((n) => n.trim().toLowerCase()));

/** Esta skill sai da vista do cliente? (nome = o id real, o mesmo do SKILL.md) */
export function ehSkillOculta(nome: string): boolean {
  const n = (nome || "").trim().toLowerCase();
  if (!n) return false;
  if (OCULTAS.has(n)) return true;
  return PREFIXOS.some((p) => n.startsWith(p));
}

/** Só para relatório/auditoria: quantas regras estão ativas hoje. */
export const REGRAS_OCULTAS = {
  produtos: PRODUTOS.length,
  internas: INTERNAS.length,
  prefixos: PREFIXOS.length,
} as const;
