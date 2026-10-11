import { NextRequest, NextResponse } from "next/server";

import { exigirConta } from "@/lib/orgs";
import {
  definirPastaDoProjeto,
  listarProjetos,
  salvarProjeto,
  tituloDoPedido,
  type ArquivoProjeto,
} from "@/lib/arquiteto-projetos";
import { normalizarTokens, type Tokens } from "@/lib/arquiteto-tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/arquiteto/projetos — os projetos do Arquiteto da CONTA logada.
 *
 * A sessão é resolvida pela mesma guarda do resto do app (`exigirConta`) e o
 * ESCOPO é sempre o `user_id` da sessão: a lista é da pessoa e um projeto de
 * outra conta nunca é achado. Não há parâmetro de usuário — não dá para pedir
 * o projeto de outro.
 *
 * A PORTEIRA do Arquiteto (capacidade de risco alto `mirai.arquiteto.construir`)
 * continua exatamente onde nasceu: no /api/arquiteto/gerar e no
 * /api/arquiteto/capacidade. Aqui só se guarda/restaura o que a própria conta
 * já construiu — nada é gerado por esta rota.
 *
 *   GET  → { projetos: [ {id, titulo, criado_em, atualizado_em}, ... ] }
 *   POST → cria (sem `projetoId`) ou atualiza (`projetoId`) — upsert com os
 *          arquivos INTEIROS. { projeto: {...com arquivos} } | 404 se o
 *          projetoId não for desta conta.
 */
export async function GET(req: NextRequest) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;
  return NextResponse.json({ projetos: listarProjetos(g.conta.id) });
}

export async function POST(req: NextRequest) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  let corpo: {
    projetoId?: string | null;
    titulo?: string | null;
    arquivos?: ArquivoProjeto[];
    // TOKENS DE DESIGN do projeto (opcional). Ausente = mantém os que já estão
    // gravados (uma edição de arquivo não apaga os tokens).
    tokens?: unknown;
    // A PASTA/CATEGORIA do projeto (dono, 11/10/2026: "o cliente, quando for
    // criar um projeto novo, ele cria a categoria"). Opcional e só vale quando
    // um conjunto NOVO vem — ausente = a pasta do projeto NÃO é mexida (uma
    // edição de arquivo não joga o projeto para fora da pasta dele).
    pastaId?: string | null;
  } = {};
  try {
    corpo = (await req.json()) as typeof corpo;
  } catch {
    corpo = {};
  }

  const arquivos = Array.isArray(corpo.arquivos) ? corpo.arquivos : [];
  if (!arquivos.length) {
    return NextResponse.json(
      { erro: "O projeto precisa de ao menos um arquivo." },
      { status: 400 },
    );
  }

  const projetoId = typeof corpo.projetoId === "string" ? corpo.projetoId : null;
  const titulo = typeof corpo.titulo === "string" ? corpo.titulo : null;
  // Só normaliza quando veio um objeto; qualquer outra coisa é "não veio".
  const tokens: Tokens | undefined =
    corpo.tokens && typeof corpo.tokens === "object"
      ? normalizarTokens(corpo.tokens)
      : undefined;

  const projeto = salvarProjeto(
    g.conta.id,
    projetoId,
    titulo ? tituloDoPedido(titulo) : null,
    arquivos,
    tokens,
  );

  if (!projeto) {
    // Pediu um projetoId que não é desta conta (ou sumiu): NÃO vaza, 404.
    return NextResponse.json({ erro: "Projeto não encontrado." }, { status: 404 });
  }

  // A PASTA do projeto, quando um conjunto NOVO veio no corpo (dono, 11/10/2026).
  // `"pastaId" in corpo` distingue "não mexer" (ausente) de "tirar da pasta"
  // (null/""). É assim que o projeto NASCE dentro da categoria escolhida na
  // criação: a tela manda `pastaId` junto com o primeiro salvamento.
  let pastaId = projeto.pasta_id ?? null;
  if ("pastaId" in corpo) {
    const alvo =
      typeof corpo.pastaId === "string" && corpo.pastaId.trim() ? corpo.pastaId.trim() : null;
    // Pasta de outra conta (ou apagada) não pega: o projeto fica sem pasta, em
    // vez de vazar para um agrupamento que não é dele.
    if (definirPastaDoProjeto(g.conta.id, projeto.id, alvo)) pastaId = alvo;
  }

  return NextResponse.json({ projeto: { ...projeto, pasta_id: pastaId } });
}
