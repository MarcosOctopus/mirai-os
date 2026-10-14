/**
 * Cliente do MCP do produto SAASO (CRM) — regra "MCP por produto".
 *
 * A Mirai NUNCA abre o banco do Saaso: ela fala com o MCP dele
 * (https://saaso.miraitohope.com/api/mcp, streamable HTTP / JSON-RPC 2.0).
 * O token `crm_...` vive em SAASO_MCP_TOKEN (.env.local 600, fora do git) —
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
  /** HTTP da resposta do MCP (0 quando nem houve resposta). Serve para separar
   *  "credencial recusada" de "CRM não respondeu" — nunca é mostrado à pessoa. */
  httpStatus?: number;
};

export function saasoConfigurado(token?: string | null): boolean {
  // O CRM cunha `crm_`; os tokens emitidos ANTES da troca sao `dsk_` e
  // continuam valendo (o CRM tambem aceita os dois). Exigir so o novo
  // recusaria toda credencial que o cliente ja tinha.
  const t = (token || "").trim();
  return t.startsWith("crm_") || t.startsWith("dsk_");
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

/**
 * Ferramentas COMPLETAS — nome + descrição + esquema de entrada.
 *
 * `saasoFerramentas` devolve só os nomes (serve para contagem/status). Para o
 * modelo CHAMAR uma ferramenta ele precisa do `inputSchema`: sem o esquema, o
 * modelo chuta os argumentos. O esquema vem do MCP (`tools/list`), nunca é
 * escrito à mão aqui — se o CRM mudar a ferramenta, isto acompanha.
 */
export type FerramentaMcp = {
  nome: string;
  descricao: string;
  esquema: Record<string, unknown>;
};

export async function saasoFerramentasCompletas(
  token: string,
  timeoutMs = 8000,
): Promise<FerramentaMcp[]> {
  const r = await rpc(token, "tools/list", {}, timeoutMs);
  const res = r.result as
    | { tools?: { name?: string; description?: string; inputSchema?: Record<string, unknown> }[] }
    | undefined;
  return (res?.tools || [])
    .filter((t) => (t.name || "").length > 0)
    .map((t) => ({
      nome: t.name as string,
      descricao: t.description || "",
      esquema:
        t.inputSchema && typeof t.inputSchema === "object"
          ? (t.inputSchema as Record<string, unknown>)
          : { type: "object", properties: {} },
    }));
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
      httpStatus: 0,
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
      httpStatus: r.httpStatus,
    };
  }
  const res = r.result as { tools?: unknown[] } | undefined;
  return {
    configurado: true,
    conectado: true,
    ferramentas: (res?.tools || []).length,
    endpoint: SAASO_MCP_URL,
    httpStatus: r.httpStatus,
  };
}

/**
 * VALIDA uma credencial de CRM AO VIVO, antes de qualquer gravação.
 *
 * É a mesma leitura do `saasoStatus` (tools/list pelo MCP), só que com o
 * MOTIVO separado — porque "token errado" e "CRM fora do ar" pedem respostas
 * diferentes para a pessoa (e a segunda não pode ser confundida com a
 * primeira: uma acusa a credencial, a outra acusa o CRM).
 *
 *   ok           -> o CRM respondeu e devolveu ferramentas; pode salvar;
 *   formato      -> nem começou com `crm_` (nem com o legado `dsk_`): recusa sem chamar o CRM;
 *   recusada     -> o CRM respondeu recusando (HTTP 4xx): credencial inválida;
 *   sem-resposta -> o CRM não respondeu (rede, timeout ou 5xx): tentar de novo.
 */
export type SaasoValidacao = {
  valida: boolean;
  motivo: "ok" | "formato" | "recusada" | "sem-resposta";
  erro: string;
  ferramentas: number;
};

export async function saasoValidarCredencial(token: string): Promise<SaasoValidacao> {
  const s = await saasoStatus((token || "").trim());
  if (!s.configurado) {
    return {
      valida: false,
      motivo: "formato",
      erro: "A credencial do CRM precisa começar com crm_.",
      ferramentas: 0,
    };
  }
  if (s.conectado) {
    return { valida: true, motivo: "ok", erro: "", ferramentas: s.ferramentas };
  }
  const st = s.httpStatus ?? 0;
  // 0/undefined = nem houve resposta; 5xx = o CRM respondeu torto. Os dois são
  // "o CRM não respondeu agora" — nunca "sua credencial está errada".
  if (st === 0 || st >= 500) {
    return {
      valida: false,
      motivo: "sem-resposta",
      erro: "O CRM não respondeu agora. Tente de novo em instantes — nada foi salvo.",
      ferramentas: 0,
    };
  }
  return {
    valida: false,
    motivo: "recusada",
    erro: "O CRM recusou esta credencial. Confira o token (crm_…) e tente de novo.",
    ferramentas: 0,
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
export async function saasoContexto(token: string, timeoutMs = 8000): Promise<string> {
  if (!saasoConfigurado(token)) return "";

  // A lista de ferramentas do CRM NÃO entra no contexto: este chat é
  // superfície de cliente e não deve citar nomes de métodos nem de integração.
  const [funil, fila, leads, conversas] = await Promise.all([
    saasoChamar(token, "crm_list_pipelines", {}, timeoutMs),
    saasoChamar(token, "crm_get_queue_status", {}, timeoutMs),
    saasoChamar(token, "crm_list_leads", {}, timeoutMs),
    saasoChamar(token, "crm_list_conversations", {}, timeoutMs),
  ]);

  const linhas: string[] = [];
  linhas.push("## Dados do CRM (Saaso) — leitura ao vivo da sua conta");
  linhas.push(`Funil: ${encurtar(funil, 500)}`);
  linhas.push(`Fila de atendimento: ${encurtar(fila, 200)}`);
  linhas.push(`Leads: ${encurtar(leads, 400)}`);
  linhas.push(`Conversas: ${encurtar(conversas, 400)}`);
  linhas.push(
    "Regra: use SOMENTE estes dados. Se o que a pessoa pediu nao estiver aqui, diga que consulta o CRM na proxima mensagem — nunca invente numero, nome ou data.",
  );
  return linhas.join("\n");
}
