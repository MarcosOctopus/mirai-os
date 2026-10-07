/**
 * Vínculo da conta do MIRAI OS com a Conta Mirai (plano de controle).
 *
 * O PROBLEMA que isto resolve: até aqui, a conta criada neste app nascia com um
 * `tenant_id` LOCAL (`mirai_usr_...`) e o plano de controle não sabia que ela
 * existia. Consequência medida: a IA não podia responder pelo gateway da conta
 * (plano, medição) e as camadas de memória ficavam "indisponíveis" — o vínculo
 * não existia. O CRM (Saaso) já fazia isso; este app, não.
 *
 * O CAMINHO (medido no código do identity, não suposto):
 *   1. POST /v1/auth/login          — provisionamento; cria o usuário da
 *      plataforma por e-mail. Exige o segredo de bootstrap (cabeçalho
 *      `x-mirai-bootstrap`) e FALHA FECHADO se ele não estiver configurado.
 *   2. POST /v1/tenants             — a casa da pessoa no produto `mirai`
 *      (organização + tenant + membership owner + assinatura).
 *   3. POST /v1/product-accounts    — o vínculo conta↔produto. Exige as
 *      credenciais DESTE app (cliente OIDC do produto `mirai`) **e** o token da
 *      pessoa: o produto não vincula ninguém sozinho, e o token de outro
 *      produto é recusado (403). É o que a porteira do plano consulta.
 *   4. POST /v1/auth/password/set   — com a senha da pessoa, para a MESMA
 *      credencial valer no "Entrar com Conta Mirai" dos outros apps.
 *
 * Depois disso, o tenant do plano de controle fica guardado em
 * `platform_config.mirai` e é ele que o resolutor usa (não o tenant local).
 *
 * Nada aqui é fatal: se o plano de controle piscar, o cadastro/login local
 * segue funcionando e o vínculo se completa no próximo acesso.
 */
import { getUserPlatformConfig, updateUserPlatformConfig } from "@/lib/auth"

const ID = (process.env.MIRAI_OIDC_ISSUER || "https://id.miraitohope.com").replace(/\/+$/, "")
const CLIENT_ID = process.env.MIRAI_OIDC_CLIENT_ID || ""
const CLIENT_SECRET = process.env.MIRAI_OIDC_CLIENT_SECRET || ""
const BOOTSTRAP = process.env.MIRAI_BOOTSTRAP_SECRET || ""
/** O produto desta casa: o próprio `mirai`. É o que o cliente OIDC do app é. */
const PRODUTO = "mirai"

export type VinculoMirai = {
  user_id: string
  tenant_id: string
  vinculado_em: string
}

/** O vínculo já gravado (leitura pura, sem rede). */
export function lerVinculo(userId: number): VinculoMirai | null {
  const cfg = getUserPlatformConfig(userId) as Record<string, any>
  const v = cfg?.mirai
  return v?.user_id && v?.tenant_id ? (v as VinculoMirai) : null
}

type Sessao = { token: string; user_id: string; tenants: any[] }

/** Passo 1: garante que a pessoa existe como usuário da plataforma. */
async function provisionar(email: string, nome?: string): Promise<Sessao | null> {
  if (!BOOTSTRAP) return null
  const r = await fetch(`${ID}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-mirai-bootstrap": BOOTSTRAP },
    body: JSON.stringify({
      email,
      display_name: nome || email.split("@")[0],
      // Diz QUAL produto está provisionando. Sem isto o token sai com o
      // primeiro membership da pessoa e o vínculo do segundo produto é
      // recusado (medido: conta com CRM + MIRAI OS).
      product_id: PRODUTO,
    }),
  })
  if (!r.ok) return null
  const d = await r.json()
  return { token: d.token, user_id: d.user?.user_id, tenants: d.tenants || [] }
}

/**
 * Vincula (ou devolve o vínculo já existente). Idempotente: chamar em todo
 * cadastro e todo login não cria tenant duplicado nem sobrescreve vínculo.
 * Devolve `null` quando não deu — e o motivo fica no log do servidor, nunca
 * na resposta ao cliente.
 */
export async function vincularContaMirai(dados: {
  userId: number
  email: string
  nome?: string
  /** senha em claro, só para definir a credencial na Conta Mirai. Não é gravada. */
  senha?: string
}): Promise<VinculoMirai | null> {
  try {
    const ja = lerVinculo(dados.userId)
    if (ja) return ja
    if (!CLIENT_ID || !CLIENT_SECRET) {
      console.warn("[conta-mirai] sem credenciais do cliente neste app: vínculo não feito")
      return null
    }
    if (!BOOTSTRAP) {
      console.warn("[conta-mirai] sem MIRAI_BOOTSTRAP_SECRET: vínculo não feito")
      return null
    }

    let s = await provisionar(dados.email, dados.nome)
    if (!s) {
      console.warn("[conta-mirai] provisionamento recusado pelo plano de controle")
      return null
    }

    // Passo 2: a casa da pessoa no produto.
    let casa = (s.tenants || []).find((t: any) => t.product_id === PRODUTO)
    if (!casa) {
      const r = await fetch(`${ID}/v1/tenants`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.token}` },
        body: JSON.stringify({ name: dados.nome || dados.email, product_id: PRODUTO }),
      })
      if (!r.ok) {
        console.warn("[conta-mirai] não consegui criar o tenant da conta:", r.status)
        return null
      }
      casa = await r.json()
      // o token anterior foi emitido sem tenant; refaz para ele carregar a casa
      s = (await provisionar(dados.email, dados.nome)) || s
    }
    const tenant_id: string = casa.tenant_id

    // Passo 3: o vínculo conta↔produto (o produto não vincula sozinho).
    const rl = await fetch(`${ID}/v1/product-accounts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-mirai-client-id": CLIENT_ID,
        "x-mirai-client-secret": CLIENT_SECRET,
        Authorization: `Bearer ${s.token}`,
      },
      body: JSON.stringify({ local_user_ref: String(dados.userId), local_email: dados.email }),
    })
    if (!rl.ok) {
      console.warn("[conta-mirai] vínculo conta↔produto recusado:", rl.status)
      return null
    }
    const link = await rl.json()

    // Passo 4: a senha da casa também vale na Conta Mirai. Se já existe
    // credencial, a rota exige a senha atual e nós não a temos — não é erro:
    // a pessoa segue entrando aqui e a credencial da Conta Mirai é a dela.
    if (dados.senha) {
      try {
        const rs = await fetch(`${ID}/v1/auth/password/set`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.token}` },
          body: JSON.stringify({ new_password: dados.senha }),
        })
        if (!rs.ok) console.warn("[conta-mirai] credencial não definida:", rs.status)
      } catch {
        /* não é fatal */
      }
    }

    const vinculo: VinculoMirai = {
      user_id: s.user_id,
      tenant_id: link.tenant_id || tenant_id,
      vinculado_em: new Date().toISOString(),
    }
    updateUserPlatformConfig(dados.userId, { mirai: vinculo })
    console.log(
      `[conta-mirai] vinculado: usuário ${dados.userId} -> ${vinculo.tenant_id} (${vinculo.user_id})`
    )
    return vinculo
  } catch (e) {
    console.warn("[conta-mirai] falhou (não fatal):", e instanceof Error ? e.message : e)
    return null
  }
}
