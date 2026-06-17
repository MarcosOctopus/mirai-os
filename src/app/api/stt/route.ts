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

const OPENAI_API_KEY = loadEnv("OPENAI_API_KEY");
const GOOGLE_API_KEY = loadEnv("GOOGLE_API_KEY");

function isStuckInstruction(text: string): boolean {
  const lower = text.toLowerCase();
  if (lower.includes("transcreva o audio em portugues brasileiro")) return true;
  if (["the user wants", "the audio is", "i need to", "therefore", "the transcription should be", "here is the transcription"].some(s => lower.includes(s))) return true;
  return false;
}

async function tryWhisper(audioBlob: Blob): Promise<string | null> {
  if (!OPENAI_API_KEY) return null;
  try {
    const ext = (audioBlob.type?.split("/")[1]) || "webm";
    const form = new FormData();
    form.append("file", audioBlob, `audio.${ext}`);
    form.append("model", "whisper-1");
    form.append("language", "pt");
    form.append("response_format", "json");

    const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: form,
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const text = (data.text || "").trim();
    return text && !isStuckInstruction(text) ? text : null;
  } catch {
    return null;
  }
}

async function tryGoogleSTT(audioBlob: Blob): Promise<string | null> {
  if (!GOOGLE_API_KEY) return null;
  try {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    const resp = await fetch(
      `https://speech.googleapis.com/v1/speech:recognize?key=${GOOGLE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: { encoding: "WEBM_OPUS", languageCode: "pt-BR", model: "latest_short", enableAutomaticPunctuation: true, useEnhanced: true },
          audio: { content: base64 },
        }),
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    const results = data?.results || [];
    if (!results.length) return null;
    const text = results.map((r: any) => r?.alternatives?.[0]?.transcript || "").filter(Boolean).join(" ").trim();
    return text || null;
  } catch {
    return null;
  }
}

async function tryGemini(audioBlob: Blob): Promise<string | null> {
  if (!GOOGLE_API_KEY) return null;
  try {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { inlineData: { mimeType: audioBlob.type || "audio/webm", data: base64 } },
              { text: "Transcreva o audio em portugues brasileiro com maxima precisao. Apenas o texto transcrito, sem explicacoes, sem prefixos, sem pontuacao extra." },
            ],
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
        }),
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!resp.ok) return null;
    const result = await resp.json();
    const text = (result?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
    return text && !isStuckInstruction(text) ? text : null;
  } catch {
    return null;
  }
}

// ─── POST /api/stt ─────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const blob = await req.blob();
    if (!blob || blob.size < 100) {
      return Response.json({ error: "Audio too small" }, { status: 400 });
    }
    if (blob.size > 10 * 1024 * 1024) {
      return Response.json({ error: "Audio too large (max 10MB)" }, { status: 400 });
    }

    // ─── WHISPER + GOOGLE EM PARALELO (8s cada) ─────────────────
    const winner = await Promise.race([
      tryWhisper(blob).then(text => ({ source: "whisper" as const, text })),
      tryGoogleSTT(blob).then(text => ({ source: "google" as const, text })),
    ]);

    if (winner.text) {
      return Response.json({ text: winner.text });
    }

    // ─── FALLBACK: Gemini (10s) ──────────────────────────────────
    const geminiText = await tryGemini(blob);
    if (geminiText) {
      return Response.json({ text: geminiText });
    }

    return Response.json({ error: "All STT providers failed" }, { status: 422 });
  } catch (err: any) {
    console.error("STT API error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
