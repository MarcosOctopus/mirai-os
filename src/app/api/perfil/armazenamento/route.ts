import { NextRequest, NextResponse } from "next/server";

import { exigirConta } from "@/lib/orgs";
import { calcularUsoBytes, LIMITE_WORKSPACE_BYTES } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── GET /api/perfil/armazenamento ─────────────────────────────────
// Contrato consumido pela tela de perfil: { usado_bytes, limite_bytes }.
// Autenticado: cada conta só vê o PRÓPRIO consumo.
export async function GET(req: NextRequest) {
  const auth = await exigirConta(req);
  if (!auth.ok) return auth.resposta;

  const usado_bytes = calcularUsoBytes(auth.conta.id);

  return NextResponse.json({
    usado_bytes,
    limite_bytes: LIMITE_WORKSPACE_BYTES,
  });
}
