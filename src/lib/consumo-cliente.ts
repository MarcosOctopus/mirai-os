/**
 * Consumo de um cliente do CRM, medido nos dois lados que existem de verdade:
 *
 *   TOKENS  -> `usage_events` do plano de controle. Duas leituras, nesta ordem:
 *              (1) `/v1/admin/consumo` — leitura de ADMIN por conta, com o
 *                  segredo do servidor; vale para conta de QUALQUER produto
 *                  (Saaso, Dark Matter, Pathfinder, Media Factory), porque
 *                  resolve pelo produto DO TENANT, nao pelo produto que pergunta;
 *              (2) `/v1/ai/quota` — a rota antiga, autenticada como CLIENTE
 *                  deste app; so le conta do proprio produto `mirai`. Fica como
 *                  reserva: se (1) nao existir ou falhar, o comportamento e'
 *                  exatamente o de antes.
 *              As duas devolvem o uso do mes corrente e o teto do plano JA em
 *              tokens (o plano declara `tokens_mes` em milhoes). A chamada e'
 *              server-to-server; o navegador nunca ve segredo.
 *   ESPACO  -> soma de `uploads.tamanho` por usuario, no banco local do app.
 *
 * Regra dura: quando nao ha leitura, dizemos que nao ha leitura. Nunca 0% para
 * dizer "nao sei", e nunca divisao por zero quando o plano nao declara teto.
 */

import { basePlanoDeControle, chamarPlanoDeControle, planoDeControleConfigurado } from "@/lib/plano-controle";
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

type CorpoConsumoAdmin = { usado?: unknown; teto?: unknown; produto?: unknown; periodo_inicio?: unknown };

/**
 * CAMINHO PREFERENCIAL — leitura de ADMIN por conta, em `/v1/admin/consumo`.
 *
 * Por que existe (27/11/2026): a rota antiga (`/v1/ai/quota`) autentica o
 * PRODUTO que pergunta e exige o vínculo conta<->produto. Este app é o produto
 * `mirai`, então toda conta de OUTRO produto (Saaso, Dark Matter, Pathfinder,
 * Media Factory) recebia 403 e a barra dizia "medidor não lê esta conta" — em
 * contas que TÊM teto no plano (medido: 13 contas do Saaso).
 *
 * A credencial é a de ADMIN da instalação, lida do AMBIENTE DO SERVIDOR por
 * `cabecalhosPlanoDeControle()` — o navegador nunca a vê. Somente leitura.
 *
 * Devolve `null` (não lança) quando não há como ler por aqui: sem credencial de
 * admin no ambiente, status diferente de 200 (401/403/404/5xx) ou corpo sem
 * número. Quem chamou cai na rota antiga — nada quebra.
 */
async function leituraPeloAdmin(tenantId: string): Promise<LeituraDeTokens | null> {
  try {
    if (!planoDeControleConfigurado()) return null;
    const r = await chamarPlanoDeControle(
      `/v1/admin/consumo?tenant_id=${encodeURIComponent(tenantId)}`,
      { method: "GET", timeoutMs: ESPERA_MS },
    );
    if (r.status !== 200) return null;
    const corpo = (r.corpo || {}) as CorpoConsumoAdmin;
    const usado = Number(corpo.usado);
    if (!Number.isFinite(usado)) return null;
    const tetoBruto = corpo.teto;
    const teto = tetoBruto === null || tetoBruto === undefined ? null : Number(tetoBruto);
    return {
      leitura: "ok",
      usado: Math.max(0, usado),
      teto: typeof teto === "number" && Number.isFinite(teto) && teto > 0 ? teto : null,
    };
  } catch {
    return null;
  }
}

/** Le o medidor central para UM tenant. Nunca lanca. */
export async function tokensDoTenant(tenantId: string): Promise<LeituraDeTokens> {
  if (!tenantId) return { leitura: "sem_leitura", motivo: "conta sem organização" };

  const guardado = cache.get(tenantId);
  if (guardado && Date.now() - guardado.em < CACHE_MS) return guardado.valor;

  // 1) ADMIN (vale para conta de QUALQUER produto).
  const peloAdmin = await leituraPeloAdmin(tenantId);
  if (peloAdmin) {
    cache.set(tenantId, { em: Date.now(), valor: peloAdmin });
    return peloAdmin;
  }

  // 2) RESERVA: a rota antiga, com as credenciais de CLIENTE deste app. É o que
  //    existia antes; continua igual, inclusive a mensagem quando não há
  //    credencial nenhuma configurada neste ambiente.
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
