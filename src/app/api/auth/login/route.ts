import { NextRequest, NextResponse } from "next/server";
import { getUserByEmail, comparePassword, signToken } from "@/lib/auth";
import { vincularContaMirai } from "@/lib/vinculo-conta-mirai";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    // ── Find user ─────────────────────────────────────────────────
    const user = getUserByEmail(email);
    if (!user) {
      return NextResponse.json(
        { error: "Email ou senha inválidos" },
        { status: 401 }
      );
    }

    // ── Compare password ──────────────────────────────────────────
    const valid = await comparePassword(password, user.password_hash);
    if (!valid) {
      return NextResponse.json(
        { error: "Email ou senha inválidos" },
        { status: 401 }
      );
    }

    // ── Vínculo com a Conta Mirai (idempotente) ───────────────────
    // Já vinculado, isto é uma leitura local e volta na hora. Ainda não
    // vinculado, aproveita a senha que a pessoa acabou de digitar para
    // definir a credencial dela também na Conta Mirai.
    await vincularContaMirai({
      userId: user.id,
      email: user.email,
      nome: user.name,
      senha: password,
    });

    // ── Sign JWT and set cookie ───────────────────────────────────
    const token = await signToken({
      userId: user.id,
      email: user.email,
      tenantId: user.tenant_id,
    });

    const isProd = process.env.NODE_ENV === "production";

    const response = NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        tenantId: user.tenant_id,
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
    console.error("Login error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
