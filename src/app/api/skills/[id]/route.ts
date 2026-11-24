import { NextRequest, NextResponse } from "next/server";

import { exigirConta } from "@/lib/orgs";
import { exigirFerramenta } from "@/lib/porteira-ferramenta";
import {
  apagarSkillDoCliente,
  atualizarSkillDoCliente,
  detectarCredencial,
  obterSkillDoCliente,
  LIMITE_DESCRICAO,
  LIMITE_INSTRUCOES,
  LIMITE_NOME,
} from "@/lib/skills-do-cliente";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/skills/[id] — UMA skill DA CONTA logada.
 *
 * A posse é conferida SEMPRE pelo `user_id` da sessão: id de OUTRA conta (ou
 * inexistente) responde 404 — nunca "existe, mas não é sua". É a mesma postura
 * de /api/conversas/[id] e /api/arquiteto/projetos/[id].
 *
 *   GET    → { skill }
 *   PATCH  → edita { nome?, descricao?, instrucoes? }  →  { skill }
 *   DELETE → apaga a skill da conta                    →  { ok: true }
 *
 * Skill do ECOSSISTEMA não tem rota: ela vive no disco, é lida só-leitura pelo
 * catálogo e não há id que a alcance por aqui. Editar/apagar "nossa" é
 * impossível — não existe caminho.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;
  // O plano manda: sem "agentes" marcado no plano, a rota não atende.
  {
    const barrado = await exigirFerramenta(req, "agentes");
    if (barrado) return barrado;
  }

  const { id } = await ctx.params;
  const skill = obterSkillDoCliente(g.conta.id, id);
  if (!skill) return NextResponse.json({ erro: "Skill não encontrada." }, { status: 404 });

  return NextResponse.json({ skill });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  const { id } = await ctx.params;

  // A posse vem ANTES do parse: id de outra conta não chega nem a ser lido.
  const atual = obterSkillDoCliente(g.conta.id, id);
  if (!atual) return NextResponse.json({ erro: "Skill não encontrada." }, { status: 404 });

  let corpo: { nome?: unknown; descricao?: unknown; instrucoes?: unknown };
  try {
    corpo = (await req.json()) as typeof corpo;
  } catch {
    return NextResponse.json({ erro: "Não entendi o pedido." }, { status: 400 });
  }

  const campos: { nome?: string; descricao?: string | null; instrucoes?: string } = {};

  if (corpo?.nome !== undefined) {
    const nome = typeof corpo.nome === "string" ? corpo.nome.trim() : "";
    if (!nome) return NextResponse.json({ erro: "Dê um nome à skill." }, { status: 400 });
    if (nome.length > LIMITE_NOME) {
      return NextResponse.json({ erro: `O nome passa de ${LIMITE_NOME} caracteres.` }, { status: 400 });
    }
    campos.nome = nome;
  }

  if (corpo?.descricao !== undefined) {
    const descricao = typeof corpo.descricao === "string" ? corpo.descricao.trim() : "";
    if (descricao.length > LIMITE_DESCRICAO) {
      return NextResponse.json(
        { erro: `A descrição passa de ${LIMITE_DESCRICAO} caracteres.` },
        { status: 400 },
      );
    }
    campos.descricao = descricao || null;
  }

  if (corpo?.instrucoes !== undefined) {
    const instrucoes = typeof corpo.instrucoes === "string" ? corpo.instrucoes.trim() : "";
    if (!instrucoes) {
      return NextResponse.json(
        { erro: "Escreva as instruções — é o que o assistente vai seguir." },
        { status: 400 },
      );
    }
    if (instrucoes.length > LIMITE_INSTRUCOES) {
      return NextResponse.json(
        { erro: `As instruções passam de ${LIMITE_INSTRUCOES} caracteres.` },
        { status: 400 },
      );
    }
    campos.instrucoes = instrucoes;
  }

  // Mesmo guarda de segredo da criação: editar não é porta para virar cofre.
  const motivo = detectarCredencial(campos.nome, campos.descricao, campos.instrucoes);
  if (motivo) {
    return NextResponse.json(
      {
        erro: `Isto parece ${motivo}. Uma skill é só texto que o assistente segue — nunca cole senha, token ou chave de API. Credencial de verdade mora no cofre da conta (nas Integrações).`,
      },
      { status: 400 },
    );
  }

  const skill = atualizarSkillDoCliente(g.conta.id, id, campos);
  if (!skill) return NextResponse.json({ erro: "Skill não encontrada." }, { status: 404 });

  return NextResponse.json({ skill });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  const { id } = await ctx.params;
  const apagou = apagarSkillDoCliente(g.conta.id, id);
  if (!apagou) return NextResponse.json({ erro: "Skill não encontrada." }, { status: 404 });

  return NextResponse.json({ ok: true });
}
