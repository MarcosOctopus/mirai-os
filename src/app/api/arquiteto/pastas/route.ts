import { NextRequest, NextResponse } from "next/server";

import { exigirConta } from "@/lib/orgs";
import { criarPasta, listarPastas } from "@/lib/arquiteto-projetos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/arquiteto/pastas — as PASTAS (categorias) do Arquiteto da CONTA logada.
 *
 * Mesma guarda e mesmo escopo do resto: a lista é sempre do `user_id` da sessão.
 * Não há parâmetro de usuário — não dá para pedir a pasta de outra conta.
 *
 *   GET  → { pastas: [ {id, nome, criado_em, atualizado_em, projetos}, ... ] }
 *   POST → cria  { nome }  →  { pasta }  (201)
 */
export async function GET(req: NextRequest) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;
  return NextResponse.json({ pastas: listarPastas(g.conta.id) });
}

export async function POST(req: NextRequest) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  let nome = "";
  try {
    const corpo = (await req.json()) as { nome?: string };
    if (typeof corpo?.nome === "string") nome = corpo.nome;
  } catch {
    /* sem corpo válido: cai no 400 abaixo */
  }

  const pasta = criarPasta(g.conta.id, nome);
  if (!pasta) return NextResponse.json({ erro: "Dê um nome à pasta." }, { status: 400 });
  return NextResponse.json({ pasta }, { status: 201 });
}
