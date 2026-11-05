import { NextRequest, NextResponse } from "next/server";

import { exigirConta } from "@/lib/orgs";
import { publicarProjeto, despublicarProjeto, garantirSlug, obterProjeto, anotarAppDoProjeto, podePublicarMaisUmApp } from "@/lib/arquiteto-projetos";
import { basePublica } from "@/lib/base-publica";
import { enderecoDoSlug } from "@/lib/dominio-projetos";
import { comecarNoRunner, runnerConfigurado } from "@/lib/runner";
import { esquecerEstadoDoApp } from "@/lib/arquiteto-servidor";
import { temConstruido } from "@/lib/arquiteto-construido";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/arquiteto/projetos/[id]/publicar — o estado de PUBLICAÇÃO do projeto.
 *
 * Escopo SEMPRE pelo `user_id` da sessão (a mesma guarda do resto do app): só o
 * dono do projeto publica/despublica, e projeto de outra conta responde 404 —
 * nunca "existe, mas não é seu".
 *
 *   POST   → publica (ou republica o mesmo link). Devolve o token e a URL
 *            pública montada com o endereço público do app.
 *            { ok, publicado_em, token, url } | 404
 *   DELETE → despublica. O link `/p/<token>` para de funcionar na hora.
 *            { ok:true } | 404
 *
 * O TOKEN nasce no SERVIDOR (ver `publicarProjeto`) e é imprevisível. Ele NUNCA é
 * logado nem impresso. A PORTEIRA do Arquiteto (`mirai.arquiteto.construir`)
 * continua exatamente onde nasceu — /gerar e /capacidade; aqui só se liga/desliga
 * o link do que a própria conta já construiu.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  const { id } = await ctx.params;

  // TETO DE APPS NO AR POR CONTA (19/10/2026). Medido: `acessos_simultaneos` do
  // plano existia e não era aplicado em lugar nenhum. Aqui é o único ponto que
  // importa: PUBLICAR um app de servidor novo. Republicar o que já está no ar
  // passa direto (senão o próprio projeto bloquearia a si mesmo), e app estático
  // não conta — ele não ocupa container.
  const antes = obterProjeto(g.conta.id, id);
  if (!antes) return NextResponse.json({ erro: "Projeto não encontrado." }, { status: 404 });
  const ehAppAntes = antes.arquivos.some((a) => a.nome.toLowerCase() === "package.json");
  if (ehAppAntes && !antes.publicado_em) {
    const pode = await podePublicarMaisUmApp(g.conta.id, id);
    if (!pode.ok) {
      // 409 com o caminho, nunca "erro" seco: o cliente sabe o que fazer.
      return NextResponse.json({ ok: false, erro: pode.erro, limite_apps: true }, { status: 409 });
    }
  }

  const r = publicarProjeto(g.conta.id, id);
  if (!r) return NextResponse.json({ erro: "Projeto não encontrado." }, { status: 404 });

  // O ENDEREÇO nasce junto com a publicação (dono, 09/10/2026 — "conexão
  // automática com domínio"): se o projeto ainda não tem nome próprio, ganha um
  // tirado do título. Trocar ou tirar depois é na rota /endereco.
  const slug = garantirSlug(g.conta.id, id);

  // PUBLICAR UM APP IMPORTADO CONSTRÓI ELE (dono, 16/10/2026). Pedido verbatim:
  // *"rurall ta a mesma coisa. Eu quero eles funcionais. […] uma aplicação
  // completa"*. Um repositório com `package.json` é uma APLICAÇÃO: publicado sem
  // build, o endereço mostrava a tela de "isto é código". Aqui o app é construído
  // (instala se faltar + builda) e o endereço passa a servir o app de verdade.
  //
  // NÃO bloqueia a resposta: o runner roda em segundo plano e a tela mostra
  // "construindo". Construir pode levar minutos — segurar a resposta seria pior
  // que dizer a verdade.
  let construindo = false;
  let app = temConstruido(g.conta.id, id);
  const projeto = obterProjeto(g.conta.id, id);
  const ehApp = !!projeto?.arquivos.some((a) => a.nome.toLowerCase() === "package.json");
  if (ehApp && runnerConfigurado()) {
    const r = await comecarNoRunner(g.conta.id, id, "preparar");
    // 409 = já existe execução em curso; não é erro, é "já está indo".
    construindo = r.ok || /já existe uma execução/i.test(r.erro || "");
  }

  return NextResponse.json({
    ok: true,
    publicado_em: r.publicado_em,
    token: r.token,
    url: `${basePublica(req)}/p/${r.token}`,
    slug,
    endereco: slug ? enderecoDoSlug(slug) : null,
    // O estado do APP no endereço: `app` = já há build servido; `construindo` =
    // começou agora. Quem mostra é a tela.
    app,
    construindo,
  });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  const { id } = await ctx.params;
  const ok = despublicarProjeto(g.conta.id, id);
  if (!ok) return NextResponse.json({ erro: "Projeto não encontrado." }, { status: 404 });

  // DESPUBLICAR DERRUBA O APP DE SERVIDOR (dono, 16/10/2026). Sem isto, tirar o
  // site do ar deixaria o processo do cliente RODANDO para sempre — gastando
  // memória e CPU de um app que ninguém alcança. Desligar é parte de despublicar.
  if (runnerConfigurado()) {
    const tipo = obterProjeto(g.conta.id, id)?.app_tipo;
    if (tipo === "servidor") {
      esquecerEstadoDoApp(g.conta.id, id);
      await comecarNoRunner(g.conta.id, id, "derrubar");
      anotarAppDoProjeto(g.conta.id, id, "servidor", null);
    }
  }

  return NextResponse.json({ ok: true });
}
