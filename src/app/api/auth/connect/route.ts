import { NextRequest, NextResponse } from "next/server";
import { getUserById, updateUserPlatformConfig, verifyToken } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    // Verify auth
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
    }

    const user = getUserById(payload.userId);
    if (!user) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }

    // Parse body
    const body = await request.json();
    const { platform, config } = body;

    if (!platform || !config) {
      return NextResponse.json({ error: "platform e config são obrigatórios" }, { status: 400 });
    }

    // Único lugar de guardar credencial (platform_config). A lista acompanha o
    // catálogo declarativo (src/lib/integracoes/catalogo.ts): integração de API
    // nova entra aqui, nunca numa rota paralela.
    const allowedPlatforms = [
      "google_drive",
      "youtube",
      "telegram",
      "instagram",
      "higgsfield",
      "suno",
      "magnific",
      "kling",
      "verboo",
      "openai",
      "google",
      "openrouter",
      "groq",
      "elevenlabs",
      "picovoice",
    ];
    if (!allowedPlatforms.includes(platform)) {
      return NextResponse.json({ error: `Plataforma não suportada: ${platform}` }, { status: 400 });
    }

    // Update platform config
    const updatedConfig = updateUserPlatformConfig(payload.userId, {
      [platform]: {
        ...config,
        connected_at: new Date().toISOString(),
      }
    });

    return NextResponse.json({
      ok: true,
      platform,
      connected: !!updatedConfig[platform],
    });
  } catch (err: any) {
    console.error("Connect error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// GET — retorna status das conexões do usuário
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
    }

    const user = getUserById(payload.userId);
    if (!user) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }

    return NextResponse.json({
      platformConfig: JSON.parse(user.platform_config || "{}"),
    });
  } catch (err: any) {
    console.error("Connect GET error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
