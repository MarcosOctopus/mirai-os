import { NextRequest, NextResponse } from "next/server";

import { basePublica } from "@/lib/base-publica";
import { lerCofre, gravarCofre } from "@/lib/cofre-escopo";
import { resolverEscopo } from "@/lib/escopos";
import { contaPorId } from "@/lib/orgs";
import { cifrar } from "@/lib/segredo-guardado";
import {
  emailDoToken,
  lerBilhete,
  trocarCodigoPorToken,
  urlDeVoltaDrive,
} from "@/lib/gdrive-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/oauth/gdrive/volta — retorno do consentimento do Drive.
 *
 * Público de propósito (quem volta é o Google, sem cookie de sessão): a autorização é o bilhete
 * ASSINADO, não a sessão.
 *
 * Guarda, por espaço (pessoal ou organização) e por email, um item na lista `google_drive` do
 * cofre daquele escopo:
 *   { blob: cifrado({refresh_token, email, conectado_em}), email, rotulo, connected_at }
 *
 * Por que o refresh token e não o access: o access morre em 1h e a fonte viva roda a cada 3h —
 * sem refresh ela morreria dizendo "conectado". Já medido no fluxo do Gmail (12/11/2026).
 *
 * Grava DENTRO da lista, preservando as outras conexões: sobrescrever apagaria o Drive de outro
 * email da mesma pessoa (multi-conta é caso normal aqui).
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const recusa = url.searchParams.get("error");

  const bilhete = lerBilhete(req.cookies.get("gd_bilhete")?.value);
  const destino = (marca: string) => {
    const base = bilhete?.volta && bilhete.volta.startsWith("/") ? bilhete.volta : "/dashboard/arca";
    const junta = base.includes("?") ? "&" : "?";
    const r = NextResponse.redirect(`${basePublica(req)}${base}${junta}gdrive=${marca}`);
    r.cookies.set("gd_bilhete", "", { path: "/", maxAge: 0 });
    return r;
  };

  if (recusa) return destino("recusado");
  if (!bilhete || !code || bilhete.state !== state || !bilhete.userId) return destino("falhou");

  const troca = await trocarCodigoPorToken(code, urlDeVoltaDrive(req));
  if (!troca.ok || !troca.token) return destino("falhou");
  // Sem refresh token a fonte não se sustenta sozinha — melhor falhar na hora, com recado claro,
  // do que gravar uma conexão que morre em uma hora.
  if (!troca.refreshToken) return destino("sem-refresh");

  const email = (await emailDoToken(troca.token)) || "";
  const pacote = JSON.stringify({
    refresh_token: troca.refreshToken,
    email,
    conectado_em: new Date().toISOString(),
  });

  const conta = contaPorId(bilhete.userId);
  const escopo = resolverEscopo(conta ?? { id: bilhete.userId }, bilhete.orgId ?? null);
  const cfg = lerCofre(escopo);
  const atuais = Array.isArray(cfg?.google_drive)
    ? (cfg.google_drive as Record<string, unknown>[])
    : [];
  const semEsta = atuais.filter(
    (c) => String(c.email || "").toLowerCase() !== email.toLowerCase(),
  );
  gravarCofre(escopo, {
    google_drive: [
      {
        blob: cifrar(pacote),
        email,
        rotulo: email,
        connected_at: new Date().toISOString(),
        // Estado da fonte (delta, contadores). Começa vazio: a primeira rodada traz tudo.
        estado: {},
      },
      ...semEsta,
    ],
  });

  return destino("conectado");
}
