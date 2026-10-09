import { NextRequest, NextResponse } from "next/server";

import { exigirConta } from "@/lib/orgs";
import { criarSkillDoCliente } from "@/lib/skills-do-cliente";
import { obterSkillBase } from "@/lib/skills-lista";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/skills/base — "usar como base": o cliente pega UMA skill do
 * ecossistema (pelo nome, vindo do catálogo) e ganha uma CÓPIA na conta dele.
 *
 * O QUE ACONTECE:
 *   - lê o texto da skill de ecossistema (nome, descrição e o corpo) — só
 *     leitura, das raízes fixas do catálogo (ver obterSkillBase);
 *   - grava uma skill NOVA, DA CONTA, com esse texto e `base` = o nome do
 *     original. Ela nasce marcada "do cliente".
 *
 * O QUE **NÃO** ACONTECE (a regra da fase):
 *   - o ORIGINAL não é tocado: nada no disco é escrito, a skill "nossa" segue
 *     read-only e a contagem do ecossistema NÃO muda (não é uma skill a menos
 *     nem a mais lá — a cópia é da conta, não do ecossistema);
 *   - nada é executado nem importado: o corpo vira TEXTO de uma skill de
 *     cliente, como qualquer outra;
 *   - quem não tem sessão não passa (401), e a cópia é sempre DESTA conta.
 */
export async function POST(req: NextRequest) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta; // 401 sem sessão

  let nome = "";
  try {
    const corpo = (await req.json()) as { nome?: unknown };
    if (typeof corpo?.nome === "string") nome = corpo.nome.trim();
  } catch {
    /* sem corpo: cai no 400 abaixo */
  }
  if (!nome) {
    return NextResponse.json({ erro: "Escolha a skill que vai servir de base." }, { status: 400 });
  }

  const base = await obterSkillBase(nome);
  if (!base) {
    return NextResponse.json({ erro: "Não achei essa skill no ecossistema." }, { status: 404 });
  }

  const instrucoes = base.instrucoes.trim() || base.descricao || `Siga a skill ${base.nome}.`;
  const skill = criarSkillDoCliente(g.conta.id, {
    nome: base.nome,
    descricao: base.descricao ?? "",
    instrucoes,
    base: base.nome,
  });

  return NextResponse.json({ skill }, { status: 201 });
}
