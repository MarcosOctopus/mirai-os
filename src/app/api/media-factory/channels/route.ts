import { createChannel, getChannels } from "@/lib/media-factory/db";
import { seedMediaFactory } from "@/lib/media-factory/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  seedMediaFactory();
  return Response.json({ channels: getChannels() });
}

export async function POST(req: Request) {
  try {
    seedMediaFactory();
    const body = (await req.json()) as { name?: string; slug?: string };
    if (!body.name || !body.slug) {
      return Response.json({ error: "name and slug are required" }, { status: 400 });
    }

    const channel = createChannel(body.name, body.slug);
    return Response.json({ channel }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
