import { NextRequest, NextResponse } from "next/server";

import { dominioDoProjeto } from "@/lib/arquiteto-projetos";
import { basePublica } from "@/lib/base-publica";
import { verificarDominioToken } from "@/lib/dominio-token";
import {
  assinarBilhete,
  configurado,
  desafioDe,
  estadoAleatorio,
  novoVerificador,
  urlDeAutorizacao,
  urlDeVolta,
} from "@/lib/github-oauth";
import { exigirConta } from "@/lib/orgs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/oauth/github/iniciar — o clique no botão "Conectar com GitHub".
 *
 * Espelho fiel do iniciar do Cloudflare. Dois caminhos chegam aqui, e os dois
 * são autorizados ANTES de sair para o GitHub:
 *   ?t=<token do domínio>  → o CLIENTE, no link público (`/conectar/<token>`);
 *   ?projeto=<id>          → o DONO, no painel (sessão + dono do projeto).
 *
 * O que sai daqui é um redirecionamento para o consentimento do GitHub, com o
 * `state` (anti-CSRF) e o PKCE. O bilhete que amarra tudo vai num cookie
 * ASSINADO e httpOnly — o callback não confia em mais nada.
 */
export async function GET(req: NextRequest) {
  if (!configurado()) {
    return NextResponse.json(
      { erro: "O GitHub ainda não está configurado no app (faltam o Client ID e o Client Secret)." },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const tokenCliente = url.searchParams.get("t");
  const paramProjeto = url.searchParams.get("projeto");

  let projetoId = "";
  let volta = "/arquiteto";
  let userId: number | undefined;

  if (tokenCliente) {
    const t = verificarDominioToken(tokenCliente);
    if (!t) return NextResponse.json({ erro: "Link inválido ou vencido." }, { status: 401 });
    projetoId = t.projetoId;
    volta = `/conectar/${tokenCliente}`;
  } else if (paramProjeto) {
    const g = await exigirConta(req);
    if (!g.ok) return g.resposta;
    const d = dominioDoProjeto(g.conta.id, paramProjeto);
    if (!d) return NextResponse.json({ erro: "Projeto não encontrado." }, { status: 404 });
    projetoId = paramProjeto;
  } else {
    /* CONEXÃO DA CONTA (dono, 13/10/2026): *"liberar dentro de integrações só
       pro cara entrar com auth do git dele e já ficar integrado pra tudo"*.
       Sem projeto: o token vai para o cofre DESTA conta e vale para todos os
       projetos dela. Exige sessão — é a conta que está conectando. */
    const g = await exigirConta(req);
    if (!g.ok) return g.resposta;
    userId = g.conta.id;
    volta = "/dashboard/connect";
  }

  const state = estadoAleatorio();
  const verificador = novoVerificador();
  const enderecoDeVolta = urlDeVolta(req);
  const resposta = NextResponse.redirect(
    urlDeAutorizacao(state, desafioDe(verificador), enderecoDeVolta),
  );
  resposta.cookies.set("gh_bilhete", assinarBilhete({ projetoId, state, verificador, volta, userId }), {
    httpOnly: true,
    sameSite: "lax",
    // `secure` segue o endereço PÚBLICO (não a URL interna do proxy): em produção
    // é sempre https; no teste local, não — senão o cookie não volta.
    secure: basePublica(req).startsWith("https://"),
    path: "/",
    maxAge: 900, // 15 min: tempo de sobra para consentir, e curto o bastante para não sobrar
  });
  return resposta;
}
