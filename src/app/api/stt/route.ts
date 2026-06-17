import { NextRequest } from "next/server";
import { existsSync, readFileSync } from "fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ─── Carregar chave de API do .env ──────────────────────────────
function loadEnv(name: string): string {
  try {
    const envFile = "/opt/data/.env";
    if (existsSync(envFile)) {
      const content = readFileSync(envFile, "utf8");
      for (const line of content.split("\n")) {
        const match1 = line.match(new RegExp(`export\\s+${name}=["']([^"']+)["']`));
        if (match1) return match1[1];
        const match2 = line.match(new RegExp(`${name}=["']([^"']+)["']`));
        if (match2) return match2[1];
        const match3 = line.match(new RegExp(`${name}=([^\\s#]+)`));
        if (match3) return match3[1];
      }
    }
  } catch {}
  return process.env[name] || "";
}

const GOOGLE_API_KEY = loadEnv("GOOGLE_API_KEY");
const GEMINI_STT_MODEL = "gemini-2.5-flash";
const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_STT_MODEL}:generateContent?key=` +
  GOOGLE_API_KEY;

export async function POST(req: NextRequest) {
  try {
    // Read raw audio blob
    const blob = await req.blob();
    if (!blob || blob.size < 100) {
      return Response.json({ error: "Audio too small" }, { status: 400 });
    }
    if (blob.size > 10 * 1024 * 1024) {
      return Response.json({ error: "Audio too large (max 10MB)" }, { status: 400 });
    }

    // Convert audio blob to base64
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Audio = buffer.toString("base64");

    const mimeType = blob.type || "audio/webm";

    // Call Gemini 2.5 Flash for faster transcription
    const geminiBody = {
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data: base64Audio } },
            {
              text: "Transcreva o audio em portugues brasileiro com maxima precisao. Apenas o texto transcrito, sem explicacoes, sem prefixos, sem pontuacao extra.",
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 512,
      },
    };

    const resp = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody),
      signal: typeof AbortSignal !== "undefined" && typeof (AbortSignal as any).timeout === "function" ? AbortSignal.timeout(25000) : undefined,
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error("Gemini STT error:", resp.status, err);
      return Response.json({ error: "STT processing failed" }, { status: 502 });
    }

    const result = await resp.json();

    // Extract transcription from Gemini response
    const transcription =
      result?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    return Response.json({ text: transcription.trim() });
  } catch (err: any) {
    console.error("STT API error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
