/**
 * COFRE POR ESCOPO — onde vivem as credenciais da PESSOA e da ORGANIZAÇÃO.
 *
 * POR QUE existe (modelo corrigido pelo dono, 13/11/2026): dado sempre tem
 * dono EXPLÍCITO. Chave de API e caixa de email não são "da conta logada" por
 * acidente — são do espaço pessoal de quem cadastrou, ou do espaço da
 * organização, e quem cadastra escolhe onde.
 *
 * DUAS CASAS, UMA PORTA:
 *   - escopo PESSOAL  -> `users.platform_config` (onde o cofre sempre viveu;
 *                        nada migra, nada quebra, e o histórico do OAuth segue
 *                        válido);
 *   - escopo ORG      -> tabela `cofre_escopo` (auth.db), uma linha por
 *                        (escopo, chave). É o mesmo formato de JSON do
 *                        platform_config, então quem lê não precisa saber onde
 *                        o dado morou.
 *
 * ISOLAMENTO: este arquivo NÃO decide quem pode usar um escopo — a decisão é
 * de `escopos.ts` (a conta só enxerga `escoposDaConta`). Aqui só se lê e grava
 * o que mandaram, e o id do escopo é a chave da linha.
 *
 * Nunca loga valor: o que entra aqui pode ser token de Gmail ou chave de API.
 */

import path from "node:path";
import Database from "better-sqlite3";

import { getUserPlatformConfig, updateUserPlatformConfig } from "./auth";
import type { Escopo } from "./escopos";

const DB_PATH = path.join(process.cwd(), "data", "auth.db");

function abrir(): Database.Database {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS cofre_escopo (
      escopo_id     TEXT NOT NULL,
      chave         TEXT NOT NULL,
      valor         TEXT NOT NULL,
      atualizado_em TEXT NOT NULL,
      PRIMARY KEY (escopo_id, chave)
    );
  `);
  return db;
}

/** O JSON inteiro do escopo (objeto simples; nunca array na raiz). */
export function lerCofre(escopo: Escopo): Record<string, unknown> {
  if (escopo.tipo === "pessoal" && typeof escopo.usuarioId === "number") {
    return (getUserPlatformConfig(escopo.usuarioId) ?? {}) as Record<string, unknown>;
  }

  const db = abrir();
  try {
    const linhas = db
      .prepare("SELECT chave, valor FROM cofre_escopo WHERE escopo_id = ?")
      .all(escopo.id) as { chave: string; valor: string }[];
    const saida: Record<string, unknown> = {};
    for (const l of linhas) {
      try {
        saida[l.chave] = JSON.parse(l.valor);
      } catch {
        // Valor gravado por uma versão anterior que não era JSON: mantém o
        // texto cru em vez de sumir com o dado.
        saida[l.chave] = l.valor;
      }
    }
    return saida;
  } finally {
    db.close();
  }
}

/**
 * Grava um patch (merge raso, igual ao `updateUserPlatformConfig`) no escopo.
 * Substitui a chave inteira quando ela é uma lista — é o contrato que as contas
 * de email já usam.
 */
export function gravarCofre(escopo: Escopo, patch: Record<string, unknown>): void {
  if (escopo.tipo === "pessoal" && typeof escopo.usuarioId === "number") {
    updateUserPlatformConfig(escopo.usuarioId, patch);
    return;
  }

  const db = abrir();
  try {
    const agora = new Date().toISOString();
    const stmt = db.prepare(`
      INSERT INTO cofre_escopo (escopo_id, chave, valor, atualizado_em)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(escopo_id, chave) DO UPDATE SET valor = excluded.valor, atualizado_em = excluded.atualizado_em
    `);
    const tx = db.transaction(() => {
      for (const [chave, valor] of Object.entries(patch)) {
        stmt.run(escopo.id, chave, JSON.stringify(valor ?? null), agora);
      }
    });
    tx();
  } finally {
    db.close();
  }
}

/** Existe alguma credencial neste escopo? (usado para não fingir conexão) */
export function cofreTem(escopo: Escopo, chave: string): boolean {
  const v = lerCofre(escopo)[chave];
  return v !== undefined && v !== null;
}
