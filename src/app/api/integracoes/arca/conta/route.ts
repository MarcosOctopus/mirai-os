/**
 * /api/integracoes/arca/conta — a credencial de CONTA para o MCP (18/11/2026).
 *
 * Pedido do dono, literal: "quero que o MCP seja da conta, não dividido por
 * empresa — ele puxa tudo e grava, edita e exclui de tudo de acordo com o que
 * foi liberado para a pessoa". E, sobre o painel: "no compartilha você escolhe:
 * pessoal + organizações · só pessoal · só organizações".
 *
 * O que esta rota guarda: a credencial `arca_conta_…` CIFRADA no cofre desta
 * conta (`platform_config.arca_conta`), separada do token de ORGANIZAÇÃO
 * (`platform_config.arca`), que continua sendo o que o app usa para LER o
 * acervo. Duas coisas diferentes, duas chaves — misturar quebraria a leitura.
 *
 *   GET    → devolve o token de conta desta pessoa + alcance + espaços
 *            (provisiona na primeira vez; idempotente na Arca)
 *   POST   → {"escopo":"tudo"|"pessoal"|"organizacoes"} troca o alcance SEM
 *            trocar o token (quem já copiou continua conectado)
 *   DELETE → revoga na Arca e esquece o cofre
 *
 * Regras: identidade vem SEMPRE do e-mail da sessão; o token nunca vai para log
 * nem para mensagem de erro; nada aqui é cacheável (`no-store`).
 */
import { NextRequest, NextResponse } from "next/server";

import { exigirConta } from "@/lib/orgs";
import {
  ARCA_MCP_URL,
  contaNaArca,
  esquecerContaNaArca,
  guardarContaNaArca,
  pedirContaNaArca,
  revogarContaNaArca,
  servicoConfigurado,
  type EscopoConta,
} from "@/lib/arca-conta";
import { impressao } from "@/lib/integracoes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEM_CACHE = { "Cache-Control": "no-store" } as const;

function escopoValido(valor: unknown): EscopoConta {
  const v = String(valor || "").trim().toLowerCase();
  if (v === "tudo" || v === "todos" || v === "pessoal+organizacoes" || v === "ambos") return "tudo";
  if (v === "organizacoes" || v === "org" || v === "empresas") return "organizacoes";
  // desconhecido/ausente => o mais CONSERVADOR (dono, 18/11/2026)
  return "pessoal";
}

function respostaComToken(
  token: string,
  escopo: EscopoConta,
  espacos: { espaco: string; nome: string; papel: string; pessoal: boolean }[],
  criadoEm: string | null,
  email: string,
) {
  return NextResponse.json(
    {
      servico_configurado: true,
      conectado: true,
      tipo: "conta",
      escopo,
      espacos,
      criado_em: criadoEm,
      impressao: impressao(token),
      token,
      url_mcp: ARCA_MCP_URL,
      email_da_conta: email,
    },
    { headers: SEM_CACHE },
  );
}

export async function GET(req: NextRequest) {
  const r = await exigirConta(req);
  if (!r.ok) return r.resposta;
  const { conta } = r;

  const email = (conta.email || "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json(
      { conectado: false, mensagem: "Esta conta não tem e-mail — a Arca precisa dele." },
      { status: 200, headers: SEM_CACHE },
    );
  }
  if (!servicoConfigurado()) {
    return NextResponse.json(
      { servico_configurado: false, conectado: false, mensagem: "A Arca não está configurada neste ambiente." },
      { status: 200, headers: SEM_CACHE },
    );
  }

  // Cofre: devolve a credencial de conta já existente (decifra só aqui).
  const guardada = contaNaArca(conta.id);
  if (guardada) {
    const { decifrar } = await import("@/lib/segredo-guardado");
    const claro = decifrar(guardada.tokenCifrado);
    if (claro) {
      // O APP é a autoridade do que está escolhido na tela: reaplica o recorte
      // guardado na Arca (idempotente, mesmo token) para a tela NUNCA afirmar um
      // alcance diferente do que está valendo de verdade.
      const sync = await pedirContaNaArca(email, guardada.escopo);
      if (sync.ok && sync.token) {
        guardarContaNaArca(conta.id, {
          tokenClaro: sync.token,
          escopo: sync.escopo || guardada.escopo,
          espacos: sync.espacos || guardada.espacos,
          criadoEm: sync.criadoEm ?? guardada.criadoEm,
          mcp: sync.mcp || ARCA_MCP_URL,
        });
        return respostaComToken(sync.token, sync.escopo || guardada.escopo, sync.espacos || guardada.espacos, sync.criadoEm ?? guardada.criadoEm, email);
      }
      return respostaComToken(claro, guardada.escopo, guardada.espacos, guardada.criadoEm, email);
    }
    esquecerContaNaArca(conta.id); // cifra ilegível: emite outra
  }

  const pedido = await pedirContaNaArca(email, "pessoal");
  if (!pedido.ok || !pedido.token) {
    return NextResponse.json(
      { servico_configurado: true, conectado: false, mensagem: pedido.erro || "não foi possível emitir a credencial de conta agora." },
      { status: 200, headers: SEM_CACHE },
    );
  }
  guardarContaNaArca(conta.id, {
    tokenClaro: pedido.token,
    escopo: pedido.escopo || "pessoal",
    espacos: pedido.espacos || [],
    criadoEm: pedido.criadoEm ?? null,
    mcp: pedido.mcp || ARCA_MCP_URL,
  });
  return respostaComToken(pedido.token, pedido.escopo || "pessoal", pedido.espacos || [], pedido.criadoEm ?? null, email);
}

export async function POST(req: NextRequest) {
  const r = await exigirConta(req);
  if (!r.ok) return r.resposta;
  const { conta } = r;
  const email = (conta.email || "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ conectado: false, mensagem: "sem e-mail na conta" }, { status: 400, headers: SEM_CACHE });
  }

  let corpo: Record<string, unknown> = {};
  try {
    corpo = (await req.json()) as Record<string, unknown>;
  } catch {
    corpo = {};
  }
  const escopo = escopoValido(corpo.escopo);

  const pedido = await pedirContaNaArca(email, escopo);
  if (!pedido.ok || !pedido.token) {
    return NextResponse.json(
      { conectado: false, mensagem: pedido.erro || "não consegui mudar o alcance agora." },
      { status: 200, headers: SEM_CACHE },
    );
  }
  guardarContaNaArca(conta.id, {
    tokenClaro: pedido.token,
    escopo: pedido.escopo || escopo,
    espacos: pedido.espacos || [],
    criadoEm: pedido.criadoEm ?? null,
    mcp: pedido.mcp || ARCA_MCP_URL,
  });
  return respostaComToken(pedido.token, pedido.escopo || escopo, pedido.espacos || [], pedido.criadoEm ?? null, email);
}

export async function DELETE(req: NextRequest) {
  const r = await exigirConta(req);
  if (!r.ok) return r.resposta;
  const { conta } = r;
  const email = (conta.email || "").trim().toLowerCase();

  let ok = false;
  let erro: string | undefined;
  if (email) {
    const res = await revogarContaNaArca(email);
    ok = res.ok;
    erro = res.erro;
  }
  esquecerContaNaArca(conta.id);
  return NextResponse.json(
    { conectado: false, revogado: ok, mensagem: ok ? "credencial de conta revogada na Arca." : erro || "revogado localmente; a Arca não confirmou." },
    { headers: SEM_CACHE },
  );
}