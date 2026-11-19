import { NextRequest, NextResponse } from "next/server";

import { EMAIL_QUE_MUDA_PRECO, exigirDono } from "@/lib/orgs";
import { guardarConfig, lerConfig } from "@/lib/plataforma-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PREÇO ADICIONAL DE CADA FERRAMENTA (add-on), por fora do plano.
 *
 * Pedido do dono, 19/11/2026: *"quero que você troque a aba 'Quem tem o quê' para aba Ferramentas,
 * que todas as ferramentas entrem lá listadas e coloque o valor adicional delas individualmente"*.
 *
 * Onde isso mora e por quê: o plano de controle guarda PREÇO DE PLANO (`plans.preco_centavos`), não
 * preço de ferramenta — e mexer no serviço de identidade (que é crítico: é o login) para isso seria
 * desproporcional. O preço do add-on é dado COMERCIAL da plataforma, então fica em
 * `plataforma_config` (a mesma tabela cifrada que guarda a config do GitHub App), sob a chave
 * `ferramentas:precos`, no formato `{ "<ferramenta_id>": <centavos> }`.
 *
 * A ferramenta em si continua sendo a capacidade técnica (src/lib/ferramentas-os.ts): aqui só se
 * guarda quanto ela custa por fora.
 *
 * Leitura: qualquer dono. Escrita: só o e-mail em EMAIL_QUE_MUDA_PRECO — a mesma trava que a rota de
 * planos usa, para trocar o dono da plataforma no futuro não dar carona em preço.
 */

const CHAVE = "ferramentas:precos";

function ler(): Record<string, number> {
  const cru = lerConfig(CHAVE);
  if (!cru) return {};
  try {
    const d = JSON.parse(cru) as unknown;
    if (!d || typeof d !== "object" || Array.isArray(d)) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(d as Record<string, unknown>)) {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0) out[k] = Math.round(n);
    }
    return out;
  } catch {
    return {};
  }
}

export async function GET(req: NextRequest) {
  const g = await exigirDono(req);
  if (!g.ok) return g.resposta;
  return NextResponse.json({ precos: ler() });
}

export async function PUT(req: NextRequest) {
  const g = await exigirDono(req);
  if (!g.ok) return g.resposta;
  if (g.conta.email !== EMAIL_QUE_MUDA_PRECO) {
    return NextResponse.json(
      { error: "Somente o e-mail autorizado muda preço." },
      { status: 403 },
    );
  }

  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const ferramentaId = String(corpo.ferramenta_id || "").trim();
  const preco = Number(corpo.preco_centavos);

  if (!ferramentaId) {
    return NextResponse.json({ error: "informe ferramenta_id" }, { status: 400 });
  }
  if (!Number.isFinite(preco) || preco < 0) {
    return NextResponse.json({ error: "preco_centavos inválido" }, { status: 400 });
  }

  const precos = { ...ler(), [ferramentaId]: Math.round(preco) };
  const gravou = guardarConfig(CHAVE, JSON.stringify(precos));
  if (!gravou) {
    return NextResponse.json({ error: "não consegui gravar o preço" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, precos });
}
