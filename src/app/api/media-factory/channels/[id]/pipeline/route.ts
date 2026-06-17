import { getPipeline } from "@/lib/media-factory/db";
import { seedMediaFactory } from "@/lib/media-factory/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, context: RouteContext) {
  seedMediaFactory();
  const { id } = await context.params;
  return Response.json({ pipeline: getPipeline(Number(id)) });
}
