import { NextRequest } from "next/server";
import { existsSync, readFileSync } from "fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function loadEnv(name: string): string {
  try {
    const envFile = "/opt/data/.env";
    if (existsSync(envFile)) {
      const content = readFileSync(envFile, "utf8");
      for (const line of content.split("\n")) {
        const m1 = line.match(new RegExp(`export\\s+${name}=["']([^"']+)["']`));
        if (m1) return m1[1];
        const m2 = line.match(new RegExp(`${name}=["']([^"']+)["']`));
        if (m2) return m2[1];
        const m3 = line.match(new RegExp(`${name}=([^\\s#]+)`));
        if (m3) return m3[1];
      }
    }
  } catch {}
  return process.env[name] || "";
}

const GOOGLE_API_KEY = loadEnv("GOOGLE_API_KEY");

// ─── Google Cloud Speech-to-Text (MUITO mais preciso que Gemini) ──
const STT_URL = "https://speech.googleapis.com/v1/speech:recognize";

export async function POST(req: NextRequest) {
  try {
    const blob = await req.blob();
    if (!blob || blob.size < 100) {
      return Response.json({ error: "Audio too small" }, { status: 400 });
    }
    if (blob.size > 10 * 1024 * 1024) {
      return Response.json({ error: "Audio too large (max 10MB)" }, { status: 400 });
    }

    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Audio = buffer.toString("base64");
    const mimeType = blob.type || "audio/webm";

    const encodingMap: Record<string, string> = {
      "audio/webm": "WEBM_OPUS",
      "audio/webm;codecs=opus": "WEBM_OPUS",
      "audio/ogg": "OGG_OPUS",
      "audio/ogg;codecs=opus": "OGG_OPUS",
      "audio/wav": "LINEAR16",
      "audio/mp4": "MP3",
      "audio/mpeg": "MP3",
    };
    const encoding = encodingMap[mimeType] || "WEBM_OPUS";

    const body = {
      config: {
        languageCode: "pt-BR",
        encoding,
        sampleRateHertz: 48000,
        enableAutomaticPunctuation: true,
        model: "latest_short",
        useEnhanced: true,
      },
      audio: { content: base64Audio },
    };

    const resp = await fetch(`${STT_URL}?key=${GOOGLE_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: typeof AbortSignal !== "undefined" && typeof (AbortSignal as any).timeout === "function"
        ? AbortSignal.timeout(15000)
        : undefined,
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error("Google STT error:", resp.status, err);
      return await fallbackGemini(base64Audio, mimeType);
    }

    const result = await resp.json();
    const transcription = result?.results?.[0]?.alternatives?.[0]?.transcript ?? "";

    if (!transcription.trim()) {
      return await fallbackGemini(base64Audio, mimeType);
    }

    return Response.json({ text: transcription.trim() });
  } catch (err: any) {
    console.error("STT API error:", err);
    try {
      return await fallbackGeminiFromReq(req);
    } catch {
      return Response.json({ error: err.message }, { status: 500 });
    }
  }
}

// ─── Fallback: Gemini multimodal ─────────────────────────────────
async function fallbackGemini(base64Audio: string, mimeType: string): Promise<Response> {
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_API_KEY}`;
  const resp = await fetch(geminiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        role: "user",
        parts: [
          { inlineData: { mimeType, data: base64Audio } },
          { text: "Transcreva o audio em portugues brasileiro com maxima precisao. Apenas o texto transcrito, sem explicacoes, sem prefixos, sem pontuacao extra." },
        ],
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) return Response.json({ error: "STT failed" }, { status: 502 });
  const result = await resp.json();
  const text = result?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return Response.json({ text: text.trim() });
}

async function fallbackGeminiFromReq(req: NextRequest): Promise<Response> {
  const blob = await req.blob();
  const buf = Buffer.from(await blob.arrayBuffer());
  return await fallbackGemini(buf.toString("base64"), blob.type || "audio/webm");
}
