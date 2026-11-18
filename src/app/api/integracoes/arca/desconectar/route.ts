/**
 * POST | DELETE /api/integracoes/arca/desconectar — revoga o acesso e esquece.
 *
 * A ordem importa e é o contrato: PRIMEIRO a Arca revoga a credencial do e-mail
 * da sessão; SÓ DEPOIS o cofre desta conta esquece o token.
 *
 * Por que não o contrário: se o app apagasse primeiro e a Arca falhasse, ficaria
 * uma credencial VIVA na organização da pessoa e a tela dizendo "desconectado" —
 * o pior estado possível. Quando a Arca não confirma a revogação, a rota devolve
 * erro e NÃO mexe no cofre: o que a tela mostra continua sendo verdade.
 */
import { NextRequest, NextResponse } from "next/server";

import { exigirConta } from "@/lib/orgs";
import { esquecerArcaDaConta, revogarTokenNaArca, servicoConfigurado } from "@/lib/arca-conta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function desconectar(req: NextRequest) {
  const r = await exigirConta(req);
  if (!r.ok) return r.resposta;
  const { conta } = r;

  const email = (conta.email || "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ ok: false, erro: "sem-email", mensagem: "Esta conta não tem e-mail." }, { status: 400 });
  }

  if (!servicoConfigurado()) {
    return NextResponse.json(
      {
        ok: false,
        erro: "servico-nao-configurado",
        mensagem: "A conexão com a Arca não está configurada neste ambiente — não há como revogar por aqui.",
      },
      { status: 503 },
    );
  }

  const revogacao = await revogarTokenNaArca(email);
  if (!revogacao.ok) {
    return NextResponse.json(
      {
        ok: false,
        erro: revogacao.erro ?? "arca-recusou",
        mensagem:
          revogacao.erro === "servico-recusado"
            ? "Este ambiente não está autorizado a revogar na Arca. Nada foi alterado."
            : "A Arca não confirmou a revogação agora. Nada foi alterado — tente de novo em alguns segundos.",
      },
      { status: 502 },
    );
  }

  esquecerArcaDaConta(conta.id);
  return NextResponse.json({ ok: true, revogado: true, email });
}

export async function POST(req: NextRequest) {
  return desconectar(req);
}

export async function DELETE(req: NextRequest) {
  return desconectar(req);
}
