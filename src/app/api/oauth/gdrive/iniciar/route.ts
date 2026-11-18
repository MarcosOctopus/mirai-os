import { NextRequest, NextResponse } from "next/server";

import { exigirConta } from "@/lib/orgs";
import { resolverEscopo } from "@/lib/escopos";
import {
  assinarBilhete,
  configurado,
  estadoAleatorio,
  urlDeAutorizacaoDrive,
  urlDeVoltaDrive,
} from "@/lib/gdrive-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/oauth/gdrive/iniciar — "Conectar meu Drive" (a fonte viva de cada pessoa).
 *
 * POR QUE EXISTE (18/11/2026): o dono quer que o Drive de TODO MUNDO entre na Arca. Cada pessoa
 * conecta o próprio Drive; o conteúdo vai para o acervo DELA (o isolamento vem do token da Arca,
 * que é por pessoa).
 *
 * Regras que não abro mão:
 *  · exige SESSÃO — é a conta doando acesso ao próprio Drive, não existe link público;
 *  · o bilhete (state + destino + userId + escopo) vai num cookie ASSINADO: o retorno não confia
 *    em nada que venha pela URL (senão qualquer um planta um `code` e amarra um Drive alheio);
 *  · escopo é SÓ LEITURA (`drive.readonly`) — a fonte nunca escreve de volta;
 *  · o espaço (pessoal ou organização) viaja ASSINADO, então o callback não pode ser induzido a
 *    gravar o Drive de alguém no espaço de outra pessoa.
 */
export async function GET(req: NextRequest) {
  if (!configurado()) {
    return NextResponse.json(
      { erro: "Google ainda não configurado neste servidor.", faltando: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] },
      { status: 503 },
    );
  }

  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  const escopo = resolverEscopo(g.conta, new URL(req.url).searchParams.get("escopo"));
  const state = estadoAleatorio();
  const bilhete = assinarBilhete({
    state,
    volta: "/dashboard/arca?modo=fontes",
    userId: g.conta.id,
    orgId: escopo.tipo === "organizacao" ? escopo.id : undefined,
  });

  const r = NextResponse.redirect(urlDeAutorizacaoDrive(state, urlDeVoltaDrive(req)));
  r.cookies.set("gd_bilhete", bilhete, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return r;
}
