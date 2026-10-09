import { NextRequest, NextResponse } from "next/server";

import { integracoesDoProjeto, obterProjeto } from "@/lib/arquiteto-projetos";
import { emitirTokenPonte } from "@/lib/ponte-token";
import { exigirConta } from "@/lib/orgs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/arquiteto/projetos/[id]/integracoes/tokens — OS TOKENS DA PONTE do projeto.
 *
 * O QUE É: para CADA integração que o projeto USA, emite UM token assinado
 * escopado ao par (projeto, integração) — `emitirTokenPonte` de
 * `ponte-token.ts`. É esse token que a prévia embute no `window.miraiPonte`
 * (`injetarIntegracoes`): o site gerado é ESTÁTICO e não pode guardar a chave,
 * então ele chama a ponte levando o token — e a ponte resolve a credencial da
 * conta dona do LADO DE LÁ. A CHAVE DE VERDADE NUNCA entra na página.
 *
 * ESCOPO (a mesma trava da rota irmã `…/integracoes`): exige conta e confere que
 * o projeto é DELA (`obterProjeto`). Projeto de outra conta responde 404 —
 * nunca "existe, mas não é seu". Sem conta é o 401 do `g.resposta`.
 *
 * DEVOLVE: { tokens: { <integração>: <token da ponte> } } — SÓ para as
 * integrações que o projeto usa (`integracoesDoProjeto`), e SÓ o token da
 * ponte. NUNCA a credencial: ela fica no servidor e não sai daqui.
 *
 *   GET → { tokens: { <integração>: <token> } }
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  const { id } = await ctx.params;
  // Posse do projeto (mesma guarda da rota irmã): não é desta conta → 404.
  if (!obterProjeto(g.conta.id, id)) {
    return NextResponse.json({ erro: "Projeto não encontrado." }, { status: 404 });
  }

  // Um token POR integração que o projeto usa. A lista vem de
  // `integracoesDoProjeto` (nunca lança: sem coluna/JSON torto → []). A
  // credencial NÃO é tocada aqui — só o token da ponte é emitido.
  const tokens: Record<string, string> = {};
  for (const integracao of integracoesDoProjeto(id)) {
    tokens[integracao] = emitirTokenPonte({ projetoId: id, integracao });
  }
  return NextResponse.json({ tokens });
}
