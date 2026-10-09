import { NextRequest, NextResponse } from "next/server";

import { dominiosParaPublicar } from "@/lib/arquiteto-projetos";
import { conferirApontamento } from "@/lib/dominio-projetos";
import { segredoDaFilaConfere } from "@/lib/fila-do-dominio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/dominio/pendentes — A FILA DA ÚLTIMA MILHA (dono, 09/10/2026: "tem que
 * ter tudo para fazer essa integração").
 *
 * Quem pergunta é o serviço da BORDA (`mirai-publica-dominio`), de tempos em
 * tempos, com o segredo compartilhado. Devolve só o que já PODE ser publicado:
 * domínio conectado, projeto publicado e o DNS apontando para a borda — o DNS é
 * conferido aqui, ao vivo, e o serviço confere DE NOVO do lado dele (não se
 * confia em quem pede).
 *
 * A porta é fechada por padrão: sem `MIRAI_FILA_SECRET` configurado, ninguém
 * entra (401).
 */
export async function GET(req: NextRequest) {
  if (!segredoDaFilaConfere(req)) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const candidatos = dominiosParaPublicar();
  const pendentes: { projetoId: string; dominio: string }[] = [];
  for (const c of candidatos) {
    const ap = await conferirApontamento(c.dominio);
    if (ap.estado === "apontando") pendentes.push(c);
  }

  return NextResponse.json({ pendentes });
}