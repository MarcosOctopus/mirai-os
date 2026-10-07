/**
 * O caminho da CONTA: a conversa sai pela inteligência da própria conta.
 *
 * Por que existe: até aqui o chat respondia pelas chaves soltas deste app — sem
 * plano, sem medição e sem saber de quem era a conta. Com o vínculo fechado
 * (`lib/vinculo-conta-mirai.ts`), a conta tem tenant e vínculo de produto no
 * plano de controle, e o gateway (`POST /v1/ai/chat/completions`) passa a
 * atender POR CONTA: quem manda no que aquela conta usa é o plano dela, e o
 * consumo fica medido por tenant.
 *
 * Regra desta peça: **sem vínculo, nada muda**. `gatewayDaConta()` devolve null
 * e quem chamou segue exatamente pelo caminho de antes. Assim a mudança vale só
 * para contas vinculadas (hoje, a do dono) e não mexe na vida de ninguém.
 *
 * O corpo é o padrão OpenAI (o gateway é compatível, aceita `tools`, `stream` e
 * devolve SSE quando `stream: true`), então o chat reaproveita o mesmo
 * tratamento de stream que já existia.
 */
import { lerVinculo } from "@/lib/vinculo-conta-mirai"

const ID = (process.env.MIRAI_OIDC_ISSUER || "https://id.miraitohope.com").replace(/\/+$/, "")
const CLIENT_ID = process.env.MIRAI_OIDC_CLIENT_ID || ""
const CLIENT_SECRET = process.env.MIRAI_OIDC_CLIENT_SECRET || ""

/** O modelo padrão da casa, quando quem pergunta não escolheu outro. */
export const MODELO_DA_CONTA = process.env.MIRAI_MODELO_PADRAO || "deepseek-v4.1-flash"

export type GatewayDaConta = {
  /** A conta (tenant) no plano de controle. */
  tenant: string
  /** Manda um corpo padrão OpenAI para o gateway da conta. */
  chamar: (corpo: Record<string, unknown>) => Promise<Response>
}

/**
 * O gateway desta pessoa — ou `null`, e aí vale o caminho de sempre.
 * Leitura pura (sem rede): o vínculo está gravado no `platform_config`.
 */
export function gatewayDaConta(userId: number): GatewayDaConta | null {
  if (!userId || !CLIENT_ID || !CLIENT_SECRET) return null
  const vinculo = lerVinculo(userId)
  if (!vinculo?.tenant_id) return null

  const tenant = vinculo.tenant_id
  return {
    tenant,
    chamar: (corpo) =>
      fetch(`${ID}/v1/ai/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-mirai-client-id": CLIENT_ID,
          "x-mirai-client-secret": CLIENT_SECRET,
          // é esta linha que diz de QUEM é a conta que está gastando
          "x-mirai-conta": tenant,
        },
        body: JSON.stringify(corpo),
      }),
  }
}
