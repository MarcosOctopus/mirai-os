/**
 * Consumo de um cliente do CRM, medido nos dois lados que existem de verdade:
 *
 *   TOKENS  -> `usage_events` do plano de controle, pela rota /v1/ai/quota do
 *              servico de identidade. Ela devolve o uso do mes corrente e o teto
 *              do plano JA em tokens (o plano declara `tokens_mes` em milhoes).
 *              A chamada e server-to-server, com as credenciais de CLIENTE deste
 *              app (as mesmas do gateway de IA); o navegador nunca ve segredo.
 *   ESPACO  -> soma de `uploads.tamanho` por usuario, no banco local do app.
 *
 * Regra dura: quando nao ha leitura, dizemos que nao ha leitura. Nunca 0% para
 * dizer "nao sei", e nunca divisao por zero quando o plano nao declara teto.
 */

import { basePlanoDeControle } from "@/lib/plano-controle";
import { db as abrirAuth } from "@/lib/auth";

export type LeituraDeTokens =
  | { leitura: "ok"; usado: number; teto: number | null }
  | { leitura: "sem_leitura"; motivo: string };

export type EspacoUsado = { bytes: number; arquivos: number };

const ESPERA_MS = 8000;
/** Cache curto: uma carga da tela pede varios tenants de uma vez. */
const CACHE_MS = 60_000;
const cache = new Map<string, { em: number; valor: LeituraDeTokens }>();

function cabecalhosDeCliente(): Record<string, string> {
  const id = (process.env.MIRAI_OIDC_CLIENT_ID || "").trim();
  const sec = (process.env.MIRAI_OIDC_CLIENT_SECRET || "").trim();
  if (!id || !sec) return {};
  return { "x-mirai-client-id": id, "x-mirai-client-secret": sec };
}

function motivoDoStatus(status: number): string {
  if (status === 401 || status === 403) return "medidor não lê esta conta";
  if (status === 404) return "medidor não exposto";
  if (status >= 500) return "medidor fora do ar";
  return `medidor respondeu ${status}`;
}

/** Le o medidor central para UM tenant. Nunca lanca. */
export async function tokensDoTenant(tenantId: string): Promise<LeituraDeTokens> {
  if (!tenantId) return { leitura: "sem_leitura", motivo: "conta sem organização" };

  const guardado = cache.get(tenantId);
  if (guardado && Date.now() - guardado.em < CACHE_MS) return guardado.valor;

  const cab = cabecalhosDeCliente();
  if (!cab["x-mirai-client-id"]) {
    return { leitura: "sem_leitura", motivo: "medidor sem credencial neste app" };
  }

  let valor: LeituraDeTokens;
  try {
    const r = await fetch(`${basePlanoDeControle()}/v1/ai/quota`, {
      method: "GET",
      headers: { ...cab, "x-mirai-conta": tenantId, accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(ESPERA_MS),
    });
    if (!r.ok) {
      valor = { leitura: "sem_leitura", motivo: motivoDoStatus(r.status) };
    } else {
      const corpo = (await r.json()) as { usado?: unknown; teto?: unknown };
      const usado = Number(corpo?.usado);
      const tetoBruto = corpo?.teto;
      const teto = tetoBruto === null || tetoBruto === undefined ? null : Number(tetoBruto);
      valor = {
        leitura: "ok",
        usado: Number.isFinite(usado) ? Math.max(0, usado) : 0,
        teto: typeof teto === "number" && Number.isFinite(teto) && teto > 0 ? teto : null,
      };
    }
  } catch (e) {
    const nome = e instanceof Error ? e.name : "erro";
    valor = { leitura: "sem_leitura", motivo: `medidor inacessível (${nome})` };
  }

  cache.set(tenantId, { em: Date.now(), valor });
  return valor;
}

/** Esquece a leitura guardada de um tenant (usado quando o plano muda). */
export function esquecerTokens(tenantId: string) {
  if (tenantId) cache.delete(tenantId);
}

/** Soma de `uploads.tamanho` por usuario (o espaco que a pessoa de fato gastou). */
export function espacoPorUsuario(): Record<string, EspacoUsado> {
  const saida: Record<string, EspacoUsado> = {};
  let d: ReturnType<typeof abrirAuth> | null = null;
  try {
    d = abrirAuth();
    const linhas = d
      .prepare(
        "SELECT user_id, COUNT(*) AS arquivos, COALESCE(SUM(tamanho),0) AS bytes FROM uploads GROUP BY user_id",
      )
      .all() as { user_id: number; arquivos: number; bytes: number }[];
    for (const l of linhas) {
      saida[String(l.user_id)] = {
        bytes: Math.max(0, Number(l.bytes) || 0),
        arquivos: Math.max(0, Number(l.arquivos) || 0),
      };
    }
  } catch {
    // sem banco local nao ha espaco medido, e a tela diz isso em vez de 0 enganoso
  } finally {
    if (d) d.close();
  }
  return saida;
}
