import { NextRequest, NextResponse } from "next/server";

import { exigirConta } from "@/lib/orgs";
import { decidirAcessoArquiteto } from "@/lib/arquiteto-acesso";
import { listarReposDoDono, tokenGithubDaConta } from "@/lib/github-conta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/arquiteto/github/repos?dono=<organização-ou-usuário>
 *
 * "Quais repositórios esta conta tem?" (dono, 16/10/2026)
 *
 * POR QUE EXISTE: o cliente colou a URL da organização
 * (`https://github.com/orgs/Mesh2Motion/repositories`) e recebeu um erro que não
 * fazia sentido — *"não achei o repositório 'orgs/Mesh2Motion'"*. Quem cola a URL
 * de uma organização quer VER os repositórios dela e escolher. Esta rota entrega
 * essa lista.
 *
 * A conta vem da SESSÃO (o mesmo guard do resto do app); o token do GitHub, do
 * cofre da conta, no servidor. Nada de credencial no navegador. O Arquiteto tem de
 * estar liberado para a conta — a mesma decisão da tela (`decidirAcessoArquiteto`).
 *
 * Sempre responde 200 com `{ok}` — a lista vazia e a falha de rede são estados
 * NORMAIS desta tela, não exceções: quem mostra é o diálogo, não o código HTTP.
 */
export async function GET(req: NextRequest) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  const d = await decidirAcessoArquiteto(g.conta);
  if (!d.permitido) {
    return NextResponse.json({ erro: "O Arquiteto não está liberado para esta conta." }, { status: 403 });
  }

  const dono = (new URL(req.url).searchParams.get("dono") || "").trim();
  if (!dono || !/^[A-Za-z0-9._-]+$/.test(dono)) {
    return NextResponse.json({ ok: false, erro: "informe a conta (organização ou usuário)" }, { status: 400 });
  }

  const token = await tokenGithubDaConta(g.conta.id);
  const r = await listarReposDoDono(dono, token);
  if (!r.ok) {
    return NextResponse.json(
      { ok: false, erro: r.erro, precisa_token: r.precisa_token },
      { status: 200 },
    );
  }
  return NextResponse.json({ ok: true, dono, tem_token: !!token, repos: r.repos }, { status: 200 });
}
