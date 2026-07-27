import { NextRequest, NextResponse } from "next/server";
import { getUserById, verifyToken } from "@/lib/auth";

export async function GET(request: NextRequest) {
  // ─── Auth check ──────────────────────────────────────────────────
  const token = request.cookies.get("token")?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const user = getUserById(payload.userId);
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // ─── Build dynamic callback URL ──────────────────────────────────
  const host =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    "localhost:3333";
  const proto = request.headers.get("x-forwarded-proto") || "http";
  const baseUrl = `${proto}://${host}`;
  const redirectUri = `${baseUrl}/api/auth/youtube/callback`;

  // ─── State param: return to original page after auth ─────────────
  const redirectTo = request.nextUrl.searchParams.get("redirect") || "/dashboard/connect";
  const state = JSON.stringify({ userId: payload.userId, redirect: redirectTo });

  // ─── Build Google OAuth URL ──────────────────────────────────────
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    redirect_uri: redirectUri,
    scope: "https://www.googleapis.com/auth/youtube.readonly",
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
}
