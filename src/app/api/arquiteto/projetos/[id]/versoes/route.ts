import { NextRequest, NextResponse } from "next/server";

import { exigirConta } from "@/lib/orgs";
import { listarVersoes } from "@/lib/arquiteto-projetos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/arquiteto/projetos/[id]/versoes — a HISTÓRIA do projeto.
 *
 * Posse conferida no projeto pelo `user_id` da sessão: projeto de outra conta
 * responde 404 (nunca "existe, mas não é seu"), então as VERSÕES dele também
 * são inalcançáveis. Não há parâmetro de usuário — não dá para pedir a história
 * de outro.
 *
 *   GET → { versoes: [ { numero, criado_em, caminhos, assinatura }, ... ] }
 *         (mais antiga → mais nova; sem o conteúdo dos arquivos)
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  const { id } = await ctx.params;
  const versoes = listarVersoes(g.conta.id, id);
  if (!versoes) return NextResponse.json({ erro: "Projeto não encontrado." }, { status: 404 });

  return NextResponse.json({ versoes });
}
