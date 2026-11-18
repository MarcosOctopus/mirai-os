/**
 * GET /api/integracoes/arca — o estado da Arca e o token DESTA conta.
 *
 * ESPECIFICAÇÃO (dono, 17/11/2026): a Arca no Synapse fica SEMPRE HABILITADA.
 * Não existe passo de "conectar" nem callback: ao abrir a tela, o servidor usa o
 * E-MAIL DA SESSÃO, chama a Arca no endpoint de serviço
 * (`POST /org/token-servico`, idempotente) e guarda o token no cofre desta
 * pessoa. A tela recebe o token pronto para copiar.
 *
 * Por que uma rota só faz tudo isso:
 *   - o cofre vazio é o único caso em que se provisiona (uma ida à rede);
 *   - com cofre, a conexão é CONFERIDA ao vivo no máximo a cada 10 minutos
 *     (`arca-conta.ts`); se a Arca disser que o token morreu, provisiona de novo
 *     em vez de mostrar uma credencial morta;
 *   - a revogação apaga a credencial NA ARCA e esquece o cofre; a próxima
 *     abertura emite outra — é o que "sempre habilitada" significa na prática.
 *
 * O token só sai daqui para o DONO da sessão, e nunca em cache:
 *   `Cache-Control: no-store`. Nada nesta rota escreve em log.
 */
import { NextRequest, NextResponse } from "next/server";

import { exigirConta } from "@/lib/orgs";
import {
  ARCA_MCP_URL,
  arcaDaConta,
  conferirArcaDaConta,
  guardarArcaDaConta,
  pedirTokenNaArca,
  servicoConfigurado,
  tokenArcaDaConta,
} from "@/lib/arca-conta";
import { impressao } from "@/lib/integracoes";
import { cifrar } from "@/lib/segredo-guardado";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEM_CACHE = { "Cache-Control": "no-store" } as const;

export async function GET(req: NextRequest) {
  const r = await exigirConta(req);
  if (!r.ok) return r.resposta;
  const { conta } = r;

  const email = (conta.email || "").trim().toLowerCase();
  const disponivel = servicoConfigurado();
  if (!email) {
    return NextResponse.json(
      {
        servico_configurado: disponivel,
        conectado: false,
        mensagem: "Esta conta não tem e-mail — a Arca precisa dele para achar a sua organização.",
        url_mcp: ARCA_MCP_URL,
      },
      { status: 200, headers: SEM_CACHE },
    );
  }
  if (!disponivel) {
    // Sem a credencial de serviço o provisionamento tomaria 401 e a pessoa veria
    // um erro que não é dela. A tela mostra o cartão como indisponível.
    const c = arcaDaConta(conta.id);
    return NextResponse.json(
      {
        servico_configurado: false,
        conectado: Boolean(c),
        org: c?.org ?? null,
        url_mcp: ARCA_MCP_URL,
        mensagem: "A conexão com a Arca não está configurada neste ambiente.",
      },
      { status: 200, headers: SEM_CACHE },
    );
  }

  // ── 1. Cofre existente: confere (barato, com cache de 10 min) e só renova à
  //      força quando a Arca disser que a credencial morreu.
  let c = arcaDaConta(conta.id);
  if (c) {
    let estado: "viva" | "morta" | "indefinido" = "viva";
    try {
      estado = await conferirArcaDaConta(conta.id);
    } catch {
      estado = "indefinido";
    }
    if (estado === "morta") c = arcaDaConta(conta.id); // esquecida pela conferência
    else {
      const token = await tokenArcaDaConta(conta.id);
      if (token) {
        return NextResponse.json(
          {
            servico_configurado: true,
            conectado: true,
            conferido: estado !== "indefinido",
            org: c.org,
            usuario: c.usuario,
            criado_em: c.criadoEm,
            conectado_em: c.conectadoEm,
            impressao: impressao(token),
            /* o token DA PRÓPRIA PESSOA, só nesta rota e sem cache — é o que o
               painel "usar em qualquer ambiente" mostra para copiar. */
            token,
            url_mcp: ARCA_MCP_URL,
            email_da_conta: conta.email,
          },
          { headers: SEM_CACHE },
        );
      }
    }
  }

  // ── 2. Sem cofre (primeira abertura, ou credencial revogada/morta):
  //      PROVISIONA pela sessão. Idempotente do lado da Arca.
  const pedido = await pedirTokenNaArca(email);
  if (!pedido.ok) {
    return NextResponse.json(
      {
        servico_configurado: true,
        conectado: false,
        erro: pedido.erro,
        mensagem:
          pedido.erro === "servico-recusado"
            ? "Este ambiente não está autorizado a falar com a Arca."
            : "A Arca não respondeu agora. Sua conta continua como estava — recarregue em instantes.",
        url_mcp: ARCA_MCP_URL,
      },
      { status: 200, headers: SEM_CACHE },
    );
  }

  guardarArcaDaConta(conta.id, {
    tokenCifrado: cifrar(pedido.token),
    org: pedido.org,
    usuario: pedido.usuario,
    criadoEm: pedido.criadoEm,
  });

  return NextResponse.json(
    {
      servico_configurado: true,
      conectado: true,
      conferido: true,
      org: pedido.org,
      usuario: pedido.usuario,
      criado_em: pedido.criadoEm,
      conectado_em: new Date().toISOString(),
      impressao: impressao(pedido.token),
      token: pedido.token,
      url_mcp: ARCA_MCP_URL,
      email_da_conta: conta.email,
    },
    { headers: SEM_CACHE },
  );
}
