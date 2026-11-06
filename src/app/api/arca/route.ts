import { NextRequest } from "next/server";
import { arcaConfigurada, erroDeCredencial, headersDaArca } from "@/lib/arca-cliente";

const ARCA_URL = "https://arca.miraitohope.com";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ROTA `/api/arca` — PROXY DA ARCA.
 *
 * MEDIDO 06/11/2026 (Fase 3): esta rota era um proxy que deixava o CLIENTE
 * escolher o path de destino na Arca (`path` no corpo do POST) — então um
 * usuário autenticado podia chamar `path: "/memory"` e ESCREVER na memória
 * pessoal do dono. E não lia `x-tenant-id` (injetado pelo middleware.ts:241-245),
 * então servia a memória global da Arca para qualquer um dos 12 tenants.
 *
 * A REGRAS DA ROTA:
 *  - `path` foi REMOVIDO. Só rotas de LEITURA podem ser chamadas, e só as
 *    listadas em ROTAS_LEITURA.
 *  - `x-tenant-id` é exigido (o middleware o injeta em toda requisição
 *    autenticada) e enviado à Arca como `X-Arca-Tenant`.
 *  - A Arca ainda NÃO filtra por tenant (nenhuma tabela tem `tenant_id`).
 *    Por isso NÃO existe "filtro" aqui: em vez de devolver dado que não é
 *    do tenant e chamar isso de filtrado, a rota devolve 403 enquanto o
 *    filtro de escopo não existir. Um filtro que não filtra é pior que
 *    nenhuma resposta — é mentira de dado.
 *  - Sem credencial da Arca, a chamada NÃO acontece (503 + motivo).
 *
 * OBS: hoje NENHUM consumidor chama `/api/arca` (medido: zero ocorrências em
 * `src/`). A rota é mantida fechada e explícita para quando um consumidor
 * legítimo existir — com a superfície mínima.
 */

/** Únicas rotas da Arca que esta rota pode chamar. NUNCA escrivas. */
const ROTAS_LEITURA = ["/context", "/memory/search", "/executive-brief"] as const;

const NEGAR = (status: number, error: string, extra?: Record<string, unknown>) =>
  Response.json({ error, ...(extra || {}) }, { status });

/** O header de tenant, exigido para qualquer resposta. */
function tenantExigido(req: NextRequest): string | Response {
  const tenantId = req.headers.get("x-tenant-id");
  if (!tenantId) {
    return NEGAR(
      401,
      "Tenant não identificado — o middleware não injetou x-tenant-id. Faça login novamente."
    );
  }
  return tenantId;
}

/** Chama a Arca, com o token e o tenant, SEMPRE GET (só leitura). */
async function chamarArca(rota: string, q: string, tenantId: string) {
  if (!arcaConfigurada()) {
    return { erro: NEGAR(503, erroDeCredencial()) as Response };
  }
  const url = rota === "/executive-brief" || !q
    ? `${ARCA_URL}${rota}`
    : `${ARCA_URL}${rota}?q=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { ...headersDaArca(), "X-Arca-Tenant": tenantId },
  });
  if (!res.ok) {
    return { erro: NEGAR(502, `Arca error: ${res.status}`) as Response };
  }
  return { data: await res.json() };
}

export async function GET(req: NextRequest) {
  const tenant = tenantExigido(req);
  if (tenant instanceof Response) return tenant;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  if (!q) {
    return NEGAR(400, "Missing query parameter 'q'");
  }

  // O GET sempre vai para /context (compatível com quem chamava ?q=)
  try {
    const { erro } = await chamarArca("/context", q, tenant);
    if (erro) return erro;
    return bloqueadoPorTenant();
  } catch (err: any) {
    return NEGAR(500, err.message);
  }
}

export async function POST(req: NextRequest) {
  const tenant = tenantExigido(req);
  if (tenant instanceof Response) return tenant;

  // `path` foi removido: o cliente não escolhe o destino na Arca.
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NEGAR(400, "Corpo JSON inválido");
  }

  const rotaPedida = String(body.rota || body.path || "").trim();
  const q = String(body.q || "");

  // Whitelist — qualquer coisa fora disso é rejeitada.
  if (rotaPedida && !(ROTAS_LEITURA as readonly string[]).includes(rotaPedida)) {
    return NEGAR(403, "Rota da Arca não permitida (só leitura)", {
      permitidas: ROTAS_LEITURA,
      pedida: rotaPedida,
    });
  }
  const rota = (rotaPedida || "/context") as string;

  try {
    const { erro, data } = await chamarArca(rota, q, tenant);
    if (erro) return erro;
    return bloqueadoPorTenant(data);
  } catch (err: any) {
    return NEGAR(500, err.message);
  }
}

/**
 * 403 honesto.
 *
 * A Arca não filtra por tenant (medido: nenhuma tabela de `documents`,
 * `memories`, `decisions`, `tasks`, `meetings`, `risks`, `opportunities`,
 * `activities` tem coluna `tenant_id`). Qualquer "filtro" aqui seria um
 * `!item.tenant_id || item.tenant_id === tenantId` — que SEMPRE passa, porque
 * o campo não existe. Devolveria os dados do dono para todos os tenants e
 * ainda chamaria isso de filtrado. Não é aceitável.
 *
 * O caminho certo é classificar os dados (Fase 3, item 1) e só depois filtrar.
 */
function bloqueadoPorTenant(_data?: unknown): Response {
  return Response.json(
    {
      error: "Acesso negado: a Arca ainda não filtra por tenant",
      motivo:
        "O filtro de escopo multi-tenant não existe na Arca (nenhuma tabela tem tenant_id). " +
        "Enquanto o escopo não existir, esta rota não devolve dado da Arca.",
      passo: "Fase 3 — classificar os dados e implementar escopo por tenant na Arca.",
    },
    { status: 403 }
  );
}
