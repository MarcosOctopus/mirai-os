/**
 * /api/integracoes — a pessoa pluga o que é DELA.
 *
 * Correção do dono (07/out/2026): *"preciso que pegue o que aquela conta tem de
 * integrações individuais"*. Antes disto não havia onde plugar: a única
 * credencial era a da empresa, e quem entrasse usava a do dono dela.
 *
 * Regras desta rota (todas server-side):
 *   - a pessoa só vê e só mexe no que é DELA (`dono_tipo='pessoa'`, `dono_id` =
 *     id da conta que está falando) — o isolamento é condição da consulta, não
 *     checagem depois;
 *   - o segredo NUNCA volta em claro: a resposta traz só o rótulo e a
 *     impressão digital;
 *   - integração da empresa aparece na lista como leitura (é apoio), e não é
 *     alterável por aqui;
 *   - o CRM (tipo 'crm') é VALIDADO AO VIVO antes de gravar: credencial que o
 *     CRM não confirma não é salva — nunca se guarda um token não testado, e
 *     nunca se diz "conectado" sem o CRM ter respondido.
 */

import { NextRequest, NextResponse } from "next/server";

import { exigirConta } from "@/lib/orgs";
import {
  TIPOS_SUPORTADOS,
  consumirVinculosPendentes,
  criarIntegracao,
  desligarIntegracao,
  integracoesDaOrganizacao,
  integracoesDaPessoa,
  semSegredo,
} from "@/lib/integracoes";
import type { Integracao } from "@/lib/integracoes";
import { CATALOGO } from "@/lib/integracoes/catalogo";
import { configurado as githubConfigurado } from "@/lib/github-oauth";
import { provedorDaPonte } from "@/lib/ponte-provedores";
import { saasoValidarCredencial } from "@/lib/saaso";
import { cifrar } from "@/lib/segredo-guardado";
import { testarCredencial } from "@/lib/testar-integracao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * O que está PRONTO para conectar nesta instalação — decidido NO SERVIDOR,
 * porque depende de variável de ambiente que o navegador não enxerga. É isto
 * que impede o botão mentir: a tela só mostra "conectar" onde há caminho real;
 * onde não há, mostra "indisponível" com o motivo. Nunca um clique vazio.
 */
function prontidao(): Record<string, { pronta: boolean; motivo?: string }> {
  const google = Boolean(
    (process.env.GOOGLE_CLIENT_ID || "").trim() && (process.env.GOOGLE_CLIENT_SECRET || "").trim(),
  );
  const mapa: Record<string, { pronta: boolean; motivo?: string }> = {};
  for (const i of CATALOGO) {
    if (i.oauthPath === "/api/auth/drive" || i.oauthPath === "/api/auth/youtube") {
      mapa[i.id] = google
        ? { pronta: true }
        : { pronta: false, motivo: "a conexão com o Google ainda não está configurada neste servidor" };
    } else if (i.tipo === "mcp" && !i.site) {
      mapa[i.id] = { pronta: false, motivo: "roda dentro do MIRAI OS — ainda sem site próprio" };
    } else if (i.id === "github") {
      /* a conexão do GitHub existe quando o App do GitHub está configurado
         neste servidor (Client ID + Secret). A conexão em si é por projeto. */
      mapa[i.id] = githubConfigurado()
        ? { pronta: true }
        : { pronta: false, motivo: "a conexão com o GitHub ainda não está configurada neste servidor" };
    } else {
      mapa[i.id] = { pronta: true };
    }
  }
  return mapa;
}

/**
 * A linha pronta para a tela: SEM o segredo (o `semSegredo` já tira a
 * credencial) e com o `status` declarado. 'conectado' quando existe credencial
 * guardada; 'pendente' quando a linha existe sem credencial. Nunca vaza o
 * segredo — só o rótulo, a impressão digital e este status.
 */
function comStatus(i: Integracao): ReturnType<typeof semSegredo> & { status: "conectado" | "pendente" } {
  return {
    ...semSegredo(i),
    status: i.credencial && i.credencial.trim() ? "conectado" : "pendente",
  };
}

/**
 * O GitHub desta conta RESPONDE? — e o que fazer quando não responde.
 *
 * O selo "conectado" olhava só a PRESENÇA do blob no cofre. Medido em
 * 16/10/2026: a tela dizia "conectado" com o token em 401 `Bad credentials`, e a
 * pessoa só descobria ao pedir algo e receber "reconecte". Aqui a conexão é
 * conferida de verdade:
 *
 *  - responde → nada muda;
 *  - 401 SEM `refresh_token` → está morta e não há como renovar: é ESQUECIDA, e
 *    o botão de conectar volta a aparecer. Manter o blob só serviria para a tela
 *    continuar afirmando o que não é verdade;
 *  - qualquer outra coisa (rede, 5xx) → NÃO mexe. Falha nossa não apaga a
 *    credencial de ninguém.
 */
async function conferirGithubDaConta(userId: number): Promise<void> {
  try {
    const { githubDaConta, tokenGithubDaConta, esquecerGithubDaConta } = await import("@/lib/github-conta");
    const c = githubDaConta(userId);
    if (!c) return;
    // Renova se venceu; se não houver o que renovar, devolve o token atual.
    const token = await tokenGithubDaConta(userId);
    if (!token) return;
    const { usuarioDoToken } = await import("@/lib/github-api");
    // Teto curto: conferir integração não pode segurar a tela se o GitHub
    // estiver lento. Sem resposta em 6s, NÃO mexe em nada (falha nossa ≠
    // credencial inválida).
    const u = await Promise.race([
      usuarioDoToken(token),
      new Promise<{ ok: false; erro: string }>((r) =>
        setTimeout(() => r({ ok: false, erro: "tempo esgotado ao conferir" }), 6000),
      ),
    ]);
    if (u.ok) return;
    // Só a recusa EXPLÍCITA derruba a conexão — e só quando não há renovação.
    const morta = /401|Bad credentials|não está mais válida/i.test(u.erro || "");
    if (morta && !c.refreshCifrado) esquecerGithubDaConta(userId);
  } catch {
    /* conferir integração não pode derrubar a lista de integrações */
  }
}

export async function GET(req: NextRequest) {
  const r = await exigirConta(req);
  if (!r.ok) return r.resposta;
  const { conta } = r;

  /* A PONTE, consumida AQUI e não só no login (14/10/2026).
     Quando a pessoa conecta o CRM pelo "Entrar com Mirai", quem cunha a
     credencial é o PRÓPRIO CRM e ele a entrega a este app pela ponte. A ponte
     guarda por E-MAIL em `vinculos_pendentes`, e até agora o único consumo era
     o login: quem conectava com a sessão já aberta só veria o CRM ligado no
     PRÓXIMO login — e concluiria que não funcionou. Consumir ao CARREGAR a tela
     fecha o ciclo: clicou, voltou, está conectado. */
  try {
    consumirVinculosPendentes(conta.id, conta.email);
  } catch {
    /* integração que tropeça não derruba a lista de integrações */
  }

  // Conferir ANTES de montar a lista: é o que impede o selo de mentir.
  await conferirGithubDaConta(conta.id);
  // Canva (19/10/2026): conexão por PESSOA, token de 4h com refresh rotativo —
  // sem esta conferência a tela diria "conectado" com o token morto.
  try {
    const { conferirCanvaDaConta } = await import("@/lib/canva-conta");
    await conferirCanvaDaConta(conta.id);
  } catch {
    /* conferir integração não pode derrubar a lista */
  }

  const minhas = integracoesDaPessoa(conta.id).map(comStatus);
  const daEmpresa = conta.org
    ? integracoesDaOrganizacao(conta.org.id).map(comStatus)
    : [];

  return NextResponse.json({
    pessoa: { id: conta.id, nome: conta.nome, email: conta.email },
    organizacao: conta.org ? { id: conta.org.id, nome: conta.org.nome } : null,
    minhas,
    daEmpresa,
    tipos: TIPOS_SUPORTADOS,
    prontidao: prontidao(),
  });
}

export async function POST(req: NextRequest) {
  const r = await exigirConta(req);
  if (!r.ok) return r.resposta;
  const { conta } = r;

  let corpo: { tipo?: string; rotulo?: string; credencial?: string; config?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  }

  const tipo = (corpo.tipo || "").trim().toLowerCase();
  if (!TIPOS_SUPORTADOS.includes(tipo as (typeof TIPOS_SUPORTADOS)[number])) {
    return NextResponse.json(
      { error: `tipo não suportado (use: ${TIPOS_SUPORTADOS.join(", ")})` },
      { status: 400 },
    );
  }
  const credencial = (corpo.credencial || "").trim();
  if (!credencial) {
    return NextResponse.json({ error: "credencial é obrigatória" }, { status: 400 });
  }

  // O `config` recebido, quando for um objeto JSON — é dele que o Supabase
  // tira o endereço do projeto (o mesmo que a ponte lerá depois).
  const config =
    corpo.config && typeof corpo.config === "object" && !Array.isArray(corpo.config)
      ? (corpo.config as Record<string, unknown>)
      : null;

  // Provedor da ponte conhecido? Se sim, esta credencial tem prova AO VIVO e
  // vai gravada CIFRADA.
  const provedor = provedorDaPonte(tipo);

  // O CRM é confirmado AO VIVO antes de gravar. A validação roda aqui (não só
  // na tela) de propósito: assim nenhum caminho — nem um cliente direto na
  // rota — consegue guardar uma credencial não testada.
  if (tipo === "crm") {
    const v = await saasoValidarCredencial(credencial);
    if (!v.valida) {
      return NextResponse.json({ error: v.erro, motivo: v.motivo }, { status: 400 });
    }
  } else if (provedor) {
    // Provedor da ponte: a MESMA doutrina do CRM — nada é gravado sem prova.
    // `testarCredencial` monta o alvo com o catálogo (e exige o endereço do
    // projeto quando o provedor precisa, como o Supabase) e faz UMA chamada
    // barata. Falhou → 400 com o recado honesto, e NADA é gravado.
    const teste = await testarCredencial(tipo, credencial, config);
    if (!teste.ok) {
      return NextResponse.json({ error: teste.mensagem }, { status: 400 });
    }
  }

  // Provedor grava CIFRADO (a ponte decifra na leitura, com fallback para o que
  // já estava em claro). Os tipos da casa seguem gravando EXATAMENTE como antes.
  const credencialGuardada = provedor ? cifrar(credencial) : credencial;

  // SEMPRE da pessoa que está falando. Não existe caminho para escrever na
  // integração de outra pessoa por esta rota.
  const criada = criarIntegracao({
    dono_tipo: "pessoa",
    dono_id: String(conta.id),
    tipo,
    rotulo: (corpo.rotulo || "").trim() || tipo,
    credencial: credencialGuardada,
    config: corpo.config ? JSON.stringify(corpo.config) : null,
  });

  return NextResponse.json({ ok: true, integracao: semSegredo(criada) }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const r = await exigirConta(req);
  if (!r.ok) return r.resposta;
  const { conta } = r;

  const id = Number(new URL(req.url).searchParams.get("id") || 0);
  if (!id) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });

  // O `dono_id` vai na condição do UPDATE: tentar desligar a de outro não
  // desliga nada (e devolve 404, sem revelar se ela existe).
  const ok = desligarIntegracao(id, "pessoa", String(conta.id));
  if (!ok) return NextResponse.json({ error: "integração não encontrada" }, { status: 404 });
  return NextResponse.json({ ok: true, id, desligada: true });
}
