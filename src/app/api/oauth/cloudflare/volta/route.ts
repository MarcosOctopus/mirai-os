import { NextRequest, NextResponse } from "next/server";

import { guardarConexaoCloudflare } from "@/lib/arquiteto-projetos";
import { basePublica } from "@/lib/base-publica";
import { apontarDominioDoProjeto } from "@/lib/cloudflare-apontar";
import { lerBilhete, trocarCodigoPorToken } from "@/lib/cloudflare-oauth";
import { cifrar } from "@/lib/segredo-guardado";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/oauth/cloudflare/volta — o retorno do consentimento.
 *
 * Ordem do que acontece aqui, e por quê:
 *   1. confere o `state` do bilhete assinado (sem isso, qualquer um poderia
 *      plantar um `code` nosso — CSRF clássico de OAuth);
 *   2. troca o `code` pelo token (PKCE: manda o verificador, sem segredo);
 *   3. guarda o token CIFRADO (é segredo de verdade);
 *   4. já APONTA o domínio (cria o registro A) — o cliente clicou uma vez só e
 *      não deveria precisar clicar de novo;
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

  const bilhete = lerBilhete(req.cookies.get("cf_bilhete")?.value);
  const destino = (marca: string) => {
    const base = bilhete?.volta && bilhete.volta.startsWith("/") ? bilhete.volta : "/arquiteto";
    // O endereço PÚBLICO (não a origem interna do proxy): o dono tem de voltar
    // para `https://app.miraitohope.com/...`, nunca para `http://localhost:3333`.
    const r = NextResponse.redirect(`${basePublica(req)}${base}?cloudflare=${marca}`);
    r.cookies.set("cf_bilhete", "", { path: "/", maxAge: 0 });
    return r;
  };

  if (recusa) return destino("recusado");
  if (!bilhete || !code || bilhete.state !== state) return destino("falhou");

  const troca = await trocarCodigoPorToken(code, bilhete.verificador);
  if (!troca.ok) return destino("falhou");

  guardarConexaoCloudflare(bilhete.projetoId, cifrar(troca.token), null);

  const apontou = await apontarDominioDoProjeto(bilhete.projetoId);
  return destino(apontou.ok ? "apontado" : "conectado");
}