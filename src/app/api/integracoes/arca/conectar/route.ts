/**
 * POST /api/integracoes/arca/conectar — provisiona o token da organização.
 *
 * ESPECIFICAÇÃO (dono, 17/11/2026): a Arca fica SEMPRE HABILITADA no Synapse —
 * não existe passo de "conectar". Quem provisiona no uso normal é o GET
 * `/api/integracoes/arca`, que roda ao abrir a tela. Esta rota existe para os
 * dois casos em que o token precisa ser (re)emitido na hora:
 *
 *   1. a pessoa REVOGOU e quer voltar a usar sem recarregar a página;
 *   2. o painel suspeita de credencial morta e pede uma nova.
 *
 * Mesmo contrato do GET: identidade vem da SESSÃO (e-mail), a Arca é idempotente
 * (mesma chamada, mesmo token), o token vai CIFRADO para o cofre desta conta e
 * a resposta devolve o token — que é DA PESSOA que está falando — para o painel
 * mostrar. Nada aqui escreve em log.
 */
import { NextRequest, NextResponse } from "next/server";

import { exigirConta } from "@/lib/orgs";
import { pedirTokenNaArca, guardarArcaDaConta, servicoConfigurado, ARCA_MCP_URL } from "@/lib/arca-conta";
import { impressao } from "@/lib/integracoes";
import { cifrar } from "@/lib/segredo-guardado";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Traduz o código interno para o que a tela pode mostrar sem assustar ninguém. */
function mensagemDe(erro: string): { status: number; mensagem: string } {
  switch (erro) {
    case "servico-nao-configurado":
      return {
        status: 503,
        mensagem: "A conexão com a Arca ainda não está configurada neste ambiente. Nada foi alterado na sua conta.",
      };
    case "arca-sem-resposta":
      return {
        status: 502,
        mensagem: "A Arca não respondeu agora. Tente de novo em alguns segundos — sua conta continua como estava.",
      };
    case "servico-recusado":
      return {
        status: 502,
        mensagem: "Este ambiente não está autorizado a falar com a Arca. Nada foi alterado.",
      };
    default:
      return {
        status: 502,
        mensagem: "A Arca não conseguiu liberar o acesso agora. Tente de novo em alguns segundos.",
      };
  }
}

export async function POST(req: NextRequest) {
  const r = await exigirConta(req);
  if (!r.ok) return r.resposta;
  const { conta } = r;

  if (!servicoConfigurado()) {
    const m = mensagemDe("servico-nao-configurado");
    return NextResponse.json({ ok: false, erro: "servico-nao-configurado", mensagem: m.mensagem }, { status: m.status });
  }

  // A ÚNICA fonte de identidade desta rota: a sessão.
  const email = (conta.email || "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json(
      { ok: false, erro: "sem-email", mensagem: "Esta conta não tem e-mail — a Arca precisa dele para achar a sua organização." },
      { status: 400 },
    );
  }

  const pedido = await pedirTokenNaArca(email);
  if (!pedido.ok) {
    const m = mensagemDe(pedido.erro);
    return NextResponse.json({ ok: false, erro: pedido.erro, mensagem: m.mensagem }, { status: m.status });
  }

  guardarArcaDaConta(conta.id, {
    tokenCifrado: cifrar(pedido.token),
    org: pedido.org,
    usuario: pedido.usuario,
    criadoEm: pedido.criadoEm,
  });

  // O token é DA PESSOA que está falando: o painel mostra para ela copiar.
  // `impressao` é a digital (prefixo + hash), para prova sem o segredo.
  return NextResponse.json({
    ok: true,
    conectado: true,
    org: pedido.org,
    usuario: pedido.usuario,
    criado_em: pedido.criadoEm,
    impressao: impressao(pedido.token),
    token: pedido.token,
    url_mcp: ARCA_MCP_URL,
  });
}
