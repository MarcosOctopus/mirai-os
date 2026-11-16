import { NextRequest, NextResponse } from "next/server";

import { basePublica } from "@/lib/base-publica";
import { lerCofre, gravarCofre } from "@/lib/cofre-escopo";
import { resolverEscopo } from "@/lib/escopos";
import { contaPorId } from "@/lib/orgs";
import { emailDoToken, lerBilhete, trocarCodigoPorToken, urlDeVolta } from "@/lib/google-oauth";
import { cifrar } from "@/lib/segredo-guardado";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/oauth/google/volta — retorno do consentimento do Google.
 *
 * Ordem (e o porquê de cada passo):
 *   1. confere o `state` do bilhete ASSINADO — sem isso qualquer um planta um
 *      `code` nosso na URL (CSRF clássico de OAuth);
 *   2. troca o `code` por token (com client_secret, no servidor — nunca no front);
 *   3. descobre o EMAIL de quem conectou (a tela mostra "conectado como …");
 *   4. guarda TUDO CIFRADO, inclusive o `refresh_token`. Sem o refresh, a conexão
 *      morre em 1h e a tela continua dizendo "conectado" — defeito já medido;
 *   5. devolve a pessoa para o Synapse com o resultado na URL.
 *
 * Pública de propósito (é o Google que volta, sem cookie de sessão): quem
 * autoriza é o bilhete assinado.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const recusa = url.searchParams.get("error");

  const bilhete = lerBilhete(req.cookies.get("g_bilhete")?.value);
  const destino = (marca: string) => {
    const base = bilhete?.volta && bilhete.volta.startsWith("/") ? bilhete.volta : "/dashboard/connect";
    const r = NextResponse.redirect(`${basePublica(req)}${base}?google=${marca}`);
    r.cookies.set("g_bilhete", "", { path: "/", maxAge: 0 });
    return r;
  };

  if (recusa) return destino("recusado");
  if (!bilhete || !code || bilhete.state !== state || !bilhete.userId) return destino("falhou");

  const troca = await trocarCodigoPorToken(code, urlDeVolta(req));
  if (!troca.ok || !troca.token) return destino("falhou");

  const email = await emailDoToken(troca.token);
  const pacote = JSON.stringify({
    access_token: troca.token,
    refresh_token: troca.refreshToken || null,
    expira_em: troca.expiraEm || null,
    email,
    conectado_em: new Date().toISOString(),
  });

  // FORMATO IMPORTA: o leitor do cofre (entrada → estaLigada) só reconhece
  // OBJETO — `v && typeof v === "object" ? v : null`. Gravar a string cifrada
  // direto fazia a chave existir e o card continuar dizendo "não conectada"
  // (defeito medido em 12/11/2026). O segredo vai no campo `blob`, cifrado; o
  // resto fica legível porque a tela precisa dele (email, data).
  /* MULTI-CONTA: a pessoa pode ter pessoal, empresa e cliente. Grava DENTRO da
     lista do ESCOPO, preservando as outras caixas — sobrescrever apagaria a
     anterior.
     
     ESCOPO (13/11/2026): o escopo vem do bilhete ASSINADO (`orgId`), nunca da
     URL de volta. Pessoal (`pessoal-<id>`) quando o bilhete não traz
     organização; a da empresa só quando foi ela que iniciou o fluxo e quem
     autorizou é membro dela (`contaPorId` + `resolverEscopo`). */
  const conta = contaPorId(bilhete.userId);
  const escopo = resolverEscopo(
    conta ?? { id: bilhete.userId },
    bilhete.orgId ?? null,
  );
  const cfg = lerCofre(escopo);
  const atuais = Array.isArray(cfg?.google_emails) ? (cfg.google_emails as Record<string, unknown>[]) : [];
  const base = [...atuais];
  const legado = cfg?.google_email as Record<string, unknown> | undefined;
  if (legado && typeof legado === "object" && typeof legado.blob === "string" && legado.blob) {
    const e = String(legado.email || "");
    if (!base.some((c) => String(c.email || "").toLowerCase() === e.toLowerCase())) base.push(legado);
  }
  const semEsta = base.filter((c) => String(c.email || "").toLowerCase() !== email.toLowerCase());
  gravarCofre(escopo, {
    google_emails: [
      { blob: cifrar(pacote), email, rotulo: email, connected_at: new Date().toISOString() },
      ...semEsta,
    ],
  });

  return destino("conectado");
}
