import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUserById } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    // ── Read token from cookie ────────────────────────────────────
    const token = req.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // ── Verify JWT ────────────────────────────────────────────────
    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    // ── Get user by id ────────────────────────────────────────────
    const user = getUserById(payload.userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 401 });
    }

    const { contaDaRequisicao } = await import("@/lib/orgs");
    const conta = await contaDaRequisicao(req);

    // O cofre vai ao navegador SEM os segredos: a tela só precisa saber QUE a
    // conexão existe, não o token (dono, 13/10/2026).
    const { cofreSemSegredos } = await import("@/lib/github-conta");

    // ── ESCOPOS (modelo unificado, 18/11/2026) ───────────────────────────
    // A tela precisa saber QUAIS espaços esta pessoa tem e qual está ativo,
    // em vez de deduzir "a org do e-mail". O pessoal vem sempre primeiro.
    const { escoposDaConta } = await import("@/lib/escopos");
    const { escopoDaRequisicao } = await import("@/lib/escopo-ativo");
    const paraEscopo = { id: user.id, nome: user.name, org: conta?.org ?? null };
    const escopos = escoposDaConta(paraEscopo).map((e) => ({ id: e.id, tipo: e.tipo, nome: e.nome }));
    const ativo = escopoDaRequisicao(req, paraEscopo);

    const resposta = NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar_url: user.avatar_url,
        tenant_id: user.tenant_id,
        platform_config: cofreSemSegredos(JSON.parse(user.platform_config || "{}")),
        // quem e esta conta: dono da plataforma, ou cliente de UMA organizacao
        ehDono: conta?.ehDono ?? false,
        papel: conta?.ehDono ? "dono" : conta?.org ? "cliente" : "sem-organizacao",
        organizacao: conta?.org
          ? { id: conta.org.id, nome: conta.org.nome, slug: conta.org.slug }
          : null,
        // ESCOPOS: pessoal (padrão) + organizações de que a pessoa é membro.
        escopos,
        escopoAtivo: { id: ativo.id, tipo: ativo.tipo, nome: ativo.nome },
      },
    });

    // SESSÃO DESLIZANTE (dono, 11/10/2026): esta rota é chamada a cada
    // carregamento de página. Renovar o prazo AQUI faz quem está usando nunca ser
    // deslogado no meio do trabalho — o problema que o dono viu como "a resposta
    // veio sem os arquivos do projeto" era, na verdade, sessão vencida.
    const { signToken, DIAS_DE_SESSAO } = await import("@/lib/auth");
    const novo = await signToken({
      userId: payload.userId,
      email: payload.email,
      tenantId: payload.tenantId,
    });
    resposta.cookies.set("token", novo, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * DIAS_DE_SESSAO,
    });
    return resposta;
  } catch (err: any) {
    console.error("Me error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
