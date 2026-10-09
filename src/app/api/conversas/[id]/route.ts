import { NextRequest, NextResponse } from "next/server";
import { exigirConta } from "@/lib/orgs";
import { obterConversa, apagarConversa } from "@/lib/conversas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── /api/conversas/[id] ───────────────────────────────────────────
// Uma conversa e suas mensagens. A posse (user_id) é conferida na leitura:
// id de outra conta responde 404 — nunca "existe, mas não é seu".
//
//   GET    → { conversa: { id, titulo, criada_em, atualizada_em, mensagens } }
//   DELETE → apaga a conversa e suas mensagens
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await exigirConta(req);
  if (!auth.ok) return auth.resposta;

  const { id } = await ctx.params;
  const conversa = obterConversa(auth.conta.id, id);
  if (!conversa) return NextResponse.json({ error: "não encontrada" }, { status: 404 });

  return NextResponse.json({ conversa });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await exigirConta(req);
  if (!auth.ok) return auth.resposta;

  const { id } = await ctx.params;
  const apagou = apagarConversa(auth.conta.id, id);
  if (!apagou) return NextResponse.json({ error: "não encontrada" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
