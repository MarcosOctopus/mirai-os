/**
 * Cliente do MCP do produto SAASO (CRM) — regra "MCP por produto".
 *
 * A Mirai NUNCA abre o banco do Saaso: ela fala com o MCP dele
 * (https://saaso.miraitohope.com/api/mcp, streamable HTTP / JSON-RPC 2.0).
 * O token `dsk_...` vive em SAASO_MCP_TOKEN (.env.local 600, fora do git) —
 * nunca em codigo, nunca no chat.
 *
 * Quem responde por qual organizacao e o TOKEN, nunca o corpo da requisicao:
 * nenhuma ferramenta do CRM aceita `organization_id` como argumento.
 */

export const SAASO_MCP_URL =
  process.env.SAASO_MCP_URL || "https://saaso.miraitohope.com/api/mcp";

type RpcError = { code?: number; message?: string };

export type SaasoRpcResponse = {
  result?: unknown;
  error?: RpcError;
  httpStatus?: number;
};

export type SaasoStatus = {
  configurado: boolean;
  conectado: boolean;
  ferramentas: number;
  endpoint: string;
  erro?: string;
};

export function saasoConfigurado(token?: string | null): boolean {
  return Boolean(token && token.trim().startsWith("dsk_"));
}

function extrairErro(texto: string): string {
  try {
    const j = JSON.parse(texto) as { error?: RpcError };
    if (j?.error?.message) return j.error.message;
  } catch {
    /* resposta nao-JSON */
  }
  return "";
}

function parsearResposta(texto: string): SaasoRpcResponse {
  const t = texto.trim();
  if (!t) return { error: { message: "resposta vazia" } };
  if (t.startsWith("{") || t.startsWith("[")) {
    try {
      return JSON.parse(t) as SaasoRpcResponse;
    } catch {
      /* cai para o parser de SSE */
    }
  }
  for (const linha of t.split("\n")) {
    const l = linha.trim();
    if (l.startsWith("data:")) {
      try {
        return JSON.parse(l.slice(5).trim()) as SaasoRpcResponse;
      } catch {
        /* proxima linha */
      }
    }
  }
  return { error: { message: "resposta ilegivel" } };
}

async function rpc(
  token: string,
  method: string,
  params: Record<string, unknown> = {},
  timeoutMs = 8000,
): Promise<SaasoRpcResponse> {
  if (!saasoConfigurado(token)) {
    return { error: { message: "organizacao sem credencial de CRM" }, httpStatus: 0 };
  }
  try {
    const res = await fetch(SAASO_MCP_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method,
        params,
      }),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    const texto = await res.text();
    if (!res.ok) {
      const msg = extrairErro(texto) || `HTTP ${res.status}`;
      return { error: { message: msg }, httpStatus: res.status };
    }
    return parsearResposta(texto);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "falha de rede";
    return { error: { message: msg }, httpStatus: 0 };
  }
}

function textoDoResultado(r: SaasoRpcResponse): string {
  const res = r.result as { content?: { text?: string }[] } | undefined;
  const conteudo = res?.content;
  if (Array.isArray(conteudo) && conteudo.length > 0) {
    const primeiro = conteudo[0];
    if (primeiro && typeof primeiro.text === "string") return primeiro.text;
  }
  if (r.result === undefined) return r.error?.message || "";
  try {
    return JSON.stringify(r.result);
  } catch {
    return "";
  }
}

/** Lista as ferramentas que o MCP do Saaso expoe (tool discovery). */
export async function saasoFerramentas(token: string, timeoutMs = 8000): Promise<string[]> {
  const r = await rpc(token, "tools/list", {}, timeoutMs);
  const res = r.result as { tools?: { name?: string }[] } | undefined;
  return (res?.tools || [])
    .map((t) => t.name || "")
    .filter((n) => n.length > 0);
}

/** Chama uma ferramenta do CRM e devolve o texto da resposta. */
export async function saasoChamar(
  token: string,
  nome: string,
  args: Record<string, unknown> = {},
  timeoutMs = 8000,
): Promise<string> {
  const r = await rpc(token, "tools/call", { name: nome, arguments: args }, timeoutMs);
  if (r.error) return `erro: ${r.error.message || "?"}`;
  return textoDoResultado(r);
}

export async function saasoStatus(token: string): Promise<SaasoStatus> {
  if (!saasoConfigurado(token)) {
    return {
      configurado: false,
      conectado: false,
      ferramentas: 0,
      endpoint: SAASO_MCP_URL,
      erro: "organizacao sem credencial de CRM vinculada",
    };
  }
  const r = await rpc(token, "tools/list", {}, 8000);
  if (r.error) {
    return {
      configurado: true,
      conectado: false,
      ferramentas: 0,
      endpoint: SAASO_MCP_URL,
      erro: r.error.message || "sem resposta do MCP",
    };
  }
  const res = r.result as { tools?: unknown[] } | undefined;
  return {
    configurado: true,
    conectado: true,
    ferramentas: (res?.tools || []).length,
    endpoint: SAASO_MCP_URL,
  };
}

function encurtar(texto: string, limite: number): string {
  const t = texto.replace(/\s+/g, " ").trim();
  return t.length > limite ? `${t.slice(0, limite)}...` : t;
}

/**
 * Resumo do CRM do dono — vira contexto do chat.
 *
 * Quatro leituras em paralelo. Se o CRM estiver vazio, o resumo diz isso
 * (dado real: zero) em vez de inventar numero.
 */
export async function saasoContexto(token: string): Promise<string> {
  if (!saasoConfigurado(token)) return "";

  const [funil, fila, leads, conversas, ferramentas] = await Promise.all([
    saasoChamar(token, "crm_list_pipelines"),
    saasoChamar(token, "crm_get_queue_status"),
    saasoChamar(token, "crm_list_leads"),
    saasoChamar(token, "crm_list_conversations"),
    saasoFerramentas(token),
  ]);

  const linhas: string[] = [];
  linhas.push("## Dados do CRM (Saaso) — leitura ao vivo pelo MCP do produto");
  linhas.push(`Funil: ${encurtar(funil, 500)}`);
  linhas.push(`Fila de atendimento: ${encurtar(fila, 200)}`);
  linhas.push(`Leads: ${encurtar(leads, 400)}`);
  linhas.push(`Conversas: ${encurtar(conversas, 400)}`);
  if (ferramentas.length > 0) {
    const amostra = ferramentas
      .filter((n) => n.startsWith("crm_"))
      .slice(0, 14)
      .join(", ");
    linhas.push(
      `O MCP do CRM expoe ${ferramentas.length} ferramentas (ex.: ${amostra}).`,
    );
  }
  linhas.push(
    "Regra: use SOMENTE estes dados. Se o que a pessoa pediu nao estiver aqui, diga que consulta o CRM na proxima mensagem — nunca invente numero, nome ou data.",
  );
  return linhas.join("\n");
}
