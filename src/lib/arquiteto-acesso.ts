import type { Conta } from "@/lib/orgs";
import { lerVinculo } from "@/lib/vinculo-conta-mirai";
import { capacidadesDoTenant } from "@/lib/plano-controle";

/**
 * A porteira do ARQUITETO — capacidade de RISCO ALTO (`mirai.arquiteto.construir`).
 *
 * Regra do dono (07/10/2026): "toda opção que o produto oferece nasce com
 * arquitetura de acesso" e o Arquiteto foi citado nominalmente. Portanto ele
 * NASCE FECHADO: a capacidade está declarada no plano de controle, mas NÃO é
 * concedida a ninguém por padrão. Quem decide liberar é o dono, por plano ou
 * por cliente (é para isso que existe `/v1/admin/*` e a tela `/admin/planos`).
 *
 * A ORDEM da decisão (falha FECHADO — qualquer dúvida nega):
 *   1. conta do DONO da plataforma → liberada (é ele quem libera; a decisão
 *      comercial e a operação do próprio produto são dele);
 *   2. conta SEM vínculo no plano de controle → negada (não há a quem perguntar);
 *   3. plano de controle inacessível / organização não achada → negada;
 *   4. capacidade presente no plano OU avulsa da organização → liberada;
 *   5. caso contrário → negada.
 *
 * A resposta NUNCA é "sim" por omissão. Sem poder perguntar, nega.
 */

/** O id da capacidade de alto risco, como declarado no plano de controle. */
export const CAPACIDADE_ARQUITETO = "mirai.arquiteto.construir";

export type MotivoAcesso =
  | "dono" // conta do dono da plataforma
  | "plano" // concedida pelo plano ou avulsa da organização
  | "sem_vinculo" // a conta não tem organização no plano de controle
  | "ausente" // organização existe, mas a capacidade não está nela
  | "controle_indisponivel"; // não deu para perguntar -> nega

export type DecisaoArquiteto = {
  permitido: boolean;
  motivo: MotivoAcesso;
  capacidade: string;
  /** capacidades efetivas da organização (quando deu para ler) — sem segredo. */
  capacidades?: string[];
  /** texto curto do porquê, para diagnóstico no servidor (nunca vai ao cliente cru). */
  detalhe?: string;
};

/** Decide se ESTA conta pode usar o Arquiteto. Nunca lança. */
export async function decidirAcessoArquiteto(conta: Conta): Promise<DecisaoArquiteto> {
  if (conta.ehDono) {
    return { permitido: true, motivo: "dono", capacidade: CAPACIDADE_ARQUITETO };
  }

  const vinculo = lerVinculo(conta.id);
  if (!vinculo?.tenant_id) {
    return {
      permitido: false,
      motivo: "sem_vinculo",
      capacidade: CAPACIDADE_ARQUITETO,
      detalhe: "conta sem vínculo no plano de controle",
    };
  }

  try {
    const r = await capacidadesDoTenant(vinculo.tenant_id);
    if (!r.ok) {
      // Fail CLOSED: se não deu para perguntar, nega.
      return {
        permitido: false,
        motivo: "controle_indisponivel",
        capacidade: CAPACIDADE_ARQUITETO,
        detalhe: r.erro,
      };
    }
    if (r.capacidades.includes(CAPACIDADE_ARQUITETO)) {
      return {
        permitido: true,
        motivo: "plano",
        capacidade: CAPACIDADE_ARQUITETO,
        capacidades: r.capacidades,
      };
    }
    return {
      permitido: false,
      motivo: "ausente",
      capacidade: CAPACIDADE_ARQUITETO,
      capacidades: r.capacidades,
    };
  } catch (e) {
    return {
      permitido: false,
      motivo: "controle_indisponivel",
      capacidade: CAPACIDADE_ARQUITETO,
      detalhe: e instanceof Error ? e.message : "falha ao consultar o plano de controle",
    };
  }
}
