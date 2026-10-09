import { NextRequest, NextResponse } from "next/server";

import { exigirConta } from "@/lib/orgs";
import { decidirAcessoArquiteto } from "@/lib/arquiteto-acesso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/arquiteto/capacidade — "esta conta pode usar o Arquiteto?"
 *
 * A tela NÃO decide sozinha: ela pergunta aqui. Esta rota resolve a conta pela
 * SESSÃO (o mesmo guard do resto do app) e consulta o plano de controle com o
 * segredo que só o servidor tem. Nenhuma credencial chega ao navegador e nada
 * é liberado por padrão — a ausência de resposta é NEGADA.
 */
export async function GET(req: NextRequest) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;
  const d = await decidirAcessoArquiteto(g.conta);
  return NextResponse.json(d, { status: 200 });
}
