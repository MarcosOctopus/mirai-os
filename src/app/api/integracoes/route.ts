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
  criarIntegracao,
  desligarIntegracao,
  integracoesDaOrganizacao,
  integracoesDaPessoa,
  semSegredo,
} from "@/lib/integracoes";
import type { Integracao } from "@/lib/integracoes";
import { CATALOGO } from "@/lib/integracoes/catalogo";
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

export async function GET(req: NextRequest) {
  const r = await exigirConta(req);
  if (!r.ok) return r.resposta;
  const { conta } = r;

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
