/**
 * "PEDIR NOVO LINK" — a única escrita que alguém SEM CONTA pode provocar.
 *
 * POR QUE EXISTE (11/11/2026): a tela de link morto dizia "peça um novo link a
 * quem compartilhou" e não havia como pedir. Quem recebeu um convite que morreu
 * ficava sem saída (o dono nem sabia que alguém tinha tentado).
 *
 * DESENHO: o navegador manda o TOKEN QUE ELE TEM (o que morreu) e nada mais. Quem
 * fala com a Arca é o SERVIDOR, com o token do Core — nenhuma credencial sai
 * daqui. A Arca é quem identifica espaço e convidado pelo token morto (a entrada
 * revogada continua no registro) e quem aplica o anti-spam (1 pedido por token a
 * cada 10 min). O dono vê o pedido no painel de compartilhar e reenvia.
 */
import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";

export const dynamic = "force-dynamic";

const API_ARCA = process.env.ARCA_API || "http://127.0.0.1:8080";
const ARQUIVO_TOKEN = "/opt/data/arca/api/.arca-token";

export async function POST(req: NextRequest) {
  const corpo = (await req.json().catch(() => ({}))) as {
    token?: string;
    pasta?: string;
    email?: string;
  };
  const token = String(corpo.token || "").slice(0, 200).trim();
  if (!token) return NextResponse.json({ error: "informe o token do convite" }, { status: 400 });

  try {
    const doCore = (await readFile(ARQUIVO_TOKEN, "utf8")).trim();
    const r = await fetch(`${API_ARCA}/org/pedido`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Arca-Token": doCore },
      body: JSON.stringify({
        token,
        pasta: String(corpo.pasta || "").slice(0, 300),
        email: String(corpo.email || "").slice(0, 200),
      }),
      cache: "no-store",
    });
    const dados = (await r.json().catch(() => ({}))) as { detail?: string; pedido?: unknown };
    if (!r.ok) {
      return NextResponse.json(
        { error: dados.detail || "não consegui avisar agora" },
        { status: r.status },
      );
    }
    return NextResponse.json({ ok: true, pedido: dados.pedido ?? null });
  } catch {
    return NextResponse.json({ error: "não consegui avisar agora" }, { status: 502 });
  }
}
