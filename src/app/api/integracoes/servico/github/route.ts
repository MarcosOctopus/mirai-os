/**
 * /api/integracoes/servico/github — a Arca pede o GitHub DA PESSOA.
 *
 * QUEM CHAMA: a Arca (fonte viva), server-to-server, com o segredo de serviço no
 * cabeçalho `x-arca-servico` (env `ARCA_SERVICO_CREDENCIAL`). É o inverso do
 * `/org/token-servico` da Arca: lá o app pede o acervo da pessoa; aqui a Arca
 * pede a credencial de um provedor que a pessoa conectou no app.
 *
 * POR QUE EXISTE (dono, 23/11/2026): o GitHub conectado por OAuth no MIRAI OS
 * morria na porta do app — a Arca não sabia que a conexão existia e o acervo
 * seguia cego (ou usava um `GITHUB_TOKEN` global, que não é de ninguém). Sem esta
 * rota, conectar GitHub nunca virava memória.
 *
 * REGRAS QUE NÃO SE NEGOCIAM (mesma doutrina da ponte e do provisionamento):
 *  - sem a env, ou com segredo curto demais, a porta NÃO EXISTE → 503. Falha
 *    fechada: melhor a Arca dizer "não consigo" do que abrir para qualquer um;
 *  - cabeçalho errado → 401, comparação em TEMPO CONSTANTE (tamanhos diferentes
 *    nunca autenticam);
 *  - a identidade vem do E-MAIL que a Arca manda — e a Arca só manda o e-mail do
 *    dono daquele espaço pessoal. O token é lido do cofre DAQUELA conta;
 *  - **escopo `organizacao` é recusado (403) de propósito**: o token é da pessoa;
 *    usá-lo para responder por uma organização faria um membro herdar o acesso
 *    privado de outro. Organização entra quando existir token por membro;
 *  - o token NUNCA é logado, NUNCA entra em mensagem de erro e NUNCA volta em
 *    campo de diagnóstico. Ele sai UMA vez, no corpo desta resposta, e só para
 *    quem apresentou o segredo do serviço.
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

import { getUserByEmail } from "@/lib/auth";
import { tokenGithubDaConta, githubDaConta } from "@/lib/github-conta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Abaixo disto o segredo é adivinhável, e a porta fica desligada. */
const TAMANHO_MINIMO_DO_SEGREDO = 32;

/** Comparação em tempo constante; tamanhos diferentes nunca autenticam. */
function segredoConfere(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido, "utf8");
  const b = Buffer.from(esperado, "utf8");
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function negar(status: number, erro: string) {
  return NextResponse.json({ erro }, { status, headers: { "cache-control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const segredo = (process.env.ARCA_SERVICO_CREDENCIAL || "").trim();
  if (segredo.length < TAMANHO_MINIMO_DO_SEGREDO) {
    return negar(503, "esta rota não está habilitada neste ambiente");
  }
  if (!segredoConfere((req.headers.get("x-arca-servico") || "").trim(), segredo)) {
    return negar(401, "credencial de serviço inválida");
  }

  let corpo: { email?: unknown; escopo?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return negar(400, "corpo inválido");
  }

  const email = typeof corpo.email === "string" ? corpo.email.trim().toLowerCase() : "";
  if (!email || !email.includes("@")) {
    return negar(400, "e-mail ausente");
  }

  /* ESCOPO: pessoal agora, organização só quando houver token POR MEMBRO. */
  const escopo = typeof corpo.escopo === "string" ? corpo.escopo.trim().toLowerCase() : "pessoal";
  if (escopo !== "pessoal") {
    return negar(
      403,
      "escopo de organização ainda não é servido: a credencial é da pessoa. Organização entra quando existir token por membro.",
    );
  }

  const pessoa = getUserByEmail(email);
  if (!pessoa) {
    return negar(404, "não há conta com este e-mail neste servidor");
  }

  const conexao = githubDaConta(pessoa.id);
  if (!conexao) {
    return negar(409, "esta conta não tem GitHub conectado");
  }

  const token = await tokenGithubDaConta(pessoa.id);
  if (!token) {
    return negar(409, "a conexão do GitHub desta conta não devolveu token válido — reconecte em Integrações");
  }

  return NextResponse.json(
    {
      provedor: "github",
      escopo: "pessoal",
      login: conexao.login,
      expira_em: conexao.expiraEm,
      token,
    },
    { headers: { "cache-control": "no-store" } },
  );
}