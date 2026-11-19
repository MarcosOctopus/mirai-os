/**
 * GRAVAR AQUI — recebe o áudio gravado no navegador e põe na fila da Arca.
 *
 * O corpo é o áudio CRU (audio/webm, audio/wav, ...), não multipart: o
 * MediaRecorder manda exatamente isso e converter no cliente só para "ficar
 * bonito" custaria CPU do dispositivo de quem está na reunião.
 *
 * Teto de 200 MB: uma reunião de 2 h em webm/opus fica MUITO abaixo disso, e o
 * teto existe para não deixar um upload infinito derrubar o app.
 */

import { NextRequest, NextResponse } from "next/server";
import { exigirConta } from "@/lib/orgs";
import { enfileirarGravacao, tokenDaPessoa } from "@/lib/reuniao-arca";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TETO = 200 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  // O token DESTA pessoa vai junto com o áudio: o cano transcreve no acervo de quem
  // gravou. Sem isso a gravação de um cliente cairia no acervo da nossa organização.
  const token = await tokenDaPessoa(g.conta.id, g.conta.email);
  if (!token) {
    return NextResponse.json(
      { error: "Sua Arca não está conectada nesta conta — não há onde guardar a gravação." },
      { status: 409 },
    );
  }

  const titulo = (req.headers.get("x-reuniao-titulo") || "").trim();
  const tags = (req.headers.get("x-reuniao-tags") || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const tipo = req.headers.get("content-type") || "";
  if (!tipo.startsWith("audio/") && !tipo.startsWith("video/")) {
    return NextResponse.json({ error: "envie o áudio gravado (audio/webm)" }, { status: 415 });
  }

  const bytes = Buffer.from(await req.arrayBuffer());
  if (!bytes.length) return NextResponse.json({ error: "áudio vazio" }, { status: 400 });
  if (bytes.length > TETO) {
    return NextResponse.json(
      { error: `áudio grande demais (${Math.round(bytes.length / 1048576)} MB, teto 200 MB)` },
      { status: 413 },
    );
  }

  const nome = (titulo || `reuniao-${new Date().toISOString().slice(0, 16)}`).slice(0, 80);
  const { arquivo } = await enfileirarGravacao(bytes, nome, tags, token);

  return NextResponse.json(
    {
      ok: true,
      arquivo,
      mensagem:
        "Áudio na fila do acervo. A transcrição entra em 05_REUNIOES assim que o cano terminar " +
        "(minutos para uma reunião longa).",
    },
    { status: 202 },
  );
}