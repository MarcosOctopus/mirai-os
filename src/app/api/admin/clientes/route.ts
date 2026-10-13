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
 * A tela de planos so mostra a metade (b); quem entrou pelo Google podia nao
 * existir la e o dono nao tinha como enxergar isso. Aqui a linha e a PESSOA.
 *
 * GET  — uma linha por (pessoa, organizacao). Quem tem conta em dois produtos
 *        aparece duas vezes, com o plano de cada produto (o plano e da
 *        CONTA-PRODUTO, nao da pessoa). Quem ainda nao tem organizacao aparece
 *        marcado; organizacao sem conta local vai em `orfaos`, com o convite
 *        pendente quando houver.
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
  desde: string | null;
};

type Linha = ContaApp & { organizacoes: OrgDoControle[] };

function orgDoAdmin(o: any, papel: string | null = null): OrgDoControle {
  return {
    tenant_id: o.tenant_id,
    organizacao: o.nome || o.tenant_id,
    produto: String(o.product_id || ""),
    plano: String(o.plan_id || ""),
    papel,
    extras: Array.isArray(o.capacidades_extras) ? o.capacidades_extras : [],
    convite_email: String(o.convite_email || "").toLowerCase() || null,
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

  const orfaos: OrgDoControle[] = [];
  let totalOrgs = 0;
  let aviso: string | undefined;

  if (!planoDeControleConfigurado()) {
    aviso = "O plano de controle não está configurado neste app — mostrando só as contas locais.";
  } else {
    // ── (b) o plano de controle: uma linha por (usuario, organizacao) ──
    const r = await chamarPlanoDeControle("/v1/admin/usuarios", { method: "GET" });
    const orgsPorEmail = new Map<string, OrgDoControle[]>();
    // Organizacoes que JA tem gente (aparecem na lista de usuarios). Serve para
    // separar "cliente com conta" de "espaco esperando alguem entrar".
    const tenantsComGente = new Set<string>();
    if (r.status !== 200) {
      aviso = `O plano de controle respondeu ${r.status} — mostrando só as contas locais.`;
    } else {
      const lista = (((r.corpo as any)?.usuarios || []) as any[]).filter(Boolean);
      totalOrgs = lista.length;
      for (const u of lista) {
        if (u.tenant_id) tenantsComGente.add(String(u.tenant_id));
        const email = String(u.email || "").toLowerCase();
        if (!email) continue;
        const linha: OrgDoControle = {
          tenant_id: u.tenant_id,
          organizacao: u.tenant_nome || u.tenant_id,
          produto: String(u.product_id || ""),
          plano: String(u.plan_id || ""),
          papel: u.papel || null,
          extras: Array.isArray(u.capacidades_extras) ? u.capacidades_extras : [],
          convite_email: null,
          desde: u.desde || null,
        };
        orgsPorEmail.set(email, [...(orgsPorEmail.get(email) || []), linha]);
      }
    }

    // ── cruzamento pelo e-mail ────────────────────────────────────────
    const clientes: Linha[] = [];
    const comOrganizacao = new Set<string>();
    for (const c of contas) {
      const minhas = orgsPorEmail.get(c.email) || [];
      if (minhas.length === 0) {
        clientes.push({ ...c, organizacoes: [] });
        continue;
      }
      comOrganizacao.add(c.email);
      for (const o of minhas) clientes.push({ ...c, organizacoes: [o] });
    }

    // ── organizacoes SEM ninguem ─────────────────────────────────────
    // Vem da lista de ORGANIZACOES, nao da de usuarios: um cliente recem-criado
    // (organizacao + convite, sem ninguem ter entrado) NAO aparece em
    // /v1/admin/usuarios — e era exatamente ele que sumia do painel.
    // Entra aqui SO quem nao tem gente nenhuma: organizacao com membro ja esta
    // na lista de clientes, e repetir aqui seria dizer que esta esperando.
    const r2 = await chamarPlanoDeControle("/v1/admin/organizacoes", { method: "GET" });
    if (r2.status === 200) {
      const todas = (((r2.corpo as any)?.organizacoes || []) as any[]).filter(Boolean);
      const emailsComConta = new Set(contas.map((c) => c.email));
      for (const o of todas) {
        if (tenantsComGente.has(String(o.tenant_id))) continue;
        const linha = orgDoAdmin(o);
        // Se quem foi convidado ja tem conta aqui, a linha dele ja esta em
        // `clientes` — nao duplica.
        if (linha.convite_email && emailsComConta.has(linha.convite_email)) continue;
        orfaos.push(linha);
      }
    }

    return NextResponse.json({
      ok: true,
      contas: contas.length,
      organizacoes: totalOrgs,
      aviso,
      clientes,
      orfaos,
      gerado_em: new Date().toISOString(),
    });
  }

  // Sem plano de controle configurado: devolve so as contas locais, sem inventar
  // organizacao nenhuma.
  return NextResponse.json({
    ok: true,
    contas: contas.length,
    organizacoes: 0,
    aviso,
    clientes: contas.map((c) => ({ ...c, organizacoes: [] })),
    orfaos: [],
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
