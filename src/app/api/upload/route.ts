import { NextRequest, NextResponse } from "next/server";

import { exigirConta } from "@/lib/orgs";
import { salvarUpload } from "@/lib/uploads";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_ROTULO, categoriaDeMime, rotuloDeMime } from "@/lib/upload-tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Corpo total máximo aceito por requisição (vários arquivos).
// TETO TÉCNICO (transporte), um pouco acima do teto de NEGÓCIO de 30 MB/arquivo:
// multipart soma cabeçalho/boundary e a mensagem pode levar mais de um arquivo.
// Precisa casar com next.config (serverActions.bodySizeLimit e
// middlewareClientMaxBodySize), senão o parser derruba antes do nosso 413.
const MAX_CORPO_BYTES = 40 * 1024 * 1024;

// ─── POST /api/upload ──────────────────────────────────────────────
// Recebe 1..N arquivos (campo "files"), valida tipo/size no SERVIDOR, grava na
// pasta do usuário e devolve o registro para a mensagem do chat.
export async function POST(req: NextRequest) {
  const auth = await exigirConta(req);
  if (!auth.ok) return auth.resposta;

  const declarado = Number(req.headers.get("content-length") || 0);
  if (declarado > MAX_CORPO_BYTES) {
    return NextResponse.json(
      {
        error:
          `Envio de ${(declarado / 1024 / 1024).toFixed(1)} MB passou do teto técnico de ` +
          `${Math.round(MAX_CORPO_BYTES / 1024 / 1024)} MB por mensagem (cada arquivo pode ter até ${MAX_UPLOAD_ROTULO}).`,
      },
      { status: 413 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    console.error("upload formData falhou:", m);
    return NextResponse.json({ error: `Envio inválido (multipart): ${m}` }, { status: 400 });
  }

  const arquivos = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!arquivos.length) {
    return NextResponse.json({ error: 'Nenhum arquivo enviado (use o campo "files").' }, { status: 400 });
  }

  const anexos: Record<string, unknown>[] = [];
  const recusados: { nome: string; erro: string; status: number }[] = [];

  for (const file of arquivos) {
    // teto por arquivo também pelo header do File (barato, antes de materializar)
    if (file.size > MAX_UPLOAD_BYTES) {
      recusados.push({
        nome: file.name,
        erro: `"${file.name}" tem ${(file.size / 1024 / 1024).toFixed(1)} MB — o limite é ${MAX_UPLOAD_ROTULO} por arquivo.`,
        status: 413,
      });
      continue;
    }
    const r = await salvarUpload({ id: auth.conta.id, org: auth.conta.org }, file);
    if (r.ok) {
      const reg = r.registro;
      anexos.push({
        id: reg.id,
        nome: reg.nome_original,
        mime: reg.mime,
        categoria: categoriaDeMime(reg.mime),
        rotulo: rotuloDeMime(reg.mime),
        tamanho: reg.tamanho,
        url: `/api/arquivo/${reg.id}`,
      });
    } else {
      recusados.push({ nome: file.name, erro: r.erro, status: r.status });
    }
  }

  // Nada aceito: devolve o status do primeiro erro para o cliente reagir direito.
  if (!anexos.length && recusados.length) {
    return NextResponse.json({ error: recusados[0].erro, recusados }, { status: recusados[0].status });
  }

  return NextResponse.json({ anexos, recusados });
}
