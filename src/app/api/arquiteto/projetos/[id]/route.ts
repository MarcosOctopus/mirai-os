import { NextRequest, NextResponse } from "next/server";

import { exigirConta } from "@/lib/orgs";
import { obterProjeto, renomearProjeto, apagarProjeto, definirPastaDoProjeto } from "@/lib/arquiteto-projetos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/arquiteto/projetos/[id] — UM projeto da CONTA logada.
 *
 * Posse conferida SEMPRE na leitura/escrita, pelo `user_id` da sessão: id de
 * outra conta responde 404 — nunca "existe, mas não é seu". Mesma postura de
 * /api/conversas/[id].
 *
 *   GET    → { projeto: { id, titulo, criado_em, atualizado_em, arquivos } }
 *   PATCH  → renomeia  { titulo }  e/ou  move de pasta  { pastaId }  →  { projeto }
 *            `pastaId: null` (ou "") tira o projeto da pasta ("Sem pasta").
 *   DELETE → apaga o projeto e seus arquivos
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  const { id } = await ctx.params;
  const projeto = obterProjeto(g.conta.id, id);
  if (!projeto) return NextResponse.json({ erro: "Projeto não encontrado." }, { status: 404 });

  return NextResponse.json({ projeto });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  const { id } = await ctx.params;
  let titulo: string | undefined;
  let veioPasta = false;
  let pastaId: string | null = null;
  try {
    const corpo = (await req.json()) as { titulo?: string; pastaId?: string | null };
    if (typeof corpo?.titulo === "string") titulo = corpo.titulo;
    if ("pastaId" in (corpo || {})) {
      veioPasta = true;
      pastaId = typeof corpo.pastaId === "string" && corpo.pastaId.trim() ? corpo.pastaId.trim() : null;
    }
  } catch {
    /* sem corpo válido: cai no 400 abaixo */
  }

  if (titulo === undefined && !veioPasta) {
    return NextResponse.json({ erro: "Nada para mudar (título ou pasta)." }, { status: 400 });
  }

  // Mover de pasta (independente do título).
  if (veioPasta) {
    const moveu = definirPastaDoProjeto(g.conta.id, id, pastaId);
    if (!moveu) return NextResponse.json({ erro: "Projeto ou pasta não encontrados." }, { status: 404 });
  }

  // Renomear, se veio título.
  if (titulo !== undefined) {
    if (!titulo.trim()) {
      return NextResponse.json({ erro: "Dê um nome ao projeto." }, { status: 400 });
    }
    const renomeado = renomearProjeto(g.conta.id, id, titulo);
    if (!renomeado) return NextResponse.json({ erro: "Projeto não encontrado." }, { status: 404 });
  }

  const projeto = obterProjeto(g.conta.id, id);
  if (!projeto) return NextResponse.json({ erro: "Projeto não encontrado." }, { status: 404 });
  return NextResponse.json({ projeto });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  const { id } = await ctx.params;
  const apagou = apagarProjeto(g.conta.id, id);
  if (!apagou) return NextResponse.json({ erro: "Projeto não encontrado." }, { status: 404 });

  return NextResponse.json({ ok: true });
}
