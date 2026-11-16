/**
 * AGENDADOR DO APP — o cron das tarefas que só o app sabe fazer.
 *
 * Regra (dono, 12/nov/2026): a agenda roda onde a ferramenta mora.
 *   - acervo, notas, grafo  -> agenda da Arca (`agenda-arca.ts`)
 *   - email, resumo diário  -> agenda do APP (este arquivo)
 *
 * A Arca recusava `ler_emails` porque essa ferramenta é do app. Em vez de
 * ensinar a Arca a ler Gmail (duplicaria o cofre de tokens), o app agenda e
 * executa o que é dele.
 *
 * ISOLAMENTO: cada agenda pertence a UMA conta (`user_id`) e a UM escopo
 * (`org` = slug da organização, ou `pessoal-<id>` para quem não tem org).
 * O resumo é entregue numa conversa privada daquela conta. Ninguém mais lê.
 *
 * SEM MODELO: o digest é montado a partir dos dados reais (remetente, assunto,
 * data, se pede ação). Modelo em digest diário é risco de invenção sem ganho.
 */

import path from "node:path";
import Database from "better-sqlite3";
import { criarConversa, registrarMensagem } from "./conversas";
import type { Escopo } from "./escopos";

const DB_PATH = path.join(process.cwd(), "data", "auth.db");

export type TarefaApp = {
  acao: string;
  argumentos?: Record<string, unknown>;
};

export type AgendaApp = {
  id: string;
  user_id: number;
  org: string;
  nome: string;
  tarefas: TarefaApp[];
  intervalo_min: number;
  proxima_em: string;
  ativa: number;
  criada_em: string;
  ultima_em: string | null;
  ultimo_status: string | null;
  conversa_id: string | null;
};

/** A linha crua do banco: `tarefas` é string JSON, não array. */
type LinhaAgenda = Omit<AgendaApp, "tarefas"> & { tarefas: string };

function abrir(): Database.Database {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS agendas_app (
      id            TEXT PRIMARY KEY,
      user_id       INTEGER NOT NULL,
      org           TEXT NOT NULL,
      nome          TEXT NOT NULL,
      tarefas       TEXT NOT NULL,
      intervalo_min INTEGER NOT NULL,
      proxima_em    TEXT NOT NULL,
      ativa         INTEGER NOT NULL DEFAULT 1,
      criada_em     TEXT NOT NULL,
      ultima_em     TEXT,
      ultimo_status TEXT,
      conversa_id   TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_agendas_app_proxima
      ON agendas_app (ativa, proxima_em);
  `);
  return db;
}

/**
 * O escopo PESSOAL da conta — e só ele.
 *
 * Mudou de sentido em 13/11/2026 (modelo corrigido pelo dono): antes esta
 * função devolvia "slug da organização, ou pessoal-<id>" — ou seja, quem tinha
 * empresa gravava a agenda na empresa SEM escolher, e o espaço pessoal virava
 * um "senão". Agora ela responde uma coisa só: o espaço da própria pessoa, que
 * é o PADRÃO do produto e existe sempre.
 *
 * Quem precisa decidir entre os dois escopos usa `escopos.ts`
 * (`escoposDaConta` / `resolverEscopo`) — a escolha é de quem usa, nunca uma
 * adivinhação daqui.
 */
export function escopoDaConta(conta: { id: number; org?: { slug?: string } | null }): string {
  return `pessoal-${conta.id}`;
}

export function criarAgendaApp(
  userId: number,
  org: string,
  nome: string,
  tarefas: TarefaApp[],
  intervaloMin: number,
): { ok: true; id: string } | { ok: false; motivo: string } {
  if (!tarefas.length) return { ok: false, motivo: "agenda sem tarefas" };
  if (!(intervaloMin > 0)) return { ok: false, motivo: "intervalo inválido" };

  const db = abrir();
  try {
    const agora = new Date();
    const proxima = new Date(agora.getTime() + intervaloMin * 60_000);
    const id = `agp_${Math.random().toString(36).slice(2, 12)}`;
    db.prepare(
      `INSERT INTO agendas_app
        (id, user_id, org, nome, tarefas, intervalo_min, proxima_em, ativa, criada_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    ).run(
      id,
      userId,
      org,
      nome,
      JSON.stringify(tarefas),
      intervaloMin,
      proxima.toISOString(),
      agora.toISOString(),
    );
    return { ok: true, id };
  } finally {
    db.close();
  }
}

export function listarAgendasApp(userId: number, org: string): AgendaApp[] {
  const db = abrir();
  try {
    const linhas = db
      .prepare(
        `SELECT * FROM agendas_app
         WHERE user_id = ? AND org = ? AND ativa = 1
         ORDER BY criada_em DESC`,
      )
      .all(userId, org) as LinhaAgenda[];
    return linhas.map((l) => ({ ...l, tarefas: JSON.parse(l.tarefas || "[]") }));
  } finally {
    db.close();
  }
}

export function desativarAgendaApp(userId: number, id: string): boolean {
  const db = abrir();
  try {
    const r = db
      .prepare("UPDATE agendas_app SET ativa = 0 WHERE id = ? AND user_id = ?")
      .run(id, userId);
    return r.changes > 0;
  } finally {
    db.close();
  }
}

/* ── EXECUÇÃO ────────────────────────────────────────────────────────────── */

type EmailResumo = {
  de: string;
  assunto: string;
  data: string;
  resumo?: string;
};

/** Quem pede ação: código de verificação, boleto, cobrança, prazo, segurança. */
function pedeAcao(assunto: string, resumo: string): boolean {
  const t = `${assunto} ${resumo}`.toLowerCase();
  return /c[oó]digo|verifica|boleto|fatura|venc|prazo|urgente|seguran|senha|pagamento|nf-?e|contrato/.test(
    t,
  );
}

/** Monta o digest a partir dos dados. Sem modelo, sem invenção. */
/**
 * Data e hora em BRASÍLIA, do jeito que se lê aqui: "sex 13/11 · 10:30".
 * Não usa o fuso do servidor (que é UTC) porque a mensagem é para quem está no
 * Brasil — e um digest dizendo "13:27" quando são 10:27 é ruído, não informação.
 */
function agoraEmBrasilia(): string {
  try {
    const partes = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    const pega = (t: string) => partes.find((x) => x.type === t)?.value || "";
    const dia = pega("weekday").replace(".", "");
    return `${dia} ${pega("day")}/${pega("month")} · ${pega("hour")}:${pega("minute")}`;
  } catch {
    return new Date().toISOString().slice(0, 16).replace("T", " ");
  }
}

/**
 * Avisa no Telegram quando a agenda entrega algo novo.
 * Fica DESLIGADO por padrão: sem `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID` no
 * ambiente, a função não faz nada. O token nunca é impresso nem devolvido —
 * ele só existe dentro do processo que fala com a API do Telegram.
 */
async function notificarTelegram(texto: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text: texto, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    /* aviso é conveniência: se o Telegram cair, o digest já está na conversa */
  }
}

function montarDigest(nome: string, emails: EmailResumo[]): string {
  if (!emails.length) {
    return `**${nome}** · ${agoraEmBrasilia()}\n\nNenhum email novo na entrada.`;
  }

  const comAcao = emails.filter((e) => pedeAcao(e.assunto, e.resumo || ""));
  const resto = emails.filter((e) => !pedeAcao(e.assunto, e.resumo || ""));

  const linhas: string[] = [];
  linhas.push(`**${nome}** · ${agoraEmBrasilia()}`);
  linhas.push("");
  linhas.push(
    emails.length === 1
      ? "Chegou 1 mensagem na sua entrada."
      : `Chegaram ${emails.length} mensagens na sua entrada.`,
  );

  if (comAcao.length) {
    linhas.push("");
    linhas.push(comAcao.length === 1 ? "**Precisa de você:**" : "**Precisam de você:**");
    for (const e of comAcao) {
      linhas.push(`· ${e.de} — ${e.assunto}`);
    }
  }

  if (resto.length) {
    linhas.push("");
    linhas.push("**Informativo:**");
    for (const e of resto) {
      linhas.push(`· ${e.de} — ${e.assunto}`);
    }
  }

  return linhas.join("\n");
}

/**
 * O ESCOPO da agenda, reconstruído a partir do que está gravado nela.
 *
 * `agendas_app.org` guarda o id do escopo (`pessoal-<id>` ou o slug da
 * organização) — é o que permite a leitura futura saber DE ONDE veio o dado,
 * sem depender de quem está logado no momento (o cron roda sem sessão).
 */
function escopoDaAgenda(agenda: AgendaApp): Escopo {
  if (agenda.org.startsWith("pessoal-")) {
    return { tipo: "pessoal", id: agenda.org, nome: "Meu espaço", usuarioId: agenda.user_id };
  }
  return { tipo: "organizacao", id: agenda.org, nome: agenda.org };
}

/**
 * DE ONDE a agenda lê os emails.
 *
 * A regra antiga lia do cofre do escopo gravado em `agendas_app.org` — e isso
 * quebrou na prática (13/11/2026): as agendas criadas ANTES do modelo de escopo
 * têm `org` = nome da organização na Arca ("core"), mas a CAIXA de email da
 * pessoa mora no cofre PESSOAL dela. Resultado: a agenda rodava, entregava na
 * conversa e dizia "Nenhum email novo na entrada" para sempre (8 ms de execução,
 * sem nem falar com o Google).
 *
 * Agora a agenda lê da PRIMEIRA caixa que existe, nesta ordem:
 *   1. o escopo gravado nela (o certo depois do modelo novo);
 *   2. o espaço PESSOAL do dono da agenda.
 *
 * Não é "fallback silencioso de org para pessoal": é escolher a caixa que existe.
 * Se nenhum dos dois tiver caixa conectada, mantém o escopo original — e o
 * digest diz honestamente que não há email, em vez de inventar um.
 */
function escoposParaLer(agenda: AgendaApp): Escopo[] {
  const proprio = escopoDaAgenda(agenda);
  const pessoalDoDono: Escopo = {
    tipo: "pessoal",
    id: `pessoal-${agenda.user_id}`,
    nome: "Meu espaço",
    usuarioId: agenda.user_id,
  };
  if (proprio.tipo === "pessoal") return [proprio];
  return [proprio, pessoalDoDono];
}

async function lerEmails(agenda: AgendaApp, quantidade: number): Promise<EmailResumo[]> {
  const { ultimosEmails, listarContas } = await import("./gmail");
  const candidatos = escoposParaLer(agenda);
  const comCaixa = candidatos.find((e) => listarContas(e).length > 0) || candidatos[0];
  const r = await ultimosEmails(comCaixa, quantidade);
  if (!r.ok) return [];
  return (r.mensagens || []).map((m) => ({
    de: m.de,
    assunto: m.assunto,
    data: m.data,
    resumo: m.resumo,
  }));
}

/** A última mensagem da conversa já dizia "nenhum email novo"? */
function ultimaFoiVazia(conversaId: string): boolean {
  const db = abrir();
  try {
    const m = db
      .prepare("SELECT conteudo FROM mensagens WHERE conversa_id = ? ORDER BY id DESC LIMIT 1")
      .get(conversaId) as { conteudo: string } | undefined;
    return Boolean(m && m.conteudo.includes("Nenhum email novo"));
  } catch {
    return false;
  } finally {
    db.close();
  }
}

/**
 * Executa as tarefas de uma agenda e entrega o resultado na conversa dela.
 * Devolve o status legível — que fica gravado em `ultimo_status`.
 */
async function executar(agenda: AgendaApp): Promise<string> {
  const partes: string[] = [];

  for (const tarefa of agenda.tarefas) {
    if (tarefa.acao === "ler_emails") {
      const q = Number(tarefa.argumentos?.quantidade) > 0
        ? Math.min(Number(tarefa.argumentos?.quantidade), 20)
        : 5;
      const emails = await lerEmails(agenda, q);
      partes.push(montarDigest(agenda.nome, emails));
    } else {
      partes.push(`Tarefa "${tarefa.acao}" não é do app — ela pertence à Arca.`);
    }
  }

  const texto = partes.join("\n\n") || "Nada a entregar.";

  /* Entrega na conversa da agenda — cria uma na primeira execução. */
  let conversaId = agenda.conversa_id;
  if (!conversaId) {
    conversaId = criarConversa(agenda.user_id, agenda.nome).id;
  }
  /* `registrarMensagem` devolve null quando o texto é IGUAL ao da última
     mensagem da conversa (dedupe de `conversas.ts`). Isso é bom — evita encher a
     conversa com o mesmo digest de hora em hora —, mas o status não pode dizer
     "entregue" quando NADA foi gravado: era isso que fazia a tela mostrar
     "entregue" enquanto a conversa continuava com a mensagem antiga. */
  /* O carimbo de hora deixa cada texto único, então o dedupe do
     `registrarMensagem` já não segura repetição. Quem decide agora é o
     agendador: "entrada vazia" só se diz UMA vez enquanto a última também
     estiver vazia — senão eram 24 mensagens por dia repetindo o mesmo. */
  const vazia = partes.length > 0 && partes.every((t) => t.includes("Nenhum email novo"));
  if (vazia && ultimaFoiVazia(conversaId)) {
    const db0 = abrir();
    try {
      db0.prepare("UPDATE agendas_app SET conversa_id = ? WHERE id = ?").run(conversaId, agenda.id);
    } finally {
      db0.close();
    }
    return `sem novidade (entrada vazia, já avisado em ${conversaId})`;
  }

  const gravada = registrarMensagem(agenda.user_id, conversaId, "assistant", texto);

  const db = abrir();
  try {
    db.prepare("UPDATE agendas_app SET conversa_id = ? WHERE id = ?").run(conversaId, agenda.id);
  } finally {
    db.close();
  }

  if (!gravada) return `sem novidade (nada a acrescentar em ${conversaId})`;

  /* Só avisa o que é NOVO: mandar um push a cada hora dizendo "sem novidade"
     viraria ruído. O aviso leva o mesmo texto do digest, sem a marcação do app
     (o Telegram usa outra sintaxe e o texto cru nunca chega torto). */
  await notificarTelegram(texto.replace(/\*\*/g, ""));
  return `entregue em ${conversaId}`;
}

/**
 * Roda UMA agenda do app agora — é o caminho do clique em "Rodar agora".
 * O id `agp_…` é NOSSO: não existe na Arca, e mandá-lo para lá devolvia
 * "agenda inexistente nesta org", que a tela mostrava como erro de carregamento.
 * Não mexe em `proxima_em`: rodar na mão não remarca a cadência do cron.
 * Devolve `null` quando o id não é de uma agenda desta conta (aí quem atende é a Arca).
 */
export async function executarAgendaAgora(
  userId: number,
  id: string,
): Promise<{ status: string; duracao_ms: number } | null> {
  const db = abrir();
  let linha: LinhaAgenda | undefined;
  try {
    linha = db
      .prepare("SELECT * FROM agendas_app WHERE id = ? AND user_id = ?")
      .get(id, userId) as LinhaAgenda | undefined;
  } finally {
    db.close();
  }
  if (!linha) return null;

  const agenda: AgendaApp = { ...linha, tarefas: JSON.parse(linha.tarefas || "[]") };
  const t0 = Date.now();
  let status = "ok";
  try {
    status = await executar(agenda);
  } catch (erro) {
    status = `falhou: ${(erro as Error)?.message || "erro"}`.slice(0, 180);
    /* Falha silenciosa é pior que falha barulhenta: quem depende do digest
       precisa saber que ele NÃO veio. */
    await notificarTelegram(`Agenda "${agenda.nome}" falhou · ${agoraEmBrasilia()}\n${status}`);
  }

  const db2 = abrir();
  try {
    db2
      .prepare("UPDATE agendas_app SET ultima_em = ?, ultimo_status = ? WHERE id = ?")
      .run(new Date().toISOString(), status, id);
  } finally {
    db2.close();
  }
  return { status, duracao_ms: Date.now() - t0 };
}

/**
 * Roda todas as agendas vencidas. Chamado pelo cron do host a cada minuto.
 * Uma falha numa agenda não impede as outras — cada uma tem seu try.
 */
export async function rodarDevidas(
  agora = new Date(),
): Promise<{ rodadas: number; falhas: number; detalhes: string[] }> {
  const db = abrir();
  let vencidas: AgendaApp[] = [];
  try {
    vencidas = (
      db
        .prepare(
          `SELECT * FROM agendas_app
           WHERE ativa = 1 AND proxima_em <= ?
           ORDER BY proxima_em ASC LIMIT 50`,
        )
        .all(agora.toISOString()) as LinhaAgenda[]
    ).map((l) => ({ ...l, tarefas: JSON.parse(l.tarefas || "[]") }));
  } finally {
    db.close();
  }

  const detalhes: string[] = [];
  let rodadas = 0;
  let falhas = 0;

  for (const agenda of vencidas) {
    let status = "ok";
    try {
      status = await executar(agenda);
      rodadas += 1;
    } catch (erro) {
      falhas += 1;
      status = `falhou: ${(erro as Error)?.message || "erro"}`.slice(0, 180);
      await notificarTelegram(`Agenda "${agenda.nome}" falhou · ${agoraEmBrasilia()}\n${status}`);
    }

    const proxima = new Date(agora.getTime() + agenda.intervalo_min * 60_000);
    const db2 = abrir();
    try {
      db2
        .prepare(
          `UPDATE agendas_app
           SET proxima_em = ?, ultima_em = ?, ultimo_status = ?
           WHERE id = ?`,
        )
        .run(proxima.toISOString(), agora.toISOString(), status, agenda.id);
    } finally {
      db2.close();
    }
    detalhes.push(`${agenda.nome}: ${status}`);
  }

  return { rodadas, falhas, detalhes };
}
