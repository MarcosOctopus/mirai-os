import { NextRequest, NextResponse } from "next/server";

import { basePublica } from "@/lib/base-publica";
import { contaDaRequisicao } from "@/lib/orgs";
import { guardarConfig } from "@/lib/plataforma-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/oauth/github/instalado — o retorno da INSTALAÇÃO do app.
 *
 * Depois que o app existe, o dono instala ele num repositório (permissões
 * finas: escolhe QUAL repositório). O GitHub manda `?installation_id=…&
 * setup_action=…` para cá. Confere a sessão (só o dono logado grava isso) e
 * guarda o `installation_id` CIFRADO — é ele que, junto do `pem`, gera o token
 * de instalação na hora de agir no repositório.
 *
 * Rota pública no middleware; quem autoriza é a SESSÃO conferida AQUI. Falha
 * sempre vira redirect (nunca JSON solto).
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const destino = (marca: string) =>
    NextResponse.redirect(`${basePublica(req)}/arquiteto?github=${marca}`);

  const conta = await contaDaRequisicao(req);
  if (!conta) return destino("falhou");

  const installationId = url.searchParams.get("installation_id") || "";
  if (!installationId) return destino("falhou");

  guardarConfig("github_app_installation_id", installationId);
  return destino("instalado");
}
