import { NextRequest } from "next/server";

import { exigirConta } from "@/lib/orgs";
import { listarAssets, obterProjeto, anotarAppDoProjeto } from "@/lib/arquiteto-projetos";
import { montarPrevia, type Asset } from "@/lib/arquiteto-preview";
import { telaPadrao, marcasDoProjeto } from "@/lib/arquiteto-tela-padrao";
import { listarWorkspace } from "@/lib/arquiteto-workspace";
import { lerConstruido, temConstruido } from "@/lib/arquiteto-construido";
import {
  garantirAppNoAr,
  paginaSubindo,
  portaNoAr,
  tipoLocalDoProjeto,
} from "@/lib/arquiteto-servidor";
import { IP_DO_APP } from "@/lib/runner";
import { assinarAsset } from "@/lib/arquiteto-asset-token";
import { sufixoDoAsset } from "@/lib/arquiteto-asset-tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/arquiteto/projetos/[id]/previa — o HTML MONTADO do projeto, para a
 * MINIATURA do portfólio (a "imagem destacada" da página de Projetos).
 *
 * Por que existe: o card do portfólio mostra o projeto VIVO (não um screenshot
 * guardado que envelhece). O grid põe esta rota num `<iframe>` escalado — a
 * miniatura é sempre o estado ATUAL do projeto.
 *
 * Escopo e posse: só o DONO (sessão). A prévia é servida como `text/html` e o
 * iframe que a consome roda em `sandbox="allow-scripts"` SEM `allow-same-origin`
 * (origem opaca) — o código do projeto não enxerga cookie, DOM do app nem rota
 * interna. As imagens carregam por URL assinada, como na página publicada.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  const { id } = await ctx.params;
  const projeto = obterProjeto(g.conta.id, id);
  if (!projeto) return new Response("Projeto não encontrado.", { status: 404 });

  const baseAssets = `/api/arquiteto/projetos/${encodeURIComponent(projeto.id)}/assets`;
  const assets: Asset[] = (listarAssets(g.conta.id, projeto.id) ?? []).map((a) => ({
    caminho: a.caminho,
    mime: a.mime,
    tamanho: a.tamanho,
    criado_em: a.criado_em,
    url: `${baseAssets}/${sufixoDoAsset(a.caminho)}?t=${assinarAsset(projeto.id, a.caminho, g.conta.id)}`,
  }));

  const previa = montarPrevia(projeto.arquivos, assets, baseAssets, projeto.tokens, { comPonte: false });
  // Sem página = TELA PADRÃO, nunca um arquivo aleatório (dono, 16/10/2026).
  // Antes, um repositório importado caía em `arquivos[0]` e a miniatura mostrava
  // um pedaço de JSON. A tela padrão diz o que o projeto é.
  //
  // O retrato vem do BANCO, mas cai no DISCO quando o banco está vazio: projeto
  // importado antes de 16/10/2026 tem os arquivos só no workspace (medido: o
  // `justy`, 1.091 no disco e 0 no banco) — sem este fallback a tela diria
  // "0 arquivos", que é tão errado quanto a página aleatória que ela substitui.
  const doBanco = projeto.arquivos.map((a) => a.nome);
  const nomes = doBanco.length ? doBanco : listarWorkspace(g.conta.id, projeto.id);

  // APP CONSTRUÍDO PRIMEIRO (dono, 16/10/2026): *"Eu quero eles funcionais."*
  // Quando o projeto tem build de verdade (`dist/index.html`), a prévia É o app
  // rodando. Isto vem ANTES de `previa.html` por medição: o construtor tinha
  // escrito uma página-guia na RAIZ do projeto (`index.html` = "Mesh2Motion — o
  // motor, em uma página"), e o `montarPrevia` bundlava ELA — a prévia mostrava
  // uma página SOBRE o app enquanto o app estava construído e no ar. Mesma regra
  // da rota pública: se o projeto TEM build, o build É o site.
  //
  // O `<base>` aponta para a rota que serve os arquivos do build: dentro de
  // `srcdoc` o `./assets/...` do index.html não teria raiz para resolver, e o app
  // abriria em branco.
  const slug = (projeto as { slug?: string | null }).slug || null;
  if (slug && temConstruido(g.conta.id, projeto.id)) {
    const idx = lerConstruido(g.conta.id, projeto.id, ["index.html"]);
    if (idx && /^text\/html/i.test(idx.mime)) {
      const base = `<base href="/d/${encodeURIComponent(slug)}/">`;
      const bruto = idx.bytes.toString("utf8");
      const comBase = /<head[^>]*>/i.test(bruto)
        ? bruto.replace(/<head[^>]*>/i, (m) => `${m}${base}`)
        : `${base}${bruto}`;
      return new Response(comBase, {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
  }

  // APP DE SERVIDOR (dono, 16/10/2026): o projeto com login/API não tem build —
  // é um processo. A prévia busca a página dele NO PROXY e injeta o `<base>`
  // (dentro de `srcdoc`, o caminho relativo do app não teria raiz). Se ainda não
  // subiu, mostra "subindo" em vez de "isto é código".
  const tipo = projeto.app_tipo ?? tipoLocalDoProjeto(g.conta.id, projeto.id);
  if (tipo === "servidor") {
    if (tipo !== projeto.app_tipo) {
      anotarAppDoProjeto(g.conta.id, projeto.id, tipo, projeto.app_porta ?? null);
    }
    const porta = await portaNoAr(g.conta.id, projeto.id);
    if (porta) {
      try {
        const r = await fetch(`http://${IP_DO_APP}:${porta}/`, {
          headers: { accept: "text/html" },
          signal: AbortSignal.timeout(15_000),
          cache: "no-store",
        });
        const bruto = await r.text();
        const base = `<base href="/d/${encodeURIComponent(slug || "")}/">`;
        const comBase = /<head[^>]*>/i.test(bruto)
          ? bruto.replace(/<head[^>]*>/i, (m) => `${m}${base}`)
          : `${base}${bruto}`;
        return new Response(comBase, {
          headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
        });
      } catch {
        /* cai no "subindo" abaixo */
      }
    }
    // ANTES DE DIZER "SUBINDO", CONFIRA SE ALGUÉM MANDOU SUBIR (dono, 19/10/2026).
    // Medido: projeto de servidor importado e NUNCA publicado mostrava
    // "Aplicação subindo…" — e não havia nada subindo. Pior: esta rota chamava
    // `garantirAppNoAr`, ou seja, ABRIR A PRÉVIA disparava uma subida que o dono
    // não pediu. Nada subindo + tela prometendo subida = espera infinita.
    const publicado = Boolean(projeto.publicado_em);
    if (!publicado) {
      const endereco = slug ? `${slug}.miraitohope.com` : null;
      return new Response(
        telaPadrao({
          titulo: projeto.titulo || "Projeto",
          arquivos: projeto.arquivos.length,
          marcas: marcasDoProjeto(projeto.arquivos),
          deFora: (projeto as { origem?: string }).origem === "git",
          aviso: "Este app ainda não foi publicado. Clique em Publicar para ele ir ao ar em",
          endereco,
        }),
        {
          headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
        },
      );
    }
    await garantirAppNoAr(g.conta.id, projeto.id);
    return new Response(paginaSubindo(), {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const html =
    previa.html ||
    telaPadrao({
      titulo: projeto.titulo,
      arquivos: nomes.length,
      marcas: marcasDoProjeto(nomes.map((nome: string) => ({ nome }))),
      deFora: (projeto as { origem?: string }).origem === "git" ||
        (projeto as { origem?: string }).origem === "servidor",
      repositorio: /^[\w.-]+\/[\w.-]+$/.test(projeto.titulo)
        ? `https://github.com/${projeto.titulo}`
        : null,
    });

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
