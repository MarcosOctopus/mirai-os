import { createVideo, getVideos } from "@/lib/media-factory/db";
import { seedMediaFactory } from "@/lib/media-factory/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, context: RouteContext) {
  seedMediaFactory();
  const { id } = await context.params;
  return Response.json({ videos: getVideos(Number(id)) });
}

export async function POST(req: Request, context: RouteContext) {
  try {
    seedMediaFactory();
    const { id } = await context.params;
    const body = (await req.json()) as { title?: string };
    if (!body.title) return Response.json({ error: "title is required" }, { status: 400 });
    return Response.json({ video: createVideo(Number(id), body.title) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
