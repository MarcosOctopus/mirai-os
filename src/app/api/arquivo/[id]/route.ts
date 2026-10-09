import { NextRequest, NextResponse } from "next/server";
import fs from "fs";

import { exigirConta } from "@/lib/orgs";
import { obterUpload } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── GET /api/arquivo/[id] ─────────────────────────────────────────
// Serve UM anexo do próprio dono. Nada de arquivo público: o id é opaco e a
// posse (user_id) é conferida a cada leitura. O caminho vem do BANCO, nunca do
// que o cliente mandou — logo não há path traversal.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await exigirConta(req);
  if (!auth.ok) return auth.resposta;

  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  const reg = obterUpload(id, auth.conta.id);
  if (!reg) return NextResponse.json({ error: "não encontrado" }, { status: 404 });

  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(reg.caminho);
  } catch {
    return NextResponse.json({ error: "arquivo ausente no disco" }, { status: 410 });
  }

  const baixar = req.nextUrl.searchParams.get("dl") === "1";
  const nome = reg.nome_original.replace(/["\r\n]/g, "");
  const headers: Record<string, string> = {
    "Content-Type": reg.mime,
    "Content-Length": String(bytes.length),
    "Cache-Control": "private, max-age=300",
    "Content-Disposition": `${baixar ? "attachment" : "inline"}; filename="${nome}"`,
  };
  return new NextResponse(new Uint8Array(bytes), { headers });
}
