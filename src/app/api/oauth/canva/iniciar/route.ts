import { NextRequest, NextResponse } from "next/server";

import { basePublica } from "@/lib/base-publica";
import {
  assinarBilhete,
  configurado,
  desafioDe,
  estadoAleatorio,
  novoVerificador,
  urlDeAutorizacao,
  urlDeVolta,
} from "@/lib/canva-oauth";
import { exigirConta } from "@/lib/orgs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/oauth/canva/iniciar — o clique em "Conectar Canva" na Synapse.
 *
 * Diferente do GitHub, aqui NÃO existe caminho por projeto: o Canva é da PESSOA
 * (dono, 19/10/2026: *"each person can use their own account of the Canva, each
 * client"*). O token vai para o cofre DESTA conta e serve a todos os projetos
 * dela. Sem sessão, não há de quem ser a conta → 401.
 *
 * Sai daqui um redirecionamento para o consentimento do Canva com `state`
 * (anti-CSRF) e PKCE S256. O bilhete assinado vai em cookie httpOnly.
 */
export async function GET(req: NextRequest) {
  if (!configurado()) {
    return NextResponse.json(
      {
        erro:
          "O Canva ainda não está configurado no app (faltam o Client ID e o Client Secret do app criado no Developer Portal).",
      },
      { status: 503 },
    );
  }

  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  const state = estadoAleatorio();
  const verificador = novoVerificador();
  const enderecoDeVolta = urlDeVolta(req);

  const resposta = NextResponse.redirect(
    urlDeAutorizacao(state, desafioDe(verificador), enderecoDeVolta),
  );
  resposta.cookies.set(
    "cv_bilhete",
    assinarBilhete({
      projetoId: "",
      state,
      verificador,
      volta: "/dashboard/connect",
      userId: g.conta.id,
    }),
    {
      httpOnly: true,
      sameSite: "lax",
      // `secure` segue o endereço PÚBLICO (não a URL interna do proxy).
      secure: basePublica(req).startsWith("https://"),
      path: "/",
      maxAge: 900, // 15 min: sobra para consentir, e curto para não vazar
    },
  );
  return resposta;
}
