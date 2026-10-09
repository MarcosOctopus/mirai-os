import { NextRequest, NextResponse } from "next/server";

import { conexaoCloudflare, dominioDoProjeto, esquecerCloudflare } from "@/lib/arquiteto-projetos";
import { apontarDominioDoProjeto } from "@/lib/cloudflare-apontar";
import { exigirConta } from "@/lib/orgs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/arquiteto/projetos/[id]/dominio/cloudflare — o estado e as ações da
 * conexão com o Cloudflare (dono, 09/10/2026 — o BOTÃO).
 *
 *   GET    → { conectado, zona, em } — NUNCA devolve o token.
 *   POST   → aponta o domínio agora (cria/corrige o registro A). É o "tentar de
 *            novo" do painel e também serve quando o domínio mudou.
 *   DELETE → esquece a conexão (o dono desconectou).
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;
  const { id } = await ctx.params;
  if (!dominioDoProjeto(g.conta.id, id)) {
    return NextResponse.json({ erro: "Projeto não encontrado." }, { status: 404 });
  }
  const c = conexaoCloudflare(id);
  return NextResponse.json({ ok: true, ...(c ?? { conectado: false, zona: null, em: null }) });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;
  const { id } = await ctx.params;
  if (!dominioDoProjeto(g.conta.id, id)) {
    return NextResponse.json({ erro: "Projeto não encontrado." }, { status: 404 });
  }
  const r = await apontarDominioDoProjeto(id);
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 400 });
  return NextResponse.json({ ok: true, mensagem: r.mensagem, zona: r.zona });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;
  const { id } = await ctx.params;
  if (!dominioDoProjeto(g.conta.id, id)) {
    return NextResponse.json({ erro: "Projeto não encontrado." }, { status: 404 });
  }
  esquecerCloudflare(id);
  return NextResponse.json({ ok: true });
}