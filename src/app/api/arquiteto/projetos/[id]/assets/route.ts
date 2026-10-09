import { NextRequest, NextResponse } from "next/server";

import { exigirConta } from "@/lib/orgs";
import { listarAssets, salvarAsset, apagarAsset } from "@/lib/arquiteto-projetos";
import {
  MAX_ASSET_BYTES,
  MAX_ASSET_ROTULO,
  MENSAGEM_ASSET_TIPO,
  caminhoDeAsset,
  normalizarCaminhoAsset,
  precisaConverterParaWoff2,
  sufixoDoAsset,
} from "@/lib/arquiteto-asset-tipos";
import { converterParaWoff2 } from "@/lib/fonte-conversor";
import { assinarAsset } from "@/lib/arquiteto-asset-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * /api/arquiteto/projetos/[id]/assets — as IMAGENS do projeto (BLOB no banco).
 *
 * Escopo SEMPRE pelo `user_id` da sessão: projeto de outra conta responde 404
 * (nunca "existe, mas não é seu"), exatamente como as demais rotas do Arquiteto.
 * A PORTEIRA (`mirai.arquiteto.construir`) continua onde nasceu — no
 * /api/arquiteto/gerar. Aqui só se guarda/lista/apaga o que a própria conta já
 * subiu para um projeto dela.
 *
 *   GET    → { assets: [ {caminho,mime,tamanho,criado_em}, ... ] }
 *   POST   → multipart (campo "file"): valida TIPO REAL e tamanho no SERVIDOR,
 *            grava o BLOB e devolve { asset, assets }. 413 tamanho / 415 tipo.
 *   DELETE → ?caminho=assets/logo.png  apaga o BLOB. { ok:true, assets }
 */

// Teto técnico do transporte, um pouco acima do teto de negócio (5 MB/arquivo):
// multipart soma cabeçalho/boundary. Precisa casar com next.config.
const MAX_CORPO_BYTES = 6 * 1024 * 1024;

/**
 * O TIPO por MAGIC BYTES — nunca pela extensão nem pelo que o navegador disse.
 * Só devolve um dos mimes aceitos, ou null. SVG (texto) é reconhecido por
 * conteúdo (`<svg` no começo), não por `image/svg+xml` declarado.
 */
function detectarMimeArquivo(buf: Buffer): string | null {
  // FONTES DA WEB primeiro: são raras e a assinatura é curta e específica.
  if (buf.length >= 4) {
    const assinatura = buf.toString("latin1", 0, 4);
    if (assinatura === "wOF2") return "font/woff2";
    if (assinatura === "wOFF") return "font/woff";
    // Fontes de DESKTOP (dono, 09/10/2026): entram e são convertidas para WOFF2
    // logo abaixo, antes de guardar. `OTTO` = OpenType/CFF; `\0\1\0\0` e `true`
    // = TrueType (o `ttcf` é coleção de fontes — tenta converter; se não der,
    // recusa com recado, nunca guarda quebrada).
    if (assinatura === "OTTO") return "font/otf";
    if (assinatura === "true" || assinatura === "ttcf") return "font/ttf";
    if (buf[0] === 0x00 && buf[1] === 0x01 && buf[2] === 0x00 && buf[3] === 0x00) return "font/ttf";
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return "image/png";
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (buf.length >= 6) {
    const g = buf.toString("latin1", 0, 6);
    if (g === "GIF87a" || g === "GIF89a") return "image/gif";
  }
  if (
    buf.length >= 12 &&
    buf.toString("latin1", 0, 4) === "RIFF" &&
    buf.toString("latin1", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  // SVG: é texto. Cheira só o começo do arquivo (não varre o arquivo inteiro).
  const inicio = buf.toString("utf8", 0, Math.min(buf.length, 4096)).replace(/^\uFEFF/, "").trimStart();
  if (/<svg[\s>]/i.test(inicio) && /^\s*(?:<\?xml|<!--|<!doctype|<svg)/i.test(inicio)) {
    return "image/svg+xml";
  }
  return null;
}

type AssetResumo = { caminho: string; mime: string; tamanho: number };

/**
 * Anexa a URL de SERVIÇO de cada asset (assinada, curta duração, amarrada a
 * projeto+caminho+dono). É ela que o preview usa: dentro do iframe `sandbox` a
 * origem é opaca e o cookie SameSite=Lax não viaja, então sem o token a imagem
 * nunca carregaria. O token vive só na resposta para o próprio dono — não é
 * gravado no banco nem em log.
 */
function comUrlDeServico(projetoId: string, userId: number, assets: AssetResumo[]) {
  return assets.map((a) => ({
    ...a,
    url: `/api/arquiteto/projetos/${encodeURIComponent(projetoId)}/assets/${sufixoDoAsset(a.caminho)}?t=${assinarAsset(projetoId, a.caminho, userId)}`,
  }));
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;
  const { id } = await ctx.params;
  const assets = listarAssets(g.conta.id, id);
  if (!assets) return NextResponse.json({ erro: "Projeto não encontrado." }, { status: 404 });
  return NextResponse.json({ assets: comUrlDeServico(id, g.conta.id, assets) });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;
  const { id } = await ctx.params;

  const declarado = Number(req.headers.get("content-length") || 0);
  if (declarado > MAX_CORPO_BYTES) {
    return NextResponse.json(
      {
        erro: `Envio de ${(declarado / 1024 / 1024).toFixed(1)} MB passou do teto de ${MAX_ASSET_ROTULO} por imagem.`,
      },
      { status: 413 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ erro: "Envio inválido — não consegui ler o arquivo." }, { status: 400 });
  }

  const arquivo = form.get("file");
  if (!(arquivo instanceof File)) {
    return NextResponse.json({ erro: "Nenhuma imagem enviada (campo \"file\")." }, { status: 400 });
  }

  // 1) Tamanho (teto de negócio, conferido no SERVIDOR).
  if (arquivo.size <= 0) {
    return NextResponse.json({ erro: "O arquivo está vazio." }, { status: 400 });
  }
  if (arquivo.size > MAX_ASSET_BYTES) {
    return NextResponse.json(
      {
        erro: `"${arquivo.name}" tem ${(arquivo.size / 1024 / 1024).toFixed(1)} MB — o limite por arquivo é ${MAX_ASSET_ROTULO}.`,
      },
      { status: 413 },
    );
  }

  const buf = Buffer.from(await arquivo.arrayBuffer());

  // 2) Tipo REAL (magic bytes) — o navegador não é confiável aqui.
  const mime = detectarMimeArquivo(buf);
  if (!mime) {
    return NextResponse.json(
      { erro: `"${arquivo.name}": ${MENSAGEM_ASSET_TIPO}` },
      { status: 415 },
    );
  }

  // 3) FONTE DE DESKTOP → WOFF2 (dono, 09/10/2026 — "no caso de mandar em ttf e
  //    otf converte entao ne?"). A conversão acontece AQUI, antes de guardar: o
  //    projeto e o site publicado ficam só com o formato da web. Conversão que
  //    falha = RECUSA (415) com recado — nunca guardar uma fonte quebrada.
  let mimeFinal = mime;
  let bytesFinais: Buffer = buf;
  let convertida: { de: string; bytes_origem: number; bytes_final: number } | null = null;
  if (precisaConverterParaWoff2(mime)) {
    const conv = await converterParaWoff2(buf);
    if (!conv.ok) {
      return NextResponse.json(
        { erro: `"${arquivo.name}": ${conv.erro}` },
        { status: 415 },
      );
    }
    mimeFinal = "font/woff2";
    bytesFinais = conv.bytes;
    convertida = { de: mime, bytes_origem: buf.length, bytes_final: conv.bytes.length };
  }

  // 4) Nome → caminho canônico dentro de `assets/` (nunca confia no cliente).
  const nomePedido =
    typeof form.get("nome") === "string" ? String(form.get("nome")) : arquivo.name;
  const caminho = caminhoDeAsset(nomePedido || arquivo.name, mimeFinal);
  if (!caminho) {
    return NextResponse.json({ erro: "Nome de arquivo inválido." }, { status: 400 });
  }

  const asset = salvarAsset(g.conta.id, id, caminho, mimeFinal, bytesFinais);
  if (!asset) return NextResponse.json({ erro: "Projeto não encontrado." }, { status: 404 });

  const lista = listarAssets(g.conta.id, id) ?? [];
  return NextResponse.json({
    asset: comUrlDeServico(id, g.conta.id, [asset])[0],
    assets: comUrlDeServico(id, g.conta.id, lista),
    // Quando houve conversão, a resposta DIZ — a tela mostra de onde veio.
    ...(convertida ? { convertida: { ...convertida, para: "font/woff2" } } : {}),
  });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;
  const { id } = await ctx.params;

  const cru = req.nextUrl.searchParams.get("caminho") || "";
  const caminho = normalizarCaminhoAsset(cru);
  if (!caminho) return NextResponse.json({ erro: "Caminho de imagem inválido." }, { status: 400 });

  const apagou = apagarAsset(g.conta.id, id, caminho);
  if (!apagou) return NextResponse.json({ erro: "Imagem não encontrada." }, { status: 404 });

  return NextResponse.json({ ok: true, caminho, assets: comUrlDeServico(id, g.conta.id, listarAssets(g.conta.id, id) ?? []) });
}
