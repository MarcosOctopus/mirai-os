import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUserById } from "@/lib/auth";
import { triggerPipeline, runGlobalPipeline } from "@/lib/mf-bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/pipeline/trigger
 * Triggers a Media Factory pipeline run for the authenticated user's channel.
 *
 * Body:
 *   channel        (string, required) – e.g. "youtube", "tiktok"
 *   date           (string, optional) – YYYY-MM-DD date override
 *   skipUpload     (boolean, optional)
 *   skipApproval   (boolean, optional)
 */
export async function POST(req: NextRequest) {
  try {
    // ── Parse body ───────────────────────────────────────────
    const body = await req.json();
    const { channel, date, skipUpload, skipApproval } = body || {};

    if (!channel || typeof channel !== "string") {
      return NextResponse.json(
        { error: "Missing required field: channel" },
        { status: 400 }
      );
    }

    // ── Auth ─────────────────────────────────────────────────
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

    const options = { date, skipUpload, skipApproval };

    // ── Decide pipeline mode ─────────────────────────────────
    let result: any;

    if (mfConfig?.user_id && mfConfig?.tenant_id) {
      // Tenant context available → call tenant-scoped pipeline
      result = await triggerPipeline(
        channel,
        Number(mfConfig.user_id),
        Number(mfConfig.tenant_id),
        options
      );
    } else {
      // No tenant context → run global pipeline (legacy user)
      result = await runGlobalPipeline(channel, options);
    }

    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (err: any) {
    console.error("Pipeline trigger error:", err);
    return NextResponse.json(
      { error: err.message || "Pipeline trigger failed" },
      { status: 500 }
    );
  }
}
