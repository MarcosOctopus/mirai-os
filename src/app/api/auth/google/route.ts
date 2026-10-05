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
    access_type: "offline",
    prompt: "consent",
  });

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
}
