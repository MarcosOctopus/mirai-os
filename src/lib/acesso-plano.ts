/**
 * A PORTEIRA DE PLANO DO PRODUTO INTEIRO.
 *
 * Dono, 24/11/2026: *"todos os planos o cara só consiga usar qualquer coisa
 * depois que ele pagar"*. Antes disto o único lugar que olhava plano era o
 * Arquiteto: qualquer conta criada usava chat, acervo e projetos de graça.
 *
 * A RÉGUA (escolhida pelo dono no mesmo dia): bloqueia quem NÃO tem plano
 * nenhum do OS. Quem já tem plano concedido — pago ou dado à mão pelo dono —
 * continua entrando. Ou seja, o que libera é a CAPACIDADE, e capacidade só
 * existe em plano do produto `mirai` (o `free` e planos de outro produto, como
 * `saaso_incluso`, não têm nenhuma).
 *
 * POR QUE CAPACIDADE E NÃO "assinatura paga": quem concede plano à mão hoje é o
 * dono, pela tela de admin; exigir assinatura do Asaas derrubaria as contas que
 * ele já liberou. A cobrança liga a capacidade — ela nunca é a régua em si.
 *
 * FALHA ABERTA SÓ QUANDO NÃO DÁ PARA PERGUNTAR: se o plano de controle estiver
 * fora, negar trancaria quem PAGA (e o dono) por um tropeço de rede. Um
 * aproveitador não consegue derrubar o serviço para se liberar; uma cliente
 * pagante trancada fora, sim, é dano. Então: indisponível → passa, com registro.
 * Ausência de plano (que é uma resposta de verdade) → nega.
 */
import type { Conta } from "@/lib/orgs";
import { lerVinculo } from "@/lib/vinculo-conta-mirai";
import { capacidadesDoTenant } from "@/lib/plano-controle";

export type MotivoPlano =
  | "dono"                  // dono da plataforma: entra sempre
  | "plano"                 // tem plano do OS (pago ou concedido à mão)
  | "sem_plano"             // resposta de verdade: não tem capacidade nenhuma
  | "sem_vinculo"           // conta sem vínculo no plano de controle (= sem plano)
  | "controle_indisponivel"; // não deu para perguntar -> passa, com registro

export type DecisaoPlano = {
  permitido: boolean;
  motivo: MotivoPlano;
  /** capacidades efetivas, quando deu para ler. */
  capacidades?: string[];
  detalhe?: string;
};

/** O que caracteriza "tem plano do OS": a capacidade de conversa do produto,
 *  ou qualquer capacidade nossa. Plano de outro produto não libera o OS. */
export function capacidadesLiberam(capacidades: string[]): boolean {
  return (
    capacidades.includes("ai.chat") ||
    capacidades.some((c) => c.startsWith("mirai."))
  );
}

/** Cache curto por organização: a porteira roda em toda abertura de tela e não
 *  pode virar uma enxurrada de chamadas ao plano de controle. */
const CACHE_MS = 60_000;
const cache = new Map<string, { em: number; d: DecisaoPlano }>();

function doCache(tenantId: string): DecisaoPlano | null {
  const c = cache.get(tenantId);
  if (!c) return null;
  if (Date.now() - c.em > CACHE_MS) {
    cache.delete(tenantId);
    return null;
  }
  return c.d;
}

/** Decide se ESTA conta pode usar o produto. Nunca lança. */
export async function decidirAcessoPlano(conta: Conta): Promise<DecisaoPlano> {
  if (conta.ehDono) return { permitido: true, motivo: "dono" };

  const vinculo = lerVinculo(conta.id);
  if (!vinculo?.tenant_id) {
    // Sem vínculo não há a quem perguntar: é uma conta nova, sem plano. Fecha.
    return {
      permitido: false,
      motivo: "sem_vinculo",
      detalhe: "conta sem vínculo no plano de controle",
    };
  }

  const guardado = doCache(vinculo.tenant_id);
  if (guardado) return guardado;

  try {
    const r = await capacidadesDoTenant(vinculo.tenant_id);
    if (!r.ok) {
      /* DUAS COISAS DIFERENTES caem aqui e não podem ter o mesmo destino:
         (a) o plano de controle RESPONDEU que esta organização não existe — é
             resposta de verdade, não falha: a conta não tem plano. Fecha.
         (b) o plano de controle não respondeu (rede/status) — não é ausência de
             plano; quem paga não pode ficar fora por um tropeço de rede. Passa,
             com registro. */
      const semOrganizacao = /não encontrada|sem organiza/i.test(r.erro || "");
      if (!semOrganizacao) {
        console.warn("[plano] plano de controle indisponível:", r.erro);
        return { permitido: true, motivo: "controle_indisponivel", detalhe: r.erro };
      }
      const fechado: DecisaoPlano = {
        permitido: false,
        motivo: "sem_plano",
        detalhe: r.erro,
      };
      cache.set(vinculo.tenant_id, { em: Date.now(), d: fechado });
      return fechado;
    }
    const libera = capacidadesLiberam(r.capacidades);
    const d: DecisaoPlano = {
      permitido: libera,
      motivo: libera ? "plano" : "sem_plano",
      capacidades: r.capacidades,
    };
    cache.set(vinculo.tenant_id, { em: Date.now(), d });
    return d;
  } catch (e) {
    console.warn(
      "[plano] falha ao consultar o plano de controle:",
      e instanceof Error ? e.message : e,
    );
    return {
      permitido: true,
      motivo: "controle_indisponivel",
      detalhe: e instanceof Error ? e.message : "falha ao consultar",
    };
  }
}

/** Texto curto para a tela, sem jargão. */
export function recadoDoBloqueio(motivo: MotivoPlano): string {
  switch (motivo) {
    case "sem_vinculo":
      return "Sua conta ainda não tem plano ativo. Escolha um plano para liberar o MIRAI OS.";
    case "sem_plano":
      return "Seu plano atual não inclui o MIRAI OS. Escolha um plano para liberar o acesso.";
    default:
      return "Escolha um plano para usar o MIRAI OS.";
  }
}
