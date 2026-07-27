import { NextRequest, NextResponse } from "next/server";
import { createUser, getUserByEmail, hashPassword, signToken, updateUserPlatformConfig } from "@/lib/auth";
import { ensureMfUser } from "@/lib/mf-bridge";

export async function POST(req: NextRequest) {
  try {
    const { name, email, password } = await req.json();

    // ── Validate inputs ──────────────────────────────────────────
    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Name, email, and password are required" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    if (typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }

    // ── Duplicate email check ─────────────────────────────────────
    const existing = getUserByEmail(email);
    if (existing) {
      return NextResponse.json(
        { error: "Email already in use" },
        { status: 400 }
      );
    }

    // ── Create user ───────────────────────────────────────────────
    const passwordHash = await hashPassword(password);
    const user = createUser(name, email, passwordHash);

    // ── Register in MF (user + tenant) ────────────────────────────
    try {
      const { mfUser, tenant } = await ensureMfUser(name, email);
      // Store MF IDs in platform_config (silent, non-blocking)
      updateUserPlatformConfig(user.id as number, {
        mf: { user_id: mfUser.id, tenant_id: tenant.id }
      });
    } catch (mfErr) {
      console.warn("MF sync failed (non-fatal):", mfErr);
    }

    // ── Sign JWT and set cookie ───────────────────────────────────
    const token = await signToken({
      userId: user.id as number,
      email: user.email,
      tenantId: user.tenantId,
    });

    const isProd = process.env.NODE_ENV === "production";

    const response = NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        tenantId: user.tenantId,
      },
    });

    response.cookies.set("token", token, {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (err: any) {
    console.error("Register error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
