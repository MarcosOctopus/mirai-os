export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    mirai: "2.0.0",
    status: "online",
    model: "claude-opus-4-8",
    provider: "myapi",
    arca: "https://arca.miraitohope.com",
    hermes: "/opt/data/.hermes",
    uptime: process.uptime(),
    components: {
      chat: { type: "streaming", protocol: "sse" },
      voice: { stt: "browser-speech-api", tts: "browser-speech-synthesis" },
      memory: { source: "arca", url: "https://arca.miraitohope.com" },
    },
  });
}
