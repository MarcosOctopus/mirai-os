/**
 * BUSCA NA WEB — a capacidade de "olhar fora" do chat.
 *
 * Por que existe (Marcos, 14/10/2026): o chat dizia "não consigo acessar dados em
 * tempo real" e não olhava nada. Ele foi direto: *"vc diz que não consegue sair e
 * ver por exemplo quantos graus está. Vc tem esse poder e pode fazer olhar fora,
 * benchmark de sites, olhar outras coisas. vc sempre é bem completo e poderoso
 * comigo, quero a mesma coisa com clientes."*
 *
 * SEM CHAVE — de propósito. O ecossistema não tinha (e não tem) chave de busca:
 * a varredura dos `.env` deu zero. Em vez de esperar uma chave, usa a MESMA porta
 * sem chave que o agente do ecossistema já usa: os endpoints MCP públicos de
 * free-tier (Parallel e Exa). Medido daqui: os dois respondem resultado real.
 *
 * CASCATA (política de API do ecossistema: principal → secundária → emergencial):
 *   1. Parallel  (search.parallel.ai)  — resultado em JSON
 *   2. Exa       (mcp.exa.ai)          — resultado em SSE
 * Se um falhar, o outro assume. Se os dois falharem, devolve erro EXPLÍCITO —
 * nunca silêncio, nunca invenção.
 *
 * O que NÃO é: não é conector de produto (não passa por credencial de conta) e
 * não é recurso de plano. É capacidade de BASE do chat — a mesma para todo mundo.
 */

export type HitBusca = { titulo: string; url: string; trecho: string };

export type ResultadoBusca = {
  ok: boolean;
  provedor: string;
  resultados: HitBusca[];
  erro?: string;
};

const PARALLEL_MCP_URL = "https://search.parallel.ai/mcp";
const EXA_MCP_URL = "https://mcp.exa.ai/mcp";
const TIMEOUT_MS = 40_000;
/** Teto do que a página lida devolve ao modelo — prompt não é despejo. */
const TETO_PAGINA = 6_000;

function sessaoAleatoria(): string {
  // Correlação de rate-limit do free-tier: aleatório por processo, nada de pessoa.
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

/**
 * Uma chamada JSON-RPC `tools/call` no MCP. Devolve o TEXTO do primeiro item de
 * conteúdo. Erro de transporte/JSON-RPC/tool vira exceção (quem chama decide).
 */
async function chamarMcp(
  url: string,
  ferramenta: string,
  argumentos: Record<string, unknown>,
): Promise<string> {
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "User-Agent": "hermes-agent",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: ferramenta, arguments: argumentos },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const bruto = await r.text();

  // O corpo pode ser JSON puro (Parallel) ou SSE com linhas `data: {...}` (Exa).
  const envelopes: any[] = [];
  const tentar = (s: string) => {
    const t = s.trim();
    if (!t.startsWith("{")) return;
    try {
      envelopes.push(JSON.parse(t));
    } catch {
      /* envelope que não é JSON não é resposta de tool */
    }
  };
  tentar(bruto);
  for (const linha of bruto.split(/\r\n|\r|\n/)) {
    if (linha.startsWith("data:")) tentar(linha.slice(5));
  }

  for (const env of envelopes) {
    if (env?.error) throw new Error(String(env.error.message || env.error));
    const res = env?.result || {};
    const textos = (res.content || [])
      .filter((c: any) => c && typeof c === "object")
      .map((c: any) => String(c.text || ""));
    if (res.isError) throw new Error(textos.filter(Boolean).join(" ") || "a busca falhou");
    const primeiro = textos.find((t: string) => t);
    if (primeiro) return primeiro;
  }
  throw new Error("resposta sem conteúdo");
}

/** Parallel: o texto é um JSON com `results[].{url,title,excerpts[]}`. */
async function buscarParallel(consulta: string, limite: number): Promise<HitBusca[]> {
  const texto = await chamarMcp(PARALLEL_MCP_URL, "web_search", {
    objective: consulta,
    search_queries: [consulta],
    session_id: sessaoAleatoria(),
  });
  const d = JSON.parse(texto);
  const linhas = (d.results || []) as any[];
  return linhas.slice(0, limite).map((r) => ({
    titulo: String(r.title || "").trim(),
    url: String(r.url || "").trim(),
    trecho: (Array.isArray(r.excerpts) ? r.excerpts.join(" ") : String(r.excerpts || ""))
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500),
  }));
}

/** Exa: o texto vem em blocos "Title: / URL: / Highlights:". */
async function buscarExa(consulta: string, limite: number): Promise<HitBusca[]> {
  const texto = await chamarMcp(EXA_MCP_URL, "web_search_exa", {
    query: consulta,
    numResults: limite,
  });
  const hits: HitBusca[] = [];
  // Um bloco por resultado; o separador é a linha "Title:".
  const blocos = texto.split(/(?=^Title:)/m).filter((b) => b.trim());
  for (const b of blocos) {
    const titulo = (b.match(/^Title:\s*(.*)$/m) || [])[1] || "";
    const url = (b.match(/^URL:\s*(\S+)/m) || [])[1] || "";
    const hl = b.split(/^Highlights:\s*$/m)[1] || "";
    const trecho = hl
      .replace(/^\s*[-*]\s*/gm, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500);
    if (titulo || url) hits.push({ titulo: titulo.trim(), url: url.trim(), trecho });
    if (hits.length >= limite) break;
  }
  return hits;
}

/** A busca, com a cascata. Nunca lança: devolve `ok: false` com o motivo. */
export async function buscarNaWeb(consulta: string, limite = 5): Promise<ResultadoBusca> {
  const q = String(consulta || "").trim();
  if (!q) return { ok: false, provedor: "", resultados: [], erro: "consulta vazia" };

  const tentativas: { nome: string; fn: () => Promise<HitBusca[]> }[] = [
    { nome: "parallel", fn: () => buscarParallel(q, limite) },
    { nome: "exa", fn: () => buscarExa(q, limite) },
  ];
  const falhas: string[] = [];
  for (const t of tentativas) {
    try {
      const r = await t.fn();
      if (r.length) return { ok: true, provedor: t.nome, resultados: r };
      falhas.push(`${t.nome}: sem resultados`);
    } catch (e) {
      falhas.push(`${t.nome}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { ok: false, provedor: "", resultados: [], erro: falhas.join(" · ") };
}

/** O que o MODELO lê: resultado de busca em texto limpo. */
export function buscaEmTexto(r: ResultadoBusca): string {
  if (!r.ok) return `A busca não respondeu agora (${r.erro}). Diga isso à pessoa com franqueza.`;
  return r.resultados
    .map((h, i) => `${i + 1}. ${h.titulo}\n   ${h.url}\n   ${h.trecho}`)
    .join("\n");
}

/** Só http(s) — nada de file://, data: ou caminho local. */
function urlPublica(u: string): boolean {
  try {
    const x = new URL(u);
    return x.protocol === "http:" || x.protocol === "https:";
  } catch {
    return false;
  }
}

/** Tira tags/scripts e devolve texto legível, com teto. */
function htmlParaTexto(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim()
    .slice(0, TETO_PAGINA);
}

/**
 * LÊ UMA PÁGINA — o que sustenta "benchmark de sites" e "olhar outras coisas":
 * buscar dá o resumo, ler dá o conteúdo. Mesma doutrina: erro explícito.
 */
export async function lerPagina(url: string): Promise<{ ok: boolean; titulo: string; texto: string; erro?: string }> {
  if (!urlPublica(url)) return { ok: false, titulo: "", texto: "", erro: "endereço inválido" };
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(25_000),
      redirect: "follow",
    });
    if (!r.ok) return { ok: false, titulo: "", texto: "", erro: `a página respondeu ${r.status}` };
    const tipo = r.headers.get("content-type") || "";
    const bruto = await r.text();
    if (tipo.includes("json")) {
      return { ok: true, titulo: url, texto: bruto.slice(0, TETO_PAGINA) };
    }
    const titulo = (bruto.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "";
    return { ok: true, titulo: titulo.trim(), texto: htmlParaTexto(bruto) };
  } catch (e) {
    return {
      ok: false,
      titulo: "",
      texto: "",
      erro: e instanceof Error ? e.message : String(e),
    };
  }
}
