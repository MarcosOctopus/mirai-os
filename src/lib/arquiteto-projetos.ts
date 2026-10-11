// Projetos do ARQUITETO — persistência no MESMO banco e no MESMO padrão do
// resto do app: better-sqlite3 sobre `data/auth.db`, WAL, tabelas criadas com
// CREATE TABLE IF NOT EXISTS. É exatamente a biblioteca que auth.ts/conversas.ts
// já usam — nenhuma dependência nova, um só caminho de verdade para o dado.
//
// POR QUE aqui: o projeto do Arquiteto é DADO DA CONTA, como as conversas.
// Guardar num segundo lugar criaria um segundo caminho de verdade para o mesmo
// tipo de dado. Não há um.
//
// ESCOPO por USUÁRIO (a trava de verdade): toda leitura/escrita filtra por
// `user_id`. Projeto de outra conta é tratado como INEXISTENTE — a rota
// responde 404, nunca "existe, mas não é seu", nunca vaza por id chutado. É a
// mesma postura de `conversas.ts`. A HISTÓRIA (versões) herda a trava: as
// funções de versão conferem a posse do projeto no `arquiteto_projetos` ANTES
// de tocar em `arquiteto_versoes` — versão de outra conta é inexistente.
//
// TABELAS (PT-BR, como pedido):
//   arquiteto_projetos(id, user_id, titulo, criado_em, atualizado_em, tokens_json)
//   arquiteto_arquivos(id, projeto_id, caminho, conteudo, ordem, criado_em, atualizado_em)
//   arquiteto_versoes(id, projeto_id, numero, criado_em, arquivos_json, tokens_json)
//     — HISTÓRIA por projeto (08/10/2026). Cada mudança do projeto (geração,
//       adicionar/remover arquivo, restauração, MUDANÇA DE TOKEN) grava um
//       SNAPSHOT imutável: o conjunto inteiro de arquivos + os tokens de design
//       serializados. A versão NUNCA é apagada por uma restauração — restaurar
//       só LÊ a versão e grava uma NOVA por cima. `numero` é 1..N por projeto.
//     — TOKENS (08/10/2026): `tokens_json` nasceu por ALTER TABLE ADD COLUMN
//       (migração aditiva, no `getDb`). Ficam na linha do PROJETO (o token é
//       dado do projeto, como o título) e no snapshot de cada versão.
// Índices: idx_arquiteto_projetos_user(user_id),
//          idx_arquiteto_arquivos_projeto(projeto_id),
//          idx_arquiteto_versoes_projeto(projeto_id, numero) UNIQUE.
import Database from "better-sqlite3";
import { createHash, randomBytes, randomUUID } from "crypto";
import path from "path";

import { normalizarTokens, assinaturaTokens, type Tokens } from "./arquiteto-tokens";
import { normalizarDominio, motivoDominioInvalido } from "./dominio-projetos";


const DB_PATH = path.join(process.cwd(), "data", "auth.db");

export type ArquivoProjeto = { nome: string; conteudo: string };

export type ProjetoResumo = {
  id: string;
  titulo: string;
  criado_em: string;
  atualizado_em: string;
  /** a pasta/categoria do projeto (null = "Sem pasta"). Presente em listarProjetos. */
  pasta_id?: string | null;
  /** endereço `<slug>.miraitohope.com` (null = sem endereço). Presente na lista. */
  slug?: string | null;
  /** domínio próprio do cliente (null = nenhum). Presente na lista. */
  dominio?: string | null;
  /** quando foi publicado (ISO) ou null. Presente na lista. */
  publicado_em?: string | null;
};

/**
 * O estado de PUBLICAÇÃO do projeto (item 10 do dono). Vive na PRÓPRIA linha do
 * projeto (colunas aditivas, como os tokens) — nada de segunda tabela para o
 * mesmo dado:
 *   - `publicar_token`  = o token do link público (NULL = não publicado). É um
 *     valor ALEATÓRIO gerado no servidor (192 bits), NUNCA derivado do id do
 *     projeto nem do id do dono. Enquanto não for NULL, o link `/p/<token>`
 *     serve ESTE projeto; ao despublicar (volta a NULL) o link morre.
 *   - `publicado_em`    = quando foi publicado (ISO). Ao republicar, é
 *     atualizado — o LINK é o mesmo, e ele SEMPRE mostra o estado ATUAL do
 *     projeto (a página pública lê o projeto vivo a cada acesso).
 */
export type ProjetoCompleto = ProjetoResumo & {
  arquivos: ArquivoProjeto[];
  tokens: Tokens;
  /** quando foi publicado (ISO) ou null se não está publicado */
  publicado_em: string | null;
  /** o token do link público ou null. Só o dono recebe isto (a tela dele). */
  publicar_token: string | null;
};

/** Resumo leve de uma versão, para a LISTA (não carrega o conteúdo). */
export type VersaoResumo = {
  numero: number;
  criado_em: string;
  /** nomes dos arquivos naquela versão — derivado do snapshot, nunca inventado */
  caminhos: string[];
  /** impressão do CONTEÚDO da versão (sha256 curto): deixa ver "mudou o texto" */
  assinatura: string;
};

/** Versão completa (com o conteúdo), para restaurar. */
export type VersaoCompleta = VersaoResumo & { arquivos: ArquivoProjeto[] };

const TITULO_PADRAO = "Projeto sem título";
const LIMITE_TITULO = 48;

/**
 * Garante uma coluna (MIGRAÇÃO ADITIVA: ALTER TABLE ADD COLUMN). Nunca apaga,
 * nunca recria a tabela. Chamado no `getDb` para os tokens de design entrarem
 * em bancos que já existem sem um passo manual.
 */
function garantirColuna(db: Database.Database, tabela: string, coluna: string, tipoSql: string): void {
  const cols = db.prepare(`PRAGMA table_info(${tabela})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === coluna)) {
    db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${tipoSql}`);
  }
}

/** Lê os tokens de um `tokens_json` (linha do projeto OU snapshot de versão).
 *  `null`/vazio/ilegível cai nos PADRÕES — nunca inventa um token quebrado. */
function tokensDoJson(json: unknown): Tokens {
  if (typeof json !== "string" || !json) return normalizarTokens({});
  try {
    return normalizarTokens(JSON.parse(json));
  } catch {
    return normalizarTokens({});
  }
}

/** Monta a linha devolvida ao cliente, sempre com um conjunto COMPLETO de tokens. */
function comoCompleto(
  linha: ProjetoResumo & {
    tokens_json?: string | null;
    publicar_token?: string | null;
    publicado_em?: string | null;
  },
  arquivos: ArquivoProjeto[],
): ProjetoCompleto {
  return {
    id: linha.id,
    titulo: linha.titulo,
    criado_em: linha.criado_em,
    atualizado_em: linha.atualizado_em,
    // A pasta/categoria do projeto (dono, 11/10/2026): presente nas consultas
    // que a pedem, ausente (→ null = "Sem pasta") nas demais.
    pasta_id: typeof linha.pasta_id === "string" ? linha.pasta_id : null,
    arquivos,
    tokens: tokensDoJson(linha.tokens_json),
    // Estado de publicação: presente nas consultas que o pedem, ausente (→ null)
    // nas demais. Nunca inventa um token.
    publicar_token: typeof linha.publicar_token === "string" ? linha.publicar_token : null,
    publicado_em: typeof linha.publicado_em === "string" ? linha.publicado_em : null,
  };
}

function getDb() {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS arquiteto_projetos (
      id            TEXT PRIMARY KEY,
      user_id       INTEGER NOT NULL,
      titulo        TEXT NOT NULL,
      criado_em     TEXT NOT NULL,
      atualizado_em TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS arquiteto_arquivos (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      projeto_id    TEXT NOT NULL,
      caminho       TEXT NOT NULL,
      conteudo      TEXT NOT NULL,
      ordem         INTEGER NOT NULL,
      criado_em     TEXT NOT NULL,
      atualizado_em TEXT NOT NULL
    )
  `);
  // HISTÓRIA: snapshot imutável do projeto a cada mudança. Nasce aqui, no mesmo
  // banco — nada de segundo lugar para o dado.
  db.exec(`
    CREATE TABLE IF NOT EXISTS arquiteto_versoes (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      projeto_id    TEXT NOT NULL,
      numero        INTEGER NOT NULL,
      criado_em     TEXT NOT NULL,
      arquivos_json TEXT NOT NULL
    )
  `);
  // ASSETS (imagens do projeto) — BLOBs escopados ao PROJETO. Nascem aqui, no
  // mesmo banco, pela mesma razão das outras tabelas: o dado é da conta e não
  // pode ter um segundo lugar para viver. O caminho é relativo ao projeto
  // (`assets/logo.png`) e é ELE que o código referencia.
  db.exec(`
    CREATE TABLE IF NOT EXISTS arquiteto_assets (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      projeto_id TEXT NOT NULL,
      caminho    TEXT NOT NULL,
      mime       TEXT NOT NULL,
      bytes      BLOB NOT NULL,
      tamanho    INTEGER NOT NULL,
      criado_em  TEXT NOT NULL,
      UNIQUE (projeto_id, caminho)
    )
  `);
  // PASTAS / CATEGORIAS (dono, 11/10/2026 — "crie pastas por projeto como se
  // fosse categoria"): o agrupamento de projetos por pasta. Um NÍVEL (pasta →
  // projetos), criado pela própria conta. O projeto guarda `pasta_id` na PRÓPRIA
  // linha (coluna aditiva, abaixo) — a pasta é um agrupamento, não um segundo
  // lugar para o projeto viver. Apagar a pasta NÃO apaga projeto nenhum: os
  // projetos dela voltam a "Sem pasta".
  db.exec(`
    CREATE TABLE IF NOT EXISTS arquiteto_pastas (
      id            TEXT PRIMARY KEY,
      user_id       INTEGER NOT NULL,
      nome          TEXT NOT NULL,
      criado_em     TEXT NOT NULL,
      atualizado_em TEXT NOT NULL
    )
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_arquiteto_projetos_user ON arquiteto_projetos(user_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_arquiteto_pastas_user ON arquiteto_pastas(user_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_arquiteto_arquivos_projeto ON arquiteto_arquivos(projeto_id)");
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_arquiteto_versoes_projeto ON arquiteto_versoes(projeto_id, numero)",
  );
  db.exec("CREATE INDEX IF NOT EXISTS idx_arquiteto_assets_projeto ON arquiteto_assets(projeto_id)");
  // TOKENS DE DESIGN (08/10/2026): migração ADITIVA em duas tabelas. Os tokens
  // do projeto vivem na PRÓPRIA linha do projeto (não numa tabela paralela: o
  // token é dado do projeto, como o título — um segundo lugar seria um segundo
  // caminho para o mesmo dado) E entram no snapshot de CADA versão, para que
  // mudar um token seja versionado como qualquer outra mudança. Linha antiga
  // com `tokens_json` NULL = usa os PADRÕES; nada de backfill inventado.
  garantirColuna(db, "arquiteto_projetos", "tokens_json", "TEXT");
  garantirColuna(db, "arquiteto_versoes", "tokens_json", "TEXT");
  // PUBLICAÇÃO (item 10 do dono, 08/10/2026): mais duas colunas ADITIVAS na
  // linha do projeto. `publicar_token` é o segredo do link público (NULL = não
  // publicado) e `publicado_em` é quando. O índice UNIQUE garante UM projeto por
  // token — o token nunca é derivado do id do projeto nem do dono. SQLite deixa
  // vários NULL no índice UNIQUE, então "não publicado" convive em paz.
  garantirColuna(db, "arquiteto_projetos", "publicar_token", "TEXT");
  garantirColuna(db, "arquiteto_projetos", "publicado_em", "TEXT");
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_arquiteto_projetos_publicar ON arquiteto_projetos(publicar_token)",
  );
  // ENDEREÇO LEGÍVEL (dono, 09/10/2026): `slug` é o nome que vira
  // `<slug>.miraitohope.com`. Índice ÚNICO sobre `lower(slug)` (nome de DNS não
  // se repete, nem entre contas, e "Prova"/"prova" são o MESMO endereço) e
  // PARCIAL (`WHERE slug IS NOT NULL`) para que "sem endereço" conviva em paz.
  garantirColuna(db, "arquiteto_projetos", "slug", "TEXT");
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_arquiteto_projetos_slug ON arquiteto_projetos(lower(slug)) WHERE slug IS NOT NULL",
  );
  // DOMÍNIO PRÓPRIO (dono, 09/10/2026 — o "Conectar um domínio" do Figma Make):
  // o domínio do CLIENTE (ex.: minhaloja.com.br) que aponta para a borda. Mesma
  // régua do slug: único no mundo, minúsculo, e só vale com o projeto publicado.
  garantirColuna(db, "arquiteto_projetos", "dominio", "TEXT");
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_arquiteto_projetos_dominio ON arquiteto_projetos(lower(dominio)) WHERE dominio IS NOT NULL",
  );
  // A ÚLTIMA MILHA do domínio (dono, 09/10/2026 — "tem que ter tudo para fazer
  // essa integração"). Quem cria o vhost e emite o certificado é o serviço da
  // BORDA (`mirai-publica-dominio`, systemd, root) — o app não tem root. Estas
  // duas colunas ADITIVAS guardam o veredito dele: quando ficou no ar e, se
  // falhou, o motivo. O painel mostra o estado REAL, nunca "no ar" antes do tempo.
  garantirColuna(db, "arquiteto_projetos", "dominio_pronto_em", "TEXT");
  garantirColuna(db, "arquiteto_projetos", "dominio_erro", "TEXT");
  // CLOUDFLARE (dono, 09/10/2026 — o BOTÃO "Conectar com Cloudflare"): o
  // `access_token` que o OAuth devolve é SEGREDO e vive CIFRADO aqui
  // (`segredo-guardado.ts`, AES-256-GCM). A zona fica em claro (não é segredo).
  // Nada disso vai para log; a tela nunca devolve o token.
  garantirColuna(db, "arquiteto_projetos", "dominio_cf_token", "TEXT");
  garantirColuna(db, "arquiteto_projetos", "dominio_cf_zona", "TEXT");
  // PASTA DO PROJETO (dono, 11/10/2026): a qual pasta/categoria este projeto
  // pertence. NULL = "Sem pasta". Aditiva e nullable — projeto antigo não muda.
  garantirColuna(db, "arquiteto_projetos", "pasta_id", "TEXT");
  garantirColuna(db, "arquiteto_projetos", "dominio_cf_em", "TEXT");
  // GITHUB (dono, 09/10/2026 — o botão "Conectar com GitHub"): mesmo padrão do
  // Cloudflare. O `access_token` do OAuth é SEGREDO e vive CIFRADO aqui
  // (`segredo-guardado.ts`, AES-256-GCM). O `login` (quem conectou) e a data
  // ficam em claro — não são segredo. Nada disso vai para log.
  garantirColuna(db, "arquiteto_projetos", "github_token_cifrado", "TEXT");
  garantirColuna(db, "arquiteto_projetos", "github_login", "TEXT");
  garantirColuna(db, "arquiteto_projetos", "github_em", "TEXT");
  // INTEGRAÇÕES (dono, 09/10/2026): QUAIS integrações o projeto USA — uma lista
  // de identificadores curtos (ex.: ['github','supabase']) guardada como JSON.
  // Coluna ADITIVA na PRÓPRIA linha do projeto, pelo mesmo motivo dos tokens: é
  // dado do projeto, e um segundo lugar seria um segundo caminho para o mesmo
  // dado. Linha antiga com NULL = lista vazia; nada de backfill inventado.
  garantirColuna(db, "arquiteto_projetos", "integracoes", "TEXT");
  return db;
}

/** Título curto a partir do primeiro pedido (mesma ideia do título de conversa). */
export function tituloDoPedido(texto: string): string {
  const limpo = (texto || "").replace(/\s+/g, " ").trim();
  if (!limpo) return TITULO_PADRAO;
  return limpo.length > LIMITE_TITULO ? `${limpo.slice(0, LIMITE_TITULO).trim()}…` : limpo;
}

/** Impressão do conteúdo de um conjunto de arquivos (curta, só para comparar). */
function assinaturaDe(arquivos: ArquivoProjeto[]): string {
  const base = arquivos.map((a) => `${a.nome}\u0000${a.conteudo}`).join("\u0001");
  return createHash("sha256").update(base).digest("hex").slice(0, 12);
}

/** Lê os nomes de arquivo de um snapshot (arquivos_json). Nunca lança. */
function caminhosDoJson(json: string): string[] {
  try {
    const arr = JSON.parse(json) as ArquivoProjeto[];
    if (!Array.isArray(arr)) return [];
    return arr.filter((a) => a && typeof a.nome === "string" && a.nome.trim()).map((a) => a.nome.trim());
  } catch {
    return [];
  }
}

/** Lê os arquivos de um snapshot (arquivos_json). Nunca lança. */
function arquivosDoJson(json: string): ArquivoProjeto[] {
  try {
    const arr = JSON.parse(json) as ArquivoProjeto[];
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((a) => a && typeof a.nome === "string" && a.nome.trim())
      .map((a) => ({ nome: a.nome.trim(), conteudo: typeof a.conteudo === "string" ? a.conteudo : "" }));
  } catch {
    return [];
  }
}

/**
 * Grava um SNAPSHOT do projeto como a PRÓXIMA versão. Deve rodar DENTRO da
 * mesma transação que altera os arquivos (o snapshot tem de refletir o estado
 * gravado). Devolve o número da versão criada.
 */
function inserirVersao(
  db: Database.Database,
  projetoId: string,
  arquivos: ArquivoProjeto[],
  tokens: Tokens,
  criadoEm: string,
): number {
  const linha = db
    .prepare("SELECT COALESCE(MAX(numero), 0) AS n FROM arquiteto_versoes WHERE projeto_id = ?")
    .get(projetoId) as { n: number } | undefined;
  const numero = Number(linha?.n ?? 0) + 1;
  db.prepare(
    `INSERT INTO arquiteto_versoes (projeto_id, numero, criado_em, arquivos_json, tokens_json)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(projetoId, numero, criadoEm, JSON.stringify(arquivos), JSON.stringify(tokens));
  return numero;
}

/** Confere se o projeto é DESTA conta. A trava herdada pelas funções de versão. */
function ehDonoDoProjeto(db: Database.Database, userId: number, projetoId: string): boolean {
  return Boolean(
    db.prepare("SELECT 1 FROM arquiteto_projetos WHERE id = ? AND user_id = ?").get(projetoId, userId),
  );
}

/**
 * O id da CONTA dona do projeto — sem pedir `userId` de propósito.
 *
 * POR QUE (dono, 09/10/2026 — a PONTE DAS INTEGRAÇÕES): quem chama a ponte é o
 * site PUBLICADO, com um TOKEN escopado ao (projeto, integração) — não há sessão
 * para dizer de quem é a conta. Mas a credencial a usar é SEMPRE a da conta dona
 * do projeto. Esta é a ponte entre o `projetoId` e o `dono_id`, para resolver a
 * credencial pela MESMA régua das outras rotas. Nunca lança: projeto inexistente
 * ou banco fora do ar viram `null` (a rota responde 404, sem vazar nada).
 */
export function donoDoProjeto(projetoId: string): number | null {
  try {
    const db = getDb();
    const l = db
      .prepare("SELECT user_id FROM arquiteto_projetos WHERE id = ?")
      .get(projetoId) as { user_id: number } | undefined;
    db.close();
    return l ? Number(l.user_id) : null;
  } catch {
    return null; // qualquer tropeço vale como "não existe"
  }
}

/** Lista os projetos da pessoa — mais recentes primeiro. (id, título, datas) */
export function listarProjetos(userId: number): ProjetoResumo[] {
  const db = getDb();
  const linhas = db
    .prepare(
      `SELECT id, titulo, criado_em, atualizado_em, pasta_id, slug, dominio, publicado_em
       FROM arquiteto_projetos WHERE user_id = ?
       ORDER BY atualizado_em DESC`,
    )
    .all(userId) as ProjetoResumo[];
  db.close();
  return linhas;
}

/* ─────────────────────────── PASTAS / CATEGORIAS ─────────────────────────── */

export type PastaResumo = {
  id: string;
  nome: string;
  criado_em: string;
  atualizado_em: string;
  /** quantos projetos há nesta pasta (contagem viva, feita na leitura) */
  projetos: number;
};

/** Lista as pastas da conta, com a contagem de projetos de cada uma. */
export function listarPastas(userId: number): PastaResumo[] {
  const db = getDb();
  const linhas = db
    .prepare(
      `SELECT p.id, p.nome, p.criado_em, p.atualizado_em,
              (SELECT COUNT(*) FROM arquiteto_projetos a
                WHERE a.pasta_id = p.id AND a.user_id = p.user_id) AS projetos
       FROM arquiteto_pastas p
       WHERE p.user_id = ?
       ORDER BY p.nome COLLATE NOCASE ASC`,
    )
    .all(userId) as PastaResumo[];
  db.close();
  return linhas;
}

/** Cria uma pasta (categoria) para a conta. Nome vazio → null. */
export function criarPasta(userId: number, nome: string): PastaResumo | null {
  const limpo = (nome || "").trim().slice(0, LIMITE_TITULO);
  if (!limpo) return null;
  const db = getDb();
  const agora = new Date().toISOString();
  const id = `pasta_${randomUUID()}`;
  db.prepare(
    `INSERT INTO arquiteto_pastas (id, user_id, nome, criado_em, atualizado_em)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, userId, limpo, agora, agora);
  db.close();
  return { id, nome: limpo, criado_em: agora, atualizado_em: agora, projetos: 0 };
}

/** Renomeia uma pasta da conta. null se não for desta conta. */
export function renomearPasta(userId: number, pastaId: string, nome: string): PastaResumo | null {
  const limpo = (nome || "").trim().slice(0, LIMITE_TITULO);
  if (!limpo) return null;
  const db = getDb();
  const info = db
    .prepare("UPDATE arquiteto_pastas SET nome = ?, atualizado_em = ? WHERE id = ? AND user_id = ?")
    .run(limpo, new Date().toISOString(), pastaId, userId);
  if (!info.changes) {
    db.close();
    return null;
  }
  const linha = db
    .prepare(
      `SELECT p.id, p.nome, p.criado_em, p.atualizado_em,
              (SELECT COUNT(*) FROM arquiteto_projetos a
                WHERE a.pasta_id = p.id AND a.user_id = p.user_id) AS projetos
       FROM arquiteto_pastas p WHERE p.id = ? AND p.user_id = ?`,
    )
    .get(pastaId, userId) as PastaResumo | undefined;
  db.close();
  return linha ?? null;
}

/**
 * Apaga a pasta. Os projetos dela NÃO são apagados: voltam a "Sem pasta"
 * (`pasta_id = NULL`). É o comportamento honesto — apagar uma categoria não pode
 * destruir o trabalho que estava dentro dela.
 */
export function apagarPasta(userId: number, pastaId: string): boolean {
  const db = getDb();
  const dono = db
    .prepare("SELECT 1 AS achou FROM arquiteto_pastas WHERE id = ? AND user_id = ?")
    .get(pastaId, userId) as { achou: number } | undefined;
  if (!dono) {
    db.close();
    return false;
  }
  db.prepare("UPDATE arquiteto_projetos SET pasta_id = NULL WHERE pasta_id = ? AND user_id = ?").run(
    pastaId,
    userId,
  );
  db.prepare("DELETE FROM arquiteto_pastas WHERE id = ? AND user_id = ?").run(pastaId, userId);
  db.close();
  return true;
}

/**
 * Move um projeto para uma pasta (ou para "Sem pasta", com `pastaId` null/vazio).
 * Confere que a PASTA e o PROJETO são da mesma conta — nada de mover projeto de
 * uma conta para pasta de outra. Devolve false se algum dos dois não for da conta.
 */
export function definirPastaDoProjeto(
  userId: number,
  projetoId: string,
  pastaId: string | null,
): boolean {
  const db = getDb();
  if (!ehDonoDoProjeto(db, userId, projetoId)) {
    db.close();
    return false;
  }
  const alvo = (pastaId || "").trim() || null;
  if (alvo) {
    const pastaOk = db
      .prepare("SELECT 1 AS achou FROM arquiteto_pastas WHERE id = ? AND user_id = ?")
      .get(alvo, userId) as { achou: number } | undefined;
    if (!pastaOk) {
      db.close();
      return false;
    }
  }
  db.prepare("UPDATE arquiteto_projetos SET pasta_id = ? WHERE id = ? AND user_id = ?").run(
    alvo,
    projetoId,
    userId,
  );
  db.close();
  return true;
}

/** Projeto completo (com arquivos), escopado ao dono. null se não for desta conta. */
export function obterProjeto(userId: number, projetoId: string): ProjetoCompleto | null {
  const db = getDb();
  const projeto = db
    .prepare(
      `SELECT id, titulo, criado_em, atualizado_em, pasta_id, tokens_json, publicar_token, publicado_em
       FROM arquiteto_projetos WHERE id = ? AND user_id = ?`,
    )
    .get(projetoId, userId) as (ProjetoResumo & { tokens_json: string | null }) | undefined;
  if (!projeto) {
    db.close();
    return null;
  }
  const arquivos = db
    .prepare(
      `SELECT caminho AS nome, conteudo
       FROM arquiteto_arquivos WHERE projeto_id = ? ORDER BY ordem ASC, id ASC`,
    )
    .all(projetoId) as ArquivoProjeto[];
  db.close();
  return comoCompleto(projeto, arquivos);
}

/** O ÚLTIMO projeto da conta (o mais recentemente atualizado). null se não há. */
export function ultimoProjeto(userId: number): ProjetoCompleto | null {
  const db = getDb();
  const projeto = db
    .prepare(
      `SELECT id, titulo, criado_em, atualizado_em
       FROM arquiteto_projetos WHERE user_id = ?
       ORDER BY atualizado_em DESC LIMIT 1`,
    )
    .get(userId) as ProjetoResumo | undefined;
  db.close();
  if (!projeto) return null;
  return obterProjeto(userId, projeto.id);
}

/** Cria um projeto vazio (sem arquivos) com o título dado ou o padrão. */
export function criarProjeto(userId: number, titulo?: string): ProjetoResumo {
  const db = getDb();
  const agora = new Date().toISOString();
  const id = `proj_${randomUUID()}`;
  const tit = (titulo || "").trim() || TITULO_PADRAO;
  db.prepare(
    `INSERT INTO arquiteto_projetos (id, user_id, titulo, criado_em, atualizado_em)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, userId, tit, agora, agora);
  db.close();
  return { id, titulo: tit, criado_em: agora, atualizado_em: agora };
}

/**
 * CRIA (projetoId nulo) ou ATUALIZA um projeto, gravando o conjunto INTEIRO de
 * arquivos (o cliente manda sempre a lista completa: substitui por inteiro, na
 * ordem recebida). CADA chamada bem-sucedida grava também uma VERSÃO (snapshot)
 * na mesma transação — é assim que "cada geração vira uma versão".
 *
 * TOKENS DE DESIGN: `tokens` é opcional. Veio um conjunto válido → grava nele
 * (e a versão guarda os tokens junto com os arquivos). NÃO veio → MANTÉM os
 * tokens atuais: uma edição de arquivo (editor, undo, restaurar) NUNCA apaga os
 * tokens do projeto. A IDEMPOTÊNCIA compara ARQUIVOS **e** TOKENS com o último
 * snapshot: só mexer num token já é uma mudança — logo, vira versão nova.
 *
 * Devolve null quando o chamador pediu para atualizar um `projetoId` que NÃO é
 * desta conta (ou sumiu): nesse caso a rota responde 404 sem vazar nada.
 */
export function salvarProjeto(
  userId: number,
  projetoId: string | null,
  titulo: string | null,
  arquivos: ArquivoProjeto[],
  tokens?: Tokens | null,
): ProjetoCompleto | null {
  const limpos = (Array.isArray(arquivos) ? arquivos : [])
    .filter((a) => a && typeof a.nome === "string" && a.nome.trim())
    .map((a) => ({
      nome: a.nome.trim(),
      conteudo: typeof a.conteudo === "string" ? a.conteudo : "",
    }));
  if (!limpos.length) return null;

  const db = getDb();
  const agora = new Date().toISOString();
  let id = (projetoId || "").trim();

  // Os tokens que ENTRAM: os atuais do projeto, se nenhum conjunto novo veio.
  let tokensAtuais = normalizarTokens({});
  if (id) {
    // Pediu para atualizar: só vale se o projeto for DESTA conta.
    if (!ehDonoDoProjeto(db, userId, id)) {
      db.close();
      return null; // não existe / não é seu → a rota devolve 404
    }
    const linhaTok = db
      .prepare("SELECT tokens_json FROM arquiteto_projetos WHERE id = ? AND user_id = ?")
      .get(id, userId) as { tokens_json: string | null } | undefined;
    tokensAtuais = tokensDoJson(linhaTok?.tokens_json);
  }
  const tokensFinais: Tokens =
    tokens && typeof tokens === "object" ? normalizarTokens(tokens) : tokensAtuais;

  if (id) {
    // IDEMPOTÊNCIA (a trava contra "versão vazia"): se ARQUIVOS **e** TOKENS
    // enviados são IGUAIS ao estado atual — lido da última versão, que é o
    // espelho fiel do que está gravado — NÃO reescreve e NÃO cria versão. É o
    // que faz o autosave do editor (e um token "salvo de novo" igual) não
    // poluir a história. Mudar um token DIFERE aqui → cria versão.
    const ultima = db
      .prepare(
        "SELECT arquivos_json, tokens_json FROM arquiteto_versoes WHERE projeto_id = ? ORDER BY numero DESC LIMIT 1",
      )
      .get(id) as { arquivos_json: string; tokens_json: string | null } | undefined;
    if (
      ultima &&
      assinaturaDe(arquivosDoJson(ultima.arquivos_json)) === assinaturaDe(limpos) &&
      assinaturaTokens(tokensDoJson(ultima.tokens_json)) === assinaturaTokens(tokensFinais)
    ) {
      const atual = db
        .prepare(
          `SELECT id, titulo, criado_em, atualizado_em, pasta_id, tokens_json, publicar_token, publicado_em
           FROM arquiteto_projetos WHERE id = ? AND user_id = ?`,
        )
        .get(id, userId) as ProjetoResumo & { tokens_json: string | null };
      const arquivosAtuais = db
        .prepare(
          `SELECT caminho AS nome, conteudo
           FROM arquiteto_arquivos WHERE projeto_id = ? ORDER BY ordem ASC, id ASC`,
        )
        .all(id) as ArquivoProjeto[];
      db.close();
      return comoCompleto(atual, arquivosAtuais);
    }
  } else {
    // Projeto novo do zero — já nasce com os tokens (padrão ou os enviados).
    id = `proj_${randomUUID()}`;
    const tit = (titulo || "").trim() || TITULO_PADRAO;
    db.prepare(
      `INSERT INTO arquiteto_projetos (id, user_id, titulo, criado_em, atualizado_em, tokens_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, userId, tit, agora, agora, JSON.stringify(tokensFinais));
  }

  // Substitui os arquivos por inteiro + grava a VERSÃO com os tokens (numa transação).
  const insert = db.prepare(
    `INSERT INTO arquiteto_arquivos (projeto_id, caminho, conteudo, ordem, criado_em, atualizado_em)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const gravar = db.transaction((lista: ArquivoProjeto[]) => {
    db.prepare("DELETE FROM arquiteto_arquivos WHERE projeto_id = ?").run(id);
    lista.forEach((a, i) => insert.run(id, a.nome, a.conteudo, i, agora, agora));
    inserirVersao(db, id, lista, tokensFinais, agora);
  });
  gravar(limpos);

  // Renomeia só se um título não-vazio veio junto (a rota de renome tem a sua).
  // Os tokens SEMPRE são regravados (é o reflexo de `tokensFinais`).
  const sets = ["atualizado_em = ?", "tokens_json = ?"];
  const valores: (string | number)[] = [agora, JSON.stringify(tokensFinais)];
  if (titulo && titulo.trim()) {
    sets.push("titulo = ?");
    valores.push(titulo.trim());
  }
  valores.push(id, userId);
  db.prepare(
    `UPDATE arquiteto_projetos SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`,
  ).run(...(valores as never[]));

  const projeto = db
    .prepare(
      `SELECT id, titulo, criado_em, atualizado_em, pasta_id, tokens_json, publicar_token, publicado_em
       FROM arquiteto_projetos WHERE id = ? AND user_id = ?`,
    )
    .get(id, userId) as ProjetoResumo & { tokens_json: string | null };
  const gravados = db
    .prepare(
      `SELECT caminho AS nome, conteudo
       FROM arquiteto_arquivos WHERE projeto_id = ? ORDER BY ordem ASC, id ASC`,
    )
    .all(id) as ArquivoProjeto[];
  db.close();
  return comoCompleto(projeto, gravados);
}

/* ── HISTÓRIA por projeto (versões) ─────────────────────────────────────────
   Todas as funções abaixo conferem a POSSE do projeto pelo `user_id` da sessão
   antes de tocar em `arquiteto_versoes`: versão de outra conta é INEXISTENTE. */

/** Lista as versões do projeto (mais antiga → mais nova). null se não é desta conta. */
export function listarVersoes(userId: number, projetoId: string): VersaoResumo[] | null {
  const db = getDb();
  if (!ehDonoDoProjeto(db, userId, projetoId)) {
    db.close();
    return null;
  }
  const linhas = db
    .prepare(
      `SELECT numero, criado_em, arquivos_json
       FROM arquiteto_versoes WHERE projeto_id = ? ORDER BY numero ASC`,
    )
    .all(projetoId) as { numero: number; criado_em: string; arquivos_json: string }[];
  db.close();
  return linhas.map((l) => ({
    numero: l.numero,
    criado_em: l.criado_em,
    caminhos: caminhosDoJson(l.arquivos_json),
    assinatura: assinaturaDe(arquivosDoJson(l.arquivos_json)),
  }));
}

/** Uma versão completa (com conteúdo). null se não existe ou não é desta conta. */
export function obterVersao(userId: number, projetoId: string, numero: number): VersaoCompleta | null {
  const db = getDb();
  if (!ehDonoDoProjeto(db, userId, projetoId)) {
    db.close();
    return null;
  }
  const linha = db
    .prepare("SELECT numero, criado_em, arquivos_json FROM arquiteto_versoes WHERE projeto_id = ? AND numero = ?")
    .get(projetoId, numero) as { numero: number; criado_em: string; arquivos_json: string } | undefined;
  db.close();
  if (!linha) return null;
  const arquivos = arquivosDoJson(linha.arquivos_json);
  return {
    numero: linha.numero,
    criado_em: linha.criado_em,
    caminhos: arquivos.map((a) => a.nome),
    assinatura: assinaturaDe(arquivos),
    arquivos,
  };
}

/**
 * RESTAURA uma versão: os arquivos daquela versão viram os arquivos ATUAIS e
 * UMA NOVA versão é gravada em cima (a história NUNCA é destruída — restaurar
 * não apaga nada, só acrescenta). Posse conferida no projeto E na versão.
 * Devolve o projeto atualizado (com arquivos). null se não achar / não for seu.
 */
export function restaurarVersao(userId: number, projetoId: string, numero: number): ProjetoCompleto | null {
  const db = getDb();
  if (!ehDonoDoProjeto(db, userId, projetoId)) {
    db.close();
    return null;
  }
  const linha = db
    .prepare(
      "SELECT arquivos_json, tokens_json FROM arquiteto_versoes WHERE projeto_id = ? AND numero = ?",
    )
    .get(projetoId, numero) as { arquivos_json: string; tokens_json: string | null } | undefined;
  if (!linha) {
    db.close();
    return null;
  }
  const arquivos = arquivosDoJson(linha.arquivos_json);
  if (!arquivos.length) {
    db.close();
    return null;
  }

  // Os TOKENS também voltam com a versão — é parte do snapshot. Snapshot antigo
  // (sem tokens gravados) mantém os tokens ATUAIS: nada de zerar por engano.
  const linhaTok = db
    .prepare("SELECT tokens_json FROM arquiteto_projetos WHERE id = ? AND user_id = ?")
    .get(projetoId, userId) as { tokens_json: string | null } | undefined;
  const tokensAtuais = tokensDoJson(linhaTok?.tokens_json);
  const tokensFinais = linha.tokens_json ? tokensDoJson(linha.tokens_json) : tokensAtuais;

  const agora = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO arquiteto_arquivos (projeto_id, caminho, conteudo, ordem, criado_em, atualizado_em)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const aplicar = db.transaction((lista: ArquivoProjeto[]) => {
    db.prepare("DELETE FROM arquiteto_arquivos WHERE projeto_id = ?").run(projetoId);
    lista.forEach((a, i) => insert.run(projetoId, a.nome, a.conteudo, i, agora, agora));
    // A restauração TAMBÉM vira uma versão nova — nada de perder a atual.
    // Ela carrega os tokens da versão restaurada: a história segue fiel.
    inserirVersao(db, projetoId, lista, tokensFinais, agora);
    db.prepare(
      "UPDATE arquiteto_projetos SET atualizado_em = ?, tokens_json = ? WHERE id = ? AND user_id = ?",
    ).run(agora, JSON.stringify(tokensFinais), projetoId, userId);
  });
  aplicar(arquivos);

  const projeto = db
    .prepare(
      `SELECT id, titulo, criado_em, atualizado_em, pasta_id, tokens_json, publicar_token, publicado_em
       FROM arquiteto_projetos WHERE id = ? AND user_id = ?`,
    )
    .get(projetoId, userId) as ProjetoResumo & { tokens_json: string | null };
  const gravados = db
    .prepare(
      `SELECT caminho AS nome, conteudo
       FROM arquiteto_arquivos WHERE projeto_id = ? ORDER BY ordem ASC, id ASC`,
    )
    .all(projetoId) as ArquivoProjeto[];
  db.close();
  return comoCompleto(projeto, gravados);
}

/** Renomeia — só se o projeto for da pessoa. null quando não é (rota → 404/400). */
export function renomearProjeto(
  userId: number,
  projetoId: string,
  titulo: string,
): ProjetoCompleto | null {
  const tit = (titulo || "").trim();
  if (!tit) return null;
  const db = getDb();
  const r = db
    .prepare(
      "UPDATE arquiteto_projetos SET titulo = ?, atualizado_em = ? WHERE id = ? AND user_id = ?",
    )
    .run(tit, new Date().toISOString(), projetoId, userId);
  db.close();
  if (Number((r as { changes?: number }).changes ?? 0) <= 0) return null;
  return obterProjeto(userId, projetoId);
}

/** Apaga o projeto (e seus arquivos E SUA HISTÓRIA) — só se for da pessoa. */
export function apagarProjeto(userId: number, projetoId: string): boolean {
  const db = getDb();
  if (!ehDonoDoProjeto(db, userId, projetoId)) {
    db.close();
    return false;
  }
  db.prepare("DELETE FROM arquiteto_assets WHERE projeto_id = ?").run(projetoId);
  db.prepare("DELETE FROM arquiteto_arquivos WHERE projeto_id = ?").run(projetoId);
  db.prepare("DELETE FROM arquiteto_versoes WHERE projeto_id = ?").run(projetoId);
  const r = db.prepare("DELETE FROM arquiteto_projetos WHERE id = ?").run(projetoId);
  db.close();
  return Number((r as { changes?: number }).changes ?? 0) > 0;
}

/* ── ASSETS do projeto (imagens como BLOB, escopadas à conta) ────────────────
   Toda função confere a POSSE do projeto pelo `user_id` da sessão ANTES de
   tocar em `arquiteto_assets`: asset de outra conta é INEXISTENTE (as rotas
   respondem 404, nunca "existe, mas não é seu"). O CAMINHO é relativo ao
   projeto (`assets/logo.png`) — é o que o código referencia e o que a prévia
   reescreve para a URL de serviço. */

export type AssetResumo = {
  caminho: string;
  mime: string;
  tamanho: number;
  criado_em: string;
};

/** Lista os assets do projeto (ordem de criação). null se o projeto não é desta conta. */
export function listarAssets(userId: number, projetoId: string): AssetResumo[] | null {
  const db = getDb();
  if (!ehDonoDoProjeto(db, userId, projetoId)) {
    db.close();
    return null;
  }
  const linhas = db
    .prepare(
      `SELECT caminho, mime, tamanho, criado_em
       FROM arquiteto_assets WHERE projeto_id = ? ORDER BY id ASC`,
    )
    .all(projetoId) as AssetResumo[];
  db.close();
  return linhas;
}

/**
 * Grava (ou SUBSTITUI) o BLOB de um asset do projeto. Devolve o resumo gravado
 * ou null quando o projeto não é desta conta (a rota responde 404). O `caminho`
 * já chega normalizado/validado pelo chamador (rota), sempre sob `assets/`.
 */
export function salvarAsset(
  userId: number,
  projetoId: string,
  caminho: string,
  mime: string,
  bytes: Buffer,
): AssetResumo | null {
  const db = getDb();
  if (!ehDonoDoProjeto(db, userId, projetoId)) {
    db.close();
    return null;
  }
  const agora = new Date().toISOString();
  db.prepare(
    `INSERT INTO arquiteto_assets (projeto_id, caminho, mime, bytes, tamanho, criado_em)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (projeto_id, caminho)
     DO UPDATE SET mime = excluded.mime, bytes = excluded.bytes,
                   tamanho = excluded.tamanho, criado_em = excluded.criado_em`,
  ).run(projetoId, caminho, mime, bytes, bytes.length, agora);
  db.close();
  return { caminho, mime, tamanho: bytes.length, criado_em: agora };
}

/** Devolve o BLOB + mime de um asset. null se não existe ou o projeto não é desta conta. */
export function obterAssetBytes(
  userId: number,
  projetoId: string,
  caminho: string,
): { mime: string; bytes: Buffer; tamanho: number } | null {
  const db = getDb();
  if (!ehDonoDoProjeto(db, userId, projetoId)) {
    db.close();
    return null;
  }
  const linha = db
    .prepare("SELECT mime, bytes, tamanho FROM arquiteto_assets WHERE projeto_id = ? AND caminho = ?")
    .get(projetoId, caminho) as { mime: string; bytes: Buffer; tamanho: number } | undefined;
  db.close();
  if (!linha) return null;
  return linha;
}

/** Apaga o asset (os BYTES saem do banco). false se não é desta conta ou não existe. */
export function apagarAsset(userId: number, projetoId: string, caminho: string): boolean {
  const db = getDb();
  if (!ehDonoDoProjeto(db, userId, projetoId)) {
    db.close();
    return false;
  }
  const r = db
    .prepare("DELETE FROM arquiteto_assets WHERE projeto_id = ? AND caminho = ?")
    .run(projetoId, caminho);
  db.close();
  return Number((r as { changes?: number }).changes ?? 0) > 0;
}

/* ── PUBLICAÇÃO do projeto (link público read-only — item 10 do dono) ─────────
   O dono publica um projeto e recebe um link `/p/<token>` que abre SEM sessão.
   O token é um valor ALEATÓRIO (192 bits) gerado AQUI, no servidor — nunca
   derivado do id do projeto nem do id do dono, nunca "chutável". Enquanto
   `publicar_token` não for NULL, a rota pública resolve o token → ESTE projeto
   (e só ele). Despublicar zera a coluna e o link MORRE na hora.
   Todas as funções de dono conferem a posse pelo `user_id` — como o resto do
   arquivo. `obterProjetoPublico` é a ÚNICA leitura sem sessão, e ela só enxerga
   projetos PUBLICADOS. */

/** Um token de link público imprevisível: 24 bytes aleatórios (base64url, ~32
 *  chars). Nunca vem do id do projeto — não há relação nenhuma, é sorteio. */
function gerarTokenPublico(): string {
  return randomBytes(24).toString("base64url");
}

/** O formato mínimo que aceitamos de um token vindo da URL (evita lixo no banco). */
function tokenPublicoValido(token: unknown): token is string {
  return typeof token === "string" && token.length >= 20 && token.length <= 128 && /^[A-Za-z0-9_-]+$/.test(token);
}

/**
 * PUBLICA o projeto (ou REPUBLICA): garante um token e marca `publicado_em`.
 * Idempotente no token — republicar MANTÉM o mesmo link e só atualiza a data (o
 * link sempre mostra o estado ATUAL do projeto, lido a cada acesso). Devolve
 * `{ token, publicado_em }` ou null se o projeto não é desta conta.
 */
export function publicarProjeto(
  userId: number,
  projetoId: string,
): { token: string; publicado_em: string } | null {
  const db = getDb();
  if (!ehDonoDoProjeto(db, userId, projetoId)) {
    db.close();
    return null;
  }
  const atual = db
    .prepare("SELECT publicar_token FROM arquiteto_projetos WHERE id = ? AND user_id = ?")
    .get(projetoId, userId) as { publicar_token: string | null } | undefined;
  const existente = tokenPublicoValido(atual?.publicar_token) ? atual.publicar_token : "";
  const agora = new Date().toISOString();

  const gravar = db.prepare(
    "UPDATE arquiteto_projetos SET publicar_token = ?, publicado_em = ? WHERE id = ? AND user_id = ?",
  );

  if (existente) {
    gravar.run(existente, agora, projetoId, userId);
    db.close();
    return { token: existente, publicado_em: agora };
  }

  // Token novo: em caso (astronomicamente raro) de colisão no índice UNIQUE,
  // tenta outro — nunca devolve um token que não ficou gravado.
  for (let tentativa = 0; tentativa < 6; tentativa++) {
    const token = gerarTokenPublico();
    try {
      gravar.run(token, agora, projetoId, userId);
      db.close();
      return { token, publicado_em: agora };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/UNIQUE/i.test(msg)) {
        db.close();
        throw e;
      }
      // colisão: tenta de novo com outro sorteio
    }
  }
  db.close();
  return null;
}

/** DESPUBLICA: zera o token e a data. O link `/p/<token>` para de funcionar. */
export function despublicarProjeto(userId: number, projetoId: string): boolean {
  const db = getDb();
  if (!ehDonoDoProjeto(db, userId, projetoId)) {
    db.close();
    return false;
  }
  const r = db
    .prepare(
      "UPDATE arquiteto_projetos SET publicar_token = NULL, publicado_em = NULL WHERE id = ? AND user_id = ?",
    )
    .run(projetoId, userId);
  db.close();
  return Number((r as { changes?: number }).changes ?? 0) > 0;
}

/**
 * A LEITURA PÚBLICA (SEM sessão): resolve um token de link no projeto publicado
 * e devolve o projeto COMPLETO + o `donoId` (necessário para ASSINAR as URLs dos
 * assets do próprio dono). Devolve `null` para token inválido, token que não
 * existe ou projeto já despublicado — a página pública responde 404 nos três
 * casos, sem vazar se "existiu algum dia".
 */
export function obterProjetoPublico(
  token: string,
): { projeto: ProjetoCompleto; donoId: number } | null {
  if (!tokenPublicoValido(token)) return null;
  const db = getDb();
  const linha = db
    .prepare(
      `SELECT id, user_id, titulo, criado_em, atualizado_em, pasta_id, tokens_json, publicar_token, publicado_em
       FROM arquiteto_projetos WHERE publicar_token = ? AND publicar_token IS NOT NULL`,
    )
    .get(token) as
    | (ProjetoResumo & {
        user_id: number;
        tokens_json: string | null;
        publicar_token: string | null;
        publicado_em: string | null;
      })
    | undefined;
  if (!linha) {
    db.close();
    return null;
  }
  const arquivos = db
    .prepare(
      `SELECT caminho AS nome, conteudo
       FROM arquiteto_arquivos WHERE projeto_id = ? ORDER BY ordem ASC, id ASC`,
    )
    .all(linha.id) as ArquivoProjeto[];
  db.close();
  return { projeto: comoCompleto(linha, arquivos), donoId: Number(linha.user_id) };
}

// ─── ENDEREÇO LEGÍVEL DO PROJETO (dono, 09/10/2026) ─────────────────────────
// O que o dono pediu olhando o Figma Make: "conexão automática com domínio".
// A régua é a MESMA do link público: endereço só funciona enquanto o projeto
// está PUBLICADO — despublicou, o endereço responde 404 igual ao token.

export const SLUG_MIN = 3;
export const SLUG_MAX = 40;

/**
 * Nomes que já são de serviços NOSSOS (ou de infraestrutura de DNS). Um projeto
 * nunca pode tomar um destes: o endereço do projeto não pode derrubar um serviço
 * de verdade nem confundir quem digita. Espelha `HOSTS_DO_APP` de
 * `dominio-projetos.ts` (lá é o roteamento, aqui é a posse do nome).
 */
const SLUG_RESERVADOS = new Set([
  "app", "www", "api", "id", "arca", "saaso", "mediafactory", "dashboard", "criador",
  "mapa", "mapa-paper", "mcp", "observador", "admin", "painel", "conta", "login",
  "entrar", "mail", "smtp", "imap", "ns", "ns1", "ns2", "dns", "vpn", "dev", "staging",
  "teste", "test", "homolog", "beta", "status", "blog", "loja", "shop", "cdn", "static",
  "assets", "img", "files", "ftp", "ssh", "gateway", "proxy", "core", "mirai", "node2",
  "pathfinder", "darkmatter", "dark-matter", "pocket", "sistema", "suporte", "ajuda",
]);

/** Tira acento, baixa a caixa, troca o que não é letra/número por hífen. */
export function normalizarSlug(bruto: string): string {
  return (bruto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/, "");
}

/** O porquê de um endereço não servir — `""` quando serve. Nunca lança. */
export function motivoSlugInvalido(bruto: string): string {
  const s = normalizarSlug(bruto);
  if (s.length < SLUG_MIN) return `O endereço precisa ter pelo menos ${SLUG_MIN} letras (a-z, 0-9 e -).`;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(s)) return "O endereço só aceita letras sem acento, números e hífen.";
  if (SLUG_RESERVADOS.has(s)) return `"${s}" é de um serviço nosso — escolha outro nome.`;
  return "";
}

/** Um endereço LIVRE: o pedido, depois `-2`, `-3`… Usado para sugerir. */
export function slugLivre(base: string, ignorarProjetoId = ""): string {
  const limpo = normalizarSlug(base);
  const raiz = (limpo.length >= SLUG_MIN ? limpo : "projeto").slice(0, SLUG_MAX - 3).replace(/-+$/, "");
  const db = getDb();
  const existe = db.prepare(
    "SELECT id FROM arquiteto_projetos WHERE lower(slug) = ? AND id <> ?",
  );
  let candidato = raiz;
  for (let n = 2; n < 80; n++) {
    const achou = existe.get(candidato.toLowerCase(), ignorarProjetoId) as { id: string } | undefined;
    if (!achou) break;
    candidato = `${raiz}-${n}`;
  }
  db.close();
  return candidato;
}

/** Estado do endereço de um projeto (o que a tela de Configurações mostra). */
export function enderecoDoProjeto(
  userId: number,
  projetoId: string,
): { slug: string | null; sugerido: string; publicado_em: string | null } | null {
  const db = getDb();
  const l = db
    .prepare("SELECT titulo, slug, publicado_em FROM arquiteto_projetos WHERE id = ? AND user_id = ?")
    .get(projetoId, userId) as { titulo: string; slug: string | null; publicado_em: string | null } | undefined;
  db.close();
  if (!l) return null;
  const slug = l.slug || null;
  return {
    slug,
    sugerido: slug || slugLivre(l.titulo || "projeto", projetoId),
    publicado_em: l.publicado_em || null,
  };
}

/**
 * Grava (ou troca) o endereço do projeto. Endereço vazio = TIRAR o endereço
 * (o projeto continua existindo, só deixa de ter nome próprio).
 * Recusa com recado em PT-BR: curto, reservado, com formato estranho ou tomado.
 */
export function definirSlug(
  userId: number,
  projetoId: string,
  bruto: string,
): { ok: true; slug: string | null } | { ok: false; erro: string } {
  const db = getDb();
  if (!ehDonoDoProjeto(db, userId, projetoId)) {
    db.close();
    return { ok: false, erro: "Projeto não encontrado." };
  }
  const limpo = normalizarSlug(bruto);
  if (!limpo) {
    db.prepare("UPDATE arquiteto_projetos SET slug = NULL WHERE id = ? AND user_id = ?").run(projetoId, userId);
    db.close();
    return { ok: true, slug: null };
  }
  const motivo = motivoSlugInvalido(limpo);
  if (motivo) {
    db.close();
    return { ok: false, erro: motivo };
  }
  const tomado = db
    .prepare("SELECT id FROM arquiteto_projetos WHERE lower(slug) = ? AND id <> ?")
    .get(limpo, projetoId) as { id: string } | undefined;
  if (tomado) {
    db.close();
    return { ok: false, erro: `"${limpo}" já está em uso por outro projeto.` };
  }
  try {
    db.prepare("UPDATE arquiteto_projetos SET slug = ? WHERE id = ? AND user_id = ?").run(limpo, projetoId, userId);
  } catch (e) {
    db.close();
    const msg = e instanceof Error ? e.message : String(e);
    if (/UNIQUE/i.test(msg)) return { ok: false, erro: `"${limpo}" acabou de ser tomado. Tente outro.` };
    throw e;
  }
  db.close();
  return { ok: true, slug: limpo };
}

/** Garante um endereço para o projeto (usado ao PUBLICAR, sem ele escolher). */
export function garantirSlug(userId: number, projetoId: string): string | null {
  const atual = enderecoDoProjeto(userId, projetoId);
  if (!atual) return null;
  if (atual.slug) return atual.slug;
  const r = definirSlug(userId, projetoId, atual.sugerido);
  return r.ok ? r.slug : null;
}

/**
 * O projeto PUBLICADO deste endereço — a MESMA régua de `obterProjetoPublico`:
 * sem publicação, `null` (404 na cara de quem pediu; nunca "existiu um dia").
 */
export function obterProjetoPublicoPorSlug(
  slug: string,
): { projeto: ProjetoCompleto; donoId: number } | null {
  const alvo = normalizarSlug(slug);
  if (!alvo) return null;
  const db = getDb();
  const linha = db
    .prepare(
      `SELECT id, user_id, titulo, criado_em, atualizado_em, tokens_json
       FROM arquiteto_projetos
       WHERE lower(slug) = ? AND slug IS NOT NULL AND publicado_em IS NOT NULL`,
    )
    .get(alvo) as
    | (ProjetoResumo & { user_id: number; tokens_json: string | null })
    | undefined;
  if (!linha) {
    db.close();
    return null;
  }
  const arquivos = db
    .prepare(
      `SELECT caminho AS nome, conteudo
       FROM arquiteto_arquivos WHERE projeto_id = ? ORDER BY ordem ASC, id ASC`,
    )
    .all(linha.id) as ArquivoProjeto[];
  db.close();
  return { projeto: comoCompleto(linha, arquivos), donoId: Number(linha.user_id) };
}

// ─── DOMÍNIO PRÓPRIO DO PROJETO (dono, 09/10/2026) ───────────────────────────
// O "Conectar um domínio" do Figma Make: o domínio do CLIENTE (ex.:
// minhaloja.com.br). O fluxo tem DOIS tempos, e a tela sempre diz em qual está:
//   1. o dono digita o domínio aqui (fica guardado, ainda não abre);
//   2. o DNS do cliente aponta para o IP da borda → então o certificado é
//      emitido e o site abre nesse domínio.
// Nada de prometer "conectado" antes do tempo.

/** O domínio próprio do projeto (null = nenhum) + onde está a última milha. */
export function dominioDoProjeto(
  userId: number,
  projetoId: string,
): { dominio: string | null; pronto_em: string | null; erro: string | null } | null {
  const db = getDb();
  const l = db
    .prepare(
      "SELECT dominio, dominio_pronto_em, dominio_erro FROM arquiteto_projetos WHERE id = ? AND user_id = ?",
    )
    .get(projetoId, userId) as
    | { dominio: string | null; dominio_pronto_em: string | null; dominio_erro: string | null }
    | undefined;
  db.close();
  if (!l) return null;
  return {
    dominio: l.dominio || null,
    pronto_em: l.dominio_pronto_em || null,
    erro: l.dominio_erro || null,
  };
}

/**
 * Candidatos à ÚLTIMA MILHA: domínio conectado, projeto publicado e ainda sem
 * veredito do serviço da borda. Quem confere o DNS é a ROTA (é `async` lá) —
 * aqui só se lista quem pode ser publicado.
 */
export function dominiosParaPublicar(): { projetoId: string; dominio: string }[] {
  const db = getDb();
  const ls = db
    .prepare(
      "SELECT id AS projetoId, dominio FROM arquiteto_projetos " +
        "WHERE dominio IS NOT NULL AND dominio <> '' AND publicado_em IS NOT NULL " +
        "AND (dominio_pronto_em IS NULL OR dominio_pronto_em = '')",
    )
    .all() as { projetoId: string; dominio: string }[];
  db.close();
  return ls;
}

/**
 * CLOUDFLARE — a conexão do projeto (dono, 09/10/2026, o BOTÃO).
 *
 * Estas funções NÃO pedem `userId` de propósito: quem chega aqui já foi
 * autorizado antes (o painel confere a sessão; o callback confere o bilhete
 * assinado do consentimento). O `access_token` vive CIFRADO e nunca sai daqui em
 * claro para fora do servidor.
 */
export function guardarConexaoCloudflare(
  projetoId: string,
  tokenCifrado: string,
  zonaId: string | null,
): boolean {
  const db = getDb();
  const r = db
    .prepare(
      "UPDATE arquiteto_projetos SET dominio_cf_token = ?, dominio_cf_zona = ?, dominio_cf_em = ? WHERE id = ?",
    )
    .run(tokenCifrado, zonaId, new Date().toISOString(), projetoId);
  db.close();
  return r.changes > 0;
}

/** O estado da conexão para a TELA — nunca devolve o token, só se existe. */
export function conexaoCloudflare(
  projetoId: string,
): { conectado: boolean; zona: string | null; em: string | null } | null {
  const db = getDb();
  const l = db
    .prepare("SELECT dominio_cf_token, dominio_cf_zona, dominio_cf_em FROM arquiteto_projetos WHERE id = ?")
    .get(projetoId) as
    | { dominio_cf_token: string | null; dominio_cf_zona: string | null; dominio_cf_em: string | null }
    | undefined;
  db.close();
  if (!l) return null;
  return {
    conectado: !!l.dominio_cf_token,
    zona: l.dominio_cf_zona || null,
    em: l.dominio_cf_em || null,
  };
}

/** O token CIFRADO (para o servidor decifrar na hora de usar). */
export function tokenCloudflareCifrado(projetoId: string): string | null {
  const db = getDb();
  const l = db
    .prepare("SELECT dominio_cf_token FROM arquiteto_projetos WHERE id = ?")
    .get(projetoId) as { dominio_cf_token: string | null } | undefined;
  db.close();
  return l?.dominio_cf_token || null;
}

/** Esquece a conexão (o dono desconectou o Cloudflare). */
export function esquecerCloudflare(projetoId: string): boolean {
  const db = getDb();
  const r = db
    .prepare(
      "UPDATE arquiteto_projetos SET dominio_cf_token = NULL, dominio_cf_zona = NULL, dominio_cf_em = NULL WHERE id = ?",
    )
    .run(projetoId);
  db.close();
  return r.changes > 0;
}

/**
 * GITHUB — a conexão do projeto (dono, 09/10/2026, o botão "Conectar com
 * GitHub"). Espelha o bloco do Cloudflare: estas funções NÃO pedem `userId` de
 * propósito — quem chega aqui já foi autorizado antes (o painel confere a
 * sessão; o callback confere o bilhete assinado do consentimento). O
 * `access_token` vive CIFRADO e nunca sai daqui em claro para fora do servidor.
 */
export function guardarConexaoGithub(
  projetoId: string,
  tokenCifrado: string,
  login: string | null,
): boolean {
  const db = getDb();
  const r = db
    .prepare(
      "UPDATE arquiteto_projetos SET github_token_cifrado = ?, github_login = ?, github_em = ? WHERE id = ?",
    )
    .run(tokenCifrado, login || null, new Date().toISOString(), projetoId);
  db.close();
  return r.changes > 0;
}

/** O estado da conexão para a TELA — nunca devolve o token, só se existe. */
export function conexaoGithub(
  projetoId: string,
): { conectado: boolean; login: string | null; em: string | null } | null {
  const db = getDb();
  const l = db
    .prepare("SELECT github_token_cifrado, github_login, github_em FROM arquiteto_projetos WHERE id = ?")
    .get(projetoId) as
    | { github_token_cifrado: string | null; github_login: string | null; github_em: string | null }
    | undefined;
  db.close();
  if (!l) return null;
  return {
    conectado: !!l.github_token_cifrado,
    login: l.github_login || null,
    em: l.github_em || null,
  };
}

/** O token CIFRADO (para o servidor decifrar na hora de usar). */
export function tokenGithub(projetoId: string): string | null {
  const db = getDb();
  const l = db
    .prepare("SELECT github_token_cifrado FROM arquiteto_projetos WHERE id = ?")
    .get(projetoId) as { github_token_cifrado: string | null } | undefined;
  db.close();
  return l?.github_token_cifrado || null;
}

/** Esquece a conexão (o dono desconectou o GitHub). */
export function esquecerGithub(projetoId: string): boolean {
  const db = getDb();
  const r = db
    .prepare(
      "UPDATE arquiteto_projetos SET github_token_cifrado = NULL, github_login = NULL, github_em = NULL WHERE id = ?",
    )
    .run(projetoId);
  db.close();
  return r.changes > 0;
}

/**
 * TODOS os domínios conectados (mesmo os que ainda não apontam). Serve para o
 * serviço da borda saber o que DESPUBLICAR: domínio desconectado no painel não
 * pode continuar no ar (ver `/api/dominio/conectados`).
 */
export function dominiosConectados(): string[] {
  const db = getDb();
  const ls = db
    .prepare(
      "SELECT dominio FROM arquiteto_projetos WHERE dominio IS NOT NULL AND dominio <> ''",
    )
    .all() as { dominio: string }[];
  db.close();
  return ls.map((l) => l.dominio);
}

/**
 * O VEREDITO do serviço da borda sobre um domínio (chega por segredo
 * compartilhado — ver `/api/dominio/resultado`). `ok` marca no ar; falha guarda
 * o motivo para o painel poder dizer o que aconteceu, em vez de "aguardando".
 */
export function registrarResultadoDominio(
  dominio: string,
  ok: boolean,
  erro: string | null,
): boolean {
  const limpo = normalizarDominio(dominio);
  if (!limpo) return false;
  const db = getDb();
  const r = ok
    ? db
        .prepare(
          "UPDATE arquiteto_projetos SET dominio_pronto_em = ?, dominio_erro = NULL WHERE lower(dominio) = ?",
        )
        .run(new Date().toISOString(), limpo)
    : db
        .prepare(
          "UPDATE arquiteto_projetos SET dominio_pronto_em = NULL, dominio_erro = ? WHERE lower(dominio) = ?",
        )
        .run(erro || "não deu para publicar", limpo);
  db.close();
  return r.changes > 0;
}

/** Grava (ou tira, com vazio) o domínio próprio. Único no mundo. */
export function definirDominio(
  userId: number,
  projetoId: string,
  bruto: string,
): { ok: true; dominio: string | null; pronto_em: string | null; erro: string | null } | { ok: false; erro: string } {
  const db = getDb();
  if (!ehDonoDoProjeto(db, userId, projetoId)) {
    db.close();
    return { ok: false, erro: "Projeto não encontrado." };
  }
  const limpo = normalizarDominio(bruto);
  if (!limpo) {
    db.prepare("UPDATE arquiteto_projetos SET dominio = NULL WHERE id = ? AND user_id = ?").run(projetoId, userId);
    db.close();
    return { ok: true, dominio: null, pronto_em: null, erro: null };
  }
  const motivo = motivoDominioInvalido(limpo);
  if (motivo) {
    db.close();
    return { ok: false, erro: motivo };
  }
  const tomado = db
    .prepare("SELECT id FROM arquiteto_projetos WHERE lower(dominio) = ? AND id <> ?")
    .get(limpo, projetoId) as { id: string } | undefined;
  if (tomado) {
    db.close();
    return { ok: false, erro: `"${limpo}" já está conectado a outro projeto.` };
  }
  try {
    // Trocar de domínio APAGA o veredito anterior (dono, 09/10/2026): o "no ar"
    // era de OUTRO domínio — deixá-lo ali seria mentira no painel.
    db.prepare(
      "UPDATE arquiteto_projetos SET dominio = ?, dominio_pronto_em = NULL, dominio_erro = NULL WHERE id = ? AND user_id = ?",
    ).run(limpo, projetoId, userId);
  } catch (e) {
    db.close();
    const msg = e instanceof Error ? e.message : String(e);
    if (/UNIQUE/i.test(msg)) return { ok: false, erro: `"${limpo}" acabou de ser conectado. Tente outro.` };
    throw e;
  }
  db.close();
  return { ok: true, dominio: limpo, pronto_em: null, erro: null };
}

/**
 * O que o LINK DE CONEXÃO pode ver (dono, 09/10/2026): o domínio pedido e o
 * título do projeto — nada mais. Quem autoriza é o TOKEN assinado
 * (`dominio-token.ts`), não uma sessão: o cliente não tem conta aqui.
 */
export function dominioPublicoDoProjeto(
  projetoId: string,
): { dominio: string | null; titulo: string; pronto_em: string | null; erro: string | null } | null {
  const db = getDb();
  const l = db
    .prepare(
      "SELECT dominio, titulo, dominio_pronto_em, dominio_erro FROM arquiteto_projetos WHERE id = ?",
    )
    .get(projetoId) as
    | {
        dominio: string | null;
        titulo: string | null;
        dominio_pronto_em: string | null;
        dominio_erro: string | null;
      }
    | undefined;
  db.close();
  if (!l) return null;
  return {
    dominio: l.dominio || null,
    titulo: l.titulo || "Site",
    pronto_em: l.dominio_pronto_em || null,
    erro: l.dominio_erro || null,
  };
}
/**
 * O projeto PUBLICADO deste DOMÍNIO próprio — o outro caminho até o MESMO site.
 * Mesma régua do slug e do token: sem publicação, `null` (404).
 */
export function obterProjetoPublicoPorDominio(
  dominio: string,
): { projeto: ProjetoCompleto; donoId: number } | null {
  const alvo = normalizarDominio(dominio);
  if (!alvo) return null;
  const db = getDb();
  const linha = db
    .prepare(
      `SELECT id, user_id, titulo, criado_em, atualizado_em, tokens_json
       FROM arquiteto_projetos
       WHERE lower(dominio) = ? AND dominio IS NOT NULL AND publicado_em IS NOT NULL`,
    )
    .get(alvo) as (ProjetoResumo & { user_id: number; tokens_json: string | null }) | undefined;
  if (!linha) {
    db.close();
    return null;
  }
  const arquivos = db
    .prepare(
      `SELECT caminho AS nome, conteudo
       FROM arquiteto_arquivos WHERE projeto_id = ? ORDER BY ordem ASC, id ASC`,
    )
    .all(linha.id) as ArquivoProjeto[];
  db.close();
  return { projeto: comoCompleto(linha, arquivos), donoId: Number(linha.user_id) };
}

/* ── INTEGRAÇÕES DO PROJETO (dono, 09/10/2026) ───────────────────────────────
   QUAIS integrações o projeto USA — uma LISTA de identificadores curtos (ex.:
   ['github','supabase']). Vive na coluna ADITIVA `integracoes` da PRÓPRIA linha
   do projeto, como um JSON de strings (mesmo espírito de `tokens_json`): lista
   pequena, dado do projeto — um segundo lugar seria um segundo caminho para o
   mesmo dado.

   Estas funções NÃO pedem `userId` de propósito, como as de Cloudflare/GitHub:
   quem chega aqui já foi autorizado ANTES (a ROTA confere a sessão E a posse do
   projeto). `integracoesDoProjeto` é DEFINITIVA: nunca lança — JSON corrompido,
   NULL ou lista vazia viram `[]`. Nada de inventar uma integração que não há. */

/** A régua única da lista de integrações — aplicada ao LER (JSON do banco) e ao
 *  GRAVAR (lista que chega da rota): só strings não vazias, sem duplicados, na
 *  ordem em que aparecem primeiro. Corrompido não é erro: cai em `[]`. */
function normalizarIntegracoes(valor: unknown): string[] {
  let bruto: unknown = valor;
  if (typeof valor === "string") {
    try {
      bruto = JSON.parse(valor);
    } catch {
      return []; // JSON torto: sem integração, jamais um valor inventado
    }
  }
  if (!Array.isArray(bruto)) return [];
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const item of bruto) {
    if (typeof item !== "string") continue;
    const limpo = item.trim();
    if (!limpo || vistos.has(limpo)) continue;
    vistos.add(limpo);
    saida.push(limpo);
  }
  return saida;
}

/** As integrações que o projeto USA. NUNCA lança: sem coluna, NULL, JSON
 *  corrompido ou banco fora do ar → `[]`. */
export function integracoesDoProjeto(projetoId: string): string[] {
  try {
    const db = getDb();
    const l = db
      .prepare("SELECT integracoes FROM arquiteto_projetos WHERE id = ?")
      .get(projetoId) as { integracoes: string | null } | undefined;
    db.close();
    return normalizarIntegracoes(l?.integracoes ?? null);
  } catch {
    return []; // qualquer tropeço na leitura vale como "não há integrações"
  }
}

/**
 * Grava a LISTA de integrações do projeto (substitui por inteiro, como os
 * arquivos): é sempre o estado final que a rota mandou. Filtra duplicados e
 * strings vazias pela MESMA régua da leitura. Devolve `false` quando nenhuma
 * linha foi afetada (projeto sumiu) — a posse já foi conferida pela rota.
 */
export function definirIntegracoesDoProjeto(projetoId: string, lista: string[]): boolean {
  const limpo = normalizarIntegracoes(lista);
  const db = getDb();
  const r = db
    .prepare("UPDATE arquiteto_projetos SET integracoes = ? WHERE id = ?")
    .run(JSON.stringify(limpo), projetoId);
  db.close();
  return r.changes > 0;
}
