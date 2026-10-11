import { NextRequest } from "next/server";

import { exigirConta } from "@/lib/orgs";
import { listarAssets, obterProjeto } from "@/lib/arquiteto-projetos";
import { montarPrevia, type Asset } from "@/lib/arquiteto-preview";
import { assinarAsset } from "@/lib/arquiteto-asset-token";
import { sufixoDoAsset } from "@/lib/arquiteto-asset-tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/arquiteto/projetos/[id]/previa — o HTML MONTADO do projeto, para a
 * MINIATURA do portfólio (a "imagem destacada" da página de Projetos).
 *
 * Por que existe: o card do portfólio mostra o projeto VIVO (não um screenshot
 * guardado que envelhece). O grid põe esta rota num `<iframe>` escalado — a
 * miniatura é sempre o estado ATUAL do projeto.
 *
 * Escopo e posse: só o DONO (sessão). A prévia é servida como `text/html` e o
 * iframe que a consome roda em `sandbox="allow-scripts"` SEM `allow-same-origin`
 * (origem opaca) — o código do projeto não enxerga cookie, DOM do app nem rota
 * interna. As imagens carregam por URL assinada, como na página publicada.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  const { id } = await ctx.params;
  const projeto = obterProjeto(g.conta.id, id);
  if (!projeto) return new Response("Projeto não encontrado.", { status: 404 });

  const baseAssets = `/api/arquiteto/projetos/${encodeURIComponent(projeto.id)}/assets`;
  const assets: Asset[] = (listarAssets(g.conta.id, projeto.id) ?? []).map((a) => ({
    caminho: a.caminho,
    mime: a.mime,
    tamanho: a.tamanho,
    criado_em: a.criado_em,
    url: `${baseAssets}/${sufixoDoAsset(a.caminho)}?t=${assinarAsset(projeto.id, a.caminho, g.conta.id)}`,
  }));

  const previa = montarPrevia(projeto.arquivos, assets, baseAssets, projeto.tokens, { comPonte: false });
  const html =
    previa.html ||
    `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#0b0b12;color:#7a7a8c;font:14px system-ui;display:grid;place-items:center;height:100vh">Projeto sem página de entrada.</body>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
