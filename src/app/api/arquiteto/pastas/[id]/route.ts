import { NextRequest, NextResponse } from "next/server";

import { exigirConta } from "@/lib/orgs";
import { apagarPasta, renomearPasta } from "@/lib/arquiteto-projetos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/arquiteto/pastas/[id] — UMA pasta da CONTA logada.
 *
 * Posse conferida SEMPRE pelo `user_id` da sessão: id de outra conta responde
 * 404 — nunca "existe, mas não é sua".
 *
 *   PATCH  → renomeia  { nome }  →  { pasta }
 *   DELETE → apaga a pasta. Os PROJETOS dela NÃO são apagados: voltam a
 *            "Sem pasta" (pasta_id = NULL).
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  const { id } = await ctx.params;
  let nome = "";
  try {
    const corpo = (await req.json()) as { nome?: string };
    if (typeof corpo?.nome === "string") nome = corpo.nome;
  } catch {
    /* sem corpo válido: cai no 400 abaixo */
  }
  if (!nome.trim()) return NextResponse.json({ erro: "Dê um nome à pasta." }, { status: 400 });

  const pasta = renomearPasta(g.conta.id, id, nome);
  if (!pasta) return NextResponse.json({ erro: "Pasta não encontrada." }, { status: 404 });
  return NextResponse.json({ pasta });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  const { id } = await ctx.params;
  const apagou = apagarPasta(g.conta.id, id);
  if (!apagou) return NextResponse.json({ erro: "Pasta não encontrada." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
