import { NextRequest } from "next/server";
import { transcreverAudio } from "@/lib/stt-providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ─── POST /api/stt ─────────────────────────────────────────────────
// A cascata de providers (Groq -> Whisper -> Google -> Gemini) foi extraída para
// @/lib/stt-providers para ser REAPROVEITADA pelo chat (anexo de áudio). Esta
// rota só guarda a fronteira HTTP (tamanho, formato de resposta).
export async function POST(req: NextRequest) {
  try {
    const blob = await req.blob();
    if (!blob || blob.size < 100) {
      return Response.json({ error: "Audio too small" }, { status: 400 });
    }
    if (blob.size > 10 * 1024 * 1024) {
      return Response.json({ error: "Audio too large (max 10MB)" }, { status: 400 });
    }

    const r = await transcreverAudio(blob);
    if (r) return Response.json({ text: r.texto, provider: r.provedor });

    return Response.json({ error: "All STT providers failed" }, { status: 422 });
  } catch (err: any) {
    console.error("STT API error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
