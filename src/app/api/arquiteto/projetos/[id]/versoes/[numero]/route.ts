import { NextRequest, NextResponse } from "next/server";

import { exigirConta } from "@/lib/orgs";
import { obterVersao, restaurarVersao, listarVersoes } from "@/lib/arquiteto-projetos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/arquiteto/projetos/[id]/versoes/[numero] — UMA versão do projeto.
 *
 * Posse conferida no projeto E na versão pelo `user_id` da sessão: qualquer id
 * de outra conta responde 404. Mesma postura das demais rotas do Arquiteto.
 *
 *   GET  → { versao: { numero, criado_em, caminhos, assinatura, arquivos } }
 *   POST → RESTAURA esta versão (os arquivos dela viram os atuais) e grava uma
 *          NOVA versão em cima — a história NUNCA é destruída.
 *          → { projeto, versao_restaurada, versoes }
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; numero: string }> },
) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  const { id, numero } = await ctx.params;
  const n = Number.parseInt(numero, 10);
  if (!Number.isFinite(n) || n <= 0) {
    return NextResponse.json({ erro: "Versão inválida." }, { status: 400 });
  }
  const versao = obterVersao(g.conta.id, id, n);
  if (!versao) return NextResponse.json({ erro: "Versão não encontrada." }, { status: 404 });

  return NextResponse.json({ versao });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; numero: string }> },
) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  const { id, numero } = await ctx.params;
  const n = Number.parseInt(numero, 10);
  if (!Number.isFinite(n) || n <= 0) {
    return NextResponse.json({ erro: "Versão inválida." }, { status: 400 });
  }

  const projeto = restaurarVersao(g.conta.id, id, n);
  if (!projeto) return NextResponse.json({ erro: "Versão não encontrada." }, { status: 404 });

  // A lista volta junto (já inclui a versão nova criada pela restauração).
  const versoes = listarVersoes(g.conta.id, id) ?? [];
  return NextResponse.json({ projeto, versao_restaurada: n, versoes });
}
