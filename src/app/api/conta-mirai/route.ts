import { NextRequest, NextResponse } from "next/server"
import { verifyToken, getUserById } from "@/lib/auth"
import { lerVinculo, vincularContaMirai } from "@/lib/vinculo-conta-mirai"

/**
 * Estado do vínculo desta conta com a Conta Mirai.
 *
 * GET  — só lê (nenhuma chamada de rede): é o que a interface usa.
 * POST — vincula agora, para quem entrou antes disto existir (contas antigas
 *        ficaram sem vínculo; o GET reflete isso em vez de fingir que está ok).
 *
 * Isto NÃO substitui a regra das portas: a identidade continua sendo o que
 * manda; aqui só se mostra em que pé está o vínculo DESTA conta.
 */
async function daSessao(req: NextRequest) {
  const token = req.cookies.get("token")?.value
  if (!token) return null
  const payload = await verifyToken(token)
  if (!payload) return null
  const user = getUserById(payload.userId)
  return user || null
}

export async function GET(req: NextRequest) {
  const user = await daSessao(req)
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const vinculo = lerVinculo(user.id)
  return NextResponse.json({
    vinculado: !!vinculo,
    // Sem tenant da plataforma, a IA desta conta não passa pelo gateway dela
    // nem enxerga as camadas de memória — dizer isso é melhor que responder
    // "tudo certo" e o chat não funcionar.
    tenant_local: user.tenant_id,
    tenant_plataforma: vinculo?.tenant_id ?? null,
    user_plataforma: vinculo?.user_id ?? null,
    vinculado_em: vinculo?.vinculado_em ?? null,
  })
}

export async function POST(req: NextRequest) {
  const user = await daSessao(req)
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const vinculo = await vincularContaMirai({
    userId: user.id,
    email: user.email,
    nome: user.name,
  })
  if (!vinculo) {
    return NextResponse.json(
      { vinculado: false, error: "Não foi possível vincular agora. Tente de novo em instantes." },
      { status: 502 }
    )
  }
  return NextResponse.json({
    vinculado: true,
    tenant_plataforma: vinculo.tenant_id,
    user_plataforma: vinculo.user_id,
    vinculado_em: vinculo.vinculado_em,
  })
}
