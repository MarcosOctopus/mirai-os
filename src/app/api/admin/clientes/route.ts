import { NextRequest, NextResponse } from "next/server";

import { exigirDono } from "@/lib/orgs";
import { chamarPlanoDeControle, planoDeControleConfigurado } from "@/lib/plano-controle";
import { db } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Rota de LEITURA da aba CLIENTES — SO O DONO (a trava por prefixo ja existe em
 * src/middleware.ts: OWNER_ONLY_API inclui /api/admin; aqui confirmamos de novo,
 * defesa em profundidade).
 *
 * Por que existe: a aba junta DUAS metades que vivem em bancos diferentes —
 *   (a) a conta no MIRAI OS (`auth.db`: nome, e-mail, como a pessoa ENTRA —
 *       Google ou senha — e se o vinculo com o plano de controle ja foi feito);
 *   (b) o plano de controle (organizacao, produto, plano, add-ons).
 * A tela de planos so mostra a metade (b); quem entrou pelo Google podia nao
 * existir la e o dono nao tinha como enxergar isso. Aqui a linha e a PESSOA.
 *
 * Uma linha por (pessoa, organizacao). Quem tem conta em dois produtos aparece
 * duas vezes, com o plano de cada produto — porque o plano e da CONTA-PRODUTO,
 * nao da pessoa. Quem ainda nao tem organizacao aparece uma vez, MARCADO, para
 * o buraco nao ficar invisivel (e "sem organizacao" nao ser lido como "sem
 * cliente").
 *
 * ESCRITA NAO MORA AQUI: trocar o plano usa /api/admin/planos (acao
 * `definir_plano_da_org`), que ja tem o freio do e-mail autorizado.
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
  desde: string | null;
};

type Linha = ContaApp & { organizacoes: OrgDoControle[] };

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

  // ── (b) o plano de controle: uma linha por (usuario, organizacao) ──
  let orgsPorEmail = new Map<string, OrgDoControle[]>();
  let totalOrgs = 0;
  let aviso: string | undefined;
  if (!planoDeControleConfigurado()) {
    aviso = "O plano de controle não está configurado neste app — mostrando só as contas locais.";
  } else {
    const r = await chamarPlanoDeControle("/v1/admin/usuarios", { method: "GET" });
    if (r.status !== 200) {
      aviso = `O plano de controle respondeu ${r.status} — mostrando só as contas locais.`;
    } else {
      const lista = (((r.corpo as any)?.usuarios || []) as any[]).filter(Boolean);
      totalOrgs = lista.length;
      for (const u of lista) {
        const email = String(u.email || "").toLowerCase();
        if (!email) continue;
        const linha: OrgDoControle = {
          tenant_id: u.tenant_id,
          organizacao: u.tenant_nome || u.tenant_id,
          produto: String(u.product_id || ""),
          plano: String(u.plan_id || ""),
          papel: u.papel || null,
          extras: Array.isArray(u.capacidades_extras) ? u.capacidades_extras : [],
          desde: u.desde || null,
        };
        orgsPorEmail.set(email, [...(orgsPorEmail.get(email) || []), linha]);
      }
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

  // Organizacao que existe no plano de controle e NAO tem conta local (dado de
  // teste, ou conta de outro produto): fica visivel, nunca somem do painel.
  const orfaos: OrgDoControle[] = [];
  for (const [email, lista] of orgsPorEmail) {
    if (!comOrganizacao.has(email)) orfaos.push(...lista);
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
