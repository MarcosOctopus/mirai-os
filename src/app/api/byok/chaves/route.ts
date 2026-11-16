import { NextRequest, NextResponse } from "next/server";

import { exigirConta } from "@/lib/orgs";
import { escopoPessoal, escoposDaConta, resolverEscopo } from "@/lib/escopos";
import {
  PROVEDORES_BYOK,
  definirPadrao,
  listarChaves,
  provedorValido,
  removerChave,
  salvarChave,
} from "@/lib/byok";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/byok/chaves — a chave de API PRÓPRIA.
 *
 * ISOLAMENTO E ESCOPO (modelo corrigido pelo dono, 13/11/2026):
 *   - os escopos válidos saem SEMPRE de `escoposDaConta(conta)`: o pessoal
 *     (derivado do id, sempre existe) e, quando houver, o da organização —
 *     como IGUAIS, não como substitutos;
 *   - o escopo ativo vem por parâmetro explícito (`?escopo=` no GET,
 *     `escopo` no corpo). Ausente = pessoal, que é o padrão do produto, nunca
 *     um "fallback" de quem não tem empresa;
 *   - escopo desconhecido não vira erro nem bloqueio: resolve para o pessoal
 *     (`resolverEscopo`). Escopo de OUTRA organização, idem — o que é seguro,
 *     porque nunca se herda o cofre de terceiro.
 *
 * A chave em claro NUNCA aparece numa resposta: a listagem devolve só a
 * mascarada (`sk-…4f2a`). O POST devolve a lista nova, não o que recebeu.
 */

/** O catálogo + os escopos: a tela não precisa de uma segunda lista de nada. */
function contextoDaTela(_conta: Parameters<typeof escoposDaConta>[0]) {
  return {
    /* NÃO devolvemos a lista de escopos: não existe seletor de organização na
       interface (definição final do dono). Devolver a lista convidaria uma tela
       futura a transformá-la em "modo organização", que é justamente o que o
       produto não tem. */
    provedores: PROVEDORES_BYOK.map((p) => ({
      id: p.id,
      nome: p.nome,
      modeloPadrao: p.modeloPadrao,
      ondePegar: p.ondePegar,
    })),
  };
}

/**
 * GET — as chaves do espaço PESSOAL (onde a tela grava) + as dos outros
 * escopos que a conta alcança, para nenhuma chave ficar invisível.
 *
 * Não existe seletor de "modo organização" (definição final do dono,
 * 13/11/2026): a organização se ativa pelo pedido, não por uma chave fixa na
 * tela. Aqui o que a pessoa vê é: a chave dela (editável) e, quando houver, as
 * chaves da organização (com o nome do espaço, removíveis).
 */
export async function GET(req: NextRequest) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  const pessoal = escopoPessoal(g.conta);
  const outros = escoposDaConta(g.conta)
    .filter((e) => e.id !== pessoal.id)
    .map((e) => ({ escopo: { id: e.id, tipo: e.tipo, nome: e.nome }, chaves: listarChaves(e) }))
    .filter((x) => x.chaves.length > 0);

  return NextResponse.json({
    escopo: { id: pessoal.id, tipo: pessoal.tipo, nome: pessoal.nome },
    chaves: listarChaves(pessoal),
    outrosEspacos: outros,
    ...contextoDaTela(g.conta),
  });
}

/** POST — grava (ou substitui) a chave de um provedor NO ESCOPO pedido. */
export async function POST(req: NextRequest) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  let corpo: { provider?: unknown; chave?: unknown; modelo?: unknown; escopo?: unknown };
  try {
    corpo = (await req.json()) as typeof corpo;
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }

  if (!provedorValido(corpo.provider)) {
    return NextResponse.json(
      { erro: "provedor inválido — use openrouter ou openai" },
      { status: 400 },
    );
  }

  /* Padrão da tela: o espaço PESSOAL (sempre existe). O `escopo` só vem
     preenchido quando a operação foi resolvida por invocação/contexto no chat
     — não existe seletor permanente de organização na interface. */
  const escopo = resolverEscopo(g.conta, typeof corpo.escopo === "string" ? corpo.escopo : null);
  const r = salvarChave(
    escopo,
    corpo.provider,
    typeof corpo.chave === "string" ? corpo.chave : "",
    typeof corpo.modelo === "string" ? corpo.modelo : undefined,
  );
  if (!r.ok) return NextResponse.json({ erro: r.motivo }, { status: 400 });

  // Log de AUDITORIA sem segredo: qual escopo, qual provedor, qual conta. Nunca
  // a chave, nunca o blob — o log é lido por gente e por watchdog.
  console.log(
    `[byok] chave do provedor ${corpo.provider} gravada no escopo ${escopo.id} pela conta ${g.conta.id}`,
  );

  return NextResponse.json({ ok: true, escopo: { id: escopo.id }, chaves: listarChaves(escopo) });
}

/** PATCH — escolhe qual provedor CADASTRADO naquele escopo o chat usa. */
export async function PATCH(req: NextRequest) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  let corpo: { provider?: unknown; escopo?: unknown };
  try {
    corpo = (await req.json()) as typeof corpo;
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }
  if (!provedorValido(corpo.provider)) {
    return NextResponse.json({ erro: "provedor inválido" }, { status: 400 });
  }

  const escopo = resolverEscopo(g.conta, typeof corpo.escopo === "string" ? corpo.escopo : null);
  if (!definirPadrao(escopo, corpo.provider)) {
    return NextResponse.json({ erro: "este escopo não tem chave desse provedor" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, chaves: listarChaves(escopo) });
}

/** DELETE ?provider=openai[&escopo=…] — remove a chave daquele provedor. */
export async function DELETE(req: NextRequest) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  const q = new URL(req.url).searchParams;
  const provider = q.get("provider");
  if (!provedorValido(provider)) {
    return NextResponse.json({ erro: "provedor inválido" }, { status: 400 });
  }

  const escopo = resolverEscopo(g.conta, q.get("escopo"));
  const removeu = removerChave(escopo, provider);
  if (!removeu) {
    return NextResponse.json({ erro: "não havia chave desse provedor neste escopo" }, { status: 404 });
  }
  console.log(`[byok] chave do provedor ${provider} removida do escopo ${escopo.id}`);
  return NextResponse.json({ ok: true, chaves: listarChaves(escopo) });
}
