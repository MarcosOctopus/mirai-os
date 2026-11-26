import { NextRequest, NextResponse } from "next/server";

import { exigirDono } from "@/lib/orgs";
import { cabecalhosPlanoDeControle } from "@/lib/plano-controle";
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
  // ATENÇÃO: o billing vive na BORDA (id.miraitohope.com), não no hostname interno do
  // plano de controle. Em Stage `MIRAI_CONTROL_URL` aponta para `http://identity-service:8080`,
  // que não resolve fora da rede do control plane — usar ele aqui dava `fetch failed`
  // (EAI_AGAIN) e a tela abria sem entrada nenhuma, como se não houvesse venda.
  const base = (
    process.env.MIRAI_BILLING_URL ||
    process.env.MIRAI_OIDC_ISSUER ||
    "https://id.miraitohope.com"
  ).replace(/\/+$/, "");
  const url = `${base}/v1/billing/movimentos?limite=${limite}`;
  // Cabeçalho limpo: valor com caractere de controle (env copiado com \r, por exemplo)
  // faz o fetch estourar TypeError "invalid header value" — e a tela mostraria
  // "cobrança inacessível" sem dizer por quê.
  const limpos: Record<string, string> = {};
  for (const [chave, valor] of Object.entries(cabecalhosPlanoDeControle())) {
    limpos[chave] = String(valor).replace(/[^\x20-\x7E]/g, "").trim();
  }
  try {
    const r = await fetch(url, { headers: limpos, cache: "no-store" });
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
    const causa = (e as { cause?: { code?: string; message?: string } }).cause;
    const detalhe = causa?.code || causa?.message || (e as Error).message;
    return {
      entradas: [],
      totais: { brl_centavos: 0, usd_centavos: 0 },
      erro: `cobrança inacessível (${(e as Error).name}: ${String(detalhe).slice(0, 120)}) em ${base}`,
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