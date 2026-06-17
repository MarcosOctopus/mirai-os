import { NextRequest } from "next/server";

const ARCA_URL = "https://arca.miraitohope.com";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");

  if (!q) {
    return Response.json({ error: "Missing query parameter 'q'" }, { status: 400 });
  }

  try {
    const res = await fetch(`${ARCA_URL}/context?q=${encodeURIComponent(q)}`);
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
  try {
    const { q, path } = await req.json();
    const queryPath = path || `/context?q=${encodeURIComponent(q || "")}`;
    
    const res = await fetch(`${ARCA_URL}${queryPath}`, {
      method: q ? "POST" : "GET",
      headers: { "Content-Type": "application/json" },
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
