/**
 * agenda-arca.ts — agendamento do MIRAI OS, na Arca, ISOLADO POR ORGANIZAÇÃO.
 *
 * ── O PROBLEMA QUE ESTE ARQUIVO RESOLVE ─────────────────────────────────────
 * O MIRAI OS é multi-tenant: cada cliente tem a sua organização. A Arca, hoje,
 * autentica com UM token (`tokenDaArca()`), e a org vem DESTE token — ou seja,
 * uma org só ("core"). Se o agendamento usasse esse token direto, a agenda do
 * cliente A apareceria para o cliente B. Isso não é bug de tela: é vazamento
 * entre tenants.
 *
 * ── A PONTE (até a Arca emitir token por org) ───────────────────────────────
 * Todo canal e toda agenda nascem com o slug da organização no nome
 * (`[org:slug] nome`), e toda leitura FILTRA por esse prefixo. Assim:
 *   - o cliente só vê o que é dele, mesmo com token compartilhado;
 *   - quando a Arca passar a emitir token por org, basta trocar `headersDaArca`
 *     e remover o prefixo — o resto do código não muda.
 *
 * ── REGRA DO FOREMAN (dono, 22/10/2026) ─────────────────────────────────────
 * Propor NÃO cria nada. Só APROVAR cria concessão real. Por isso nunca se cria
 * agenda direto: cria o canal, pede a proposta, aprova, e só então agenda.
 *
 * Nada aqui inventa sucesso: toda função devolve { ok, ... } com o motivo real.
 */

import { arcaConfigurada, erroDeCredencial, headersDaArca } from "./arca-cliente";

const BASE = (process.env.ARCA_API_URL || "http://127.0.0.1:8080").replace(/\/+$/, "");

export type Tarefa = { acao: string; argumentos?: Record<string, unknown>; para?: string | null };
export type Agenda = {
  id: string;
  nome?: string;
  intervalo_min?: number;
  ativa?: boolean;
  tarefas?: Tarefa[];
};

type Falha = { ok: false; motivo: string };

/** Prefixo que amarra o registro à organização. Sem ele, nada é lido. */
function marca(org: string): string {
  return `[org:${org}]`;
}

function comOrg(org: string, nome: string): string {
  return `${marca(org)} ${nome}`.trim();
}

function semOrg(org: string, nome: string | undefined): string {
  const m = marca(org);
  return (nome || "").startsWith(m) ? (nome || "").slice(m.length).trim() : (nome || "");
}

async function chamar(
  org: string,
  caminho: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ ok: true; dados: unknown } | Falha> {
  if (!org) return { ok: false, motivo: "sem-organizacao" };
  if (!arcaConfigurada()) return { ok: false, motivo: erroDeCredencial() };
  try {
    const r = await fetch(`${BASE}${caminho}`, {
      method: init.method || "GET",
      headers: headersDaArca({ "Content-Type": "application/json" }),
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
    const texto = await r.text();
    let dados: unknown = null;
    try {
      dados = texto ? JSON.parse(texto) : null;
    } catch {
      dados = texto;
    }
    if (!r.ok) {
      const d = dados as { detail?: unknown; erro?: string } | null;
      const detalhe =
        typeof d?.detail === "string"
          ? d.detail
          : d?.erro || JSON.stringify(d?.detail ?? "").slice(0, 120);
      return { ok: false, motivo: `arca ${r.status}${detalhe ? `: ${detalhe}` : ""}` };
    }
    return { ok: true, dados };
  } catch (e) {
    return { ok: false, motivo: `rede: ${e instanceof Error ? e.message : "falhou"}` };
  }
}

/** Agendas DESTA organização. As de outros tenants são descartadas aqui. */
export async function listarAgendas(org: string): Promise<{ ok: true; agendas: Agenda[] } | Falha> {
  const r = await chamar(org, "/canais/agenda");
  if (!r.ok) return r;
  const d = r.dados as { agendas?: Agenda[] };
  const todas = Array.isArray(d?.agendas) ? d.agendas : [];
  const minhas = todas
    .filter((a) => (a.nome || "").startsWith(marca(org)))
    .map((a) => ({ ...a, nome: semOrg(org, a.nome) }));
  return { ok: true, agendas: minhas };
}

export async function criarCanal(
  org: string,
  nome: string,
  objetivo: string,
): Promise<{ ok: true; id: string } | Falha> {
  const r = await chamar(org, "/canais", { method: "POST", body: { nome: comOrg(org, nome), objetivo } });
  if (!r.ok) return r;
  const d = r.dados as { id?: string };
  if (!d?.id) return { ok: false, motivo: "a Arca não devolveu o id do canal" };
  return { ok: true, id: d.id };
}

/** Pede ao Foreman a proposta. Propor NÃO cria nada. */
export async function propor(org: string, objetivo: string): Promise<{ ok: true; propostaId: string } | Falha> {
  const r = await chamar(org, "/canais/foreman/propor", { method: "POST", body: { objetivo } });
  if (!r.ok) return r;
  const d = r.dados as { id?: string; proposta_id?: string; proposta?: { id?: string } };
  const id = d?.proposta?.id || d?.proposta_id || d?.id;
  if (!id) return { ok: false, motivo: "o Foreman não devolveu proposta" };
  return { ok: true, propostaId: id };
}

/** Aprova a proposta — é aqui que a concessão passa a existir. */
export async function aprovar(org: string, propostaId: string): Promise<{ ok: true } | Falha> {
  const r = await chamar(org, `/canais/foreman/${encodeURIComponent(propostaId)}/aprovar`, { method: "POST" });
  return r.ok ? { ok: true } : r;
}

/** Cria a agenda a partir de uma proposta JÁ aprovada. */
export async function criarAgenda(
  org: string,
  propostaId: string,
  tarefas: Tarefa[],
  nome: string,
  intervaloMin = 0,
): Promise<{ ok: true; id: string } | Falha> {
  if (!tarefas.length) return { ok: false, motivo: "agenda sem tarefas" };
  const r = await chamar(org, "/canais/agenda", {
    method: "POST",
    body: { proposta_id: propostaId, tarefas, intervalo_min: intervaloMin, nome: comOrg(org, nome) },
  });
  if (!r.ok) return r;
  const d = r.dados as { id?: string; agenda_id?: string };
  const id = d?.agenda_id || d?.id;
  if (!id) return { ok: false, motivo: "a Arca não devolveu o id da agenda" };
  return { ok: true, id };
}

export async function rodarAgora(org: string, agendaId: string): Promise<{ ok: true; dados: unknown } | Falha> {
  return chamar(org, `/canais/agenda/${encodeURIComponent(agendaId)}/rodar`, { method: "POST" });
}

export async function desativar(org: string, agendaId: string): Promise<{ ok: true } | Falha> {
  const r = await chamar(org, `/canais/agenda/${encodeURIComponent(agendaId)}/desativar`, { method: "POST" });
  return r.ok ? { ok: true } : r;
}
