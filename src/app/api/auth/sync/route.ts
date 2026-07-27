import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUserById } from "@/lib/auth";
import { syncToVault } from "@/lib/mf-bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/sync
 * Syncs all connected platform API keys to the MF vault for the authenticated user.
 */
export async function POST(req: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────
    const token = req.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const user = getUserById(payload.userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const platformConfig = JSON.parse(user.platform_config || "{}");
    const mfConfig = platformConfig.mf;
    if (!mfConfig?.user_id) {
      return NextResponse.json(
        { error: "Media Factory user not registered. Re-register or reconnect account." },
        { status: 400 }
      );
    }

    // ── Sync each platform that has keys ──────────────────────
    const results: Record<string, any> = {};
    const keyedPlatforms = ["youtube", "google_drive", "higgsfield", "suno", "telegram", "magnific", "instagram", "kling"];

    for (const platform of keyedPlatforms) {
      const config = platformConfig[platform];
      if (config && typeof config === "object" && Object.keys(config).length > 0) {
        const syncResult = await syncToVault(mfConfig.user_id, platform, config);
        results[platform] = syncResult;
      }
    }

    return NextResponse.json({
      ok: true,
      mfUserId: mfConfig.user_id,
      syncedPlatforms: Object.keys(results),
      results,
    });
  } catch (err: any) {
    console.error("Sync error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * GET /api/auth/sync
 * Returns the current sync status — which platforms are connected and
 * whether the user has an MF registration.
 */
export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const user = getUserById(payload.userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const platformConfig = JSON.parse(user.platform_config || "{}");
    const mfConfig = platformConfig.mf;

    // Identify which platforms are connected (have at least one key)
    const keyedPlatforms = ["youtube", "google_drive", "higgsfield", "suno", "telegram", "magnific", "instagram", "kling"];
    const connected: string[] = [];
    for (const platform of keyedPlatforms) {
      const config = platformConfig[platform];
      if (config && typeof config === "object" && Object.keys(config).length > 0) {
        connected.push(platform);
      }
    }

    return NextResponse.json({
      ok: true,
      mfRegistered: !!(mfConfig?.user_id && mfConfig?.tenant_id),
      mfUserId: mfConfig?.user_id ?? null,
      mfTenantId: mfConfig?.tenant_id ?? null,
      connectedPlatforms: connected,
      platformCount: connected.length,
    });
  } catch (err: any) {
    console.error("Sync status error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
