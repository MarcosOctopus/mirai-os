import { chamarPlanoDeControle } from "./plano-controle";

/**
 * QUANTAS ORGANIZAÇÕES O PLANO DE CADA UM PERMITE (dono, 20/11/2026:
 * "qualquer um crie suas organizações, mas o plano de cada um tem o número
 * específico de organização").
 *
 * A FONTE É O PLANO DE CONTROLE, não uma tabela inventada aqui: em `plans.limits`
 * já vive o campo `organizacoes` por plano do produto `mirai`
 * (medido 20/11/2026: básico 1 · intermediário 3 · profissional 10 · avançado 25).
 * Preço, teto e nome mudam no painel de planos — aqui só se LÊ.
 *
 * Regra de leitura: o plano que vale é o do PRODUTO `mirai` da pessoa (a mesma
 * lista que o painel `/admin/planos` mostra). Quem não aparece no controle fica
 * sem limite conhecido — e aí a criação é permitida (falha aberta): derrubar a
 * criação porque o plano de controle piscou seria pior do que um teto frouxo por
 * alguns minutos.
 */

export type PlanoMirai = {
  plan_id: string;
  nome: string;
  limites: Record<string, number>;
};

export type LimiteOrganizacoes = {
  /** Plano lido do controle (`mirai_basico`…), ou null se não deu para saber. */
  planId: string | null;
  /** Nome legível do plano ("Básico"). */
  plano: string | null;
  /** Quantas organizações o plano permite. `null` = sem teto conhecido. */
  total: number | null;
};

const TTL_MS = 60_000;
let cachePlanos: { em: number; dados: PlanoMirai[] } | null = null;
let cacheUsuarios: { em: number; dados: { email: string; plan_id: string | null }[] } | null = null;

async function planosDoProdutoMirai(): Promise<PlanoMirai[]> {
  if (cachePlanos && Date.now() - cachePlanos.em < TTL_MS) return cachePlanos.dados;
  const r = await chamarPlanoDeControle("/v1/admin/plans");
  if (r.status !== 200) return cachePlanos?.dados ?? [];
  const corpo = r.corpo as { planos?: unknown };
  const lista = Array.isArray(corpo.planos) ? (corpo.planos as Record<string, unknown>[]) : [];
  const dados: PlanoMirai[] = lista
    .filter((p) => String(p.product_id ?? "") === "mirai")
    .map((p) => ({
      plan_id: String(p.plan_id ?? ""),
      nome: String(p.nome ?? p.plan_id ?? ""),
      limites: (p.limites as Record<string, number>) ?? {},
    }));
  cachePlanos = { em: Date.now(), dados };
  return dados;
}

async function usuariosDoControle(): Promise<{ email: string; plan_id: string | null }[]> {
  if (cacheUsuarios && Date.now() - cacheUsuarios.em < TTL_MS) return cacheUsuarios.dados;
  const r = await chamarPlanoDeControle("/v1/admin/usuarios");
  if (r.status !== 200) return cacheUsuarios?.dados ?? [];
  const corpo = r.corpo as { usuarios?: unknown };
  const lista = Array.isArray(corpo.usuarios) ? (corpo.usuarios as Record<string, unknown>[]) : [];
  const dados = lista
    .filter((u) => String(u.product_id ?? "mirai") === "mirai")
    .map((u) => ({
      email: String(u.email ?? "").trim().toLowerCase(),
      plan_id: u.plan_id ? String(u.plan_id) : null,
    }));
  cacheUsuarios = { em: Date.now(), dados };
  return dados;
}

/** Plano `mirai` da pessoa + quantas organizações ele permite. */
export async function limiteDeOrganizacoes(email: string): Promise<LimiteOrganizacoes> {
  const alvo = (email || "").trim().toLowerCase();
  const [planos, usuarios] = await Promise.all([planosDoProdutoMirai(), usuariosDoControle()]);
  const linha = usuarios.find((u) => u.email === alvo);
  const plano = planos.find((p) => p.plan_id === linha?.plan_id) ?? null;
  const bruto = plano?.limites?.organizacoes;
  const total = typeof bruto === "number" && bruto >= 0 ? bruto : null;
  return { planId: plano?.plan_id ?? null, plano: plano?.nome ?? null, total };
}