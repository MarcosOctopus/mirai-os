// SKILLS DO CLIENTE — as skills que a PRÓPRIA CONTA cria (fase 2 da Synapse,
// aprovada pelo dono em 08/10/2026).
//
// Persistência no MESMO banco e no MESMO padrão do resto do app: better-sqlite3
// sobre `data/auth.db`, WAL, tabela criada com CREATE TABLE IF NOT EXISTS — é a
// mesma biblioteca que auth.ts / conversas.ts / arquiteto-projetos.ts já usam.
// Nenhuma dependência nova, nenhum segundo caminho de verdade para o dado.
//
// O QUE ESTA CAMADA É (e o que ela NUNCA é):
//   • Uma skill de cliente é TEXTO que o assistente segue: `nome`, `descricao`
//     ("o que é", curta) e `instrucoes` (o corpo). Só isso é guardado.
//   • NÃO existe campo de credencial. A dica do formulário diz, em PT-BR, que
//     skill NÃO é senha/token/chave — e a função `detectarCredencial` recusa,
//     no servidor, o que PARECE credencial (chave de API, token, PEM, atribuição
//     de senha). A credencial de verdade mora no cofre da conta, nunca aqui.
//   • NÃO há execução de código: nada de eval, shell, import de arquivo. A skill
//     é texto consultado, ponto.
//
// ESCOPO POR USUÁRIO (a trava de verdade desta fase): TODA leitura/escrita
// filtra por `user_id`. Skill de outra conta é tratada como INEXISTENTE — as
// rotas respondem 404 (nunca "existe, mas não é sua") e a listagem da conta
// nunca traz a de ninguém. É a mesma postura de `conversas.ts` e
// `arquiteto-projetos.ts`.
//
// TABELA (PT-BR, no padrão do app):
//   skills_cliente(id, user_id, nome, descricao, instrucoes, base,
//                  criada_em, atualizada_em)
//     — `base` guarda o NOME da skill de ecossistema copiada ("usar como base"),
//       quando houver. Serve para a origem honesta do item; o ORIGINAL nunca é
//       tocado (é lido do disco e nada mais — ver skills-lista.ts).
//   Índice: idx_skills_cliente_user(user_id).
import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "auth.db");

export type SkillCliente = {
  id: string;
  nome: string;
  descricao: string | null;
  instrucoes: string;
  /** nome da skill do ecossistema usada como base, ou null se criada do zero */
  base: string | null;
  criada_em: string;
  atualizada_em: string;
};

export const LIMITE_NOME = 80;
export const LIMITE_DESCRICAO = 240;
export const LIMITE_INSTRUCOES = 20000;

function getDb() {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS skills_cliente (
      id            TEXT PRIMARY KEY,
      user_id       INTEGER NOT NULL,
      nome          TEXT NOT NULL,
      descricao     TEXT,
      instrucoes    TEXT NOT NULL,
      base          TEXT,
      criada_em     TEXT NOT NULL,
      atualizada_em TEXT NOT NULL
    )
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_skills_cliente_user ON skills_cliente(user_id)");
  return db;
}

function comoResumo(linha: SkillCliente): SkillCliente {
  return {
    id: linha.id,
    nome: linha.nome,
    descricao: linha.descricao ?? null,
    instrucoes: linha.instrucoes,
    base: linha.base ?? null,
    criada_em: linha.criada_em,
    atualizada_em: linha.atualizada_em,
  };
}

/** Lista as skills DESTA conta — mais recentes primeiro. Nunca a de ninguém. */
export function listarSkillsDoCliente(userId: number): SkillCliente[] {
  const db = getDb();
  const linhas = db
    .prepare(
      `SELECT * FROM skills_cliente WHERE user_id = ? ORDER BY atualizada_em DESC, criada_em DESC`,
    )
    .all(userId) as SkillCliente[];
  db.close();
  return linhas.map(comoResumo);
}

/** UMA skill da conta. Skill de outra conta (ou inexistente) => null (vira 404). */
export function obterSkillDoCliente(userId: number, id: string): SkillCliente | null {
  const db = getDb();
  const linha = db
    .prepare(`SELECT * FROM skills_cliente WHERE user_id = ? AND id = ?`)
    .get(userId, id) as SkillCliente | undefined;
  db.close();
  return linha ? comoResumo(linha) : null;
}

export function criarSkillDoCliente(
  userId: number,
  dados: { nome: string; descricao?: string | null; instrucoes: string; base?: string | null },
): SkillCliente {
  const db = getDb();
  const agora = new Date().toISOString();
  const id = `skc_${randomUUID()}`;
  db.prepare(
    `INSERT INTO skills_cliente (id, user_id, nome, descricao, instrucoes, base, criada_em, atualizada_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    userId,
    dados.nome.trim(),
    dados.descricao?.trim() ? dados.descricao.trim() : null,
    dados.instrucoes,
    dados.base?.trim() ? dados.base.trim() : null,
    agora,
    agora,
  );
  db.close();
  return obterSkillDoCliente(userId, id) as SkillCliente;
}

/** Edita uma skill DA CONTA. De outra conta (ou inexistente) => null (404). */
export function atualizarSkillDoCliente(
  userId: number,
  id: string,
  campos: { nome?: string; descricao?: string | null; instrucoes?: string },
): SkillCliente | null {
  const atual = obterSkillDoCliente(userId, id);
  if (!atual) return null;

  const db = getDb();
  const sets: string[] = [];
  const valores: unknown[] = [];
  if (campos.nome !== undefined) {
    sets.push("nome = ?");
    valores.push(campos.nome.trim());
  }
  if (campos.descricao !== undefined) {
    sets.push("descricao = ?");
    valores.push(campos.descricao && campos.descricao.trim() ? campos.descricao.trim() : null);
  }
  if (campos.instrucoes !== undefined) {
    sets.push("instrucoes = ?");
    valores.push(campos.instrucoes);
  }
  sets.push("atualizada_em = ?");
  valores.push(new Date().toISOString());
  valores.push(userId);
  valores.push(id);
  db.prepare(`UPDATE skills_cliente SET ${sets.join(", ")} WHERE user_id = ? AND id = ?`).run(
    ...(valores as never[]),
  );
  db.close();
  return obterSkillDoCliente(userId, id);
}

/** Apaga uma skill DA CONTA. De outra conta (ou inexistente) => false. */
export function apagarSkillDoCliente(userId: number, id: string): boolean {
  const db = getDb();
  const r = db.prepare(`DELETE FROM skills_cliente WHERE user_id = ? AND id = ?`).run(userId, id);
  db.close();
  return Number((r as { changes?: number }).changes ?? 0) > 0;
}

/**
 * Detector de CREDENCIAL — a recusa do servidor (o formulário já avisa em
 * PT-BR; aqui é a trava de verdade). Recebe os textos da skill e devolve o
 * motivo, em PT-BR, quando ALGO PARECE credencial; `null` quando está limpo.
 *
 * Conservador de propósito: só pega o que TEM cara de segredo (chave de API,
 * token, PEM, atribuição de senha/token com valor). A palavra "senha" numa
 * frase normal de instruções não dispara — o padrão exige a atribuição com um
 * valor logo depois.
 */
export function detectarCredencial(...textos: (string | null | undefined)[]): string | null {
  const junto = textos.filter(Boolean).join("\n");
  if (!junto.trim()) return null;

  const padroes: { re: RegExp; motivo: string }[] = [
    { re: /-----BEGIN [A-Z ]*(PRIVATE KEY|CERTIFICATE)-----/, motivo: "uma chave privada (bloco PEM)" },
    { re: /\b(sk|pk|rk)-[A-Za-z0-9_-]{16,}/, motivo: "uma chave de API (formato sk-/pk-/rk-)" },
    { re: /\b(sk_live|sk_test|dsk_|ghp_|gho_|ghs_|xoxb-|xoxp-|AKIA[0-9A-Z]{16})\b/, motivo: "um token de serviço (dsk_/ghp_/xoxb-/AWS…)" },
    // O token do CRM tem forma propria: prefixo + 8 hex + `_` + segredo. Ancorar no
    // formato (e nao so no prefixo) evita confundir com nome de ferramenta
    // (`crm_create_pipeline`) e continua pegando o `dsk_` que ja existe.
    { re: /\b(dsk|crm)_[0-9a-f]{8}_[A-Za-z0-9_-]{20,}/, motivo: "um token de acesso do CRM (crm_/dsk_)" },
    { re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}\b/, motivo: "um JWT" },
    {
      re: /(api[_-]?key|access[_-]?token|secret|senha|password|credencial|bearer)\s*[:=]\s*\S{8,}/i,
      motivo: "a atribuição de um segredo (ex.: senha = …, token = …, api_key: …)",
    },
  ];

  for (const p of padroes) {
    if (p.re.test(junto)) return p.motivo;
  }
  return null;
}
