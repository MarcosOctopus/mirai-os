import { NextRequest, NextResponse } from "next/server";

import { exigirConta } from "@/lib/orgs";
import { MODELO_DA_CONTA } from "@/lib/gateway-da-conta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/arquiteto/modelo — "qual modelo o Arquiteto está usando AGORA?"
 *
 * Existe para o controle "Automática" do compositor ser HONESTO: ele NÃO é um
 * menu falso; é o ESTADO real. O modelo NÃO é escolhido pela pessoa — a Mirai
 * escolhe sozinha, conforme a conta. Esta rota lê o MESMO valor que o construtor
 * usa (`MODELO_DA_CONTA`, o padrão da casa quando a conta não fixou outro) e o
 * devolve. Nada de nome de modelo escrito à mão no cliente: o cliente lê daqui.
 *
 * PORTEIRA: mesma sessão do resto do Arquiteto. Sem conta → 401 (o guard já
 * responde). Não há credencial nem segredo aqui — só o NOME do modelo.
 */
export async function GET(req: NextRequest) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  return NextResponse.json(
    {
      // Deixa explícito para a tela: a escolha é da Mirai, não da pessoa.
      automatico: true,
      // O modelo REAL que o construtor (/api/arquiteto/gerar) manda ao provedor.
      modelo: MODELO_DA_CONTA,
    },
    { status: 200 },
  );
}
