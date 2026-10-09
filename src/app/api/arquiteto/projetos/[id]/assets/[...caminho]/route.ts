import { NextRequest, NextResponse } from "next/server";

import { exigirConta } from "@/lib/orgs";
import { obterAssetBytes, apagarAsset, listarAssets } from "@/lib/arquiteto-projetos";
import { normalizarCaminhoAsset, ehFonte } from "@/lib/arquiteto-asset-tipos";
import { verificarAssetToken } from "@/lib/arquiteto-asset-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/arquiteto/projetos/[id]/assets/[...caminho] — serve UM asset (os BYTES).
 *
 * A sessão é resolvida pela mesma guarda do app e a POSSE do projeto é conferida
 * ANTES de ler o BLOB: o asset de outra conta é INEXISTENTE (404). O caminho vem
 * dos segmentos da URL, é NORMALIZADO (sem `..`, sempre sob `assets/`) e casa a
 * chave no banco — não há caminho de sistema aqui, logo não há path traversal.
 *
 * Cabeçalhos: o Content-Type REAL gravado e cache longo. Para o SVG (que é o
 * único tipo capaz de carregar script), a resposta leva uma CSP restritiva com
 * `sandbox`: mesmo que alguém abra o SVG direto, ele não ganha a origem do app
 * nem executa script. Para os demais tipos a CSP é inócua.
 *
 *   GET    → os bytes (imagem OU fonte da web)
 *   DELETE → apaga o BLOB. { ok:true, assets }
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; caminho: string[] }> },
) {
  const { id, caminho } = await ctx.params;
  const canonico = normalizarCaminhoAsset(Array.isArray(caminho) ? caminho.join("/") : String(caminho || ""));
  if (!canonico) return NextResponse.json({ erro: "Caminho de imagem inválido." }, { status: 400 });

  // 1) Caminho do PREVIEW: token assinado (projeto+caminho+dono). O iframe
  //    `sandbox` tem origem OPACA e o cookie SameSite=Lax não viaja até aqui —
  //    sem este caminho a imagem do projeto nunca apareceria na prévia.
  //    Token só é aceito se casar com ESTE projeto e ESTE caminho.
  const token = req.nextUrl.searchParams.get("t");
  let dono: number;
  if (token) {
    const v = verificarAssetToken(token);
    if (!v || v.projetoId !== id || v.caminho !== canonico) {
      return NextResponse.json({ erro: "Imagem não encontrada." }, { status: 404 });
    }
    dono = v.userId;
  } else {
    // 2) Sem token: sessão + posse do projeto (navegador do dono, curl, download).
    const g = await exigirConta(req);
    if (!g.ok) return g.resposta;
    dono = g.conta.id;
  }

  const asset = obterAssetBytes(dono, id, canonico);
  if (!asset) return NextResponse.json({ erro: "Imagem não encontrada." }, { status: 404 });

  const bytes = Buffer.isBuffer(asset.bytes) ? asset.bytes : Buffer.from(asset.bytes as unknown as ArrayBuffer);
  const headers: Record<string, string> = {
    "Content-Type": asset.mime,
    "Content-Length": String(bytes.length),
    // Conteúdo privado da conta: só o navegador do dono guarda. Mesmo assim,
    // pedido pelo dono, o cache é LONGO (a URL não muda enquanto o asset existe).
    "Cache-Control": "private, max-age=31536000, immutable",
    "Content-Disposition": `inline; filename="${canonico.split("/").pop() || "arquivo"}"`,
    "X-Content-Type-Options": "nosniff",
  };
  if (ehFonte(asset.mime)) {
    // FONTE DA WEB: o `@font-face` é SEMPRE uma busca cross-origin (o iframe da
    // prévia tem origem opaca; no site publicado a fonte vem na mesma origem, mas
    // o navegador aplica CORS igual). Sem estes dois cabeçalhos o arquivo baixa e
    // a fonte NÃO é usada — falha silenciosa, das piores de diagnosticar.
    headers["Access-Control-Allow-Origin"] = "*";
    headers["Cross-Origin-Resource-Policy"] = "cross-origin";
  } else {
    // Trava de execução para SVG (e inócua nos binários de imagem).
    headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
  }
  return new NextResponse(new Uint8Array(bytes), { headers });
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; caminho: string[] }> },
) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  const { id, caminho } = await ctx.params;
  const canonico = normalizarCaminhoAsset(Array.isArray(caminho) ? caminho.join("/") : String(caminho || ""));
  if (!canonico) return NextResponse.json({ erro: "Caminho de imagem inválido." }, { status: 400 });

  const apagou = apagarAsset(g.conta.id, id, canonico);
  if (!apagou) return NextResponse.json({ erro: "Imagem não encontrada." }, { status: 404 });

  return NextResponse.json({ ok: true, caminho: canonico, assets: listarAssets(g.conta.id, id) ?? [] });
}
