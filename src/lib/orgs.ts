/**
 * Organizacoes (white-label) — quem ve o que.
 *
 * Regra do dono (01/10/2026): *"eu ponho uma organizacao; quem usa aquela
 * organizacao e um e-mail especifico do meu cliente; ele nao pode ter acesso
 * as outras organizacoes."*
 *
 *  - 1 e-mail = 1 organizacao (tabela `memberships`).
 *  - O dono da plataforma (MIRAI_OWNER_EMAIL, padrao a conta do Marcos) e o
 *    unico que atravessa organizacoes: ele cria a organizacao, amarra o e-mail
 *    do cliente e, se quiser, a credencial do CRM daquele cliente.
 *  - Sem vinculo => a conta nao ve dado de produto nenhum (nem consulta o MCP).
 */

import { NextRequest, NextResponse } from "next/server";

import { db, getUserById, verifyToken } from "./auth";

export const OWNER_EMAIL = (
  process.env.MIRAI_OWNER_EMAIL || "marcospaulonascimentoguimaraes@gmail.com"
).toLowerCase();

/**
 * Quem pode MUDAR PRECO / escrever plano.
 *
 * Constante explicita de proposito (contrato PLANOS-CONTRATO.md): trocar o dono
 * da plataforma (`OWNER_EMAIL`) no futuro nao pode dar carona para mexer em
 * preco. Escrita de plano (criar, editar preco/intervalo/ativo, trocar o
 * conjunto de capacidades, conceder/revogar add-on) exige ESTE e-mail.
 */
export const EMAIL_QUE_MUDA_PRECO = "marcospaulonascimentoguimaraes@gmail.com";

export type Organizacao = {
  id: string;
  nome: string;
  slug: string;
  cliente_email: string | null;
  saaso_org_id: string | null;
  saaso_token: string | null;
  criada_em?: string;
  atualizada_em?: string;
};

export type Conta = {
  id: number;
  nome: string;
  email: string;
  ehDono: boolean;
  org: Organizacao | null;
};

function normaliza(email: string): string {
  return (email || "").trim().toLowerCase();
}

export function slugificar(texto: string): string {
  const s = (texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return s || "org";
}

// ─── Leitura ──────────────────────────────────────────────────────
export function orgPorId(id: string): Organizacao | null {
  const c = db();
  const r = c.prepare("SELECT * FROM organizations WHERE id = ?").get(id) as Organizacao | undefined;
  c.close();
  return r || null;
}

export function orgPorEmail(email: string): Organizacao | null {
  const c = db();
  const r = c
    .prepare(
      `SELECT o.* FROM memberships m
       JOIN organizations o ON o.id = m.org_id
       WHERE lower(m.email) = ?`,
    )
    .get(normaliza(email)) as Organizacao | undefined;
  c.close();
  return r || null;
}

export function membrosDaOrg(orgId: string): { email: string; papel: string }[] {
  const c = db();
  const r = c
    .prepare("SELECT email, papel FROM memberships WHERE org_id = ? ORDER BY email")
    .all(orgId) as { email: string; papel: string }[];
  c.close();
  return r;
}

export function listarOrganizacoes(): (Organizacao & { membros: { email: string; papel: string }[] })[] {
  const c = db();
  const orgs = c.prepare("SELECT * FROM organizations ORDER BY nome").all() as Organizacao[];
  c.close();
  return orgs.map((o) => ({ ...o, membros: membrosDaOrg(o.id) }));
}

// ─── Escrita (so o dono chega aqui) ───────────────────────────────
export function criarOrganizacao(dados: {
  nome: string;
  clienteEmail?: string | null;
  saasoOrgId?: string | null;
  saasoToken?: string | null;
}): Organizacao {
  const c = db();
  const agora = new Date().toISOString();
  const id = `org_${Date.now()}`;
  let slug = slugificar(dados.nome);
  const jaExiste = c.prepare("SELECT 1 FROM organizations WHERE slug = ?").get(slug);
  if (jaExiste) slug = `${slug}-${id.slice(-4)}`;
  c.prepare(
    `INSERT INTO organizations (id, nome, slug, cliente_email, saaso_org_id, saaso_token, criada_em, atualizada_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    dados.nome.trim(),
    slug,
    dados.clienteEmail ? normaliza(dados.clienteEmail) : null,
    dados.saasoOrgId || null,
    dados.saasoToken || null,
    agora,
    agora,
  );
  c.close();
  // Quem funda a empresa entra como ADMIN dela (gerencia os funcionarios).
  if (dados.clienteEmail) vincularEmail(dados.clienteEmail, id, "admin");
  return orgPorId(id) as Organizacao;
}

export function atualizarOrganizacao(
  id: string,
  dados: {
    nome?: string;
    clienteEmail?: string | null;
    saasoOrgId?: string | null;
    saasoToken?: string | null;
  },
): Organizacao | null {
  const org = orgPorId(id);
  if (!org) return null;
  const c = db();
  const campos: string[] = [];
  const valores: unknown[] = [];
  if (dados.nome !== undefined) {
    campos.push("nome = ?");
    valores.push(dados.nome.trim());
  }
  if (dados.clienteEmail !== undefined) {
    campos.push("cliente_email = ?");
    valores.push(dados.clienteEmail ? normaliza(dados.clienteEmail) : null);
  }
  if (dados.saasoOrgId !== undefined) {
    campos.push("saaso_org_id = ?");
    valores.push(dados.saasoOrgId || null);
  }
  if (dados.saasoToken !== undefined) {
    campos.push("saaso_token = ?");
    valores.push(dados.saasoToken || null);
  }
  campos.push("atualizada_em = ?");
  valores.push(new Date().toISOString());
  valores.push(id);
  c.prepare(`UPDATE organizations SET ${campos.join(", ")} WHERE id = ?`).run(...(valores as never[]));
  c.close();
  // Quem funda a empresa entra como ADMIN dela (gerencia os funcionarios).
  if (dados.clienteEmail) vincularEmail(dados.clienteEmail, id, "admin");
  return orgPorId(id);
}

export function vincularEmail(email: string, orgId: string, papel = "membro"): void {
  const c = db();
  c.prepare(
    `INSERT INTO memberships (email, org_id, papel, criada_em) VALUES (?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET org_id = excluded.org_id, papel = excluded.papel`,
  ).run(normaliza(email), orgId, papel, new Date().toISOString());
  c.close();
}

/**
 * Papel de um e-mail NA EMPRESA (organizacao): 'dono' (dono da plataforma),
 * 'admin' (dono da empresa — gerencia os funcionarios) ou 'membro' (funcionario).
 */
export function papelNaOrg(email: string): string | null {
  const c = db();
  const v = c
    .prepare("SELECT papel FROM memberships WHERE lower(email) = ?")
    .get(normaliza(email)) as { papel: string } | undefined;
  c.close();
  return v?.papel ?? null;
}

/** Quem manda NA EMPRESA: o dono da plataforma ou o admin daquela organizacao. */
export function ehAdminDaOrg(conta: Conta): boolean {
  if (conta.ehDono) return true;
  const p = papelNaOrg(conta.email);
  return p === "admin" || p === "dono";
}

/** Organizacao a que o e-mail ja pertence (para nao "roubar" gente de outra empresa). */
export function orgDoEmail(email: string): string | null {
  const c = db();
  const v = c
    .prepare("SELECT org_id FROM memberships WHERE lower(email) = ?")
    .get(normaliza(email)) as { org_id: string } | undefined;
  c.close();
  return v?.org_id ?? null;
}

/** Tira o e-mail da empresa — so se ele for DESTA empresa. */
export function removerMembro(email: string, orgId: string): boolean {
  const c = db();
  const r = c
    .prepare("DELETE FROM memberships WHERE lower(email) = ? AND org_id = ?")
    .run(normaliza(email), orgId);
  c.close();
  return Number((r as { changes?: number }).changes ?? 0) > 0;
}

export function desvincularEmail(email: string): void {
  const c = db();
  c.prepare("DELETE FROM memberships WHERE lower(email) = ?").run(normaliza(email));
  c.close();
}

// ─── Sessao ───────────────────────────────────────────────────────
export async function contaDaRequisicao(req: NextRequest): Promise<Conta | null> {
  const doHeader = req.headers.get("authorization");
  const token =
    (doHeader?.startsWith("Bearer ") ? doHeader.slice(7) : null) ||
    req.cookies.get("token")?.value ||
    null;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;
  const user = getUserById(payload.userId) as
    | { id: number; name: string; email: string; role?: string }
    | null;
  if (!user) return null;
  const email = normaliza(user.email);
  const ehDono = email === OWNER_EMAIL || user.role === "owner";
  // O dono tambem tem organizacao propria (a dele) — so atravessa as outras.
  return {
    id: user.id,
    nome: user.name,
    email,
    ehDono,
    org: orgPorEmail(email),
  };
}

export async function exigirConta(
  req: NextRequest,
): Promise<{ ok: true; conta: Conta } | { ok: false; resposta: NextResponse }> {
  const conta = await contaDaRequisicao(req);
  if (!conta) {
    return { ok: false, resposta: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { ok: true, conta };
}

/** So o dono da plataforma: telas e rotas internas (Sistema, pipeline, config...). */
export async function exigirDono(
  req: NextRequest,
): Promise<{ ok: true; conta: Conta } | { ok: false; resposta: NextResponse }> {
  const r = await exigirConta(req);
  if (!r.ok) return r;
  if (!r.conta.ehDono) {
    return { ok: false, resposta: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return r;
}

/**
 * Credencial do CRM (MCP do Saaso) da organizacao da conta.
 * Sem vinculo => sem token => nada e consultado.
 */
export function credencialSaasoDaConta(conta: Conta): { orgId: string; token: string } | null {
  const org = conta.org;
  if (!org?.saaso_token) return null;
  return { orgId: org.saaso_org_id || org.slug, token: org.saaso_token };
}
