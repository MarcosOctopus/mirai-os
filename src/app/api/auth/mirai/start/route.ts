// Começa o login pela Conta Mirai.
//
// O bilhete (state + nonce + pkce) viaja num cookie HttpOnly que só é enviado
// para /api/auth/mirai — então quem devolver um `code` sem ter começado o
// pedido AQUI não fecha nada.
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { MIRAI, configurado, assinarBilhete, novoVerifier, desafio, destino } from "@/lib/mirai-oidc";

export const dynamic = "force-dynamic";

function interno(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/dashboard/connect";
  return next;
}

export async function GET(request: NextRequest) {
  if (!configurado()) {
    return NextResponse.redirect(destino("/login?error=mirai_nao_configurado", request.url));
  }

  const next = interno(new URL(request.url).searchParams.get("next"));
  const state = crypto.randomBytes(24).toString("base64url");
  const nonce = crypto.randomBytes(24).toString("base64url");
  const verifier = novoVerifier();

  const params = new URLSearchParams({
    client_id: MIRAI.CLIENT_ID,
    redirect_uri: MIRAI.REDIRECT,
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: await desafio(verifier),
    code_challenge_method: "S256",
  });

  const response = NextResponse.redirect(
    `${MIRAI.ISSUER}/v1/auth/authorize?${params.toString()}`,
  );
  response.cookies.set("mirai_ticket", await assinarBilhete({ state, nonce, verifier, next }), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/api/auth/mirai",
  });
  return response;
}
