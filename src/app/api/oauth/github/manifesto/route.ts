import { NextRequest, NextResponse } from "next/server";

import { bilheteDoManifesto, manifesto } from "@/lib/github-app";
import { exigirConta } from "@/lib/orgs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Escapa um texto para entrar com segurança no atributo `value` de um input. */
function atributo(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * /api/oauth/github/manifesto — o PRIMEIRO passo do FLUXO DE MANIFESTO.
 *
 * Exige sessão (mesmo padrão de `exigirConta` das rotas existentes): só quem
 * está logado dispara a criação do app. O que devolvemos NÃO é um JSON solto —
 * é uma página mínima que se AUTO-ENVIA (form method=post) para o GitHub, com o
 * manifesto no campo `manifest` e o `state` ASSINADO (bilhete) na URL. O dono
 * cai na tela do GitHub e clica UMA vez em "Create GitHub App"; o GitHub cria o
 * app e devolve o `code` ao nosso `redirect_url`.
 *
 * O manifesto NÃO contém segredo nenhum — só nome, endereços e permissões.
 */
export async function GET(req: NextRequest) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  const bilhete = bilheteDoManifesto();
  const json = JSON.stringify(manifesto(req));
  const acao = `https://github.com/settings/apps/new?state=${encodeURIComponent(bilhete)}`;

  // `noscript` dá um botão de continuar para quem tem JS desligado; com JS, o
  // formulário se envia sozinho — é o clique único do dono.
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mirai OS — criando o app no GitHub…</title>
</head>
<body>
<p>Levando você ao GitHub para criar o app do Mirai OS…</p>
<form id="manifesto" method="post" action="${atributo(acao)}">
  <input type="hidden" name="manifest" value="${atributo(json)}">
  <noscript><button type="submit">Continuar no GitHub</button></noscript>
</form>
<script>document.getElementById("manifesto").submit();</script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
