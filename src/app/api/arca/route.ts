import { NextRequest } from "next/server";
import { arcaConfigurada, erroDeCredencial, headersDaArca } from "@/lib/arca-cliente";

const ARCA_URL = "https://arca.miraitohope.com";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");

  if (!q) {
    return Response.json({ error: "Missing query parameter 'q'" }, { status: 400 });
  }

  // A Arca tem rota de escrita e guard de IP que não distingue Core de VM
  // (medido 05/11/2026). Sem token, não chamamos — e dizemos o porquê.
  if (!arcaConfigurada()) {
    return Response.json({ error: erroDeCredencial() }, { status: 503 });
  }

  try {
    const res = await fetch(`${ARCA_URL}/context?q=${encodeURIComponent(q)}`, {
      headers: headersDaArca(),
    });
    if (!res.ok) {
      return Response.json({ error: `Arca error: ${res.status}` }, { status: 502 });
    }
    const data = await res.json();
    return Response.json(data);
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!arcaConfigurada()) {
    return Response.json({ error: erroDeCredencial() }, { status: 503 });
  }

  try {
    const { q, path } = await req.json();
    const queryPath = path || `/context?q=${encodeURIComponent(q || "")}`;

    const res = await fetch(`${ARCA_URL}${queryPath}`, {
      method: q ? "POST" : "GET",
      headers: headersDaArca({ "Content-Type": "application/json" }),
      body: q ? JSON.stringify({ query: q }) : undefined,
    });

    if (!res.ok) {
      return Response.json({ error: `Arca error: ${res.status}` }, { status: 502 });
    }
    const data = await res.json();
    return Response.json(data);
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
