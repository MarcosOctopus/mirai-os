import { NextRequest, NextResponse } from "next/server";

import { exigirDono } from "@/lib/orgs";
import { estados, gravar, ITENS, type Estado } from "@/lib/visibilidade";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * VISIBILIDADE DOS ITENS — GET para quem está logado, POST só para o dono.
 *
 * GET  devolve o mapa {href: estado}. É público para quem tem sessão porque o
 *      menu de TODO usuário precisa saber o que esconder/marcar; não há segredo
 *      aqui (é o estado da vitrine, não dado de cliente).
 * POST é a escrita: `exigirDono()` + lista fechada de itens (`gravar` recusa href
 *      inventado). Não aceita estado arbitrário — só os três que existem.
 */
export async function GET() {
  return NextResponse.json({ mapa: estados(), itens: ITENS }, {
    headers: { "cache-control": "no-store" },
  });
}

export async function POST(req: NextRequest) {
  const trava = await exigirDono(req);
  if (!trava.ok) return trava.resposta;

  let corpo: { href?: string; estado?: string };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }
  const href = (corpo.href || "").trim();
  const estado = corpo.estado as Estado;
  if (!href || !["publico", "em_breve", "oculto"].includes(estado)) {
    return NextResponse.json({ erro: "href e estado (publico|em_breve|oculto) obrigatórios" }, { status: 400 });
  }
  try {
    const mapa = gravar(href, estado);
    return NextResponse.json({ ok: true, mapa });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 400 });
  }
}