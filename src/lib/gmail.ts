import { decifrar, cifrar } from "@/lib/segredo-guardado";
import { lerCofre, gravarCofre } from "@/lib/cofre-escopo";
import type { Escopo } from "@/lib/escopos";

/**
 * gmail.ts — lê a caixa com o token que a PESSOA (ou a ORGANIZAÇÃO) autorizou.
 *
 * ESCOPO (modelo corrigido pelo dono, 13/11/2026): toda operação recebe o
 * escopo EXPLÍCITO — o pessoal de quem conectou, ou o da organização quando a
 * caixa foi conectada lá. Não existe "a conta logada" implícita: a mesma pessoa
 * pode ter caixas no espaço dela e no da empresa, e são coisas separadas. Quem
 * garante que o escopo é legítimo é `escopos.ts`; aqui só se lê e grava o cofre
 * do escopo que chegou.
 *
 * O que este arquivo resolve, e por que cada passo existe:
 *  - o token está CIFRADO no cofre da pessoa (`google_email.blob`), então nada
 *    aqui funciona sem decifrar;
 *  - o `access_token` do Google vence em ~1h. Sem renovar com o `refresh_token`,
 *    a primeira leitura funciona e a segunda falha — o clássico "conectado mas
 *    não funciona". Por isso `renovar()` grava o token novo de volta no cofre;
 *  - nada é inventado: se não houver conexão, devolve `{ ok: false, motivo }` e
 *    quem chamou decide o que dizer. Nunca uma lista vazia fingindo "sem emails".
 */

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

export type Mensagem = {
  id: string;
  de: string;
  assunto: string;
  data: string;
  resumo: string;
};

type Pacote = {
  access_token?: string;
  refresh_token?: string | null;
  expira_em?: string | null;
  email?: string;
};

/** Uma caixa conectada: o endereço, um rótulo humano e o token cifrado. */
export type ContaEmail = { email: string; rotulo: string; blob: string; conectadoEm?: string };

/**
 * As caixas desta pessoa para a TELA — SEM o blob.
 *
 * Existe para não haver duas verdades: a tela de integrações e o seletor do
 * chat leem daqui, e esta função nunca devolve segredo. Se um dia alguém
 * precisar do token, o caminho é `ultimosEmails`, não esta lista.
 */
export function listarContas(escopo: Escopo): { email: string; rotulo: string; conectado_em: string }[] {
  return lerContas(escopo).map((c) => ({
    email: c.email,
    rotulo: c.rotulo,
    conectado_em: c.conectadoEm || "",
  }));
}

/**
 * Desconecta UMA caixa (13/11/2026).
 *
 * Por que por ENDEREÇO e não por índice: índice muda quando outra conta é
 * adicionada — apagar "a 2ª" poderia levar embora a caixa errada. O endereço é
 * a identidade da conta no cofre (`volta/route.ts` deduplica por ele).
 *
 * Remove também o legado `google_email` quando ele é a mesma caixa; sem isso
 * a conta "desconectada" continuaria aparecendo pela compatibilidade.
 */
export function removerConta(escopo: Escopo, email: string): boolean {
  const alvo = (email || "").trim().toLowerCase();
  if (!alvo) return false;

  const atuais = lerContas(escopo);
  const restantes = atuais.filter((c) => c.email.toLowerCase() !== alvo);
  if (restantes.length === atuais.length) return false;

  const cfg = lerCofre(escopo);
  const legado = cfg?.google_email as Record<string, unknown> | undefined;
  const limparLegado =
    legado && typeof legado === "object" && String(legado.email || "").toLowerCase() === alvo;

  gravarCofre(escopo, {
    google_emails: restantes.map((c) => ({
      email: c.email,
      rotulo: c.rotulo,
      blob: c.blob,
      connected_at: c.conectadoEm || "",
    })),
    ...(limparLegado ? { google_email: null } : {}),
  });
  return true;
}

/**
 * TODAS as caixas da pessoa.
 *
 * Por que lista e não um só: a mesma pessoa tem email pessoal, o da empresa e
 * às vezes o do cliente. Guardar um só obrigava a desconectar para trocar — e
 * a Mirai nunca sabia qual estava lendo.
 *
 * Compatibilidade: quem conectou antes tem `google_email` (objeto único). Ele é
 * lido como a primeira conta da lista, então nada quebra e ninguém reconecta.
 */
export function lerContas(escopo: Escopo): ContaEmail[] {
  const cfg = lerCofre(escopo);
  const contas: ContaEmail[] = [];

  const lista = cfg?.google_emails;
  if (Array.isArray(lista)) {
    for (const item of lista) {
      const c = item as Record<string, unknown>;
      if (typeof c?.blob === "string" && c.blob) {
        contas.push({
          email: String(c.email || ""),
          rotulo: String(c.rotulo || c.email || "conta"),
          blob: c.blob,
          // A data vem do cofre (`volta/route.ts` grava `connected_at`). Serve
          // só para a tela dizer "desde quando" — nunca para decidir acesso.
          conectadoEm: typeof c.connected_at === "string" ? c.connected_at : "",
        });
      }
    }
  }

  // legado: uma conta só
  const unica = cfg?.google_email as Record<string, unknown> | undefined;
  if (unica && typeof unica === "object" && typeof unica.blob === "string" && unica.blob) {
    const email = String(unica.email || "");
    if (!contas.some((c) => c.email === email)) {
      contas.push({ email, rotulo: email || "conta", blob: unica.blob });
    }
  }

  return contas;
}

function lerPacote(escopo: Escopo, alvo?: string): Pacote | null {
  const contas = lerContas(escopo);
  if (!contas.length) return null;
  const escolhida = alvo
    ? contas.find(
        (c) =>
          c.email.toLowerCase() === alvo.toLowerCase() ||
          c.rotulo.toLowerCase() === alvo.toLowerCase(),
      )
    : contas[0];
  if (!escolhida) return null;
  const cru = decifrar(escolhida.blob);
  if (!cru) return null;
  try {
    return JSON.parse(cru) as Pacote;
  } catch {
    return null;
  }
}

function gravarPacote(escopo: Escopo, p: Pacote, email: string) {
  /* Grava DENTRO da lista, preservando as outras caixas. Sobrescrever a lista
     inteira apagaria o email da empresa quando o token do pessoal renovasse. */
  const atuais = lerContas(escopo);
  const anterior = atuais.find((c) => c.email.toLowerCase() === email.toLowerCase());
  const novo = {
    email,
    rotulo: email || "conta",
    blob: cifrar(JSON.stringify(p)),
    // Preserva a data da conexão ao renovar o token: renovar não é reconectar.
    connected_at: anterior?.conectadoEm || new Date().toISOString(),
  };
  const outros = atuais.filter((c) => c.email.toLowerCase() !== email.toLowerCase());
  const lista = [
    { email: novo.email, rotulo: novo.rotulo, blob: novo.blob, connected_at: novo.connected_at },
    ...outros.map((c) => ({
      email: c.email,
      rotulo: c.rotulo,
      blob: c.blob,
      connected_at: c.conectadoEm || "",
    })),
  ];
  gravarCofre(escopo, { google_emails: lista });
}

async function renovar(escopo: Escopo, p: Pacote): Promise<string | null> {
  if (!p.refresh_token) return null;
  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        refresh_token: p.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.access_token) return null;
    const novo: Pacote = {
      ...p,
      access_token: d.access_token,
      expira_em: new Date(Date.now() + (Number(d.expires_in) || 3600) * 1000).toISOString(),
    };
    gravarPacote(escopo, novo, p.email || "");
    return d.access_token as string;
  } catch {
    return null;
  }
}

/** Token válido, renovando se preciso. */
async function tokenDe(
  escopo: Escopo,
  alvo?: string,
): Promise<{ ok: true; token: string; email: string } | { ok: false; motivo: string }> {
  const p = lerPacote(escopo, alvo);
  if (!p) return { ok: false, motivo: "sem-conexao" };
  const venceu = p.expira_em ? new Date(p.expira_em).getTime() < Date.now() + 60_000 : false;
  if (p.access_token && !venceu) return { ok: true, token: p.access_token, email: p.email || "" };
  const novo = await renovar(escopo, p);
  if (novo) return { ok: true, token: novo, email: p.email || "" };
  if (p.access_token) return { ok: true, token: p.access_token, email: p.email || "" };
  return { ok: false, motivo: "token-vencido" };
}

function cabecalho(headers: { name?: string; value?: string }[], nome: string): string {
  const h = headers.find((x) => (x.name || "").toLowerCase() === nome.toLowerCase());
  return h?.value || "";
}

function limpar(texto: string): string {
  return texto
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Últimas N mensagens de UMA caixa. Sem `alvo` e com várias contas, pergunta. */
export async function ultimosEmails(
  escopo: Escopo,
  quantidade = 3,
  alvo?: string,
): Promise<
  | { ok: true; email: string; mensagens: Mensagem[] }
  | { ok: false; motivo: string; contas?: { email: string; rotulo: string }[] }
> {
  const contas = lerContas(escopo);
  if (!contas.length) return { ok: false, motivo: "sem-conexao" };

  /* Várias caixas e nenhuma escolhida: NÃO adivinha. Devolve a lista para a
     Mirai perguntar "qual delas?" — ler a errada e resumir seria pior que
     perguntar. */
  if (!alvo && contas.length > 1) {
    return {
      ok: false,
      motivo: "varias-contas",
      contas: contas.map((c) => ({ email: c.email, rotulo: c.rotulo })),
    };
  }

  const t = await tokenDe(escopo, alvo);
  if (!t.ok) return t;

  const lista = await fetch(
    `${GMAIL}/messages?maxResults=${Math.min(Math.max(quantidade, 1), 20)}&labelIds=INBOX`,
    { headers: { Authorization: `Bearer ${t.token}` } },
  );
  if (!lista.ok) {
    const corpo = await lista.text().catch(() => "");
    return { ok: false, motivo: `gmail ${lista.status} ${corpo.slice(0, 80)}` };
  }
  const dados = (await lista.json().catch(() => ({}))) as { messages?: { id: string }[] };
  const ids = (dados.messages || []).map((m) => m.id);

  const mensagens: Mensagem[] = [];
  for (const id of ids) {
    const r = await fetch(`${GMAIL}/messages/${id}?format=full`, {
      headers: { Authorization: `Bearer ${t.token}` },
    });
    if (!r.ok) continue;
    const m = (await r.json().catch(() => ({}))) as {
      payload?: { headers?: { name?: string; value?: string }[]; body?: { data?: string }; parts?: { body?: { data?: string }; mimeType?: string }[] };
      snippet?: string;
    };
    const hs = m.payload?.headers || [];
    let corpo = m.snippet || "";
    const b64 = m.payload?.body?.data || m.payload?.parts?.find((p) => p.mimeType === "text/plain")?.body?.data;
    if (b64) {
      try {
        corpo = Buffer.from(b64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
      } catch {
        /* fica o snippet */
      }
    }
    mensagens.push({
      id,
      de: cabecalho(hs, "From"),
      assunto: cabecalho(hs, "Subject") || "(sem assunto)",
      data: cabecalho(hs, "Date"),
      resumo: limpar(corpo).slice(0, 600),
    });
  }

  return { ok: true, email: t.email, mensagens };
}
