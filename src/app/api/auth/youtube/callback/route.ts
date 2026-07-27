import { NextRequest, NextResponse } from "next/server";
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
  const host =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    "localhost:3333";
  const proto = request.headers.get("x-forwarded-proto") || "http";
  const baseUrl = `${proto}://${host}`;
  const redirectUri = `${baseUrl}/api/auth/youtube/callback`;

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
    console.error("YouTube OAuth token exchange failed:", errText);
    return NextResponse.redirect(
      new URL("/dashboard/connect?error=token_failed", request.url)
    );
  }

  const tokens = await tokenRes.json();
  const accessToken = tokens.access_token;
  const refreshToken = tokens.refresh_token || null;

  // ─── Fetch YouTube channel info ──────────────────────────────────
  let channelInfo = null;
  try {
    const channelRes = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (channelRes.ok) {
      const channelData = await channelRes.json();
      if (channelData.items && channelData.items.length > 0) {
        const item = channelData.items[0];
        channelInfo = {
          id: item.id,
          title: item.snippet.title,
          description: item.snippet.description,
          thumbnails: item.snippet.thumbnails,
          publishedAt: item.snippet.publishedAt,
        };
      }
    }
  } catch (err) {
    console.error("YouTube channel fetch failed:", err);
  }

  // ─── Save tokens + channel info to platform_config ───────────────
  const youtubeConfig: Record<string, any> = {
    access_token: accessToken,
    refresh_token: refreshToken,
    scope: "https://www.googleapis.com/auth/youtube.readonly",
    connected_at: new Date().toISOString(),
  };

  if (channelInfo) {
    youtubeConfig.channel = channelInfo;
  }

  updateUserPlatformConfig(userId, { youtube: youtubeConfig });

  // ─── Redirect back to dashboard ──────────────────────────────────
  return NextResponse.redirect(
    new URL(`${redirectTo}?youtube=connected`, request.url)
  );
}
