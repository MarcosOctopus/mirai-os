import { NextRequest, NextResponse } from "next/server";

import { credencialSaasoDaConta, exigirConta } from "@/lib/orgs";
import { saasoChamar, saasoStatus } from "@/lib/saaso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Estado da integracao com o Saaso (produto ligado por MCP).
 *
 * A credencial e a da ORGANIZACAO da conta logada:
 *  - cliente: so a organizacao dele (memberships -> organizations.saaso_token);
 *  - dono da plataforma: a credencial da propria conta (SAASO_MCP_TOKEN);
 *  - sem vinculo: `vinculado: false` e NADA e consultado.
 *
 * Le ao vivo pelo MCP do produto — nao ha valor em cache nem "fachada":
 * se o MCP cair, `conectado: false` e o motivo aparece em `erro`.
 */
export async function GET(req: NextRequest) {
  const r = await exigirConta(req);
  if (!r.ok) return r.resposta;
  const conta = r.conta;

  const doVinculo = credencialSaasoDaConta(conta)?.token;
  const doDono = conta.ehDono ? (process.env.SAASO_MCP_TOKEN || "").trim() : "";
  const token = (doVinculo || doDono || "").trim();

  const status = token
    ? await saasoStatus(token)
    : {
        configurado: false,
        conectado: false,
        ferramentas: 0,
        endpoint: process.env.SAASO_MCP_URL || "https://saaso.miraitohope.com/api/mcp",
        erro: conta.org
          ? "esta organizacao ainda nao tem credencial de CRM vinculada"
          : "esta conta nao esta vinculada a nenhuma organizacao",
      };

  let funil = "";
  let fila = "";
  if (status.conectado && token) {
    const [p, q] = await Promise.all([
      saasoChamar(token, "crm_list_pipelines"),
      saasoChamar(token, "crm_get_queue_status"),
    ]);
    funil = p;
    fila = q;
  }

  return NextResponse.json({
    ...status,
    vinculado: Boolean(token),
    ehDono: conta.ehDono,
    papel: conta.ehDono ? "dono" : conta.org ? "cliente" : "sem-organizacao",
    organizacao: conta.org
      ? { id: conta.org.id, nome: conta.org.nome, slug: conta.org.slug }
      : null,
    funil,
    fila,
    lidoEm: new Date().toISOString(),
  });
}
