import { NextRequest, NextResponse } from "next/server";

import { exigirConta } from "@/lib/orgs";
import { listarSkills } from "@/lib/skills-lista";
import { temaDaSkill } from "@/lib/skills-temas";
import { ehSkillOculta } from "@/lib/skills-ocultas";
import {
  criarSkillDoCliente,
  detectarCredencial,
  listarSkillsDoCliente,
  LIMITE_DESCRICAO,
  LIMITE_INSTRUCOES,
  LIMITE_NOME,
} from "@/lib/skills-do-cliente";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/skills — a casa das skills.
 *
 *   GET  → o catálogo REAL do ecossistema (`skills`, `total`, lido do disco, ver
 *          src/lib/skills-lista.ts) E as skills DESTA CONTA (`minhas`, ver
 *          src/lib/skills-do-cliente.ts). `total` continua sendo só o
 *          ecossistema — a contagem de "nossa" não muda por causa das do
 *          cliente; elas vêm separadas em `minhas`.
 *   POST → CRIA uma skill DA CONTA a partir de { nome, descricao, instrucoes }.
 *          É TEXTO que o assistente segue: nenhum campo de credencial existe e
 *          o servidor RECUSA instruções que pareçam segredo (ver
 *          detectarCredencial). Nada de código, nada de arquivo de disco.
 *
 * Exige SESSÃO: sem conta, 401 e nada é lido do disco nem do banco. A resposta
 * de `minhas` é SEMPRE filtrada pelo `user_id` da sessão — a skill de outra
 * conta nunca aparece, nunca vaza por id. As rotas de item
 * (/api/skills/[id]) são a única forma de tocar uma skill, e também são
 * escopadas por conta (404 para o que não é seu).
 */
export async function GET(req: NextRequest) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta; // 401 sem sessão

  const { skills } = await listarSkills();
  // Cada skill ganha o TEMA (a organização por tema pedida pelo dono): derivado
  // do nome, da pasta real e da descrição — ver src/lib/skills-temas.ts. O campo
  // é ADITIVO: /skills e /explorar (SkillsCatalogo) seguem lendo só
  // nome/descricao/categoria, sem nenhuma mudança de comportamento.
  //
  // O QUE O CLIENTE VÊ (08/10/2026): os produtos que o dono vende à parte e a
  // operação interna do ecossistema saem da VISTA — a regra está em
  // src/lib/skills-ocultas.ts. Isto é VITRINE, não exclusão: os arquivos seguem
  // no disco, o assistente continua usando, `/api/skills/base` continua
  // copiando. `total` passa a ser o total VISÍVEL — nada de contagem fantasma
  // na tela.
  const visiveis = skills
    .filter((s) => !ehSkillOculta(s.nome))
    .map((s) => ({ ...s, tema: temaDaSkill(s.nome, s.categoria) }));
  const minhas = listarSkillsDoCliente(g.conta.id);
  return NextResponse.json({ skills: visiveis, total: visiveis.length, minhas });
}

export async function POST(req: NextRequest) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta; // 401 sem sessão

  let corpo: { nome?: unknown; descricao?: unknown; instrucoes?: unknown };
  try {
    corpo = (await req.json()) as typeof corpo;
  } catch {
    return NextResponse.json({ erro: "Não entendi o pedido." }, { status: 400 });
  }

  const nome = typeof corpo?.nome === "string" ? corpo.nome.trim() : "";
  const descricao = typeof corpo?.descricao === "string" ? corpo.descricao.trim() : "";
  const instrucoes = typeof corpo?.instrucoes === "string" ? corpo.instrucoes.trim() : "";

  if (!nome) return NextResponse.json({ erro: "Dê um nome à skill." }, { status: 400 });
  if (nome.length > LIMITE_NOME) {
    return NextResponse.json({ erro: `O nome passa de ${LIMITE_NOME} caracteres.` }, { status: 400 });
  }
  if (descricao.length > LIMITE_DESCRICAO) {
    return NextResponse.json(
      { erro: `A descrição passa de ${LIMITE_DESCRICAO} caracteres.` },
      { status: 400 },
    );
  }
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

  // A TRAVA DE SEGREDO: uma skill é texto que o assistente segue — nunca uma
  // senha, token ou chave. Se o que foi escrito PARECE credencial, recusa e diz
  // o porquê, em PT-BR, apontando o lugar certo (o cofre da conta).
  const motivo = detectarCredencial(nome, descricao, instrucoes);
  if (motivo) {
    return NextResponse.json(
      {
        erro: `Isto parece ${motivo}. Uma skill é só texto que o assistente segue — nunca cole senha, token ou chave de API. Credencial de verdade mora no cofre da conta (nas Integrações).`,
      },
      { status: 400 },
    );
  }

  const skill = criarSkillDoCliente(g.conta.id, { nome, descricao, instrucoes });
  return NextResponse.json({ skill }, { status: 201 });
}
