// Volta da Conta Mirai.
//
// Ordem do que é conferido (nada é confiado de graça):
//   1. o bilhete no cookie (provou que ESTE navegador começou o pedido?)
//   2. o state da URL casa com o do bilhete
//   3. o código só vale trocado no servidor do id.miraitohope.com, com o nosso
//      segredo + o code_verifier do PKCE
//   4. a assinatura do id_token é conferida contra o JWKS público do Mirai
//   5. o nonce casa (o token é resposta ao NOSSO pedido, não replay)
//
// Só então a conta local é achada (ou criada) pelo e-mail e a sessão do app é
// assinada — a mesma de antes, então o resto do app (middleware, /me, banco)
// continua funcionando sem saber que a identidade mudou.
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import {
  getUserByEmail,
  createUser,
  signToken,
} from "@/lib/auth";
import { lerBilhete, trocarCodigo, conferirIdToken, destino } from "@/lib/mirai-oidc";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const erro = url.searchParams.get("error");
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";

  const falha = (motivo: string) => {
    const r = NextResponse.redirect(destino(`/login?error=${motivo}`, request.url));
    r.cookies.delete("mirai_ticket");
    return r;
  };

  if (erro) return falha("mirai_recusou");

  const bilhete = await lerBilhete(request.cookies.get("mirai_ticket")?.value);
  if (!bilhete) return falha("mirai_bilhete");
  if (!state || state !== bilhete.state) return falha("mirai_state");
  if (!code) return falha("mirai_sem_code");

  let idToken = "";
  try {
    const tokens = await trocarCodigo(code, bilhete.verifier);
    idToken = tokens.id_token || "";
  } catch {
    return falha("mirai_token");
  }

  let email = "";
  let nome = "";
  try {
    const claims = await conferirIdToken(idToken, bilhete.nonce);
    email = String(claims.email).trim().toLowerCase();
    nome = claims.name || email.split("@")[0];
  } catch {
    return falha("mirai_idtoken");
  }

  // ─── Acha ou cria a conta local pelo e-mail ──────────────────────────────
  let userId: number;
  let userEmail: string;
  let tenantId: string | undefined;

  const existente = getUserByEmail(email) as any;
  if (existente) {
    userId = existente.id;
    userEmail = existente.email;
    tenantId = existente.tenantId ?? existente.tenant_id;
  } else {
    // senha aleatória: a conta nasce sem porta de senha local
    const aleatoria = bcrypt.hashSync(crypto.randomBytes(24).toString("hex"), 10);
    const criado = createUser(nome, email, aleatoria) as any;
    userId = criado.id;
    userEmail = criado.email;
    tenantId = criado.tenantId ?? criado.tenant_id;
  }

  const token = await signToken({ userId, email: userEmail, tenantId });
  const response = NextResponse.redirect(
    destino(bilhete.next || "/dashboard/connect", request.url),
  );
  response.cookies.set("token", token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
  response.cookies.delete("mirai_ticket");
  return response;
}
