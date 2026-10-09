import { NextRequest, NextResponse } from "next/server";
import { exigirConta } from "@/lib/orgs";
import { listarConversas, criarConversa, tituloDaMensagem } from "@/lib/conversas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── /api/conversas ────────────────────────────────────────────────
// Histórico de conversas da CONTA logada. A middleware já fecha /api/*, mas a
// posse é reconferida aqui: a lista é sempre filtrada pelo usuário da sessão.
//
//   GET  → conversas da pessoa (id, título, atualizada_em), mais novas primeiro
//   POST → cria uma conversa nova (título opcional; senão "Nova conversa")
export async function GET(req: NextRequest) {
  const auth = await exigirConta(req);
  if (!auth.ok) return auth.resposta;
  return NextResponse.json({ conversas: listarConversas(auth.conta.id) });
}

export async function POST(req: NextRequest) {
  const auth = await exigirConta(req);
  if (!auth.ok) return auth.resposta;

  let titulo = "";
  try {
    const corpo = await req.json();
    if (typeof corpo?.titulo === "string") titulo = corpo.titulo;
  } catch {
    /* sem corpo: cria com o título padrão */
  }

  const conversa = criarConversa(auth.conta.id, titulo ? tituloDaMensagem(titulo) : undefined);
  return NextResponse.json({ conversa }, { status: 201 });
}
