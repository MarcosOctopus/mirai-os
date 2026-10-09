import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { obterProjetoPublicoPorSlug, obterProjetoPublicoPorDominio, type ArquivoProjeto } from "@/lib/arquiteto-projetos";
import { ProjetoPublico } from "@/components/arquiteto/ProjetoPublico";
import { enderecoDoSlug } from "@/lib/dominio-projetos";

export const runtime = "nodejs";
// SEM cache: o site TEM de refletir o projeto atual e MORRER na hora em que o
// dono despublica (a mesma régua do link `/p/<token>`).
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * A CHAVE da rota é o que veio no Host, reescrito pelo middleware: pode ser o
 * ENDEREÇO automático (`prova-caixa`) ou um DOMÍNIO PRÓPRIO já conectado
 * (`minhaloja.com.br` — tem ponto). Um `includes(".")` decide qual tabela olhar;
 * as duas exigem projeto PUBLICADO.
 */
function acharProjeto(chave: string) {
  return chave.includes(".")
    ? obterProjetoPublicoPorDominio(chave)
    : obterProjetoPublicoPorSlug(chave);
}

/**
 * O SITE DO PROJETO no endereço dele — `<slug>.miraitohope.com/<caminho>`.
 *
 * Quem chega aqui veio pelo middleware, que reescreveu o Host para `/d/<slug>`.
 * Esta rota (Node, com banco) é QUEM DECIDE: existe um projeto PUBLICADO com
 * este endereço? Então renderiza. Não existe, ou está despublicado? `notFound()`
 * — nunca "existiu algum dia", nunca outro projeto, nunca vazamento de rascunho.
 *
 * Sem sessão, sem cookie: site publicado é público. E o projeto em si roda
 * isolado (ver `ProjetoPublico`).
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; caminho?: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const achado = acharProjeto(slug);
  if (!achado) return { title: "Site não encontrado", robots: { index: false, follow: false } };
  // Site de verdade, em endereço de verdade: PODE ser indexado (diferente do
  // link com token, que é segredo e continua `noindex`).
  return {
    title: achado.projeto.titulo,
    description: slug.includes(".") ? `Publicado em ${slug}` : `Publicado em ${enderecoDoSlug(slug)}`,
  };
}

const baixo = (s: string) => (s || "").toLowerCase();

/**
 * Qual arquivo do projeto responde por este caminho.
 * `""` (raiz) → `null`, e aí o bundler usa a entrada natural (`index.html`).
 * `/sobre` → `sobre.html`, senão o arquivo `sobre` exato. Não achou → `null` =
 * 404 na cara (nada de servir a home fingindo que era a página pedida).
 */
function paginaDoCaminho(arquivos: ArquivoProjeto[], caminho: string[]): ArquivoProjeto | null {
  const pedido = caminho.join("/").replace(/\/+$/, "");
  if (!pedido) return null;
  return (
    arquivos.find((a) => baixo(a.nome) === baixo(`${pedido}.html`)) ??
    arquivos.find((a) => baixo(a.nome) === baixo(pedido)) ??
    null
  );
}

export default async function SiteDoProjeto({
  params,
}: {
  params: Promise<{ slug: string; caminho?: string[] }>;
}) {
  const { slug, caminho } = await params;
  const achado = acharProjeto(slug);
  if (!achado) notFound();

  const partes = Array.isArray(caminho) ? caminho : [];
  let arquivos = achado.projeto.arquivos;

  if (partes.length) {
    const alvo = paginaDoCaminho(arquivos, partes);
    if (!alvo) notFound();
    // O bundler escolhe a entrada por NOME (`index.html`), então a página pedida
    // entra no lugar do index — o resto do projeto (CSS/JS) continua o mesmo.
    arquivos = [
      { nome: "index.html", conteudo: alvo.conteudo },
      ...arquivos.filter((a) => a.nome !== alvo.nome),
    ];
  }

  return <ProjetoPublico projeto={achado.projeto} donoId={achado.donoId} arquivos={arquivos} />;
}
