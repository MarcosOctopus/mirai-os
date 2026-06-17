import { PipelineStageName, StageStatus } from "@/lib/media-factory/db";
import { reportStatus } from "@/lib/media-factory/integration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface WebhookBody {
  channelSlug?: string;
  stage?: PipelineStageName;
  videoTitle?: string;
  status?: StageStatus;
  message?: string;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as WebhookBody;
    if (!body.channelSlug || !body.stage || !body.videoTitle || !body.status) {
      return Response.json(
        { error: "channelSlug, stage, videoTitle and status are required" },
        { status: 400 },
      );
    }

    const result = reportStatus(
      body.channelSlug,
      body.stage,
      body.videoTitle,
      body.status,
      body.message ?? "Status recebido via webhook",
    );

    return Response.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
