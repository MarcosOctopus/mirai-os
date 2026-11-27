/**
 * POST /api/aprendizado — a conversa vira NOTA no acervo.
 *
 * Duas portas para o mesmo fim (o dono pediu as duas, 27/11/2026):
 *
 *   { modo: "agora", conversaId, mensagens }  → grava AGORA ("guarda isso")
 *   { modo: "fim",   conversaId, mensagens }  → grava o fecho da conversa
 *
 * As duas são IDEMPOTENTES pela conversa: uma nota por `conversaId` e por conta.
 * O gatilho automático dispara em três eventos (troca de conversa, sair da tela,
 * ociosidade), então a segunda, a terceira e a décima chamada com o mesmo id
 * devolvem `ja_existia: true` e NÃO criam nota nova.
 *
 * Esta rota NÃO fica no caminho da resposta do chat: o cliente a chama depois do
 * stream (ou por `sendBeacon`, ao sair). Se ela falhar, a conversa não sente.
 *
 * Escopo: o que vale é o cookie `mirai_escopo` da requisição. Em "Tudo" a
 * escrita cai no espaço PESSOAL — "Tudo" é leitura, não lugar de gravar.
 * Pasta/organização usa a credencial DAQUELA organização; nunca a de cliente
 * alheio.
 */
import { NextRequest, NextResponse } from "next/server";

import {
  gerarNotaDeAprendizado,
  normalizarMensagens,
  type ModoAprendizado,
} from "@/lib/aprendizado";
import { escopoDaRequisicao } from "@/lib/escopo-ativo";
import { exigirConta } from "@/lib/orgs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const sessao = await exigirConta(req);
  if (!sessao.ok) return sessao.resposta;
  const conta = sessao.conta;

  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ error: "corpo inválido" }, { status: 400 });

  const modo: ModoAprendizado = corpo.modo === "fim" ? "fim" : "agora";
  const conversaId = String(corpo.conversaId || "").trim();
  if (!conversaId) {
    // Sem conversa não existe "uma nota por conversa": o carimbo seria impossível.
    return NextResponse.json({ error: "informe a conversa (conversaId)" }, { status: 400 });
  }

  const mensagens = normalizarMensagens(corpo.mensagens);
  const escopo = escopoDaRequisicao(req, conta);

  const r = await gerarNotaDeAprendizado({ conta, escopo, conversaId, modo, mensagens });
  if (!r.ok) {
    return NextResponse.json(
      { ok: false, error: r.erro, conversaId, modo },
      { status: r.status >= 400 && r.status < 600 ? r.status : 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    ja_existia: r.ja_existia,
    ...(r.ignorado ? { ignorado: r.ignorado } : {}),
    ...(r.caminho ? { caminho: r.caminho } : {}),
    ...(r.pasta ? { pasta: r.pasta } : {}),
    ...(r.subpasta ? { subpasta: r.subpasta } : {}),
    ...(r.destilacao ? { destilacao: r.destilacao } : {}),
    ...(r.aviso ? { aviso: r.aviso } : {}),
    conversaId,
    modo,
  });
}

/** GET só para diagnóstico honesto: a rota existe e o que ela espera. */
export async function GET(req: NextRequest) {
  const sessao = await exigirConta(req);
  if (!sessao.ok) return sessao.resposta;
  const escopo = escopoDaRequisicao(req, sessao.conta);
  return NextResponse.json({
    ok: true,
    rota: "aprendizado",
    modos: ["agora", "fim"],
    escopo: { id: escopo.id, tipo: escopo.tipo, nome: escopo.nome },
    gravacao_em: escopo.tipo === "tudo" ? "espaco pessoal (Tudo e leitura)" : escopo.nome,
  });
}
