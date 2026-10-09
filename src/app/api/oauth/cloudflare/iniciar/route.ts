import { NextRequest, NextResponse } from "next/server";

import { dominioDoProjeto } from "@/lib/arquiteto-projetos";
import { basePublica } from "@/lib/base-publica";
import { assinarBilhete, configurado, desafioDe, estadoAleatorio, novoVerificador, urlDeAutorizacao } from "@/lib/cloudflare-oauth";
import { verificarDominioToken } from "@/lib/dominio-token";
import { exigirConta } from "@/lib/orgs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/oauth/cloudflare/iniciar — o clique no botão "Conectar com Cloudflare".
 *
 * Dois caminhos chegam aqui, e os dois são autorizados ANTES de sair para o
 * Cloudflare:
 *   ?t=<token do domínio>  → o CLIENTE, no link público (`/conectar/<token>`);
 *   ?projeto=<id>          → o DONO, no painel (sessão + dono do projeto).
 *
 * O que sai daqui é um redirecionamento para o consentimento do Cloudflare, com
 * o `state` (anti-CSRF) e o PKCE. O bilhete que amarra tudo vai num cookie
 * ASSINADO e httpOnly — o callback não confia em mais nada.
 */
export async function GET(req: NextRequest) {
  if (!configurado()) {
    return NextResponse.json(
      { erro: "O Cloudflare ainda não está configurado no app (falta o Client ID)." },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const tokenCliente = url.searchParams.get("t");
  const paramProjeto = url.searchParams.get("projeto");

  let projetoId = "";
  let volta = "/arquiteto";

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
    return NextResponse.json({ erro: "Diga de qual projeto é a conexão." }, { status: 400 });
  }

  const state = estadoAleatorio();
  const verificador = novoVerificador();
  const resposta = NextResponse.redirect(urlDeAutorizacao(state, desafioDe(verificador)));
  resposta.cookies.set("cf_bilhete", assinarBilhete({ projetoId, state, verificador, volta }), {
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