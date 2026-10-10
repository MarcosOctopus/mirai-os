import { NextRequest, NextResponse } from "next/server";

import { basePublica } from "@/lib/base-publica";

export async function GET(request: NextRequest) {
  // endereco publico: o visitante nunca esta no localhost do servidor
  const baseUrl = basePublica(request);
  const redirectUri = `${baseUrl}/api/auth/google/callback`;

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    redirect_uri: redirectUri,
    scope: "openid email profile",
    response_type: "code",
    // SELETOR DE CONTAS (correção 10/10/2026). Antes era `prompt: "consent"`, que
    // FORÇAVA a tela de consentimento em TODA entrada e pulava o seletor — e, sem
    // o seletor, quem entra pelo app instalado (PWA) caía na tela de DIGITAR a
    // conta em vez de ver as contas já conectadas no aparelho. `select_account`
    // mostra o seletor; quem já autorizou antes não vê consentimento de novo.
    prompt: "select_account",
  });

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
}
