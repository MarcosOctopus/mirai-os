import { NextRequest, NextResponse } from "next/server";

import { basePublica } from "@/lib/base-publica";
import bcrypt from "bcryptjs";
import {
  createUser,
  getUserByEmail,
  getUserByGoogleId,
  signToken,
} from "@/lib/auth";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=no_code", request.url));
  }

  // endereco publico: o visitante nunca esta no localhost do servidor
  const baseUrl = basePublica(request);
  const redirectUri = `${baseUrl}/api/auth/google/callback`;

  // ─── Exchange authorization code for tokens ───────────────────────
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
    console.error("Google token exchange failed:", errText);
    return NextResponse.redirect(new URL("/login?error=token_failed", request.url));
  }

  const tokens = await tokenRes.json();
  const accessToken = tokens.access_token;

  // ─── Fetch user info ─────────────────────────────────────────────
  const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!userRes.ok) {
    console.error("Google userinfo fetch failed:", await userRes.text());
    return NextResponse.redirect(new URL("/login?error=userinfo_failed", request.url));
  }

  const googleUser = await userRes.json();
  const { sub: googleId, name, email, picture } = googleUser;

  // ─── Find or create user ─────────────────────────────────────────
  let user = getUserByGoogleId(googleId);

  if (!user) {
    user = getUserByEmail(email);
  }

  if (!user) {
    const randomHash = bcrypt.hashSync(Math.random().toString(36), 10);
    user = createUser(name, email, randomHash, googleId, picture);
  }

  // ─── Sign JWT ────────────────────────────────────────────────────
  const token = await signToken({
    userId: user.id,
    email: user.email,
    tenantId: user.tenantId,
  });

  // ─── Set cookie & redirect ───────────────────────────────────────
  const isProd = process.env.NODE_ENV === "production";
  const response = NextResponse.redirect(
    new URL("/dashboard/connect", request.url)
  );

  response.cookies.set("token", token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
  });

  return response;
}
