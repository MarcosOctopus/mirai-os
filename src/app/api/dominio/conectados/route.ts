import { NextRequest, NextResponse } from "next/server";

import { dominiosConectados } from "@/lib/arquiteto-projetos";
import { segredoDaFilaConfere } from "@/lib/fila-do-dominio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/dominio/conectados — a lista COMPLETA de domínios conectados.
 *
 * Para que serve (dono, 09/10/2026): o serviço da borda precisa saber não só o
 * que PUBLICAR, mas o que DESPUBLICAR. Se o dono desconecta um domínio no painel,
 * o vhost daquele domínio não pode continuar no ar servindo o projeto — seria
 * entrega de site para quem não é mais dono do endereço. O serviço compara os
 * vhosts que ELE gerou com esta lista e tira os órfãos.
 *
 * Mesma porta da fila: segredo compartilhado, em tempo constante.
 */
export async function GET(req: NextRequest) {
  if (!segredoDaFilaConfere(req)) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  return NextResponse.json({ dominios: dominiosConectados() });
}