import { PipelineStageName, updateVideoStage } from "@/lib/media-factory/db";
import { seedMediaFactory } from "@/lib/media-factory/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: Request, context: RouteContext) {
  try {
    seedMediaFactory();
    const { id } = await context.params;
    const body = (await req.json()) as { stage?: PipelineStageName };
    if (!body.stage) return Response.json({ error: "stage is required" }, { status: 400 });
    return Response.json({ video: updateVideoStage(Number(id), body.stage) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
