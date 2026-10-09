/**
 * Telemetria de TOKENS — mede o consumo REAL informado pelos provedores.
 *
 * Regra dura: NUNCA estimar. O que se grava e exatamente o campo de uso que a
 * API devolveu na resposta (Verboo/OpenRouter: `usage.prompt_tokens` +
 * `usage.completion_tokens`; Google: `usageMetadata.promptTokenCount` +
 * `candidatesTokenCount`). Se o provedor nao devolveu uso, nada e gravado.
 *
 * Persistencia: SQLite proprio do app, ao lado do `auth.db`, seguindo o mesmo
 * padrao de `src/lib/auth.ts` (better-sqlite3, WAL, abre/usa/fecha por chamada).
 * NAO abre banco de outro produto.
 *
 * Toda gravacao e NAO FATAL: falha de telemetria nunca derruba a conversa.
 */

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "tokens.db");

// ─── DB ───────────────────────────────────────────────────────────
function abrir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS uso_tokens (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      criado_em      TEXT    NOT NULL,
      provedor       TEXT    NOT NULL,
      modelo         TEXT    NOT NULL,
      tokens_entrada INTEGER NOT NULL DEFAULT 0,
      tokens_saida   INTEGER NOT NULL DEFAULT 0,
      tokens_total   INTEGER NOT NULL DEFAULT 0,
      custo          REAL
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_uso_tokens_criado ON uso_tokens (criado_em)`);
  return db;
}

export type UsoTokens = {
  provedor: string;
  modelo: string;
  tokens_entrada: number;
  tokens_saida: number;
  /** Custo em dolar APENAS quando o provedor informa (ex.: OpenRouter). */
  custo?: number | null;
};

/**
 * Grava UMA chamada medida. Retorna true se persistiu.
 * Qualquer falha e engolida (logada) — o chat NUNCA pode cair por telemetria.
 */
export function registrarUsoTokens(uso: UsoTokens): boolean {
  try {
    const entrada = Math.max(0, Math.floor(Number(uso.tokens_entrada) || 0));
    const saida = Math.max(0, Math.floor(Number(uso.tokens_saida) || 0));
    // Sem nenhum token medido nao ha o que registrar (nao inventa linha).
    if (entrada === 0 && saida === 0) return false;

    const db = abrir();
    try {
      db.prepare(
        `INSERT INTO uso_tokens
           (criado_em, provedor, modelo, tokens_entrada, tokens_saida, tokens_total, custo)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        new Date().toISOString(),
        String(uso.provedor || "desconhecido"),
        String(uso.modelo || "desconhecido"),
        entrada,
        saida,
        entrada + saida,
        typeof uso.custo === "number" && Number.isFinite(uso.custo) ? uso.custo : null,
      );
      return true;
    } finally {
      db.close();
    }
  } catch (e) {
    console.error(
      "Telemetria de tokens falhou (nao fatal):",
      e instanceof Error ? e.message : e,
    );
    return false;
  }
}

// ─── Agregacao ────────────────────────────────────────────────────
export type LinhaUso = {
  provedor: string;
  modelo?: string;
  tokens_entrada: number;
  tokens_saida: number;
  tokens_total: number;
  chamadas: number;
  custo: number | null;
};

export type RecorteUso = {
  tokens_entrada: number;
  tokens_saida: number;
  tokens_total: number;
  chamadas: number;
  custo: number | null;
  por_provedor: LinhaUso[];
  por_modelo: LinhaUso[];
};

export type ResumoUso = RecorteUso & {
  medido: boolean;
  aviso: string | null;
  gerado_em: string;
  mes_corrente: RecorteUso & { inicio: string; fim: string };
};

function linhasPorProvedor(db: Database.Database, where: string, params: unknown[]): LinhaUso[] {
  return db
    .prepare(
      `SELECT provedor,
              COUNT(*)                             chamadas,
              COALESCE(SUM(tokens_entrada), 0)     tokens_entrada,
              COALESCE(SUM(tokens_saida), 0)       tokens_saida,
              COALESCE(SUM(tokens_total), 0)       tokens_total,
              SUM(custo)                           custo
         FROM uso_tokens
        ${where}
        GROUP BY provedor
        ORDER BY tokens_total DESC`,
    )
    .all(...(params as never[])) as LinhaUso[];
}

function linhasPorModelo(db: Database.Database, where: string, params: unknown[]): LinhaUso[] {
  return db
    .prepare(
      `SELECT provedor, modelo,
              COUNT(*)                             chamadas,
              COALESCE(SUM(tokens_entrada), 0)     tokens_entrada,
              COALESCE(SUM(tokens_saida), 0)       tokens_saida,
              COALESCE(SUM(tokens_total), 0)       tokens_total,
              SUM(custo)                           custo
         FROM uso_tokens
        ${where}
        GROUP BY provedor, modelo
        ORDER BY tokens_total DESC`,
    )
    .all(...(params as never[])) as LinhaUso[];
}

function recorte(db: Database.Database, where: string, params: unknown[]): RecorteUso {
  const t = db
    .prepare(
      `SELECT COUNT(*)                             chamadas,
              COALESCE(SUM(tokens_entrada), 0)     tokens_entrada,
              COALESCE(SUM(tokens_saida), 0)       tokens_saida,
              COALESCE(SUM(tokens_total), 0)       tokens_total,
              SUM(custo)                           custo
         FROM uso_tokens
        ${where}`,
    )
    .get(...(params as never[])) as Omit<RecorteUso, "por_provedor" | "por_modelo">;
  return {
    chamadas: t.chamadas,
    tokens_entrada: t.tokens_entrada,
    tokens_saida: t.tokens_saida,
    tokens_total: t.tokens_total,
    custo: t.custo,
    por_provedor: linhasPorProvedor(db, where, params),
    por_modelo: linhasPorModelo(db, where, params),
  };
}

/** Sempre numeros reais. Sem dado => zeros + `medido: false`. */
export function resumoUsoTokens(): ResumoUso {
  const agora = new Date();
  const inicio = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));
  const fim = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 1));

  try {
    const db = abrir();
    try {
      const total = recorte(db, "", []);
      const mes = recorte(
        db,
        "WHERE criado_em >= ? AND criado_em < ?",
        [inicio.toISOString(), fim.toISOString()],
      );
      return {
        ...total,
        medido: total.chamadas > 0,
        aviso: total.chamadas > 0 ? null : "nenhuma medicao de tokens registrada ainda",
        gerado_em: agora.toISOString(),
        mes_corrente: { ...mes, inicio: inicio.toISOString(), fim: fim.toISOString() },
      };
    } finally {
      db.close();
    }
  } catch (e) {
    // Endpoint tambem nunca explode: devolve zeros e o motivo.
    console.error("Resumo de tokens falhou:", e instanceof Error ? e.message : e);
    const vazio: RecorteUso = {
      tokens_entrada: 0,
      tokens_saida: 0,
      tokens_total: 0,
      chamadas: 0,
      custo: null,
      por_provedor: [],
      por_modelo: [],
    };
    return {
      ...vazio,
      medido: false,
      aviso: "falha ao ler a telemetria de tokens",
      gerado_em: agora.toISOString(),
      mes_corrente: { ...vazio, inicio: inicio.toISOString(), fim: fim.toISOString() },
    };
  }
}
