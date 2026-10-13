/**
 * Cliente SERVER-SIDE do plano de controle (servico de identidade).
 *
 * Regra de ouro (docs/PLANOS-CONTRATO.md): o navegador NUNCA fala com o plano
 * de controle nem guarda o segredo. So a rota /api/admin/planos importa este
 * arquivo, e so ela carrega a credencial — o segredo nunca sai do servidor.
 *
 * Autenticacao: reusa o padrao que o app JA usa para falar com o servico de
 * identidade (src/lib/mirai-oidc.ts) — as credenciais de cliente OIDC
 * (MIRAI_OIDC_CLIENT_ID / MIRAI_OIDC_CLIENT_SECRET), que ja autenticam este app
 * server-to-server (usadas na troca do codigo). Se existir um segredo de admin
 * dedicado `MIRAI_ADMIN_SECRET`, ele tem precedencia (Bearer) — e a separacao
 * recomendada entre "entrar no app" e "administrar planos".
 *
 * Base: MIRAI_CONTROL_URL ou, na falta, o proprio emissor OIDC
 * (MIRAI_OIDC_ISSUER = https://id.miraitohope.com).
 */

const BASE =
  process.env.MIRAI_CONTROL_URL ||
  process.env.MIRAI_OIDC_ISSUER ||
  "https://id.miraitohope.com";

export function basePlanoDeControle(): string {
  return BASE.replace(/\/+$/, "");
}

/** Cabecalho de autenticacao server-side. NUNCA serializar para o cliente. */
export function cabecalhosPlanoDeControle(): Record<string, string> {
  const cab: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
  };

  const segredo = (process.env.MIRAI_ADMIN_SECRET || "").trim();
  if (segredo) {
    cab["x-mirai-admin"] = segredo;
    return cab;
  }

  // Fallback: a mesma credencial de cliente OIDC que o app ja usa com o
  // servico de identidade (troca do codigo em mirai-oidc.ts).
  const id = (process.env.MIRAI_OIDC_CLIENT_ID || "").trim();
  const sec = (process.env.MIRAI_OIDC_CLIENT_SECRET || "").trim();
  if (id && sec) {
    cab.authorization = `Basic ${Buffer.from(`${id}:${sec}`).toString("base64")}`;
    cab["x-client-id"] = id;
  }
  return cab;
}

/** Autenticacao configurada? (para a rota devolver erro claro, nao um 401 mudo)
 *
 * Medido em 13/10/2026: esta funcao checava SO o desvio (`authorization`, do
 * cliente OIDC) e ignorava o caminho PRINCIPAL — o segredo de admin, que e o
 * unico configurado no MIRAI OS. Resultado: dizia "nao configurado" com o app
 * funcionando. Quem manda e quem `cabecalhosPlanoDeControle` de fato devolve. */
export function planoDeControleConfigurado(): boolean {
  const cab = cabecalhosPlanoDeControle();
  return Boolean(cab["x-mirai-admin"] || cab.authorization);
}

export type RespostaPlano = { status: number; corpo: unknown };

/** Chama o plano de controle e devolve { status, corpo } sem lancar. */
export async function chamarPlanoDeControle(
  caminho: string,
  init: { method?: string; body?: unknown; timeoutMs?: number } = {},
): Promise<RespostaPlano> {
  const url = `${basePlanoDeControle()}${caminho}`;
  try {
    const res = await fetch(url, {
      method: init.method || "GET",
      headers: cabecalhosPlanoDeControle(),
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(init.timeoutMs ?? 10000),
    });
    const texto = await res.text();
    let corpo: unknown = {};
    if (texto.trim()) {
      try {
        corpo = JSON.parse(texto);
      } catch {
        corpo = { erro: "resposta ilegivel do plano de controle", cru: texto.slice(0, 400) };
      }
    }
    return { status: res.status, corpo };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "falha de rede";
    return { status: 502, corpo: { error: `plano de controle inacessivel: ${msg}` } };
  }
}

// ─── Capacidades de um tenant (porteira do Arquiteto e afins) ─────────────
//
// Regra da casa: a LISTA de capacidades mora SO no plano de controle. O app
// pergunta "esta organização pode X?" e recebe sim/nao — nunca guarda a lista.
// Aqui a pergunta é feita pelas rotas de LEITURA de admin (`/v1/admin/*`), já
// autenticadas com o MESMO segredo que este arquivo já usa
// (`MIRAI_ADMIN_SECRET` -> header `x-mirai-admin`); nenhuma credencial sai do
// servidor. A capacidade efetiva é a UNIAO de:
//   (1) `capacidades_extras` da organização (entitlement avulso, concedido a dedo)
//   (2) as capacidades do PLANO dela (`plan_capabilities`)
// — exatamente os dois degraus que o próprio serviço de identidade usa.

type OrganizacaoNoControle = {
  tenant_id?: string;
  plan_id?: string;
  capacidades_extras?: string[];
};

export type CapacidadesDoTenant = {
  /** true só quando o plano de controle respondeu e a organização foi achada. */
  ok: boolean;
  /** capacidades efetivas (plano + avulsas). Vazio quando `ok` é false. */
  capacidades: string[];
  /** motivo, quando `ok` é false — para a tela dizer a verdade em vez de mentir. */
  erro?: string;
};

export async function capacidadesDoTenant(tenantId: string): Promise<CapacidadesDoTenant> {
  if (!tenantId) {
    return { ok: false, capacidades: [], erro: "conta sem organização no plano de controle" };
  }

  const orgs = await chamarPlanoDeControle("/v1/admin/organizacoes", { method: "GET" });
  if (orgs.status !== 200) {
    return { ok: false, capacidades: [], erro: `plano de controle respondeu ${orgs.status}` };
  }
  const lista = (orgs.corpo as { organizacoes?: OrganizacaoNoControle[] })?.organizacoes || [];
  const org = lista.find((o) => o.tenant_id === tenantId);
  if (!org) {
    return { ok: false, capacidades: [], erro: "organização não encontrada no plano de controle" };
  }

  const capacidades = new Set<string>();
  for (const c of org.capacidades_extras || []) if (c) capacidades.add(c);

  if (org.plan_id) {
    const plano = await chamarPlanoDeControle(
      `/v1/admin/plans/${encodeURIComponent(org.plan_id)}/capabilities`,
      { method: "GET" },
    );
    if (plano.status === 200) {
      const caps = (plano.corpo as { capacidades?: unknown[] })?.capacidades || [];
      for (const c of caps) {
        if (typeof c === "string" && c) capacidades.add(c);
        else if (c && typeof c === "object") {
          const id = (c as { capability_id?: string }).capability_id;
          if (id) capacidades.add(id);
        }
      }
    }
  }

  return { ok: true, capacidades: [...capacidades] };
}
