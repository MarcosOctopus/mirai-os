import { NextRequest, NextResponse } from "next/server";

import { exigirDono } from "@/lib/orgs";
import {
  REPETICOES,
  alternarConta,
  apagarConta,
  criarConta,
  listarContas,
  projetar,
  type Repeticao,
} from "@/lib/financeiro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CONTAS QUE SE REPETEM — só o dono (26/11/2026).
 *
 * GET    — lista com a próxima data de cada conta + projeção de 30 dias.
 * POST   — cadastra {tipo, descricao, categoria, valor_centavos, moeda, vencimento, repeticao, automatico}.
 * PATCH  — liga/desliga a conta e o "lançar sozinho".
 * DELETE — apaga pelo id.
 *
 * `automatico` é a INTENÇÃO declarada. Quem lança no vencimento é o agendador (peça
 * seguinte); esta rota não inventa lançamento nenhum.
 */

type Corpo = {
  id?: number;
  tipo?: "entrada" | "saida";
  descricao?: string;
  categoria?: string;
  valor_centavos?: number;
  moeda?: string;
  vencimento?: string;
  repeticao?: string;
  automatico?: boolean;
  ativo?: boolean;
};

export async function GET(req: NextRequest) {
  const auth = await exigirDono(req);
  if (!auth.ok) return auth.resposta;

  const contas = listarContas();
  return NextResponse.json({ contas, projecao: projetar(contas, 30) });
}

export async function POST(req: NextRequest) {
  const auth = await exigirDono(req);
  if (!auth.ok) return auth.resposta;

  let corpo: Corpo;
  try {
    corpo = (await req.json()) as Corpo;
  } catch {
    return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  }

  const descricao = String(corpo.descricao || "").trim();
  const vencimento = String(corpo.vencimento || "").trim();
  const valor = Number(corpo.valor_centavos || 0);
  const repeticao = String(corpo.repeticao || "mensal") as Repeticao;

  if (!descricao) return NextResponse.json({ error: "descrição é obrigatória" }, { status: 422 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vencimento)) {
    return NextResponse.json({ error: "vencimento tem de ser AAAA-MM-DD" }, { status: 422 });
  }
  if (!Number.isFinite(valor) || valor <= 0) {
    return NextResponse.json({ error: "valor tem de ser maior que zero" }, { status: 422 });
  }
  if (!REPETICOES.includes(repeticao)) {
    return NextResponse.json({ error: "repetição inválida" }, { status: 422 });
  }

  const conta = criarConta({
    tipo: corpo.tipo === "entrada" ? "entrada" : "saida",
    descricao,
    categoria: corpo.categoria,
    valor_centavos: valor,
    moeda: corpo.moeda,
    vencimento,
    repeticao,
    automatico: corpo.automatico !== false,
  });

  return NextResponse.json({ ok: true, conta, projecao: projetar(listarContas(), 30) }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const auth = await exigirDono(req);
  if (!auth.ok) return auth.resposta;

  const corpo = (await req.json().catch(() => ({}))) as Corpo;
  const id = Number(corpo.id || 0);
  if (!id) return NextResponse.json({ error: "id é obrigatório" }, { status: 422 });

  const mudou = alternarConta(id, corpo.ativo !== false, corpo.automatico);
  return NextResponse.json({ ok: mudou, projecao: projetar(listarContas(), 30) }, { status: mudou ? 200 : 404 });
}

export async function DELETE(req: NextRequest) {
  const auth = await exigirDono(req);
  if (!auth.ok) return auth.resposta;

  const id = Number(req.nextUrl.searchParams.get("id") || 0);
  if (!id) return NextResponse.json({ error: "id é obrigatório" }, { status: 422 });
  const apagou = apagarConta(id);
  return NextResponse.json({ ok: apagou, projecao: projetar(listarContas(), 30) }, { status: apagou ? 200 : 404 });
}