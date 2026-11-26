import { NextRequest, NextResponse } from "next/server";

import { exigirDono } from "@/lib/orgs";
import { basePlanoDeControle, cabecalhosPlanoDeControle } from "@/lib/plano-controle";
import {
  CAMBIO_USD_BRL,
  apagarSaida,
  consolidar,
  criarSaida,
  listarSaidas,
} from "@/lib/financeiro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * FINANCEIRO do CRM — SÓ O DONO (26/11/2026).
 *
 * GET    — entradas do serviço de cobrança (Asaas BRL + Paddle USD) e saídas lançadas,
 *          com o consolidado e o câmbio declarado.
 * POST   — lança uma saída {data, categoria, descricao, valor_centavos, moeda}.
 * DELETE — apaga uma saída pelo id (o CRM é do dono; quem lança é ele).
 *
 * A credencial do plano de controle NÃO sai do servidor: o navegador só fala com esta rota.
 */

type Corpo = {
  data?: string;
  categoria?: string;
  descricao?: string;
  valor_centavos?: number;
  moeda?: string;
  id?: number;
};

async function entradasDoGateway(limite = 200) {
  const base = basePlanoDeControle();
  const url = `${base}/v1/billing/movimentos?limite=${limite}`;
  try {
    const r = await fetch(url, { headers: cabecalhosPlanoDeControle(), cache: "no-store" });
    if (!r.ok) {
      return { entradas: [], totais: { brl_centavos: 0, usd_centavos: 0 }, erro: `cobrança respondeu ${r.status}` };
    }
    const dados = (await r.json()) as {
      entradas?: unknown[];
      totais?: { brl_centavos?: number; usd_centavos?: number };
    };
    return {
      entradas: Array.isArray(dados.entradas) ? dados.entradas : [],
      totais: {
        brl_centavos: Number(dados.totais?.brl_centavos || 0),
        usd_centavos: Number(dados.totais?.usd_centavos || 0),
      },
      erro: null as string | null,
    };
  } catch (e) {
    return {
      entradas: [],
      totais: { brl_centavos: 0, usd_centavos: 0 },
      erro: `cobrança inacessível (${(e as Error).name})`,
    };
  }
}

export async function GET(req: NextRequest) {
  const auth = await exigirDono(req);
  if (!auth.ok) return auth.resposta;

  const limite = Number(req.nextUrl.searchParams.get("limite") || 200);
  const [cobranca, saidas] = await Promise.all([entradasDoGateway(limite), Promise.resolve(listarSaidas(limite))]);
  const resumo = consolidar(cobranca.totais, saidas);

  return NextResponse.json({
    entradas: cobranca.entradas,
    saidas,
    resumo,
    cambio_usd_brl: CAMBIO_USD_BRL,
    aviso: cobranca.erro,
  });
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

  const data = String(corpo.data || "").trim();
  const categoria = String(corpo.categoria || "").trim();
  const valor = Number(corpo.valor_centavos || 0);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return NextResponse.json({ error: "data tem de ser AAAA-MM-DD" }, { status: 422 });
  }
  if (!categoria) {
    return NextResponse.json({ error: "categoria é obrigatória" }, { status: 422 });
  }
  if (!Number.isFinite(valor) || valor <= 0) {
    return NextResponse.json({ error: "valor tem de ser maior que zero" }, { status: 422 });
  }

  const saida = criarSaida({
    data,
    categoria,
    descricao: String(corpo.descricao || "").slice(0, 240),
    valor_centavos: valor,
    moeda: String(corpo.moeda || "BRL"),
  });

  return NextResponse.json({ ok: true, saida }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const auth = await exigirDono(req);
  if (!auth.ok) return auth.resposta;

  const id = Number(req.nextUrl.searchParams.get("id") || 0);
  if (!id) return NextResponse.json({ error: "id é obrigatório" }, { status: 422 });
  const apagou = apagarSaida(id);
  return NextResponse.json({ ok: apagou }, { status: apagou ? 200 : 404 });
}