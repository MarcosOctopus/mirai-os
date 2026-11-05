import { NextRequest } from "next/server";

import {
  integracoesDoProjeto,
  listarAssets,
  obterProjetoPublicoPorDominio,
  obterProjetoPublicoPorSlug,
  anotarAppDoProjeto,
  type ArquivoProjeto,
  type ProjetoCompleto,
} from "@/lib/arquiteto-projetos";
import { montarPrevia, type Asset } from "@/lib/arquiteto-preview";
import { telaPadrao, marcasDoProjeto } from "@/lib/arquiteto-tela-padrao";
import { lerConstruido, temConstruido } from "@/lib/arquiteto-construido";
import {
  garantirAppNoAr,
  paginaSubindo,
  portaNoAr,
  proxyParaApp,
  tipoLocalDoProjeto,
} from "@/lib/arquiteto-servidor";
import { assinarAsset } from "@/lib/arquiteto-asset-token";
import { sufixoDoAsset } from "@/lib/arquiteto-asset-tipos";
import { emitirTokenPonte } from "@/lib/ponte-token";

export const runtime = "nodejs";
// SEM cache: o site TEM de refletir o projeto atual e MORRER na hora em que o
// dono despublica (a mesma régua do link `/p/<token>`).
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * O SITE DO PROJETO em `<slug>.miraitohope.com/<caminho>` (o middleware reescreve
 * o Host para cá). Quem decide é esta rota: existe um projeto PUBLICADO com este
 * endereço? Então serve. Não existe, ou está despublicado? 404 — nunca
 * "existiu algum dia", nunca outro projeto, nunca vazamento de rascunho.
 *
 * POR QUE É `route.ts` E NÃO `page.tsx` (dono, 16/10/2026). Pedido verbatim:
 * *"rurall ta a mesma coisa. Eu quero eles funcionais. […] uma aplicação
 * completa"*. Um app construído (`vite build`) é um conjunto de ARQUIVOS —
 * `index.html` e `assets/*.js|css` com hash — que só funcionam servidos um a um,
 * com o `Content-Type` certo. Uma página React devolve HTML, não bytes com tipo:
 * o `.js` viraria `text/html` e o navegador recusaria o módulo (tela branca, sem
 * erro). Então aqui há DOIS caminhos:
 *
 *   1. O projeto tem APP CONSTRUÍDO → serve o arquivo pedido, do disco;
 *   2. senão → o site HTML do Arquiteto, como sempre foi (a prévia bundlada
 *      dentro de um iframe de origem opaca — o isolamento não muda).
 */
function acharProjeto(chave: string): { projeto: ProjetoCompleto; donoId: number } | null {
  return chave.includes(".")
    ? obterProjetoPublicoPorDominio(chave)
    : obterProjetoPublicoPorSlug(chave);
}

const baixo = (s: string) => (s || "").toLowerCase();

/** Escapa texto que vai para dentro de um atributo HTML (o título vem do repo). */
function attr(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Qual arquivo do projeto HTML responde por este caminho (null = a raiz). */
function paginaDoCaminho(arquivos: ArquivoProjeto[], caminho: string[]): ArquivoProjeto | null {
  const pedido = caminho.join("/").replace(/\/+$/, "");
  if (!pedido) return null;
  return (
    arquivos.find((a) => baixo(a.nome) === baixo(`${pedido}.html`)) ??
    arquivos.find((a) => baixo(a.nome) === baixo(pedido)) ??
    null
  );
}

/**
 * O site de um projeto HTML do Arquiteto: a prévia bundlada dentro de um iframe
 * `sandbox="allow-scripts"` SEM `allow-same-origin` (origem opaca). É o MESMO
 * isolamento de antes — o código do projeto não enxerga cookie, DOM do app nem
 * rota interna, e as imagens carregam por URL assinada.
 */
function siteDoProjetoHtml(
  projeto: ProjetoCompleto,
  donoId: number,
  arquivos: ArquivoProjeto[],
): string {
  const lista = arquivos.length ? arquivos : projeto.arquivos;
  const baseAssets = `/api/arquiteto/projetos/${encodeURIComponent(projeto.id)}/assets`;
  const assets: Asset[] = (listarAssets(donoId, projeto.id) ?? []).map((a) => ({
    caminho: a.caminho,
    mime: a.mime,
    tamanho: a.tamanho,
    criado_em: a.criado_em,
    url: `${baseAssets}/${sufixoDoAsset(a.caminho)}?t=${assinarAsset(projeto.id, a.caminho, donoId)}`,
  }));

  const usadasPonte = integracoesDoProjeto(projeto.id);
  const tokensPonte: Record<string, string> = {};
  for (const i of usadasPonte) tokensPonte[i] = emitirTokenPonte({ projetoId: projeto.id, integracao: i });

  const previa = montarPrevia(lista, assets, baseAssets, projeto.tokens, {
    comPonte: false,
    ...(usadasPonte.length ? { integracoes: { projetoId: projeto.id, tokens: tokensPonte } } : {}),
  });

  const dentro =
    previa.html ||
    telaPadrao({
      titulo: projeto.titulo,
      arquivos: lista.length,
      marcas: marcasDoProjeto(lista),
    });

  const t = attr(projeto.titulo);
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${t}</title></head>
<body style="margin:0">
<main data-publico-arquiteto data-publico-titulo="${t}" style="position:fixed;inset:0;margin:0;padding:0;background:#ffffff">
<iframe title="${t}" srcdoc="${attr(dentro)}" sandbox="allow-scripts" data-publico-preview style="display:block;width:100%;height:100%;border:0"></iframe>
</main>
</body></html>`;
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string; caminho?: string[] }> },
) {
  const { slug, caminho } = await ctx.params;
  const achado = acharProjeto(slug);
  if (!achado) return new Response("Site não encontrado.", { status: 404 });

  const partes = Array.isArray(caminho) ? caminho : [];

  // ── 0) APP DE SERVIDOR: o processo do cliente, no ar (dono, 16/10/2026) ────
  // *"Eu quero eles funcionais. […] e tem area de login e tudo."* Um app com
  // login/API/banco não tem build estático: é um SERVIDOR que precisa ficar
  // rodando. Aqui a requisição é repassada para o container dele (publicado só
  // na ponte do host). Se ainda não subiu, manda subir e mostra "subindo" —
  // nunca uma tela de erro.
  //
  // Vem ANTES do build de propósito: um projeto pode ter os dois (Next com
  // `start`), e nesse caso quem manda é o servidor.
  const tipo =
    achado.projeto.app_tipo ?? tipoLocalDoProjeto(achado.donoId, achado.projeto.id);
  // Anota o veredito na linha do projeto: assim o resto do app (prévia, tela,
  // listagem) sabe o que este projeto é sem reler o disco a cada request.
  if (tipo && tipo !== achado.projeto.app_tipo) {
    anotarAppDoProjeto(achado.donoId, achado.projeto.id, tipo, achado.projeto.app_porta ?? null);
  }
  if (tipo === "servidor") {
    const porta = await portaNoAr(achado.donoId, achado.projeto.id);
    if (!porta) {
      await garantirAppNoAr(achado.donoId, achado.projeto.id);
      return new Response(paginaSubindo(), {
        status: 503,
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
    const destino = "/" + partes.map((p) => encodeURIComponent(p)).join("/");
    return proxyParaApp(achado.donoId, achado.projeto.id, porta, req, destino);
  }

  // ── 1) APP CONSTRUÍDO: o arquivo pedido, do disco ─────────────────────────
  // Se o projeto TEM build, o build É o site. Nada de cair no site HTML quando o
  // arquivo não está lá: medido, `/mesh2motion.svg` (que o build não gera)
  // escorregava para o caminho antigo e devolvia um ARQUIVO-FONTE do repositório
  // como se fosse página — `text/html` com o conteúdo errado. Com build, o que
  // não está no build é 404 de verdade.
  const temBuild = temConstruido(achado.donoId, achado.projeto.id);
  if (temBuild) {
    const arq = lerConstruido(achado.donoId, achado.projeto.id, partes);
    if (!arq) return new Response("Arquivo não encontrado.", { status: 404 });
    return new Response(new Uint8Array(arq.bytes), {
      headers: {
        "Content-Type": arq.mime,
        "Content-Length": String(arq.bytes.length),
        // O app é público (é um site), mas muda a cada build: cache curto.
        "Cache-Control": "public, max-age=60",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  // ── 2) SITE HTML DO ARQUITETO (como sempre foi) ───────────────────────────
  let arquivos = achado.projeto.arquivos;
  if (partes.length) {
    const alvo = paginaDoCaminho(arquivos, partes);
    if (!alvo) return new Response("Página não encontrada.", { status: 404 });
    arquivos = [
      { nome: "index.html", conteudo: alvo.conteudo },
      ...arquivos.filter((a) => a.nome !== alvo.nome),
    ];
  }

  const html = siteDoProjetoHtml(achado.projeto, achado.donoId, arquivos);
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
