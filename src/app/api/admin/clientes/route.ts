import { NextRequest, NextResponse } from "next/server";

import { exigirDono } from "@/lib/orgs";
import { chamarPlanoDeControle, planoDeControleConfigurado } from "@/lib/plano-controle";
import { db } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Rota da aba CLIENTES — SO O DONO (a trava por prefixo ja existe em
 * src/middleware.ts: OWNER_ONLY_API inclui /api/admin; aqui confirmamos de novo,
 * defesa em profundidade).
 *
 * Por que existe: a aba junta DUAS metades que vivem em bancos diferentes —
 *   (a) a conta no MIRAI OS (`auth.db`: nome, e-mail, como a pessoa ENTRA —
 *       Google ou senha — e se o vinculo com o plano de controle ja foi feito);
 *   (b) o plano de controle (organizacao, produto, plano, add-ons, convite).
 *
 * GET — LISTA DE LISTAS (14/10/2026). A linha e a PESSOA, nao o par
 *       (pessoa, produto). Quem esta em dois produtos aparece UMA vez, e dentro
 *       dela fica a lista de onde ela esta — cada produto com a sua organizacao
 *       e o seu plano. O defeito medido antes: o dono aparecia duas vezes (CRM
 *       `saaso_pro` + MIRAI OS `mirai_free`) como se fossem DUAS contas, quando
 *       e a mesma pessoa — "it's the same account". O e-mail e a chave.
 *       `semConta` = organizacoes onde ainda nao ha ninguem (o cliente novo, com
 *       o convite de pe) — quem tem membro no plano de controle aparece como
 *       pessoa, mesmo sem conta local.
 * POST — `criar_cliente`: cria a ORGANIZACAO + o convite do dono, sem inventar
 *        usuario nem senha. A conta nasce quando a pessoa entra: `garantir_espaco`
 *        acha o convite e a poe NESTE espaco, com o papel do convite.
 */

type ContaApp = {
  id: number;
  nome: string;
  email: string;
  entra_por: "Google" | "senha";
  tenant_local: string | null;
  vinculado: boolean;
  desde: string | null;
};

type OrgDoControle = {
  tenant_id: string;
  organizacao: string;
  produto: string;
  plano: string;
  papel: string | null;
  extras: string[];
  convite_email: string | null;
  membros: string[];
  desde: string | null;
};

/** A linha da tela: UMA pessoa e a lista de onde ela esta. */
type Pessoa = {
  email: string;
  nome: string;
  /** Como entra no MIRAI OS. Sem conta local, diz o que se sabe. */
  entra_por: string;
  conta_id: number | null;
  tenant_local: string | null;
  vinculado: boolean;
  desde: string | null;
  organizacoes: OrgDoControle[];
};

function orgDoAdmin(o: any, papel: string | null = null): OrgDoControle {
  return {
    tenant_id: o.tenant_id,
    organizacao: o.nome || o.tenant_id,
    produto: String(o.product_id || ""),
    plano: String(o.plan_id || ""),
    papel,
    extras: Array.isArray(o.capacidades_extras) ? o.capacidades_extras : [],
    convite_email: String(o.convite_email || "").toLowerCase() || null,
    membros: [],
    desde: o.desde || null,
  };
}

export async function GET(req: NextRequest) {
  const g = await exigirDono(req);
  if (!g.ok) return g.resposta;

  // ── (a) as contas do MIRAI OS ─────────────────────────────────────
  const d = db();
  let cruas: any[] = [];
  try {
    cruas = d
      .prepare(
        "SELECT id, name, email, google_id, tenant_id, platform_config, created_at FROM users ORDER BY id",
      )
      .all() as any[];
  } finally {
    d.close();
  }

  const contas: ContaApp[] = cruas.map((r) => {
    let vinculo: any = null;
    try {
      vinculo = (JSON.parse(r.platform_config || "{}") || {}).mirai || null;
    } catch {
      vinculo = null;
    }
    return {
      id: r.id,
      nome: r.name || r.email,
      email: String(r.email || "").toLowerCase(),
      // Como a pessoa entra de verdade: conta criada pelo Google tem google_id;
      // as de senha, nao. E o que explica por que uma aparecia e outra nao.
      entra_por: r.google_id ? "Google" : "senha",
      tenant_local: r.tenant_id || null,
      vinculado: Boolean(vinculo?.tenant_id),
      desde: r.created_at || null,
    };
  });

  const semConta: OrgDoControle[] = [];
  let totalOrgs = 0;
  let aviso: string | undefined;

  if (!planoDeControleConfigurado()) {
    aviso = "O plano de controle não está configurado neste app — mostrando só as contas locais.";
    const pessoas: Pessoa[] = contas.map((c) => ({
      email: c.email,
      nome: c.nome,
      entra_por: c.entra_por,
      conta_id: c.id,
      tenant_local: c.tenant_local,
      vinculado: c.vinculado,
      desde: c.desde,
      organizacoes: [],
    }));
    return NextResponse.json({
      ok: true,
      contas: contas.length,
      organizacoes: 0,
      aviso,
      pessoas,
      semConta: [],
      gerado_em: new Date().toISOString(),
    });
  }

  // ── (b) o plano de controle ───────────────────────────────────────
  const porEmail = new Map<string, Pessoa>();
  for (const c of contas) {
    // Uma conta local por e-mail (o mesmo e-mail em duas linhas de `users` nao
    // cria duas pessoas). O mais antigo fica.
    if (!porEmail.has(c.email)) {
      porEmail.set(c.email, {
        email: c.email,
        nome: c.nome,
        entra_por: c.entra_por,
        conta_id: c.id,
        tenant_local: c.tenant_local,
        vinculado: c.vinculado,
        desde: c.desde,
        organizacoes: [],
      });
    }
  }

  const r = await chamarPlanoDeControle("/v1/admin/usuarios", { method: "GET" });
  const emailsPorTenant = new Map<string, string[]>();
  if (r.status !== 200) {
    aviso = `O plano de controle respondeu ${r.status} — mostrando só as contas locais.`;
  } else {
    const lista = (((r.corpo as any)?.usuarios || []) as any[]).filter(Boolean);
    totalOrgs = lista.length;
    for (const u of lista) {
      const email = String(u.email || "").toLowerCase();
      const tid = String(u.tenant_id || "");
      if (tid && email) emailsPorTenant.set(tid, [...(emailsPorTenant.get(tid) || []), email]);
      if (!email) continue;
      const org: OrgDoControle = {
        tenant_id: u.tenant_id,
        organizacao: u.tenant_nome || u.tenant_id,
        produto: String(u.product_id || ""),
        plano: String(u.plan_id || ""),
        papel: u.papel || null,
        extras: Array.isArray(u.capacidades_extras) ? u.capacidades_extras : [],
        convite_email: null,
        membros: [],
        desde: u.desde || null,
      };
      // A pessoa pode nao ter conta no MIRAI OS (entra por outro produto, ou o
      // convite dela foi aceito num produto so). Ela ENTRA na lista assim mesmo:
      // e gente de verdade no plano de controle, e some-la seria esconder de quem
      // o dono cobra.
      const p =
        porEmail.get(email) ||
        ({
          email,
          nome: u.nome || email,
          entra_por: "sem conta no MIRAI OS",
          conta_id: null,
          tenant_local: null,
          vinculado: false,
          desde: null,
          organizacoes: [],
        } as Pessoa);
      p.organizacoes.push(org);
      porEmail.set(email, p);
    }
  }

  // ── organizacoes onde ainda nao ha NINGUEM ────────────────────────
  // Vem da lista de ORGANIZACOES, nao da de usuarios: o cliente recem-criado
  // (organizacao + convite, sem ninguem ter entrado) nao tem membro nenhum e
  // NAO aparece em /v1/admin/usuarios — era ele que sumia do painel.
  // Quem TEM membro ja esta representado como pessoa (mesmo sem conta local),
  // entao nao se repete aqui.
  const r2 = await chamarPlanoDeControle("/v1/admin/organizacoes", { method: "GET" });
  if (r2.status === 200) {
    const todas = (((r2.corpo as any)?.organizacoes || []) as any[]).filter(Boolean);
    for (const o of todas) {
      const membros = emailsPorTenant.get(String(o.tenant_id)) || [];
      if (membros.length > 0) continue;
      semConta.push({ ...orgDoAdmin(o), membros });
    }
  }

  const pessoas = [...porEmail.values()].sort((a, b) => {
    // Sem conta local primeiro (sao os que pedem atencao), depois por nome.
    const fa = a.conta_id === null ? 0 : 1;
    const fb = b.conta_id === null ? 0 : 1;
    if (fa !== fb) return fa - fb;
    return a.nome.localeCompare(b.nome, "pt-BR");
  });

  return NextResponse.json({
    ok: true,
    contas: contas.length,
    organizacoes: totalOrgs,
    aviso,
    pessoas,
    semConta,
    gerado_em: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  const g = await exigirDono(req);
  if (!g.ok) return g.resposta;

  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const acao = String(corpo.acao || "").trim();
  if (acao !== "criar_cliente") {
    return NextResponse.json({ error: `acao desconhecida: ${acao}` }, { status: 400 });
  }

  const email = String(corpo.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "informe um e-mail válido" }, { status: 400 });
  }
  const produto = String(corpo.produto || "").trim();
  if (!produto) return NextResponse.json({ error: "informe o produto" }, { status: 400 });

  // O caminho de destino NAO vem do navegador, e o corpo e montado campo a
  // campo: nada de proxy aberto.
  const body: Record<string, unknown> = { email, product_id: produto };
  const nome = String(corpo.nome || "").trim();
  if (nome) body.nome = nome;
  const plano = String(corpo.plano || "").trim();
  if (plano) body.plano = plano;
  const papel = String(corpo.papel || "").trim();
  if (papel) body.role = papel;

  const r = await chamarPlanoDeControle("/v1/admin/organizacoes", { method: "POST", body });
  return NextResponse.json(r.corpo as any, { status: r.status });
}
