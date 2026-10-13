import { NextRequest, NextResponse } from "next/server";

import { guardarConexaoGithub } from "@/lib/arquiteto-projetos";
import { guardarGithubDaConta } from "@/lib/github-conta";
import { basePublica } from "@/lib/base-publica";
import { usuarioDoToken } from "@/lib/github-api";
import { lerBilhete, trocarCodigoPorToken, urlDeVolta } from "@/lib/github-oauth";
import { cifrar } from "@/lib/segredo-guardado";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/oauth/github/volta — o retorno do consentimento.
 *
 * Espelho do volta do Cloudflare. Ordem do que acontece aqui, e por quê:
 *   1. confere o `state` do bilhete assinado (sem isso, qualquer um poderia
 *      plantar um `code` nosso — CSRF clássico de OAuth);
 *   2. troca o `code` pelo token (GitHub exige o client_secret; PKCE vai junto);
 *   3. lê o `login` de quem conectou (para a tela mostrar QUEM conectou);
 *   4. guarda o token CIFRADO (é segredo de verdade) e o login;
 *   5. volta para onde a pessoa estava, com o resultado na URL.
 *
 * Rota pública de propósito (o cliente não tem sessão aqui): quem autoriza é o
 * bilhete assinado, não um cookie de login.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const recusa = url.searchParams.get("error");

  const bilhete = lerBilhete(req.cookies.get("gh_bilhete")?.value);
  const destino = (marca: string) => {
    const base = bilhete?.volta && bilhete.volta.startsWith("/") ? bilhete.volta : "/arquiteto";
    // O endereço PÚBLICO (não a origem interna do proxy): o dono tem de voltar
    // para `https://app.miraitohope.com/...`, nunca para `http://localhost:3333`.
    const r = NextResponse.redirect(`${basePublica(req)}${base}?github=${marca}`);
    r.cookies.set("gh_bilhete", "", { path: "/", maxAge: 0 });
    return r;
  };

  if (recusa) return destino("recusado");
  if (!bilhete || !code || bilhete.state !== state) return destino("falhou");

  const troca = await trocarCodigoPorToken(code, bilhete.verificador, urlDeVolta(req));
  if (!troca.ok) return destino("falhou");

  // O login é o que a tela mostra ("conectado como @fulano"). Se por algum
  // motivo não vier, guardamos vazio — a conexão em si já está feita.
  const perfil = await usuarioDoToken(troca.token);
  const login = perfil.ok ? perfil.login : "";

  // DUAS CONEXÕES, um só consentimento (dono, 13/10/2026): com projeto, o token
  // é daquele projeto (fluxo antigo, intacto); sem projeto, é a conexão da
  // CONTA — vale para todos os projetos dela.
  if (bilhete.projetoId) {
    guardarConexaoGithub(bilhete.projetoId, cifrar(troca.token), login);
  } else if (bilhete.userId) {
    guardarGithubDaConta(bilhete.userId, cifrar(troca.token), login);
  } else {
    return destino("falhou");
  }

  return destino("conectado");
}
