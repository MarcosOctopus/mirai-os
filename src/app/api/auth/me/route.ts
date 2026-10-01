import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUserById } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    // ── Read token from cookie ────────────────────────────────────
    const token = req.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // ── Verify JWT ────────────────────────────────────────────────
    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    // ── Get user by id ────────────────────────────────────────────
    const user = getUserById(payload.userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 401 });
    }

    const { contaDaRequisicao } = await import("@/lib/orgs");
    const conta = await contaDaRequisicao(req);

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar_url: user.avatar_url,
        tenant_id: user.tenant_id,
        platform_config: JSON.parse(user.platform_config || "{}"),
        // quem e esta conta: dono da plataforma, ou cliente de UMA organizacao
        ehDono: conta?.ehDono ?? false,
        papel: conta?.ehDono ? "dono" : conta?.org ? "cliente" : "sem-organizacao",
        organizacao: conta?.org
          ? { id: conta.org.id, nome: conta.org.nome, slug: conta.org.slug }
          : null,
      },
    });
  } catch (err: any) {
    console.error("Me error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
