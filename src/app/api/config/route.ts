export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Retrato real da plataforma.
 *
 * Antes esta rota respondia `"model": "claude-opus-4-8"` / `"provider": "myapi"`
 * — retrato FALSO (medido em 01/10/2026): o chat do app roda Verboo V4.1
 * (`deepseek-v4.1-flash`) com reserva V4.0 -> Gemini -> Claude. Retrato que
 * mente é pior que retrato nenhum: aqui fica o que está de pé de verdade.
 */
const CADEIA = [
  { ordem: 1, modelo: "deepseek-v4.1-flash", provider: "verboo" },
  { ordem: 2, modelo: "deepseek-v4-flash", provider: "verboo", papel: "reserva imediata" },
  { ordem: 3, modelo: "gemini-2.5-flash", provider: "google" },
  { ordem: 4, modelo: "anthropic/claude-sonnet-4-6", provider: "openrouter" },
];

export async function GET() {
  return Response.json({
    mirai: "2.0.0",
    status: "online",
    // compatível com quem já lia `model` / `provider`
    model: CADEIA[0].modelo,
    provider: CADEIA[0].provider,
    modelo: { principal: CADEIA[0].modelo, provider: CADEIA[0].provider, cadeia: CADEIA },
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
