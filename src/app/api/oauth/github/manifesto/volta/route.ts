import { NextRequest, NextResponse } from "next/server";

import { basePublica } from "@/lib/base-publica";
import { converterManifesto, lerBilheteDoManifesto } from "@/lib/github-app";
import { guardarConfig } from "@/lib/plataforma-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/oauth/github/manifesto/volta — o retorno do FLUXO DE MANIFESTO.
 *
 * O GitHub devolve `?code=…&state=…` aqui depois de criar o app. Ordem do que
 * acontece, e por quê:
 *   1. confere o `state` (o bilhete ASSINADO que emitimos): sem a assinatura,
 *      qualquer um poderia plantar um `code` nosso — CSRF clássico;
 *   2. troca o `code` pelos dados do app (`converterManifesto`) — inclusive a
 *      CHAVE PRIVADA (`pem`) e o `client_secret`;
 *   3. guarda TUDO CIFRADO (`plataforma-config.ts`): é config da PLATAFORMA, não
 *      de um projeto. Nada de segredo em claro no banco nem em log;
 *   4. volta para o painel com o resultado na URL.
 *
 * Rota pública no middleware (o navegador sai do nosso site e volta): quem
 * autoriza é o bilhete assinado, não uma sessão de login.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const destino = (marca: string) =>
    NextResponse.redirect(`${basePublica(req)}/arquiteto?github=${marca}`);

  if (url.searchParams.get("error")) return destino("falhou");
  if (!code) return destino("falhou");

  const bilhete = lerBilheteDoManifesto(state);
  if (!bilhete) return destino("falhou");

  const app = await converterManifesto(code);
  if (!app.ok) return destino("falhou");

  // Config GLOBAL da plataforma, CIFRADA. O `pem` e o `client_secret` são
  // segredos de verdade — nunca são impressos; só passam por aqui e viram blob.
  guardarConfig("github_app_id", app.id);
  guardarConfig("github_app_slug", app.slug);
  guardarConfig("github_app_client_id", app.client_id);
  guardarConfig("github_app_client_secret", app.client_secret);
  guardarConfig("github_app_pem", app.pem);

  return destino("app-criado");
}
