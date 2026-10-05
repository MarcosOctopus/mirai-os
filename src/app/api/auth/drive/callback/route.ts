import { NextRequest, NextResponse } from "next/server";

import { basePublica } from "@/lib/base-publica";
import { getUserById, updateUserPlatformConfig, verifyToken } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const stateRaw = searchParams.get("state");

  if (!code) {
    return NextResponse.redirect(
      new URL("/dashboard/connect?error=no_code", request.url)
    );
  }

  // ─── Parse state to get userId ───────────────────────────────────
  let userId: number | null = null;
  let redirectTo = "/dashboard/connect";
  if (stateRaw) {
    try {
      const state = JSON.parse(stateRaw);
      userId = state.userId;
      redirectTo = state.redirect || "/dashboard/connect";
    } catch {
      // fallback: try reading JWT from cookie
    }
  }

  // Fallback: verify JWT from cookie if state didn't contain userId
  if (!userId) {
    const token = request.cookies.get("token")?.value;
    if (token) {
      const payload = await verifyToken(token);
      if (payload) {
        userId = payload.userId;
      }
    }
  }

  if (!userId) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // ─── Build callback URL for token exchange ───────────────────────
  // endereco publico: o visitante nunca esta no localhost do servidor
  const baseUrl = basePublica(request);
  const redirectUri = `${baseUrl}/api/auth/drive/callback`;

  // ─── Exchange authorization code for tokens ──────────────────────
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error("Drive OAuth token exchange failed:", errText);
    return NextResponse.redirect(
      new URL("/dashboard/connect?error=token_failed", request.url)
    );
  }

  const tokens = await tokenRes.json();

  // ─── Save tokens to platform_config ──────────────────────────────
  updateUserPlatformConfig(userId, {
    google_drive: {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      scope: "https://www.googleapis.com/auth/drive.file",
      connected_at: new Date().toISOString(),
    },
  });

  // ─── Redirect back to dashboard ──────────────────────────────────
  return NextResponse.redirect(
    new URL(`${redirectTo}?drive=connected`, request.url)
  );
}
