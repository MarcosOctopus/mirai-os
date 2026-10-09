import { NextResponse } from "next/server";

import { resumoUsoTokens } from "@/lib/telemetria-tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Consumo de tokens do MIRAI OS — numeros REAIS, medidos por chamada.
 *
 * Devolve:
 *  - total geral (entrada, saida, total, chamadas);
 *  - quebra por provedor e por modelo;
 *  - recorte do mes corrente (UTC);
 *  - `medido: false` + `aviso` quando ainda nao ha nenhuma medicao.
 *
 * Sem dado => zeros (nunca valor estimado).
 */
export async function GET() {
  return NextResponse.json(resumoUsoTokens());
}
