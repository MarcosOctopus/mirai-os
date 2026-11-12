import { NextRequest, NextResponse } from "next/server";

import { exigirConta, listarOrganizacoes } from "@/lib/orgs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * AS ORGANIZACOES DO MIRAI OS — fonte do escopo do ceu da Arca (pedido do dono,
 * 10/11/2026): "quando digo organizacao tem que estar na conta do Mirai OS como
 * organizacao". A lista NAO sai do acervo (pasta `Empresas`), sai do REGISTRO DA
 * PLATAFORMA (tabela `organizations` em data/auth.db).
 *
 * Quem enxerga o que: o dono ve todas; a pessoa ve apenas a organizacao dela (por
 * vinculo de e-mail) — a mesma regua do resto do app, para nao vazar organizacao
 * de cliente para outra conta.
 */
export async function GET(req: NextRequest) {
  const s = await exigirConta(req);
  if (!s.ok) return s.resposta;

  const todas = listarOrganizacoes();
  const visiveis = s.conta.ehDono
    ? todas
    : todas.filter(
        (o) => o.id === s.conta.org?.id || o.membros.some((m) => m.email === s.conta.email),
      );

  return NextResponse.json({
    organizacoes: visiveis.map((o) => ({ id: o.id, nome: o.nome, slug: o.slug })),
  });
}
