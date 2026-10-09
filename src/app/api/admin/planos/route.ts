import { NextRequest, NextResponse } from "next/server";

import { EMAIL_QUE_MUDA_PRECO, exigirDono } from "@/lib/orgs";
import { chamarPlanoDeControle } from "@/lib/plano-controle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Rota-proxy do PAINEL DE PLANOS — SO O DONO (a trava por prefixo ja existe em
 * src/middleware.ts: OWNER_ONLY_API inclui /api/admin; aqui confirmamos de novo,
 * defesa em profundidade, igual a /api/admin/organizacoes).
 *
 * O navegador chama ESTA rota; e ELA que fala com o plano de controle
 * server-side, com o segredo (nunca exposto ao navegador). Ver
 * src/lib/plano-controle.ts.
 *
 * Escrita (criar/editar plano, ligar capacidade, conceder/revogar add-on) exige
 * EMAIL_QUE_MUDA_PRECO — constante explicita, para que trocar o dono da
 * plataforma no futuro nao de um carona em preco.
 *
 * O caminho de destino NUNCA vem do navegador: so aceitamos as `acao` da lista
 * abaixo (whitelist). Nada de proxy aberto / SSRF.
 */

type Metodo = "GET" | "POST" | "PATCH" | "PUT";

// Whitelist de leitura: acao -> caminho no plano de controle.
const LEITURA: Record<string, (p: URLSearchParams) => string> = {
  planos: () => "/v1/admin/plans",
  capabilities: () => "/v1/admin/capabilities",
  organizacoes: () => "/v1/admin/organizacoes",
  usuarios: () => "/v1/admin/usuarios",
  capacidades_do_plano: (p) => {
    const id = (p.get("plan_id") || "").trim();
    if (!id) throw new Error("informe plan_id");
    return `/v1/admin/plans/${encodeURIComponent(id)}/capabilities`;
  },
};

function pegar(corpo: Record<string, unknown>, chaves: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of chaves) if (corpo[k] !== undefined) out[k] = corpo[k];
  return out;
}

export async function GET(req: NextRequest) {
  const g = await exigirDono(req);
  if (!g.ok) return g.resposta;

  const params = new URL(req.url).searchParams;
  const acao = (params.get("acao") || "planos").trim();
  const monta = LEITURA[acao];
  if (!monta) {
    return NextResponse.json({ error: `acao de leitura desconhecida: ${acao}` }, { status: 400 });
  }

  let caminho: string;
  try {
    caminho = monta(params);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "parametros invalidos" },
      { status: 400 },
    );
  }

  const r = await chamarPlanoDeControle(caminho, { method: "GET" });
  return NextResponse.json(r.corpo, { status: r.status });
}

// Toda escrita passa por aqui: dono (middleware + exigirDono) E o e-mail de
// preco. Se nao for o EMAIL_QUE_MUDA_PRECO, nem toca no plano de controle.
async function escrever(req: NextRequest): Promise<{ ok: true; corpo: Record<string, unknown> } | { ok: false; resposta: NextResponse }> {
  const g = await exigirDono(req);
  if (!g.ok) return g;
  if (g.conta.email !== EMAIL_QUE_MUDA_PRECO) {
    return {
      ok: false,
      resposta: NextResponse.json(
        { error: "Somente o e-mail autorizado muda plano/preco." },
        { status: 403 },
      ),
    };
  }
  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: true, corpo };
}

function despachar(
  acao: string,
  corpo: Record<string, unknown>,
): { method: Metodo; caminho: string; body: unknown } | { error: string } {
  const planId = String(corpo.plan_id || "").trim();
  const tenantId = String(corpo.tenant_id || "").trim();

  switch (acao) {
    case "salvar_plano":
      return {
        method: "POST",
        caminho: "/v1/admin/plans",
        body: pegar(corpo, ["plan_id", "product_id", "nome", "preco_centavos", "intervalo", "ativo", "limites"]),
      };
    case "editar_plano":
      if (!planId) return { error: "informe plan_id" };
      return {
        method: "PATCH",
        caminho: `/v1/admin/plans/${encodeURIComponent(planId)}`,
        body: pegar(corpo, ["nome", "preco_centavos", "intervalo", "ativo", "limites"]),
      };
    case "definir_capacidades_do_plano":
      if (!planId) return { error: "informe plan_id" };
      return {
        method: "PUT",
        caminho: `/v1/admin/plans/${encodeURIComponent(planId)}/capabilities`,
        body: { capacidades: Array.isArray(corpo.capacidades) ? corpo.capacidades : [] },
      };
    case "definir_plano_da_org":
      if (!tenantId || !corpo.plan_id) return { error: "informe tenant_id e plan_id" };
      return {
        method: "POST",
        caminho: `/v1/admin/organizacoes/${encodeURIComponent(tenantId)}/plano`,
        body: { plan_id: corpo.plan_id },
      };
    case "definir_capacidade_da_org":
      if (!tenantId || !corpo.capability_id) return { error: "informe tenant_id e capability_id" };
      return {
        method: "POST",
        caminho: `/v1/admin/organizacoes/${encodeURIComponent(tenantId)}/capacidades`,
        body: { capability_id: corpo.capability_id, conceder: corpo.conceder !== false },
      };
    default:
      return { error: `acao de escrita desconhecida: ${acao}` };
  }
}

async function tratarEscrita(req: NextRequest, esperado: Metodo) {
  const g = await escrever(req);
  if (!g.ok) return g.resposta;

  const acao = String(g.corpo.acao || new URL(req.url).searchParams.get("acao") || "").trim();
  const alvo = despachar(acao, g.corpo);
  if ("error" in alvo) {
    return NextResponse.json({ error: alvo.error }, { status: 400 });
  }
  if (alvo.method !== esperado) {
    return NextResponse.json(
      { error: `a acao '${acao}' espera ${alvo.method}, nao ${esperado}` },
      { status: 405 },
    );
  }

  const r = await chamarPlanoDeControle(alvo.caminho, { method: alvo.method, body: alvo.body });
  return NextResponse.json(r.corpo, { status: r.status });
}

export async function POST(req: NextRequest) {
  return tratarEscrita(req, "POST");
}

export async function PATCH(req: NextRequest) {
  return tratarEscrita(req, "PATCH");
}

export async function PUT(req: NextRequest) {
  return tratarEscrita(req, "PUT");
}
