// CONFIGURAÇÃO DA PLATAFORMA — chave/valor GLOBAL, guardado CIFRADO.
//
// POR QUE existe (dono, 09/10/2026): o FLUXO DE MANIFESTO cria o GitHub App e
// devolve TUDO de uma vez — inclusive a CHAVE PRIVADA (`pem`) e o
// `client_secret`. Isso NÃO é dado de um projeto: é da PLATAFORMA inteira (o
// mesmo app do GitHub serve todos os projetos). Guardar por projeto seria um
// segundo lugar para o mesmo dado — e o dono teria de recriar o app a cada
// projeto. Aqui é o único lugar.
//
// COMO: mesma biblioteca e mesmo banco do resto do app (`better-sqlite3` sobre
// `data/auth.db`), tabela própria criada com `CREATE TABLE IF NOT EXISTS`
// (padrão ADITIVO de `arquiteto-projetos.ts`: nada é apagado nem recriado).
// O `valor` é SEMPRE cifrado (`segredo-guardado.ts`, AES-256-GCM) — mesmo os
// campos que não são segredo vão cifrados, por uniformidade: assim ninguém
// precisa decidir caso a caso o que é segredo, e um vazamento do banco não
// entrega o `pem` nem o `client_secret` em claro.
//
// NENHUMA função lança exceção para fora: erro vira `null`/`false`. Quem chama
// (rota) nunca precisa de try/catch e a tela sempre tem o que mostrar.
import Database from "better-sqlite3";
import path from "path";

import { cifrar, decifrar } from "./segredo-guardado";

const DB_PATH = path.join(process.cwd(), "data", "auth.db");

function getDb() {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  // Tabela própria da plataforma: `chave` é a identidade (PRIMARY KEY) e
  // `valor` guarda o conteúdo CIFRADO. `atualizado_em` é só auditoria.
  db.exec(`
    CREATE TABLE IF NOT EXISTS plataforma_config (
      chave         TEXT PRIMARY KEY,
      valor         TEXT NOT NULL,
      atualizado_em TEXT NOT NULL
    )
  `);
  return db;
}

/**
 * Grava (ou SUBSTITUI) um valor da plataforma. O valor entra CIFRADO; nunca é
 * escrito em claro no banco. Devolve `true` se gravou. Nunca lança.
 */
export function guardarConfig(chave: string, valor: string): boolean {
  if (!chave) return false;
  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO plataforma_config (chave, valor, atualizado_em)
       VALUES (?, ?, ?)
       ON CONFLICT (chave)
       DO UPDATE SET valor = excluded.valor, atualizado_em = excluded.atualizado_em`,
    ).run(chave, cifrar(valor ?? ""), new Date().toISOString());
    db.close();
    return true;
  } catch {
    return false;
  }
}

/**
 * Lê um valor da plataforma JÁ DECIFRADO. Devolve `null` quando não existe ou
 * quando o conteúdo não bate (adulterado). Nunca lança.
 */
export function lerConfig(chave: string): string | null {
  if (!chave) return null;
  try {
    const db = getDb();
    const linha = db
      .prepare("SELECT valor FROM plataforma_config WHERE chave = ?")
      .get(chave) as { valor: string } | undefined;
    db.close();
    if (!linha) return null;
    return decifrar(linha.valor);
  } catch {
    return null;
  }
}

/** Existe configuração para esta chave? (sem decifrar — só presença). Nunca lança. */
export function temConfig(chave: string): boolean {
  if (!chave) return false;
  try {
    const db = getDb();
    const linha = db.prepare("SELECT 1 FROM plataforma_config WHERE chave = ?").get(chave);
    db.close();
    return Boolean(linha);
  } catch {
    return false;
  }
}
