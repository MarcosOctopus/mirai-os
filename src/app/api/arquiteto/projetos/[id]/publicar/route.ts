import { NextRequest, NextResponse } from "next/server";

import { exigirConta } from "@/lib/orgs";
import { publicarProjeto, despublicarProjeto, garantirSlug } from "@/lib/arquiteto-projetos";
import { basePublica } from "@/lib/base-publica";
import { enderecoDoSlug } from "@/lib/dominio-projetos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/arquiteto/projetos/[id]/publicar — o estado de PUBLICAÇÃO do projeto.
 *
 * Escopo SEMPRE pelo `user_id` da sessão (a mesma guarda do resto do app): só o
 * dono do projeto publica/despublica, e projeto de outra conta responde 404 —
 * nunca "existe, mas não é seu".
 *
 *   POST   → publica (ou republica o mesmo link). Devolve o token e a URL
 *            pública montada com o endereço público do app.
 *            { ok, publicado_em, token, url } | 404
 *   DELETE → despublica. O link `/p/<token>` para de funcionar na hora.
 *            { ok:true } | 404
 *
 * O TOKEN nasce no SERVIDOR (ver `publicarProjeto`) e é imprevisível. Ele NUNCA é
 * logado nem impresso. A PORTEIRA do Arquiteto (`mirai.arquiteto.construir`)
 * continua exatamente onde nasceu — /gerar e /capacidade; aqui só se liga/desliga
 * o link do que a própria conta já construiu.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  const { id } = await ctx.params;
  const r = publicarProjeto(g.conta.id, id);
  if (!r) return NextResponse.json({ erro: "Projeto não encontrado." }, { status: 404 });

  // O ENDEREÇO nasce junto com a publicação (dono, 09/10/2026 — "conexão
  // automática com domínio"): se o projeto ainda não tem nome próprio, ganha um
  // tirado do título. Trocar ou tirar depois é na rota /endereco.
  const slug = garantirSlug(g.conta.id, id);

  return NextResponse.json({
    ok: true,
    publicado_em: r.publicado_em,
    token: r.token,
    url: `${basePublica(req)}/p/${r.token}`,
    slug,
    endereco: slug ? enderecoDoSlug(slug) : null,
  });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  const { id } = await ctx.params;
  const ok = despublicarProjeto(g.conta.id, id);
  if (!ok) return NextResponse.json({ erro: "Projeto não encontrado." }, { status: 404 });

  return NextResponse.json({ ok: true });
}
