import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUserById } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MF_MCP_URL = process.env.MF_MCP_URL || "http://127.0.0.1:16346";

/**
 * GET /api/pipeline/status
 * Returns the pipeline system status: MCP server health, user tenant info.
 */
export async function GET(req: NextRequest) {
  try {
    // ── Auth ─────────────────────────────────────────────────
    const token = req.cookies.get("token")?.value;
    let mfRegistered = false;
    let mfUserId: number | null = null;
    let mfTenantId: number | null = null;
    let userEmail: string | null = null;

    if (token) {
      const payload = await verifyToken(token);
      if (payload) {
        const user = getUserById(payload.userId);
        userEmail = user?.email ?? null;
        if (user) {
          const platformConfig = JSON.parse(user.platform_config || "{}");
          const mfConfig = platformConfig.mf;
          if (mfConfig?.user_id && mfConfig?.tenant_id) {
            mfRegistered = true;
            mfUserId = Number(mfConfig.user_id);
            mfTenantId = Number(mfConfig.tenant_id);
          }
        }
      }
    }

    // ── MCP server health check ──────────────────────────────
    let mcpHealthy = false;
    let mcpStatus = "unknown";
    let mcpPingMs: number | null = null;

    try {
      const start = Date.now();
      const res = await fetch(`${MF_MCP_URL}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      mcpPingMs = Date.now() - start;
      mcpHealthy = res.ok;
      mcpStatus = res.ok ? "healthy" : `unhealthy (${res.status})`;
    } catch (err: any) {
      mcpStatus = `unreachable — ${err.message || "connection failed"}`;
      mcpHealthy = false;
    }

    return NextResponse.json({
      ok: true,
      server: {
        mcpUrl: MF_MCP_URL,
        healthy: mcpHealthy,
        status: mcpStatus,
        pingMs: mcpPingMs,
      },
      user: {
        authenticated: !!token,
        email: userEmail,
        mfRegistered,
        mfUserId,
        mfTenantId,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("Pipeline status error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
