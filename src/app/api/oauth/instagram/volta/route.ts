import { NextRequest, NextResponse } from "next/server";

import { basePublica } from "@/lib/base-publica";
import { gravarCofre, lerCofre } from "@/lib/cofre-escopo";
import { resolverEscopo } from "@/lib/escopos";
import { contasDoCodigo, lerBilhete, urlDeVolta } from "@/lib/instagram-oauth";
import { contaPorId } from "@/lib/orgs";
import { cifrar } from "@/lib/segredo-guardado";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/oauth/instagram/volta — retorno do consentimento do Facebook.
 *
 * Ordem, e o porquê de cada passo:
 *   1. confere o `state` do bilhete ASSINADO (CSRF clássico de OAuth: sem isso
 *      qualquer um planta um `code` nosso na URL);
 *   2. troca o `code` por token, alonga o token e lista as contas profissionais
 *      alcançadas — tudo no servidor, com o segredo do app;
 *   3. grava no cofre do ESCOPO de quem autorizou, com o token CIFRADO;
 *   4. MULTI-CONTA: a pessoa pode ter mais de uma conta. Cada uma entra como uma
 *      entrada da lista, com o próprio blob; conectar a segunda não apaga a
 *      primeira (mesmo defeito já corrigido no Gmail).
 *
 * Pública de propósito (é o Facebook que volta, sem cookie de sessão): quem
 * autoriza é o bilhete assinado.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const recusa = url.searchParams.get("error") || url.searchParams.get("error_code");

  const bilhete = lerBilhete(req.cookies.get("ig_bilhete")?.value);
  const destino = (marca: string) => {
    const base = bilhete?.volta && bilhete.volta.startsWith("/") ? bilhete.volta : "/dashboard/connect";
    const r = NextResponse.redirect(`${basePublica(req)}${base}?instagram=${marca}`);
    r.cookies.set("ig_bilhete", "", { path: "/", maxAge: 0 });
    return r;
  };

  if (recusa) return destino("recusado");
  if (!bilhete || !code || bilhete.state !== state || !bilhete.userId) return destino("falhou");

  const t = await contasDoCodigo(code, urlDeVolta(req));
  if (!t.ok || !t.contas?.length) return destino("sem_conta");

  const conta = contaPorId(bilhete.userId);
  const escopo = resolverEscopo(conta ?? { id: bilhete.userId }, bilhete.orgId ?? null);

  const cfg = lerCofre(escopo);
  const anterior = cfg?.instagram as Record<string, unknown> | undefined;
  const listaAnterior: Record<string, unknown>[] = Array.isArray(anterior?.contas)
    ? (anterior?.contas as Record<string, unknown>[])
    : [];

  const agora = new Date().toISOString();
  const novas = t.contas.map((c) => ({
    ig_id: c.ig_id,
    ig_usuario: c.ig_usuario,
    page_id: c.page_id,
    page_nome: c.page_nome,
    /* O SEGREDO VAI NO CAMPO `blob`: o resto fica legível porque a tela precisa
       dele (nome da conta, data). Mesmo formato do Gmail, pela mesma razão: o
       leitor do cofre só reconhece OBJETO, e gravar texto solto fazia o card
       continuar dizendo "não conectada" com o token gravado. */
    blob: cifrar(
      JSON.stringify({
        token: c.token,
        page_id: c.page_id,
        ig_id: c.ig_id,
        ig_usuario: c.ig_usuario,
        conectado_em: agora,
      }),
    ),
    connected_at: agora,
  }));

  // Preserva as contas anteriores que não vieram agora (a pessoa pode ter
  // conectado outra conta numa sessão anterior).
  const ids = new Set(novas.map((n) => n.ig_id));
  const mantidas = listaAnterior.filter((a) => !ids.has(String(a.ig_id || "")));
  const todas = [...novas, ...mantidas];

  gravarCofre(escopo, {
    instagram: {
      contas: todas,
      total: todas.length,
      rotulo: todas
        .map((c) => (c.ig_usuario ? `@${c.ig_usuario}` : c.page_nome))
        .join(", ")
        .slice(0, 160),
      connected_at: agora,
    },
  });

  return destino("conectado");
}