import { NextRequest, NextResponse } from "next/server";

import { exigirConta } from "@/lib/orgs";
import { resolverEscopo } from "@/lib/escopos";
import {
  assinarBilhete,
  configurado,
  estadoAleatorio,
  urlDeAutorizacao,
  urlDeVolta,
} from "@/lib/instagram-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/oauth/instagram/iniciar — o clique em "Conectar" no card do Instagram.
 *
 * Exige SESSÃO: quem autoriza é a pessoa, com a conta dela. Não existe link
 * público para esta integração.
 *
 * O escopo (pessoal ou organização) vai DENTRO do bilhete assinado, nunca na URL:
 * assim o retorno não pode ser induzido a gravar na empresa de outra pessoa.
 */
export async function GET(req: NextRequest) {
  if (!configurado()) {
    return NextResponse.json(
      {
        erro: "Instagram ainda não configurado neste servidor (app da Meta ausente).",
        faltando: ["META_APP_ID", "META_APP_SECRET"],
      },
      { status: 503 },
    );
  }

  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  const escopo = resolverEscopo(g.conta, new URL(req.url).searchParams.get("escopo"));
  const state = estadoAleatorio();
  const bilhete = assinarBilhete({
    state,
    volta: "/dashboard/connect",
    userId: g.conta.id,
    orgId: escopo.tipo === "organizacao" ? escopo.id : undefined,
  });

  const r = NextResponse.redirect(urlDeAutorizacao(state, urlDeVolta(req)));
  r.cookies.set("ig_bilhete", bilhete, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return r;
}