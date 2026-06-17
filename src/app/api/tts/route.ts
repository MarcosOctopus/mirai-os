import { NextRequest } from "next/server";
import { readFileSync, existsSync } from "fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getKey(): string {
  const credPath = "/opt/data/mirai-app/.credentials/elevenlabs.env";
  try {
    if (existsSync(credPath)) {
      const content = readFileSync(credPath, "utf8");
      for (const line of content.split("\n")) {
        if (line.startsWith("ELEVENLABS_API_KEY=")) {
          const key = line.split("=", 2)[1].trim();
          if (key && key.length > 10) return key;
        }
      }
    }
  } catch {}
  const fromEnv = process.env.ELEVENLABS_API_KEY;
  if (fromEnv && fromEnv.length > 10) return fromEnv;
  return "";
}

const VOICE_ID = "UPMmrmly8qbddSJ3ycdB"; // Voz da Mirai (ElevenLabs)

const MAX_CHUNK = 500;

function splitIntoChunks(text: string, maxLen: number): string[] {
  const chunks: string[] = [];
  const splitRx = /(?<=[.!?])\s+/g;
  const sentences = text.split(splitRx).filter(Boolean);
  let current = "";
  for (const s of sentences) {
    if ((current + " " + s).trim().length <= maxLen) {
      current = (current + " " + s).trim();
    } else {
      if (current) chunks.push(current);
      if (s.length > maxLen) {
        for (let i = 0; i < s.length; i += maxLen) chunks.push(s.slice(i, i + maxLen));
      } else {
        current = s;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function fetchTTSChunk(text: string, apiKey: string): Promise<ArrayBuffer> {
  const resp = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.3, similarity_boost: 0.8 },
      }),
      signal: AbortSignal.timeout(30000),
    }
  );
  if (!resp.ok) {
    const err = await resp.text();
    console.error("ElevenLabs error:", resp.status, err.substring(0, 200));
    throw new Error(`ElevenLabs error: ${resp.status}`);
  }
  return resp.arrayBuffer();
}

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    if (!text) {
      return Response.json({ error: "Text is required" }, { status: 400 });
    }
    const elevenKey = getKey();
    if (!elevenKey) {
      console.error("TTS: ElevenLabs API key not configured");
      return Response.json({ error: "TTS not configured" }, { status: 500 });
    }

    const chunks = splitIntoChunks(text, MAX_CHUNK);

    if (chunks.length === 1) {
      const audioBuffer = await fetchTTSChunk(chunks[0], elevenKey);
      return new Response(audioBuffer, {
        headers: { "Content-Type": "audio/mpeg", "Content-Length": audioBuffer.byteLength.toString() },
      });
    }

    // Multiple chunks in parallel, concatenate MP3s
    const buffers = await Promise.all(chunks.map((chunk) => fetchTTSChunk(chunk, elevenKey)));
    const totalLength = buffers.reduce((sum, b) => sum + b.byteLength, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const buf of buffers) {
      combined.set(new Uint8Array(buf), offset);
      offset += buf.byteLength;
    }

    return new Response(combined, {
      headers: { "Content-Type": "audio/mpeg", "Content-Length": combined.byteLength.toString() },
    });
  } catch (err: any) {
    console.error("TTS API error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
