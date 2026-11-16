/**
 * POST /api/agendador/rodar — o pulso do agendador do app.
 *
 * Chamado pelo cron do host a cada minuto (ver scripts/cron-agendador.sh).
 * Não usa sessão de usuário: o próprio agendador sabe de quem é cada agenda
 * (`user_id` gravado na criação). A proteção é um segredo compartilhado —
 * sem ele, qualquer um poderia disparar execuções.
 *
 * Idempotente por construção: só pega agendas com `proxima_em <= agora` e
 * empurra `proxima_em` para frente depois de rodar.
 */

import { NextRequest, NextResponse } from "next/server";
import { rodarDevidas } from "@/lib/agendador-app";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function autorizado(req: NextRequest): boolean {
  const esperado = (process.env.AGENDADOR_SEGREDO || "").trim();
  if (!esperado) return false;
  const recebido =
    req.headers.get("x-agendador-segredo") ||
    new URL(req.url).searchParams.get("segredo") ||
    "";
  return recebido === esperado;
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ ok: false, erro: "não autorizado" }, { status: 401 });
  }

  const inicio = Date.now();
  try {
    const r = await rodarDevidas();
    return NextResponse.json({
      ok: true,
      rodadas: r.rodadas,
      falhas: r.falhas,
      detalhes: r.detalhes,
      ms: Date.now() - inicio,
    });
  } catch (erro) {
    return NextResponse.json(
      { ok: false, erro: (erro as Error)?.message || "erro" },
      { status: 500 },
    );
  }
}

/** GET serve só para saber se o agendador está de pé (sem rodar nada). */
export async function GET() {
  return NextResponse.json({ ok: true, servico: "agendador-do-app" });
}
