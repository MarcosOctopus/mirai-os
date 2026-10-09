import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { obterProjetoPublico } from "@/lib/arquiteto-projetos";
import { ProjetoPublico } from "@/components/arquiteto/ProjetoPublico";

export const runtime = "nodejs";
// SEM cache: o link TEM de refletir o estado atual do projeto e MORRER na hora
// em que o dono despublica.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * A PÁGINA PÚBLICA do projeto — `/p/<token>`. SEM SESSÃO, SEM COOKIE.
 *
 * O QUE ELA É: uma página magra que resolve o token → projeto PUBLICADO e
 * renderiza SÓ o conteúdo dele (o HTML do projeto com o CSS/JS embutidos),
 * dentro de um iframe `sandbox="allow-scripts"` — SEM `allow-same-origin`. É a
 * MESMA técnica e o MESMO bundler da bancada do Arquiteto (a origem do iframe é
 * OPACA: o código do projeto NÃO enxerga o cookie de sessão, o DOM do app, o
 * localStorage nem qualquer rota interna; e o cookie SameSite=Lax não viaja nas
 * requisições que saem de dentro do sandbox).
 *
 * O QUE ELA NÃO É: não há menu, não há workspace, não há chat, não há lista de
 * projetos, não há como alcançar outro projeto nem outra conta. As IMAGENS do
 * projeto carregam por URLs ASSINADAS (projeto+caminho+dono) — a rota de bytes
 * NÃO foi aberta: quem não traz o token assinado continua precisando de sessão.
 *
 * Token inválido, inexistente ou de projeto DESPUBLICADO → 404. Nunca "existiu
 * algum dia", nunca outro projeto.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const achado = obterProjetoPublico(token);
  if (!achado) return { title: "Página não encontrada", robots: { index: false, follow: false } };
  return {
    title: achado.projeto.titulo,
    robots: { index: false, follow: false },
  };
}

export default async function PaginaPublica({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const achado = obterProjetoPublico(token);
  if (!achado) notFound();

  return <ProjetoPublico projeto={achado.projeto} donoId={achado.donoId} />;
}
