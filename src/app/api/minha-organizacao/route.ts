import { NextRequest, NextResponse } from "next/server";

import {
  OWNER_EMAIL,
  ehAdminDaOrg,
  exigirConta,
  membrosDaOrg,
  orgDoEmail,
  papelNaOrg,
  removerMembro,
  vincularEmail,
} from "@/lib/orgs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A MINHA organizacao — o que a propria empresa ve e gerencia.
 *
 * Cada empresa tem o seu CRM, com os clientes e os FUNCIONARIOS dela. Esta
 * rota só enxerga a organização da conta logada: nunca outra.
 *   - qualquer conta: ve a organizacao e quem entra nela;
 *   - admin da organizacao (ou o dono da plataforma): adiciona/tira funcionarios.
 */
export async function GET(req: NextRequest) {
  const r = await exigirConta(req);
  if (!r.ok) return r.resposta;
  const conta = r.conta;

  if (!conta.org) {
    return NextResponse.json({
      organizacao: null,
      membros: [],
      papel: conta.ehDono ? "dono" : null,
      podeGerir: conta.ehDono,
      erro: "esta conta nao esta vinculada a nenhuma organizacao",
    });
  }

  return NextResponse.json({
    organizacao: {
      id: conta.org.id,
      nome: conta.org.nome,
      slug: conta.org.slug,
      crm: Boolean(conta.org.saaso_token),
    },
    membros: membrosDaOrg(conta.org.id),
    papel: papelNaOrg(conta.email),
    podeGerir: ehAdminDaOrg(conta),
  });
}

export async function POST(req: NextRequest) {
  const r = await exigirConta(req);
  if (!r.ok) return r.resposta;
  const conta = r.conta;

  if (!conta.org) {
    return NextResponse.json({ error: "esta conta nao esta vinculada a nenhuma organizacao" }, { status: 400 });
  }
  if (!ehAdminDaOrg(conta)) {
    return NextResponse.json(
      { error: "so o admin da organizacao pode adicionar gente" },
      { status: 403 },
    );
  }

  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const email = String(corpo?.email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "informe um e-mail valido" }, { status: 400 });
  }
  const papel = corpo?.papel === "admin" ? "admin" : "membro";

  // Ninguem "rouba" gente de outra empresa: quem ja tem organizacao fica nela.
  const jaEm = orgDoEmail(email);
  if (jaEm && jaEm !== conta.org.id) {
    return NextResponse.json(
      { error: "este e-mail ja pertence a outra organizacao" },
      { status: 409 },
    );
  }

  vincularEmail(email, conta.org.id, papel);
  return NextResponse.json({
    ok: true,
    membro: { email, papel },
    membros: membrosDaOrg(conta.org.id),
  });
}

export async function DELETE(req: NextRequest) {
  const r = await exigirConta(req);
  if (!r.ok) return r.resposta;
  const conta = r.conta;

  if (!conta.org) {
    return NextResponse.json({ error: "esta conta nao esta vinculada a nenhuma organizacao" }, { status: 400 });
  }
  if (!ehAdminDaOrg(conta)) {
    return NextResponse.json(
      { error: "so o admin da organizacao pode tirar gente" },
      { status: 403 },
    );
  }

  const email = (new URL(req.url).searchParams.get("email") || "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "informe o e-mail" }, { status: 400 });
  }
  if (email === OWNER_EMAIL) {
    return NextResponse.json({ error: "o dono da plataforma nao pode ser removido" }, { status: 403 });
  }

  // A empresa nao pode ficar sem quem a administre.
  const restantes = membrosDaOrg(conta.org.id).filter((m) => m.email !== email);
  if (!restantes.some((m) => m.papel === "admin" || m.papel === "dono")) {
    return NextResponse.json(
      { error: "a organizacao precisa de pelo menos um admin" },
      { status: 400 },
    );
  }

  const ok = removerMembro(email, conta.org.id);
  return NextResponse.json({ ok, membros: membrosDaOrg(conta.org.id) });
}
