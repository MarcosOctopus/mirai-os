/**
 * "ESTA CONTA PODE USAR?" — a pergunta que a tela faz antes de mostrar o app.
 *
 * A resposta de verdade é a porteira (`@/lib/acesso-plano`), que olha as
 * capacidades da organização no plano de controle. A tela usa isto para levar a
 * pessoa à página de planos em vez de deixá-la batendo numa parede de 402.
 *
 * Não confundir com permissão: quem MANDA é o servidor. Rota de uso (chat,
 * acervo) confere a porteira por conta própria — esta rota é a cortesia que
 * evita a pessoa chegar no erro.
 */
import { NextRequest, NextResponse } from "next/server";
import { contaDaRequisicao } from "@/lib/orgs";
import { decidirAcessoPlano, recadoDoBloqueio } from "@/lib/acesso-plano";
import { PLANOS_DO_OS } from "@/lib/planos-do-os";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const conta = await contaDaRequisicao(req);
  if (!conta) {
    return NextResponse.json({ erro: "sem-sessao" }, { status: 401 });
  }
  const d = await decidirAcessoPlano(conta);
  return NextResponse.json({
    pode: d.permitido,
    motivo: d.motivo,
    mensagem: d.permitido ? "" : recadoDoBloqueio(d.motivo),
    ehDono: conta.ehDono,
    planos: PLANOS_DO_OS.map((p) => ({
      id: p.id,
      nome: p.nome,
      valorCentavos: p.valorCentavos,
      link: p.link,
      resumo: p.resumo,
    })),
  });
}
