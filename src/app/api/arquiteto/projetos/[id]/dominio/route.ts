import { NextRequest, NextResponse } from "next/server";

import { exigirConta } from "@/lib/orgs";
import { dominioDoProjeto, definirDominio, enderecoDoProjeto } from "@/lib/arquiteto-projetos";
import { IP_DA_BORDA, conferirApontamento } from "@/lib/dominio-projetos";
import { assinarDominio } from "@/lib/dominio-token";
import { basePublica } from "@/lib/base-publica";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * O LINK que o dono manda para o CLIENTE (dono, 09/10/2026: "tem que ter tudo
 * para fazer essa integração — um processo rápido de explicar o que deve ser
 * feito, ou de uma forma mais rápida"). O cliente não tem conta aqui: abre o
 * link e vê o registro exato a criar e o andamento ao vivo. Token assinado,
 * amarrado ao par (projeto, domínio) — trocar o domínio invalida o link antigo.
 */
function linkDeConexao(req: NextRequest, projetoId: string, dominio: string | null): string | null {
  if (!dominio) return null;
  return `${basePublica(req)}/conectar/${assinarDominio(projetoId, dominio)}`;
}

/**
 * /api/arquiteto/projetos/[id]/dominio — o DOMÍNIO PRÓPRIO do projeto
 * ("Conectar um domínio", o que o dono pediu olhando o Figma Make).
 *
 * O FLUXO TEM DOIS TEMPOS, e esta rota diz em qual se está — nunca "conectado"
 * antes do tempo:
 *   1. o dono digita o domínio (POST) → fica guardado, ainda NÃO abre;
 *   2. o DNS do cliente aponta para o IP da borda (GET confere ao vivo, por
 *      DNS-over-HTTPS) → então o certificado é emitido e o site abre nele.
 *
 *   GET            → { ok, dominio, publicado, ip_borda, apontamento:{estado,ips} }
 *   POST { dominio } → grava/troca; `dominio: ""` desconecta.
 *                      { ok, dominio } | 400 (recado em PT-BR) | 404
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  const { id } = await ctx.params;
  const d = dominioDoProjeto(g.conta.id, id);
  if (!d) return NextResponse.json({ erro: "Projeto não encontrado." }, { status: 404 });

  const end = enderecoDoProjeto(g.conta.id, id);
  const apontamento = d.dominio
    ? await conferirApontamento(d.dominio)
    : { estado: "sem-resposta" as const, ips: [] as string[] };

  return NextResponse.json({
    ok: true,
    dominio: d.dominio,
    publicado: !!end?.publicado_em,
    ip_borda: IP_DA_BORDA,
    apontamento,
    link: linkDeConexao(req, id, d.dominio),
    // A ÚLTIMA MILHA (dono, 09/10/2026): o veredito do serviço da borda. Sem
    // isto o painel não teria como dizer "no ar" — e não pode inventar.
    pronto_em: d.pronto_em,
    erro_publicacao: d.erro,
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  const { id } = await ctx.params;
  let corpo: { dominio?: string } = {};
  try {
    corpo = (await req.json()) as { dominio?: string };
  } catch {
    // Sem corpo = desconectar (não é erro).
  }

  const r = definirDominio(g.conta.id, id, String(corpo.dominio ?? ""));
  if (!r.ok) {
    const naoAchou = /não encontrado/i.test(r.erro);
    return NextResponse.json({ erro: r.erro }, { status: naoAchou ? 404 : 400 });
  }

  const apontamento = r.dominio
    ? await conferirApontamento(r.dominio)
    : { estado: "sem-resposta" as const, ips: [] as string[] };

  return NextResponse.json({
    ok: true,
    dominio: r.dominio,
    ip_borda: IP_DA_BORDA,
    apontamento,
    link: linkDeConexao(req, id, r.dominio),
    pronto_em: r.pronto_em ?? null,
    erro_publicacao: r.erro ?? null,
  });
}
