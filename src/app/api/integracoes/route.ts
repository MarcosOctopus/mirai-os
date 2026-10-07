/**
 * /api/integracoes — a pessoa pluga o que é DELA.
 *
 * Correção do dono (07/out/2026): *"preciso que pegue o que aquela conta tem de
 * integrações individuais"*. Antes disto não havia onde plugar: a única
 * credencial era a da empresa, e quem entrasse usava a do dono dela.
 *
 * Regras desta rota (todas server-side):
 *   - a pessoa só vê e só mexe no que é DELA (`dono_tipo='pessoa'`, `dono_id` =
 *     id da conta que está falando) — o isolamento é condição da consulta, não
 *     checagem depois;
 *   - o segredo NUNCA volta em claro: a resposta traz só o rótulo e a
 *     impressão digital;
 *   - integração da empresa aparece na lista como leitura (é apoio), e não é
 *     alterável por aqui.
 */

import { NextRequest, NextResponse } from "next/server";

import { exigirConta } from "@/lib/orgs";
import {
  TIPOS_SUPORTADOS,
  criarIntegracao,
  desligarIntegracao,
  integracoesDaOrganizacao,
  integracoesDaPessoa,
  semSegredo,
} from "@/lib/integracoes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const r = await exigirConta(req);
  if (!r.ok) return r.resposta;
  const { conta } = r;

  const minhas = integracoesDaPessoa(conta.id).map(semSegredo);
  const daEmpresa = conta.org
    ? integracoesDaOrganizacao(conta.org.id).map(semSegredo)
    : [];

  return NextResponse.json({
    pessoa: { id: conta.id, nome: conta.nome, email: conta.email },
    organizacao: conta.org ? { id: conta.org.id, nome: conta.org.nome } : null,
    minhas,
    daEmpresa,
    tipos: TIPOS_SUPORTADOS,
  });
}

export async function POST(req: NextRequest) {
  const r = await exigirConta(req);
  if (!r.ok) return r.resposta;
  const { conta } = r;

  let corpo: { tipo?: string; rotulo?: string; credencial?: string; config?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  }

  const tipo = (corpo.tipo || "").trim().toLowerCase();
  if (!TIPOS_SUPORTADOS.includes(tipo as (typeof TIPOS_SUPORTADOS)[number])) {
    return NextResponse.json(
      { error: `tipo não suportado (use: ${TIPOS_SUPORTADOS.join(", ")})` },
      { status: 400 },
    );
  }
  const credencial = (corpo.credencial || "").trim();
  if (!credencial) {
    return NextResponse.json({ error: "credencial é obrigatória" }, { status: 400 });
  }

  // SEMPRE da pessoa que está falando. Não existe caminho para escrever na
  // integração de outra pessoa por esta rota.
  const criada = criarIntegracao({
    dono_tipo: "pessoa",
    dono_id: String(conta.id),
    tipo,
    rotulo: (corpo.rotulo || "").trim() || tipo,
    credencial,
    config: corpo.config ? JSON.stringify(corpo.config) : null,
  });

  return NextResponse.json({ ok: true, integracao: semSegredo(criada) }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const r = await exigirConta(req);
  if (!r.ok) return r.resposta;
  const { conta } = r;

  const id = Number(new URL(req.url).searchParams.get("id") || 0);
  if (!id) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });

  // O `dono_id` vai na condição do UPDATE: tentar desligar a de outro não
  // desliga nada (e devolve 404, sem revelar se ela existe).
  const ok = desligarIntegracao(id, "pessoa", String(conta.id));
  if (!ok) return NextResponse.json({ error: "integração não encontrada" }, { status: 404 });
  return NextResponse.json({ ok: true, id, desligada: true });
}
