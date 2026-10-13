import { NextRequest, NextResponse } from "next/server";

import { exigirDono } from "@/lib/orgs";
import { guardarConfig } from "@/lib/plataforma-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/github-app — o DONO cola o Client ID + Secret do OAuth App.
 *
 * POR QUE existe (dono, 13/10/2026): o app do GitHub (OAuth App) é criado no
 * GitHub pelo dono, mas as chaves NÃO passam por chat — vão cifradas direto ao
 * servidor, pela tela. Só o dono da plataforma grava (`exigirDono`); qualquer
 * outra conta recebe 401/403.
 *
 * O que grava: `github_app_client_id` + `github_app_client_secret` na
 * plataforma_config, CIFRADOS (`plataforma-config.ts`). Sem o par, o cartão do
 * GitHub segue "indisponível" — nunca um clique vazio.
 *
 * GET: só diz se o par existe (para a tela mostrar o estado) — NUNCA devolve
 * os valores, nem em parte.
 */
export async function GET(req: NextRequest) {
  const g = await exigirDono(req);
  if (!g.ok) return g.resposta;
  const { temConfig } = await import("@/lib/plataforma-config");
  return NextResponse.json({
    configurado:
      temConfig("github_app_client_id") && temConfig("github_app_client_secret"),
  });
}

export async function POST(req: NextRequest) {
  const g = await exigirDono(req);
  if (!g.ok) return g.resposta;

  let corpo: { client_id?: unknown; client_secret?: unknown };
  try {
    corpo = (await req.json()) as { client_id?: unknown; client_secret?: unknown };
  } catch {
    return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });
  }

  const id = typeof corpo.client_id === "string" ? corpo.client_id.trim() : "";
  const secret = typeof corpo.client_secret === "string" ? corpo.client_secret.trim() : "";

  // Client ID de OAuth App começa com `Ov1.`; o de GitHub App (manifesto), com
  // `Iv1.`. Recusar o formato errado evita o erro clássico: colar a chave do
  // app errado e o consentimento falhar sem explicar por quê.
  if (!id || !secret) {
    return NextResponse.json({ erro: "Cole as duas chaves." }, { status: 400 });
  }
  if (!/^Ov1\.[A-Za-z0-9]+$/.test(id)) {
    return NextResponse.json(
      {
        erro: id.startsWith("Iv1.")
          ? "Este é o Client ID do GitHub App (começa com Iv1.) — aqui vai o do OAuth App (começa com Ov1.)."
          : "O Client ID do OAuth App começa com Ov1. — confira o que foi colado.",
      },
      { status: 400 },
    );
  }

  const okId = guardarConfig("github_app_client_id", id);
  const okSecret = guardarConfig("github_app_client_secret", secret);
  if (!okId || !okSecret) {
    return NextResponse.json({ erro: "Não consegui gravar. Tente de novo." }, { status: 500 });
  }
  return NextResponse.json({ configurado: true });
}
