import { NextRequest, NextResponse } from "next/server";

import { basePublica } from "@/lib/base-publica";
import { guardarCanvaDaConta } from "@/lib/canva-conta";
import { lerBilhete, perfilDoToken, trocarCodigoPorToken, urlDeVolta } from "@/lib/canva-oauth";
import { cifrar } from "@/lib/segredo-guardado";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/oauth/canva/volta — o retorno do consentimento do Canva.
 *
 * Ordem, e por quê:
 *   1. confere o `state` do bilhete assinado (sem isso qualquer um planta um
 *      `code` nosso — CSRF clássico de OAuth);
 *   2. troca o `code` pelo token (Basic auth id+secret, PKCE junto);
 *   3. lê o nome da conta que autorizou (para a tela mostrar QUEM conectou);
 *   4. grava CIFRADO no cofre da PESSOA — access E refresh, porque o Canva
 *      rotaciona o refresh a cada uso;
 *   5. volta para a Synapse com o resultado na URL.
 *
 * Rota pública de propósito: quem autoriza é o bilhete assinado, não um cookie
 * de sessão.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const recusa = url.searchParams.get("error");

  const bilhete = lerBilhete(req.cookies.get("cv_bilhete")?.value);
  const destino = (marca: string) => {
    const base = bilhete?.volta && bilhete.volta.startsWith("/") ? bilhete.volta : "/dashboard/connect";
    // Endereço PÚBLICO: o cliente volta para `https://app.miraitohope.com/...`,
    // nunca para `http://localhost:3333`.
    const r = NextResponse.redirect(`${basePublica(req)}${base}?canva=${marca}`);
    r.cookies.set("cv_bilhete", "", { path: "/", maxAge: 0 });
    return r;
  };

  if (recusa) return destino("recusado");
  if (!bilhete || !code || bilhete.state !== state) return destino("falhou");
  if (!bilhete.userId) return destino("falhou");

  const troca = await trocarCodigoPorToken(code, bilhete.verificador, urlDeVolta(req));
  if (!troca.ok) return destino("falhou");

  // O nome é só o que a tela mostra ("conectado como Fulano"). Se não vier, a
  // conexão em si já está feita — não é motivo para falhar.
  const perfil = await perfilDoToken(troca.token);
  const nome = perfil.ok ? perfil.nome : "";

  guardarCanvaDaConta(
    bilhete.userId,
    cifrar(troca.token),
    troca.refreshToken ? cifrar(troca.refreshToken) : null,
    troca.expiraEm,
    nome,
  );

  return destino("conectado");
}
