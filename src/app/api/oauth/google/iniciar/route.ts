import { NextRequest, NextResponse } from "next/server";

import { exigirConta } from "@/lib/orgs";
import { resolverEscopo } from "@/lib/escopos";
import {
  assinarBilhete,
  configurado,
  estadoAleatorio,
  urlDeAutorizacao,
  urlDeVolta,
} from "@/lib/google-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/oauth/google/iniciar — o clique em "Conectar Google" no Synapse.
 *
 * Exige SESSÃO: é a conta que está doando acesso ao próprio email. Sem sessão,
 * ninguém conecta nada (não existe link público para esta integração — email é
 * dado pessoal, diferente do GitHub de um projeto).
 *
 * O bilhete (state + destino + userId) vai num cookie ASSINADO; o callback não
 * confia em nada que venha da URL.
 *
 * ESCOPO (13/11/2026): `?escopo=` diz em QUAL espaço a caixa vai ser guardada —
 * o pessoal (padrão) ou o da organização. Vai dentro do bilhete ASSINADO
 * (campo `orgId`), então o callback não pode ser induzido a gravar numa empresa
 * que não é de quem autorizou. Conexão começa sempre no espaço pessoal; mudar
 * de escopo é escolha explícita na tela.
 */
export async function GET(req: NextRequest) {
  if (!configurado()) {
    return NextResponse.json(
      {
        erro: "Google ainda não configurado neste servidor.",
        faltando: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
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
    // O id do escopo viaja assinado; pessoal = `pessoal-<id>`.
    orgId: escopo.tipo === "organizacao" ? escopo.id : undefined,
  });

  const r = NextResponse.redirect(urlDeAutorizacao(state, urlDeVolta(req)));
  r.cookies.set("g_bilhete", bilhete, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return r;
}
