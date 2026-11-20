import { NextRequest, NextResponse } from "next/server";

import { limiteDeOrganizacoes } from "@/lib/limite-organizacoes";
import {
  criarOrganizacao,
  exigirConta,
  listarOrganizacoes,
  membrosDaOrg,
  orgPorId,
  vincularEmail,
} from "@/lib/orgs";

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

  // QUANTAS CABEM NO PLANO (dono, 20/11/2026): a tela precisa saber para mostrar
  // "2 de 3" e explicar o bloqueio ANTES de a pessoa tentar criar.
  const email = s.conta.email.toLowerCase();
  const usadas = todas.filter((o) =>
    o.membros.some((m) => m.email.toLowerCase() === email && (m.papel === "admin" || m.papel === "dono")),
  ).length;

  let limite: { plano: string | null; total: number | null } = { plano: null, total: null };
  if (!s.conta.ehDono) {
    const l = await limiteDeOrganizacoes(s.conta.email);
    limite = { plano: l.plano, total: l.total };
  }

  return NextResponse.json({
    organizacoes: visiveis.map((o) => ({ id: o.id, nome: o.nome, slug: o.slug })),
    limite: { ...limite, usadas, dono: Boolean(s.conta.ehDono) },
  });
}

/**
 * CRIAR ORGANIZAÇÃO — agora é de QUEM ENTROU, não só do dono (dono, 20/11/2026:
 * "meus colaboradores não estão conseguindo adicionar organização nova").
 *
 * Antes só existia o POST do painel admin (`/api/admin/organizacoes`), que exige
 * `exigirDono` — ou seja: a porta de criar empresa estava trancada para todo
 * mundo menos para uma conta. Aqui a regra é a mesma do resto do produto: quem
 * cria é dono/admin DA PRÓPRIA organização, e não vê as dos outros.
 *
 * Teto de 20 por conta: um laço (ou um script) não enche o registro da
 * plataforma, e continua sendo folgado para uso real.
 */
export async function POST(req: NextRequest) {
  const s = await exigirConta(req);
  if (!s.ok) return s.resposta;

  const corpo = await req.json().catch(() => null);
  const nome = String(corpo?.nome ?? "").trim().replace(/\s+/g, " ");
  if (nome.length < 2 || nome.length > 60) {
    return NextResponse.json({ error: "Nome da organização precisa ter de 2 a 60 letras." }, { status: 400 });
  }

  // TETO PELO PLANO (dono, 20/11/2026): não é um número fixo — é o
  // `limits.organizacoes` do plano `mirai` de cada um, lido do plano de controle.
  const email = s.conta.email.toLowerCase();
  const todas = listarOrganizacoes();
  if (!s.conta.ehDono) {
    const usadas = todas.filter((o) =>
      o.membros.some((m) => m.email.toLowerCase() === email && (m.papel === "admin" || m.papel === "dono")),
    ).length;
    const { plano, total } = await limiteDeOrganizacoes(s.conta.email);
    if (total !== null && usadas >= total) {
      const nome = plano ?? "seu plano";
      return NextResponse.json(
        {
          error:
            total === 0
              ? `O plano ${nome} não inclui organizações próprias.`
              : `O plano ${nome} permite ${total} organização${total > 1 ? "ões" : ""} e você já usa ${usadas}.`,
          plano,
          limite: total,
          usadas,
        },
        { status: 402 },
      );
    }
  }

  // `clienteEmail` = quem fundou: o vínculo entra como ADMIN da org nova.
  const org = criarOrganizacao({ nome, clienteEmail: s.conta.email });
  return NextResponse.json(
    { organizacao: { id: org.id, nome: org.nome, slug: org.slug } },
    { status: 201 },
  );
}

/**
 * ADICIONAR MEMBRO — pelo ADMIN DA ORGANIZAÇÃO, não só pelo dono da plataforma.
 * A regra antiga mandava tudo para `/api/admin/organizacoes`, então o sócio que
 * fundou a empresa não conseguia pôr o time dele dentro dela. Aqui vale:
 * dono da plataforma OU quem é `admin`/`dono` NAQUELA organização.
 */
export async function PATCH(req: NextRequest) {
  const s = await exigirConta(req);
  if (!s.ok) return s.resposta;

  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(corpo?.id || "").trim();
  if (!id || !orgPorId(id)) {
    return NextResponse.json({ error: "organização não encontrada" }, { status: 404 });
  }

  const email = s.conta.email.toLowerCase();
  const meu = membrosDaOrg(id).find((m) => m.email.toLowerCase() === email);
  const souAdminDaOrg = s.conta.ehDono || (meu ? meu.papel === "admin" || meu.papel === "dono" : false);
  if (!souAdminDaOrg) {
    return NextResponse.json(
      { error: "só quem administra esta organização pode adicionar membros" },
      { status: 403 },
    );
  }

  const membro = corpo?.membro as { email?: string; papel?: string } | undefined;
  if (!membro?.email) {
    return NextResponse.json({ error: "informe o e-mail de quem vai entrar" }, { status: 400 });
  }
  const alvo = String(membro.email).trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(alvo)) {
    return NextResponse.json({ error: "e-mail inválido" }, { status: 400 });
  }
  // O vínculo agora é por (email, organização): a mesma pessoa pode estar em
  // várias empresas — e é isso que o plano por número de organizações exige.
  // O que NÃO se admite é o mesmo e-mail duas vezes na MESMA organização (é a
  // chave primária; `vincularEmail` só atualiza o papel).
  const papel = membro.papel === "admin" ? "admin" : "membro";
  vincularEmail(alvo, id, papel);
  return NextResponse.json({ ok: true, membro: { email: alvo, papel } }, { status: 201 });
}
