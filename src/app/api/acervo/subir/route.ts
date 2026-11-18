import { NextRequest, NextResponse } from "next/server";

import { exigirConta } from "@/lib/orgs";
import { pedirTokenNaArca } from "@/lib/arca-conta";

/**
 * POST /api/acervo/subir — SOBE ARQUIVO PARA A ARCA e o transforma em nota catalogada.
 *
 * POR QUE EXISTE (18/11/2026): o dono tentou ARRASTAR um documento para a tela da Arca e não
 * aconteceu nada — a tela simplesmente não tinha porta de upload (só arraste de pasta/nota).
 * No chat já existia (`/api/upload`), mas ali o arquivo vira ANEXO da conversa, não conteúdo
 * do acervo.
 *
 * O CAMINHO: o arquivo vai para a Arca (`POST /arquivos/upload`, guardado por organização) e
 * em seguida `POST /arquivos/{id}/nota` extrai o texto e cria a NOTA CATALOGADA — quem decide
 * pasta/subpasta/keywords/cor é o classificador da Arca (a rota de lá deixou de forçar
 * `documentos`, que era pasta fora do canon).
 *
 * A credencial é a DA PESSOA (`pedirTokenNaArca(email)`), nunca um token de arquivo: é o
 * mesmo caminho que a tela usa para ler o acervo dela.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ARCA = (process.env.ARCA_API_URL || "https://arca.miraitohope.com").replace(/\/+$/, "");
const MAX_BYTES = 30 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const auth = await exigirConta(req);
  if (!auth.ok) return auth.resposta;

  let form: FormData;
  try {
    form = await req.formData();
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Envio inválido (multipart): ${m}` }, { status: 400 });
  }

  const arquivos = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!arquivos.length) {
    return NextResponse.json({ error: 'Nenhum arquivo enviado (use o campo "files").' }, { status: 400 });
  }

  const cred = await pedirTokenNaArca(auth.conta.email);
  if (!cred.ok) {
    // Diz o MOTIVO em português — vazio silencioso é indistinguível de acervo vazio.
    return NextResponse.json(
      { error: cred.erro || "não consegui a credencial da Arca para esta conta." },
      { status: 503 },
    );
  }
  const tokenIsso = cred.token; // estreitado: daqui para baixo é sempre o ramo ok

  const enviados: Record<string, unknown>[] = [];
  const recusados: { nome: string; erro: string }[] = [];

  for (const file of arquivos) {
    if (file.size > MAX_BYTES) {
      recusados.push({ nome: file.name, erro: `"${file.name}" passou de 30 MB.` });
      continue;
    }
    try {
      // 1) o arquivo em si
      const fd = new FormData();
      fd.append("arquivo", file, file.name);
      const r1 = await fetch(`${ARCA}/arquivos/upload`, {
        method: "POST",
        headers: { "X-Arca-Token": tokenIsso, "user-agent": "MIRAI-OS/1.0" },
        body: fd,
        cache: "no-store",
      });
      const j1 = (await r1.json().catch(() => ({}))) as { id?: string; erro?: string; detail?: string };
      if (!r1.ok || !j1.id) {
        recusados.push({ nome: file.name, erro: j1.detail || j1.erro || `a Arca recusou (HTTP ${r1.status}).` });
        continue;
      }

      // 2) o arquivo vira NOTA CATALOGADA (é o que o mapa e a busca leem)
      const r2 = await fetch(`${ARCA}/arquivos/${j1.id}/nota`, {
        method: "POST",
        headers: { "X-Arca-Token": tokenIsso, "user-agent": "MIRAI-OS/1.0" },
        cache: "no-store",
      });
      const j2 = (await r2.json().catch(() => ({}))) as {
        acervo?: { nota?: string; pasta?: string; subpasta?: string };
        detail?: string;
      };
      if (!r2.ok) {
        // O arquivo ficou guardado; só a nota falhou (ex.: PDF sem texto extraível).
        recusados.push({
          nome: file.name,
          erro: `subiu, mas não virou nota: ${j2.detail || `HTTP ${r2.status}`}`,
        });
        continue;
      }
      enviados.push({
        nome: file.name,
        nota: j2.acervo?.nota || "",
        pasta: j2.acervo?.pasta || "",
        subpasta: j2.acervo?.subpasta || "",
      });
    } catch (e) {
      recusados.push({ nome: file.name, erro: `falha de rede com a Arca: ${e instanceof Error ? e.message : "?"}` });
    }
  }

  if (!enviados.length && recusados.length) {
    return NextResponse.json({ error: recusados[0].erro, recusados }, { status: 502 });
  }
  return NextResponse.json({ ok: true, enviados, recusados });
}
