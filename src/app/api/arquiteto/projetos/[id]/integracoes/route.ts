import { NextRequest, NextResponse } from "next/server";

import { integracoesDoProjeto, definirIntegracoesDoProjeto, obterProjeto } from "@/lib/arquiteto-projetos";
import { exigirConta } from "@/lib/orgs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/arquiteto/projetos/[id]/integracoes — QUAIS integrações o projeto USA.
 *
 * O QUE É: uma LISTA de identificadores curtos (ex.: ['github','supabase']) que
 * o projeto registra usar. Diferente do Cloudflare/GitHub (que guardam a
 * CONEXÃO — token cifrado), aqui só se anota a INTENÇÃO: "este projeto usa
 * isto". É o que a tela mostra para o dono.
 *
 * ESCOPO (a trava de verdade, a mesma da rota do Cloudflare): exige conta e
 * confere que o projeto é DELA. Projeto de outra conta responde 404 — nunca
 * "existe, mas não é seu". Sem conta é 401 (o `g.resposta` de `exigirConta`).
 *
 * O `[id]` da URL é o PROJETO. O identificador da INTEGRAÇÃO é OUTRA coisa e
 * viaja no corpo (`POST { id }`) ou na query (`DELETE ?id=`): é o que entra/sai
 * da lista.
 *
 *   GET            → { usadas: string[] }
 *   POST { id }    → adiciona (sem duplicar) e devolve { usadas: string[] }
 *   DELETE ?id=    → remove e devolve { usadas: string[] }
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  const { id } = await ctx.params;
  // Posse do projeto (mesma guarda da rota do Cloudflare): não é desta conta → 404.
  if (!obterProjeto(g.conta.id, id)) {
    return NextResponse.json({ erro: "Projeto não encontrado." }, { status: 404 });
  }
  return NextResponse.json({ usadas: integracoesDoProjeto(id) });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  const { id } = await ctx.params;
  if (!obterProjeto(g.conta.id, id)) {
    return NextResponse.json({ erro: "Projeto não encontrado." }, { status: 404 });
  }

  // Corpo ausente/ilegível NÃO é erro: vira "nada a adicionar" e a lista volta
  // como está. A validação de verdade é do valor logo abaixo.
  let corpo: { id?: unknown } = {};
  try {
    corpo = (await req.json()) as { id?: unknown };
  } catch {
    // sem corpo: segue com a lista atual
  }
  const novo = typeof corpo.id === "string" ? corpo.id.trim() : "";

  const atuais = integracoesDoProjeto(id);
  // NÃO duplica: só acrescenta um id novo, não vazio e ainda ausente.
  const usadas = novo && !atuais.includes(novo) ? [...atuais, novo] : atuais;
  definirIntegracoesDoProjeto(id, usadas);
  return NextResponse.json({ usadas });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  const { id } = await ctx.params;
  if (!obterProjeto(g.conta.id, id)) {
    return NextResponse.json({ erro: "Projeto não encontrado." }, { status: 404 });
  }

  const alvo = (req.nextUrl.searchParams.get("id") || "").trim();
  // Remove o id pedido (se estiver na lista) e grava o que sobra. Tirar um id
  // que não estava é no-op — a lista volta igual.
  const usadas = integracoesDoProjeto(id).filter((i) => i !== alvo);
  definirIntegracoesDoProjeto(id, usadas);
  return NextResponse.json({ usadas });
}