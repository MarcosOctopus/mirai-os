import { NextRequest, NextResponse } from "next/server";

import { registrarResultadoDominio } from "@/lib/arquiteto-projetos";
import { segredoDaFilaConfere } from "@/lib/fila-do-dominio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/dominio/resultado — o VEREDITO da borda sobre um domínio.
 *
 * O serviço `mirai-publica-dominio` publica (vhost + certificado) e conta aqui
 * como foi: `ok: true` = no ar (`dominio_pronto_em`), `ok: false` = o motivo
 * (`dominio_erro`, que o painel mostra em vez de um "aguardando" eterno).
 *
 * Mesma porta da fila: segredo compartilhado em tempo constante. O app NÃO
 * confia no conteúdo — só guarda o que o serviço com root conseguiu fazer.
 */
export async function POST(req: NextRequest) {
  if (!segredoDaFilaConfere(req)) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  let corpo: { dominio?: unknown; ok?: unknown; erro?: unknown } = {};
  try {
    corpo = (await req.json()) as typeof corpo;
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }

  const dominio = typeof corpo.dominio === "string" ? corpo.dominio : "";
  if (!dominio) return NextResponse.json({ erro: "domínio ausente" }, { status: 400 });

  const erro = typeof corpo.erro === "string" && corpo.erro ? corpo.erro.slice(0, 400) : null;
  const mudou = registrarResultadoDominio(dominio, corpo.ok === true, erro);
  if (!mudou) return NextResponse.json({ erro: "domínio não encontrado" }, { status: 404 });

  return NextResponse.json({ ok: true });
}