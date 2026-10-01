import { NextRequest, NextResponse } from "next/server";

import {
  atualizarOrganizacao,
  criarOrganizacao,
  desvincularEmail,
  exigirDono,
  listarOrganizacoes,
  orgPorId,
  removerMembro,
  vincularEmail,
} from "@/lib/orgs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Organizacoes (white-label) — SO O DONO.
 *
 * O dono cria a organizacao, amarra o e-mail do cliente e, se quiser, a
 * credencial de CRM (MCP do Saaso) daquela organizacao. O cliente, ao entrar
 * com o e-mail dele, cai na organizacao dele e nao enxerga as outras.
 */
export async function GET(req: NextRequest) {
  const g = await exigirDono(req);
  if (!g.ok) return g.resposta;
  return NextResponse.json({ organizacoes: listarOrganizacoes() });
}

export async function POST(req: NextRequest) {
  const g = await exigirDono(req);
  if (!g.ok) return g.resposta;

  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const nome = String(corpo?.nome || "").trim();
  if (!nome) {
    return NextResponse.json({ error: "informe o nome da organizacao" }, { status: 400 });
  }
  const email = corpo?.clienteEmail ? String(corpo.clienteEmail).trim() : "";

  const org = criarOrganizacao({
    nome,
    clienteEmail: email || null,
    saasoOrgId: corpo?.saasoOrgId ? String(corpo.saasoOrgId).trim() : null,
    saasoToken: corpo?.saasoToken ? String(corpo.saasoToken).trim() : null,
  });
  return NextResponse.json({ organizacao: org });
}

export async function PATCH(req: NextRequest) {
  const g = await exigirDono(req);
  if (!g.ok) return g.resposta;

  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(corpo?.id || "").trim();
  if (!id || !orgPorId(id)) {
    return NextResponse.json({ error: "organizacao nao encontrada" }, { status: 404 });
  }

  // Membro (funcionario) da empresa: adicionar ou mudar o papel
  const membro = corpo?.membro as { email?: string; papel?: string } | undefined;
  if (membro?.email) {
    const alvo = String(membro.email).trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(alvo)) {
      return NextResponse.json({ error: "informe um e-mail valido" }, { status: 400 });
    }
    const papel = membro.papel === "admin" ? "admin" : membro.papel === "dono" ? "dono" : "membro";
    vincularEmail(alvo, id, papel);
    return NextResponse.json({ organizacao: orgPorId(id), membro: { email: alvo, papel } });
  }

  const org = atualizarOrganizacao(id, {
    nome: corpo?.nome !== undefined ? String(corpo.nome) : undefined,
    clienteEmail:
      corpo?.clienteEmail !== undefined
        ? corpo.clienteEmail
          ? String(corpo.clienteEmail).trim()
          : null
        : undefined,
    saasoOrgId:
      corpo?.saasoOrgId !== undefined
        ? corpo.saasoOrgId
          ? String(corpo.saasoOrgId).trim()
          : null
        : undefined,
    saasoToken:
      corpo?.saasoToken !== undefined
        ? corpo.saasoToken
          ? String(corpo.saasoToken).trim()
          : null
        : undefined,
  });
  return NextResponse.json({ organizacao: org });
}

export async function DELETE(req: NextRequest) {
  const g = await exigirDono(req);
  if (!g.ok) return g.resposta;

  const params = new URL(req.url).searchParams;
  const email = params.get("email");
  const orgId = params.get("orgId");
  if (!email) {
    return NextResponse.json({ error: "informe o e-mail" }, { status: 400 });
  }
  // com orgId: tira so daquela empresa; sem: tira o vinculo (o dono manda)
  const ok = orgId ? removerMembro(email, orgId) : (desvincularEmail(email), true);
  return NextResponse.json({ ok, email, orgId: orgId || null });
}
