/**
 * /api/integracoes/ponte — a PONTE: o CRM avisa o MIRAI OS de uma conexão feita
 * DENTRO dele, sem a pessoa precisar refazer nada na tela do app.
 *
 * CORREÇÃO DO PROBLEMA: o cliente conectou o CRM dentro do próprio CRM (aba
 * "Integrar com Mirai" / a tela de chaves de API). A conexão e a credencial
 * `dsk_…` passaram a existir — mas a tabela `integracoes` deste app só ganhava
 * uma linha quando a conexão era feita PELA tela do app. O app (e o chat dele)
 * ficava cego para o que o cliente conectou no CRM.
 *
 * Esta rota é o lado receptor da ponte. Ela é server-to-server e exige o segredo
 * compartilhado no cabeçalho `x-mirai-ponte` (env `MIRAI_PONTE_SECRET`):
 *
 *   - sem a env, ou com um segredo curto demais, a porta NÃO EXISTE (503) —
 *     falha fechada, a mesma doutrina da rota de provisionamento;
 *   - sem o cabeçalho certo (ou errado), é 401 — comparação em tempo constante,
 *     tamanhos diferentes nunca autenticam;
 *   - a credencial NUNCA é registrada em log, NUNCA volta em erro e NUNCA é
 *     devolvida: a resposta traz só o rótulo e a impressão digital.
 *
 * Corpo: `{ email, tipo:'crm', rotulo, credencial }`.
 *
 *   - a pessoa JÁ existe aqui → grava a integração DELA (`dono_tipo='pessoa'`,
 *     `dono_id` = id da pessoa), via os MESMOS helpers de `lib/integracoes.ts`.
 *     O upsert é por (dono_tipo, dono_id, tipo, rotulo): NUNCA toca a linha de
 *     outra pessoa;
 *   - a pessoa AINDA não existe → guarda um VÍNCULO PENDENTE por e-mail, que é
 *     consumido UMA vez no primeiro login dela (ver `consumirVinculosPendentes`).
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

import { db } from "@/lib/auth";
import {
  TIPOS_SUPORTADOS,
  criarIntegracao,
  guardarVinculoPendente,
  semSegredo,
} from "@/lib/integracoes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Abaixo disto o segredo é adivinhável, e a ponte fica desligada. */
const TAMANHO_MINIMO_DO_SEGREDO = 32;

/** Comparação em tempo constante; tamanhos diferentes nunca autenticam. */
function segredoConfere(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido, "utf8");
  const b = Buffer.from(esperado, "utf8");
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

/**
 * Procura a pessoa por e-mail SEM sensibilidade a maiúscula: o CRM manda o
 * e-mail como o cadastro dele, e o app pode ter guardado com outra caixa. Sem
 * isto, uma diferença de caixa faria nascer um vínculo pendente para quem já é
 * dono do e-mail — a integração apareceria só no próximo login, sem motivo.
 */
function userIdPorEmail(email: string): number | null {
  const c = db();
  try {
    const linha = c
      .prepare("SELECT id FROM users WHERE lower(email) = lower(?) LIMIT 1")
      .get(email.trim()) as { id: number } | undefined;
    return linha?.id ?? null;
  } catch {
    return null;
  } finally {
    c.close();
  }
}

export async function POST(req: NextRequest) {
  // ── Porta fechada sem segredo forte (mesma régua da rota de provisionamento) ──
  const esperado = (process.env.MIRAI_PONTE_SECRET || "").trim();
  if (esperado.length < TAMANHO_MINIMO_DO_SEGREDO) {
    return NextResponse.json({ error: "ponte indisponível" }, { status: 503 });
  }

  const recebido = (req.headers.get("x-mirai-ponte") || "").trim();
  if (!recebido || !segredoConfere(recebido, esperado)) {
    // Sem corpo no erro: nem eco do que veio, para não devolver nada de volta.
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  let corpo: { email?: unknown; tipo?: unknown; rotulo?: unknown; credencial?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  }

  const email = typeof corpo.email === "string" ? corpo.email.trim().toLowerCase() : "";
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "email é obrigatório" }, { status: 400 });
  }

  const tipo =
    (typeof corpo.tipo === "string" ? corpo.tipo : "crm").trim().toLowerCase() || "crm";
  if (!TIPOS_SUPORTADOS.includes(tipo as (typeof TIPOS_SUPORTADOS)[number])) {
    return NextResponse.json(
      { error: `tipo não suportado (use: ${TIPOS_SUPORTADOS.join(", ")})` },
      { status: 400 },
    );
  }

  // A credencial entra e sai daqui SEM nunca ser logada nem devolvida.
  const credencial = typeof corpo.credencial === "string" ? corpo.credencial.trim() : "";
  if (!credencial) {
    return NextResponse.json({ error: "credencial é obrigatória" }, { status: 400 });
  }

  const rotulo =
    (typeof corpo.rotulo === "string" ? corpo.rotulo.trim() : "") || tipo;

  const userId = userIdPorEmail(email);
  if (userId) {
    // A pessoa existe: a integração é DELA. O upsert é ancorado no dono, então
    // nenhuma linha de outra pessoa é tocada por esta escrita.
    const criada = criarIntegracao({
      dono_tipo: "pessoa",
      dono_id: String(userId),
      tipo,
      rotulo,
      credencial,
    });
    return NextResponse.json(
      { ok: true, vinculado: true, integracao: semSegredo(criada) },
      { status: 201 },
    );
  }

  // A pessoa ainda não existe aqui: guarda por e-mail e liga no primeiro login.
  guardarVinculoPendente({ email, tipo, rotulo, credencial });
  return NextResponse.json({ ok: true, pendente: true }, { status: 202 });
}

export async function GET() {
  return NextResponse.json({ error: "método não permitido" }, { status: 405 });
}
