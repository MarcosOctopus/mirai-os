import { NextRequest, NextResponse } from "next/server";

import { ultimosEmails } from "@/lib/gmail";
import { resolverEscopo } from "@/lib/escopos";
import { exigirConta } from "@/lib/orgs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/gmail/mensagens?n=3 — as últimas mensagens da caixa de QUEM PEDIU.
 *
 * Exige sessão: o token é do escopo, e a leitura é feita com ele. O escopo
 * (`?escopo=`) só pode ser um dos que a conta enxerga — pessoal ou o da própria
 * organização (`escopos.ts`); qualquer outro resolve para o PESSOAL, que é o
 * padrão do produto. Não existe "ler a caixa de outra pessoa" por id na URL.
 *
 * `?conta=<endereço|rótulo>` escolhe qual caixa quando há mais de uma.
 *
 * Quando não há conexão, devolve 409 com o motivo — nunca uma lista vazia, que
 * faria a Mirai dizer "você não tem emails" quando o problema é outro.
 */
export async function GET(req: NextRequest) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  const q = new URL(req.url).searchParams;
  const n = Number(q.get("n") || 3);
  const escopo = resolverEscopo(g.conta, q.get("escopo"));
  const alvo = (q.get("conta") || "").trim() || undefined;
  const r = await ultimosEmails(escopo, Number.isFinite(n) ? n : 3, alvo);

  if (!r.ok) {
    const semConexao = r.motivo === "sem-conexao";
    return NextResponse.json(
      {
        erro: semConexao
          ? "O Google ainda não está conectado nesta conta."
          : "Não consegui ler a caixa agora.",
        motivo: r.motivo,
        acao: semConexao ? "/api/oauth/google/iniciar" : null,
      },
      { status: semConexao ? 409 : 502 },
    );
  }

  return NextResponse.json({
    conta: r.email,
    total: r.mensagens.length,
    mensagens: r.mensagens,
  });
}
