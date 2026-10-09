import { NextRequest, NextResponse } from "next/server";

import { credencialSaasoDaConta, exigirConta } from "@/lib/orgs";
import { integracoesDaOrganizacao, integracoesDaPessoa } from "@/lib/integracoes";
import { saasoChamar, saasoStatus } from "@/lib/saaso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Estado da integracao com o Saaso (produto ligado por MCP).
 *
 * A credencial e resolvida na MESMA ordem do resolutor unico do Mirai OS
 * (src/lib/contexto-da-pessoa.ts) — e a mesma que o chat usa hoje:
 *
 *   1. a integracao DA PESSOA (linha 'crm' com credencial),
 *   2. a da EMPRESA, como apoio,
 *   3. o token legado da organizacao (organizations.saaso_token),
 *   4. so o dono da plataforma: a credencial do proprio app (SAASO_MCP_TOKEN).
 *
 * Antes disto esta rota lia SO a credencial da organizacao: a tela podia
 * mostrar "ligada" pelo token da empresa e "nao conectada" pela linha da
 * pessoa — a mesma integracao com dois estados. Agora ha uma so resolucao, a
 * mesma que o chat enxerga.
 *
 * Le ao vivo pelo MCP do produto — nao ha valor em cache nem "fachada":
 * se o MCP cair, `conectado: false` e o motivo aparece em `erro`.
 */
export async function GET(req: NextRequest) {
  const r = await exigirConta(req);
  if (!r.ok) return r.resposta;
  const conta = r.conta;

  let minhas: { tipo: string; credencial: string | null }[] = [];
  let daEmpresa: { tipo: string; credencial: string | null }[] = [];
  try {
    minhas = integracoesDaPessoa(conta.id);
    daEmpresa = conta.org ? integracoesDaOrganizacao(conta.org.id) : [];
  } catch {
    /* sem linhas legiveis: cai no token legado / do dono abaixo */
  }

  const crmDaPessoa = minhas.find((i) => i.tipo === "crm" && i.credencial);
  const crmDaEmpresa = daEmpresa.find((i) => i.tipo === "crm" && i.credencial);
  const legado = credencialSaasoDaConta(conta)?.token;
  const doDono = conta.ehDono ? (process.env.SAASO_MCP_TOKEN || "").trim() : "";

  let token = "";
  let origem: "pessoa" | "organizacao" | "dono" | null = null;
  if (crmDaPessoa?.credencial) {
    token = crmDaPessoa.credencial;
    origem = "pessoa";
  } else if (crmDaEmpresa?.credencial) {
    token = crmDaEmpresa.credencial;
    origem = "organizacao";
  } else if (legado) {
    token = legado;
    origem = "organizacao";
  } else if (doDono) {
    token = doDono;
    origem = "dono";
  }
  token = (token || "").trim();

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
    origem,
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
