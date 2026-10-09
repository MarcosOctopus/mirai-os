/**
 * INTEGRAÇÕES — o que é de CADA PESSOA e o que é da empresa.
 *
 * Correção do dono (07/out/2026, textual): *"entendeu que não tá pegando os
 * mcps e apis e integrações individuais e sim da conta toda, o que não faz
 * sentido. preciso que pegue o que aquela conta tem de integrações
 * individuais."*
 *
 * Antes disto: a única fonte era `organizations.saaso_token` — UM token para a
 * empresa inteira. Quem entrava na organização falava com o CRM com a
 * credencial do dono dela: a integração de um servia para todos, e ninguém
 * podia plugar o seu próprio WhatsApp, Telegram, MCP ou API.
 *
 * Agora existem dois níveis, e a origem de cada integração é explícita:
 *
 *   dono_tipo = 'pessoa'       → a integração é DAQUELA PESSOA (só ela usa)
 *   dono_tipo = 'organizacao'  → a integração é DA EMPRESA (membros usam)
 *
 * A resolução para uma pessoa é: as integrações DELA primeiro; as da empresa
 * entram como apoio, marcadas como da empresa. Nunca o contrário — era esse o
 * erro.
 *
 * O segredo fica no banco do app (nunca sai do servidor, nunca vai ao modelo,
 * nunca é citado na resposta). A `credencial` nunca é devolvida em claro por
 * API: quem lê de fora recebe só o rótulo e a impressão digital.
 */

import { db } from "./auth";
import { IDS_PROVEDORES } from "./ponte-provedores";

export type DonoDaIntegracao = "pessoa" | "organizacao";

export type Integracao = {
  id: number;
  dono_tipo: DonoDaIntegracao;
  dono_id: string;
  tipo: string;          // 'crm' | 'whatsapp' | 'telegram' | 'mcp' | 'api' | ...
  rotulo: string;        // nome que a pessoa deu ("meu CRM", "zap da loja")
  credencial: string | null;
  config: string | null; // JSON: endpoint, o que mais precisar
  ativa: number;
  criada_em: string;
  atualizada_em: string;
};

/**
 * Tipos aceitos no cadastro. Além dos tipos da casa (crm/whatsapp/telegram/
 * mcp/api), entram os IDs DE PROVEDOR da ponte — a MESMA lista do catálogo
 * (`IDS_PROVEDORES` de `ponte-provedores.ts`, a fonte da verdade de como montar
 * a chamada). Importar de lá, em vez de repetir os ids aqui, é o que impede a
 * lista do cadastro de divergir do que a ponte sabe usar.
 */
export const TIPOS_SUPORTADOS: readonly string[] = [
  "crm",
  "whatsapp",
  "telegram",
  "mcp",
  "api",
  ...IDS_PROVEDORES,
];

/** Impressão digital de um segredo — para provar qual credencial foi usada sem expor. */
export function impressao(segredo: string | null | undefined): string {
  const s = (segredo || "").trim();
  if (!s) return "(sem credencial)";
  const inicio = s.slice(0, 7);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100000;
  return `${inicio}…${String(h).padStart(5, "0")}`
}

/**
 * Garante a tabela e migra o que existia.
 *
 * Idempotente de propósito: roda no primeiro uso e não mexe em nada depois. A
 * credencial que estava só em `organizations.saaso_token` vira uma integração
 * 'organizacao' — o que já funcionava continua funcionando, agora com origem
 * declarada em vez de implícita.
 */
export function garantirIntegracoes(): void {
  const c = db();
  try {
    c.exec(`
      CREATE TABLE IF NOT EXISTS integracoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dono_tipo TEXT NOT NULL,
        dono_id TEXT NOT NULL,
        tipo TEXT NOT NULL,
        rotulo TEXT NOT NULL DEFAULT '',
        credencial TEXT,
        config TEXT,
        ativa INTEGER NOT NULL DEFAULT 1,
        criada_em TEXT NOT NULL,
        atualizada_em TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS integracoes_unica
        ON integracoes (dono_tipo, dono_id, tipo, rotulo);
      CREATE INDEX IF NOT EXISTS integracoes_dono
        ON integracoes (dono_tipo, dono_id);
    `);

    // Migração: credencial da empresa que vivia só na tabela `organizations`.
    const orfas = c
      .prepare(
        `SELECT id, nome, saaso_token FROM organizations
         WHERE saaso_token IS NOT NULL AND trim(saaso_token) <> ''`,
      )
      .all() as { id: string; nome: string; saaso_token: string }[];
    const inserir = c.prepare(
      `INSERT INTO integracoes (dono_tipo, dono_id, tipo, rotulo, credencial, config, ativa, criada_em, atualizada_em)
       VALUES ('organizacao', ?, 'crm', ?, ?, NULL, 1, ?, ?)
       ON CONFLICT (dono_tipo, dono_id, tipo, rotulo) DO NOTHING`,
    );
    const agora = new Date().toISOString();
    for (const o of orfas) {
      inserir.run(o.id, "CRM da empresa", o.saaso_token, agora, agora);
    }
  } catch (e) {
    console.error("Integrações: falha ao garantir tabela:", e instanceof Error ? e.message : e);
  } finally {
    c.close();
  }
}

/** Integrações de uma pessoa (as dela) — só as ativas. */
export function integracoesDaPessoa(userId: number): Integracao[] {
  garantirIntegracoes();
  const c = db();
  try {
    return c
      .prepare(
        `SELECT * FROM integracoes WHERE dono_tipo='pessoa' AND dono_id=? AND ativa=1 ORDER BY tipo, rotulo`,
      )
      .all(String(userId)) as Integracao[];
  } finally {
    c.close();
  }
}

/** Integrações da empresa — só as ativas. */
export function integracoesDaOrganizacao(orgId: string): Integracao[] {
  garantirIntegracoes();
  const c = db();
  try {
    return c
      .prepare(
        `SELECT * FROM integracoes WHERE dono_tipo='organizacao' AND dono_id=? AND ativa=1 ORDER BY tipo, rotulo`,
      )
      .all(orgId) as Integracao[];
  } finally {
    c.close();
  }
}

/** Lista para a pessoa (sem devolver o segredo). */
export type IntegracaoPublica = Omit<Integracao, "credencial"> & { impressao: string };

export function semSegredo(i: Integracao): IntegracaoPublica {
  const { credencial, ...resto } = i;
  return { ...resto, impressao: impressao(credencial) };
}

export function criarIntegracao(dados: {
  dono_tipo: DonoDaIntegracao;
  dono_id: string;
  tipo: string;
  rotulo?: string;
  credencial?: string | null;
  config?: string | null;
}): Integracao {
  garantirIntegracoes();
  const agora = new Date().toISOString();
  const c = db();
  try {
    const r = c
      .prepare(
        `INSERT INTO integracoes (dono_tipo, dono_id, tipo, rotulo, credencial, config, ativa, criada_em, atualizada_em)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
         ON CONFLICT (dono_tipo, dono_id, tipo, rotulo) DO UPDATE SET
           credencial=excluded.credencial, config=excluded.config, ativa=1, atualizada_em=excluded.atualizada_em`,
      )
      .run(
        dados.dono_tipo,
        String(dados.dono_id),
        dados.tipo,
        (dados.rotulo || "").trim(),
        dados.credencial || null,
        dados.config || null,
        agora,
        agora,
      );
    return c.prepare("SELECT * FROM integracoes WHERE id=?").get(Number(r.lastInsertRowid)) as Integracao;
  } finally {
    c.close();
  }
}

/**
 * Desliga uma integração — mas SÓ se ela for do dono que pediu.
 *
 * É a regra de isolamento em uma linha: `dono_tipo` e `dono_id` são condição da
 * escrita, não checagem depois. Ninguém desliga (nem lê) integração de outro.
 */
export function desligarIntegracao(
  id: number,
  dono_tipo: DonoDaIntegracao,
  dono_id: string,
): boolean {
  garantirIntegracoes();
  const c = db();
  try {
    const r = c
      .prepare(
        `UPDATE integracoes SET ativa=0, atualizada_em=? WHERE id=? AND dono_tipo=? AND dono_id=?`,
      )
      .run(new Date().toISOString(), id, dono_tipo, String(dono_id));
    return Number((r as { changes?: number }).changes ?? 0) > 0;
  } finally {
    c.close();
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * VÍNCULOS PENDENTES — a ponte para quem conectou o CRM ANTES de existir aqui.
 *
 * O problema medido: o cliente conecta o CRM DENTRO do próprio CRM (a aba
 * "Integrar com Mirai" / a tela de chaves de API). A conexão existe, a
 * credencial `dsk_…` existe — mas a pessoa ainda NÃO tem conta neste app, então
 * não há `dono_id` para gravar a integração. Antes disto o app ficava cego: a
 * linha de `integracoes` só nascia quando a conexão era feita PELA tela do app.
 *
 * A solução: guardar o vínculo por E-MAIL (`vinculos_pendentes`) e consumi-lo no
 * PRIMEIRO login daquela pessoa — aí o `dono_id` existe. O consumo é de USO
 * ÚNICO: a linha pendente morre ao ser ligada, nunca vira uma segunda
 * integração fantasma.
 *
 * O isolamento continua sendo o mesmo das outras operações: a integração só é
 * gravada com `dono_tipo='pessoa'` e `dono_id` = id de quem acabou de entrar.
 * Ninguém escreve (nem lê) integração de outra pessoa por este caminho.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Normaliza o e-mail para a chave do vínculo (a mesma régua dos dois lados). */
export function normalizaEmail(email: string): string {
  return (email || "").trim().toLowerCase();
}

/** Garante a tabela dos vínculos pendentes. Idempotente, roda no primeiro uso. */
export function garantirVinculosPendentes(): void {
  const c = db();
  try {
    c.exec(`
      CREATE TABLE IF NOT EXISTS vinculos_pendentes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        tipo TEXT NOT NULL,
        rotulo TEXT NOT NULL DEFAULT '',
        credencial TEXT,
        criado_em TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS vinculos_pendentes_unico
        ON vinculos_pendentes (email, tipo, rotulo);
      CREATE INDEX IF NOT EXISTS vinculos_pendentes_email
        ON vinculos_pendentes (email);
    `);
  } catch (e) {
    console.error("Vínculos pendentes: falha ao garantir tabela:", e instanceof Error ? e.message : e);
  } finally {
    c.close();
  }
}

/**
 * Guarda um vínculo pendente para quando a pessoa existir aqui.
 * Idempotente por (email, tipo, rotulo): reconectar ATUALIZA a credencial em vez
 * de empilhar linhas — a pessoa tem UMA conexão daquele tipo, não N.
 */
export function guardarVinculoPendente(dados: {
  email: string;
  tipo: string;
  rotulo?: string;
  credencial: string;
}): void {
  garantirVinculosPendentes();
  const c = db();
  try {
    c.prepare(
      `INSERT INTO vinculos_pendentes (email, tipo, rotulo, credencial, criado_em)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (email, tipo, rotulo) DO UPDATE SET
         credencial=excluded.credencial, criado_em=excluded.criado_em`,
    ).run(
      normalizaEmail(dados.email),
      dados.tipo,
      (dados.rotulo || "").trim(),
      dados.credencial,
      new Date().toISOString(),
    );
  } finally {
    c.close();
  }
}

/**
 * Liga (uma vez) os vínculos pendentes do e-mail à pessoa que acabou de entrar.
 * Devolve quantos foram ligados. NUNCA lança para o chamador: o login não pode
 * cair porque uma integração tropeçou — quem chama ainda envolve em try, por
 * disciplina, mas a função já degrada em silêncio.
 */
export function consumirVinculosPendentes(userId: number, email: string): number {
  const e = normalizaEmail(email);
  if (!e) return 0;
  try {
    garantirVinculosPendentes();
    const c = db();
    try {
      const pendentes = c
        .prepare(`SELECT id, tipo, rotulo, credencial FROM vinculos_pendentes WHERE email=?`)
        .all(e) as { id: number; tipo: string; rotulo: string; credencial: string | null }[];
      if (pendentes.length === 0) return 0;

      let ligados = 0;
      for (const p of pendentes) {
        if (p.credencial && p.credencial.trim()) {
          criarIntegracao({
            dono_tipo: "pessoa",
            dono_id: String(userId),
            tipo: p.tipo,
            rotulo: p.rotulo || p.tipo,
            credencial: p.credencial,
          });
          ligados++;
        }
        // Consumo de USO ÚNICO: sai da fila tenha ligado ou não (sem credencial
        // não há o que ligar; manter a linha só a faria reaparecer para sempre).
        c.prepare(`DELETE FROM vinculos_pendentes WHERE id=?`).run(p.id);
      }
      return ligados;
    } finally {
      c.close();
    }
  } catch (erro) {
    console.warn("Vínculos pendentes: consumo falhou (não fatal):", erro instanceof Error ? erro.message : erro);
    return 0;
  }
}
