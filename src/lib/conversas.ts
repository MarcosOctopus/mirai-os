// Histórico de conversas do chat — persistência no mesmo banco e no mesmo
// padrão do resto do app (better-sqlite3 sobre `data/auth.db`, WAL, tabelas
// criadas com CREATE TABLE IF NOT EXISTS). Nada de biblioteca nova: é a mesma
// que auth.ts/uploads.ts já usam.
//
// POR QUE aqui e não em outro arquivo: `uploads` já mora no auth.db; este é o
// mesmo banco do usuário logado, então não há um segundo caminho de verdade
// para os dados da conta.
//
// Escopo por USUÁRIO: toda leitura filtra por user_id. Uma conversa de outra
// conta é tratada como inexistente (nunca "vaza" por id chutado).
import Database from "better-sqlite3";
import path from "path";
import { randomUUID } from "crypto";

const DB_PATH = path.join(process.cwd(), "data", "auth.db");

export type PapelMensagem = "user" | "assistant";

export type ConversaResumo = {
  id: string;
  titulo: string;
  criada_em: string;
  atualizada_em: string;
  /** 0 = normal, 1 = favoritada. Inteiro porque é assim que o SQLite guarda
      booleano — e o cliente compara por verdadeiro/falso sem conversão. */
  favorita: number;
};

export type MensagemGuardada = {
  id: number;
  papel: PapelMensagem;
  conteudo: string;
  criada_em: string;
};

export type ConversaCompleta = ConversaResumo & { mensagens: MensagemGuardada[] };

const TITULO_PADRAO = "Nova conversa";
const LIMITE_TITULO = 40;

function getDb() {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversas (
      id            TEXT PRIMARY KEY,
      user_id       INTEGER NOT NULL,
      titulo        TEXT NOT NULL,
      criada_em     TEXT NOT NULL,
      atualizada_em TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS mensagens (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      conversa_id TEXT NOT NULL,
      papel       TEXT NOT NULL,
      conteudo    TEXT NOT NULL,
      criada_em   TEXT NOT NULL
    )
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_conversas_user ON conversas(user_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_mensagens_conversa ON mensagens(conversa_id)");

  // ── Migração: a coluna `favorita` nasceu DEPOIS da tabela (dono,
  // 12/10/2026 — os três pontinhos da conversa, no padrão do ChatGPT).
  // `CREATE TABLE IF NOT EXISTS` não acrescenta coluna a uma tabela que já
  // existe: sem este ALTER, um banco em produção (com conversas dentro) ficaria
  // sem a coluna e a listagem quebraria. Roda uma vez; depois disso, o desvio
  // nem entra no ALTER.
  const colunas = db.prepare("PRAGMA table_info(conversas)").all() as { name: string }[];
  if (!colunas.some((c) => c.name === "favorita")) {
    db.exec("ALTER TABLE conversas ADD COLUMN favorita INTEGER NOT NULL DEFAULT 0");
  }

  return db;
}

/** Título no estilo ChatGPT: primeiros ~40 caracteres da 1ª mensagem, limpos. */
export function tituloDaMensagem(texto: string): string {
  const limpo = (texto || "").replace(/\s+/g, " ").trim();
  if (!limpo) return TITULO_PADRAO;
  return limpo.length > LIMITE_TITULO ? `${limpo.slice(0, LIMITE_TITULO).trim()}…` : limpo;
}

/** Lista as conversas da pessoa — FAVORITAS primeiro, e dentro de cada grupo as
 *  mais recentes primeiro (mesma ordem do ChatGPT: as favoritadas ficam no topo
 *  e não se misturam com o histórico). */
export function listarConversas(userId: number): ConversaResumo[] {
  const db = getDb();
  const linhas = db
    .prepare(
      `SELECT id, titulo, criada_em, atualizada_em, favorita
       FROM conversas WHERE user_id = ?
       ORDER BY favorita DESC, atualizada_em DESC`,
    )
    .all(userId) as ConversaResumo[];
  db.close();
  return linhas;
}

/** Cria uma conversa. Sem título, nasce "Nova conversa" (como o ChatGPT). */
export function criarConversa(userId: number, titulo?: string): ConversaResumo {
  const db = getDb();
  const agora = new Date().toISOString();
  const id = `conv_${randomUUID()}`;
  const tit = (titulo || "").trim() || TITULO_PADRAO;
  db.prepare(
    `INSERT INTO conversas (id, user_id, titulo, criada_em, atualizada_em)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, userId, tit, agora, agora);
  db.close();
  return { id, titulo: tit, criada_em: agora, atualizada_em: agora, favorita: 0 };
}

/** Conversa completa (com mensagens), escopada ao dono. null se não existir. */
export function obterConversa(userId: number, conversaId: string): ConversaCompleta | null {
  const db = getDb();
  const conversa = db
    .prepare(
      `SELECT id, titulo, criada_em, atualizada_em, favorita
       FROM conversas WHERE id = ? AND user_id = ?`,
    )
    .get(conversaId, userId) as ConversaResumo | undefined;
  if (!conversa) {
    db.close();
    return null;
  }
  const mensagens = db
    .prepare(
      `SELECT id, papel, conteudo, criada_em
       FROM mensagens WHERE conversa_id = ? ORDER BY id ASC`,
    )
    .all(conversaId) as MensagemGuardada[];
  db.close();
  return { ...conversa, mensagens };
}

/** Existe e é desta pessoa. Leve: só a checagem, sem trazer as mensagens. */
export function conversaExiste(userId: number, conversaId: string): boolean {
  const db = getDb();
  const linha = db
    .prepare("SELECT 1 FROM conversas WHERE id = ? AND user_id = ?")
    .get(conversaId, userId);
  db.close();
  return !!linha;
}

/** Favorita / desfavorita a conversa — só se for da pessoa. Devolve o resumo
 *  atualizado (o cliente usa a resposta do servidor como verdade, em vez de
 *  adivinhar o estado novo). null = não existe / não é desta conta. */
export function definirFavorita(
  userId: number,
  conversaId: string,
  favorita: boolean,
): ConversaResumo | null {
  const db = getDb();
  const dona = db
    .prepare("SELECT 1 FROM conversas WHERE id = ? AND user_id = ?")
    .get(conversaId, userId);
  if (!dona) {
    db.close();
    return null;
  }
  db.prepare("UPDATE conversas SET favorita = ? WHERE id = ? AND user_id = ?").run(
    favorita ? 1 : 0,
    conversaId,
    userId,
  );
  const conversa = db
    .prepare(
      `SELECT id, titulo, criada_em, atualizada_em, favorita
       FROM conversas WHERE id = ? AND user_id = ?`,
    )
    .get(conversaId, userId) as ConversaResumo;
  db.close();
  return conversa;
}

/** Apaga a conversa (e suas mensagens) — só se for da pessoa. */
export function apagarConversa(userId: number, conversaId: string): boolean {
  const db = getDb();
  const dona = db
    .prepare("SELECT 1 FROM conversas WHERE id = ? AND user_id = ?")
    .get(conversaId, userId);
  if (!dona) {
    db.close();
    return false;
  }
  db.prepare("DELETE FROM mensagens WHERE conversa_id = ?").run(conversaId);
  const r = db.prepare("DELETE FROM conversas WHERE id = ?").run(conversaId);
  db.close();
  return Number((r as { changes?: number }).changes ?? 0) > 0;
}

/**
 * Grava uma mensagem e atualiza o relógio da conversa.
 *
 * Dedupe: o cliente manda o histórico INTEIRO a cada envio (o modelo precisa do
 * contexto). Se a última mensagem guardada já é idêntica, não duplica. Isso
 * mantém a ordem e evita a mesma pergunta duas vezes na lista.
 *
 * Título: se a conversa ainda é "Nova conversa" e chega a 1ª mensagem do
 * usuário, o título passa a ser ela — do jeito que o ChatGPT nomeia.
 */
export function registrarMensagem(
  userId: number,
  conversaId: string,
  papel: PapelMensagem,
  conteudo: string,
): MensagemGuardada | null {
  const texto = (conteudo || "").trim();
  if (!texto) return null;
  const db = getDb();
  const conversa = db
    .prepare("SELECT titulo FROM conversas WHERE id = ? AND user_id = ?")
    .get(conversaId, userId) as { titulo: string } | undefined;
  if (!conversa) {
    db.close();
    return null;
  }
  const ultima = db
    .prepare(
      `SELECT papel, conteudo FROM mensagens
       WHERE conversa_id = ? ORDER BY id DESC LIMIT 1`,
    )
    .get(conversaId) as { papel: string; conteudo: string } | undefined;
  if (ultima && ultima.papel === papel && ultima.conteudo === texto) {
    db.close();
    return null; // já estava guardada: nada a fazer
  }
  const agora = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO mensagens (conversa_id, papel, conteudo, criada_em)
       VALUES (?, ?, ?, ?)`,
    )
    .run(conversaId, papel, texto, agora);
  const novo = db
    .prepare(
      `SELECT id, papel, conteudo, criada_em FROM mensagens WHERE id = ?`,
    )
    .get(info.lastInsertRowid) as MensagemGuardada;
  db.prepare("UPDATE conversas SET atualizada_em = ? WHERE id = ?").run(agora, conversaId);
  // Primeira mensagem do usuário batiza a conversa.
  if (papel === "user" && conversa.titulo === TITULO_PADRAO) {
    db.prepare("UPDATE conversas SET titulo = ? WHERE id = ?").run(
      tituloDaMensagem(texto),
      conversaId,
    );
  }
  db.close();
  return novo;
}

/**
 * Garante que existe uma conversa para este turno e grava a pergunta do
 * usuário. Devolve o id — novo, se o cliente ainda não tinha um.
 */
export function prepararTurno(
  userId: number,
  conversaId: string | null | undefined,
  textoUsuario: string,
): string {
  let id = conversaId && conversaId.trim() ? conversaId.trim() : "";
  // Conversa pedida pode não existir / não ser desta pessoa: cai numa nova.
  if (id && !conversaExiste(userId, id)) id = "";
  if (!id) id = criarConversa(userId, tituloDaMensagem(textoUsuario)).id;
  registrarMensagem(userId, id, "user", textoUsuario);
  return id;
}

/**
 * Envolve a resposta do chat para GUARDAR o turno, sem mudar o que a tela
 * recebe: o corpo passa idêntico (o filtro anti-vazamento continua no caminho);
 * a resposta do assistente é acumulada de um "lado" do stream e gravada no fim.
 *
 * Regra do dono (07/out/2026): "novas conversas, novas conversas, tudo na
 * lateral". Isto é o que faz a lista da lateral ter conteúdo de verdade.
 *
 * Se a resposta não for um stream (erro/JSON), só a pergunta fica guardada — a
 * conversa continua existindo na lista, com o que realmente aconteceu.
 */
export function envolverComHistorico(
  resposta: Response,
  opts: { userId: number | null; conversaId: string; textoUsuario: string },
): Response {
  const { userId, conversaId } = opts;
  const headers = new Headers(resposta.headers);
  headers.set("x-conversa-id", conversaId);
  // Sem conta resolvida não há escopo: devolve a resposta como veio.
  if (!userId) return new Response(resposta.body, { status: resposta.status, headers });

  const tipo = resposta.headers.get("content-type") || "";
  if (!resposta.body || !tipo.includes("text/event-stream")) {
    return new Response(resposta.body, { status: resposta.status, headers });
  }

  const [paraCliente, paraSalvar] = resposta.body.tee();

  // Leitura paralela do "lado" que fica: acumula o texto do assistente e grava.
  void (async () => {
    const reader = paraSalvar.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let acumulado = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const linhas = buffer.split("\n");
        buffer = linhas.pop() || "";
        for (const linha of linhas) {
          if (!linha.startsWith("data: ")) continue;
          const dado = linha.slice(6).trim();
          if (!dado || dado === "[DONE]") continue;
          try {
            const p = JSON.parse(dado);
            const pedaco: string = p?.choices?.[0]?.delta?.content || "";
            if (pedaco) acumulado += pedaco;
          } catch {
            /* linha parcial do SSE */
          }
        }
      }
      if (acumulado.trim()) {
        registrarMensagem(userId, conversaId, "assistant", acumulado.trim());
      }
    } catch {
      /* stream interrompido: o que já saiu, saiu — não grava resposta parcial */
    }
  })();

  return new Response(paraCliente, { status: resposta.status, headers });
}

