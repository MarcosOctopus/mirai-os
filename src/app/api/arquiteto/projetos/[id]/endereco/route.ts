import { NextRequest, NextResponse } from "next/server";

import { exigirConta } from "@/lib/orgs";
import { enderecoDoProjeto, definirSlug } from "@/lib/arquiteto-projetos";
import { DOMINIO_PROJETOS, enderecoDoSlug } from "@/lib/dominio-projetos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/arquiteto/projetos/[id]/endereco — o ENDEREÇO do projeto.
 *
 * O QUE É: o nome que o projeto ganha (`<slug>.miraitohope.com`) — a "conexão
 * automática com domínio" que o dono pediu olhando o Figma Make (09/10/2026).
 * O link antigo `/p/<token>` continua existindo e valendo: ele é o segredo, o
 * endereço é a porta com nome.
 *
 * REGRAS (as mesmas do link): escopo SEMPRE pelo `user_id` da sessão; endereço
 * só serve enquanto o projeto está PUBLICADO (despublicado → 404 em todo lugar);
 * nome único no mundo, minúsculo, `[a-z0-9-]`, e nunca um nome de serviço nosso.
 *
 *   GET             → { ok, slug, endereco, sugerido, publicado, dominio }
 *   POST { slug }   → grava/troca. `slug: ""` = TIRAR o endereço.
 *                     { ok, slug, endereco } | 400 (recado em PT-BR) | 404
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  const { id } = await ctx.params;
  const e = enderecoDoProjeto(g.conta.id, id);
  if (!e) return NextResponse.json({ erro: "Projeto não encontrado." }, { status: 404 });

  return NextResponse.json({
    ok: true,
    slug: e.slug,
    endereco: e.slug ? enderecoDoSlug(e.slug) : null,
    sugerido: e.sugerido,
    dominio: DOMINIO_PROJETOS,
    publicado: !!e.publicado_em,
    publicado_em: e.publicado_em,
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  const { id } = await ctx.params;
  let corpo: { slug?: string } = {};
  try {
    corpo = (await req.json()) as { slug?: string };
  } catch {
    // Sem corpo = pedido de tirar o endereço (não é erro).
  }

  const r = definirSlug(g.conta.id, id, String(corpo.slug ?? ""));
  if (!r.ok) {
    const naoAchou = /não encontrado/i.test(r.erro);
    return NextResponse.json({ erro: r.erro }, { status: naoAchou ? 404 : 400 });
  }

  return NextResponse.json({
    ok: true,
    slug: r.slug,
    endereco: r.slug ? enderecoDoSlug(r.slug) : null,
  });
}
