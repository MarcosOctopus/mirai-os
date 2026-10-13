/**
 * UTILITÁRIO DE SEGURANÇA PARA OS SCRIPTS DE PROVA (dono, 13/10/2026).
 *
 * POR QUE EXISTE — a falha real que isto conserta:
 * os scripts de prova terminavam com
 *
 *   DELETE FROM plataforma_config WHERE chave LIKE 'github_app_%'
 *
 * achando que só apagavam "chave de teste". O padrão pegou as chaves REAIS do dono,
 * que ele tinha acabado de gravar pela tela — a integração do GitHub "parou de
 * funcionar do nada".
 *
 * REGRA (não negociável): script de prova NUNCA apaga dado real. Ele tira um
 * INSTANTÂNEO do que existe antes, e no fim devolve o banco EXATAMENTE ao estado do
 * instantâneo — inclusive as linhas que ele não tocou.
 *
 * Como usar:
 *   const inst = instantaneoConfig("github_app_");
 *   try { ...teste... } finally { restaurarConfig("github_app_", inst); }
 */
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "auth.db");

export type LinhaConfig = { chave: string; valor: string; atualizado_em: string };

/** Tira o instantâneo das chaves que o teste pode tocar. */
export function instantaneoConfig(prefixo: string): LinhaConfig[] {
  const db = new Database(DB_PATH, { readonly: true });
  const linhas = db
    .prepare("SELECT chave, valor, atualizado_em FROM plataforma_config WHERE chave LIKE ?")
    .all(`${prefixo}%`) as LinhaConfig[];
  db.close();
  return linhas;
}

/**
 * Devolve o banco ao estado do instantâneo: apaga o que o teste criou e recoloca as
 * linhas originais (com o MESMO ciphertext e a MESMA data). Devolve quantas voltaram.
 */
export function restaurarConfig(prefixo: string, instantaneo: LinhaConfig[]): number {
  const db = new Database(DB_PATH);
  try {
    db.prepare("DELETE FROM plataforma_config WHERE chave LIKE ?").run(`${prefixo}%`);
    const ins = db.prepare(
      "INSERT INTO plataforma_config (chave, valor, atualizado_em) VALUES (?, ?, ?)",
    );
    for (const l of instantaneo) ins.run(l.chave, l.valor, l.atualizado_em);
    return instantaneo.length;
  } finally {
    db.close();
  }
}
