/**
 * /api/servidor — a pessoa pluga O SERVIDOR DELA.
 *
 * Regra do dono (09/out/2026): *"a gente entra no servidor DELE e trabalha lá
 * dentro."* Esta rota é a FUNDAÇÃO: guardar a credencial SSH cifrada, PROVAR
 * que conecta e listar arquivos (leitura só). Sem deploy ainda.
 *
 * Regras (todas server-side), iguais às de `/api/integracoes`:
 *   - a pessoa só vê e só mexe no que é DELA (`dono_tipo='pessoa'`, `dono_id` =
 *     id da conta que está falando) — o isolamento é condição da consulta;
 *   - a CHAVE PRIVADA nunca volta em claro por API: a resposta traz no máximo o
 *     alvo (host, porta, usuário);
 *   - a credencial é TESTADA AO VIVO antes de gravar: chave que o servidor não
 *     confirma não é salva — nunca se diz "conectado" sem o servidor ter
 *     respondido.
 */
import { NextRequest, NextResponse } from "next/server";

import { exigirConta } from "@/lib/orgs";
import { cifrar } from "@/lib/segredo-guardado";
import {
  criarIntegracao,
  desligarIntegracao,
  integracoesDaPessoa,
  type Integracao,
} from "@/lib/integracoes";
import {
  ROTULO_SERVIDOR,
  TIPO_SERVIDOR,
  lerAlvo,
  normalizarPorta,
  testarConexao,
  validarAlvo,
} from "@/lib/servidor-cliente";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** O servidor guardado da pessoa, se houver (só o dela, só ativo). */
function meuServidor(contaId: number): Integracao | null {
  return integracoesDaPessoa(contaId).find((i) => i.tipo === TIPO_SERVIDOR) ?? null;
}

/**
 * Estado do servidor da conta. `conectado` = existe uma credencial guardada
 * (que, por construção, já passou no teste de conexão no POST). NUNCA devolve a
 * chave — só o alvo.
 */
export async function GET(req: NextRequest) {
  const r = await exigirConta(req);
  if (!r.ok) return r.resposta;
  const { conta } = r;

  const srv = meuServidor(conta.id);
  const alvo = srv ? lerAlvo(srv.config) : null;
  if (!srv || !alvo) {
    return NextResponse.json({ conectado: false, alvo: null });
  }
  return NextResponse.json({
    conectado: true,
    alvo: { host: alvo.host, porta: alvo.porta, usuario: alvo.usuario },
  });
}

/**
 * Conecta e guarda. A ordem importa: valida o alvo, TESTA a conexão e SÓ
 * guarda cifrado se passar. Falhou o teste, nada é gravado e o erro volta
 * honesto.
 */
export async function POST(req: NextRequest) {
  const r = await exigirConta(req);
  if (!r.ok) return r.resposta;
  const { conta } = r;

  let corpo: { host?: unknown; porta?: unknown; usuario?: unknown; chave?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ ok: false, mensagem: "corpo inválido" }, { status: 400 });
  }

  // valida o ALVO antes de qualquer uso (defesa contra injeção).
  const alvo = validarAlvo(corpo.host, corpo.usuario);
  if (!alvo.ok) {
    return NextResponse.json({ ok: false, mensagem: alvo.erro }, { status: 400 });
  }
  const porta = normalizarPorta(corpo.porta);
  if (porta === null) {
    return NextResponse.json({ ok: false, mensagem: "porta inválida (use um número de 1 a 65535)" }, { status: 400 });
  }
  const chave = typeof corpo.chave === "string" ? corpo.chave : "";
  if (!chave.trim()) {
    return NextResponse.json({ ok: false, mensagem: "a chave privada SSH é obrigatória" }, { status: 400 });
  }

  // TESTA de verdade antes de guardar.
  const teste = await testarConexao({ host: alvo.host, porta, usuario: alvo.usuario, chave });
  if (!teste.ok) {
    return NextResponse.json({ ok: false, mensagem: teste.mensagem }, { status: 400 });
  }

  // Só chega aqui se conectou. A chave vai CIFRADA — nunca em claro no banco.
  criarIntegracao({
    dono_tipo: "pessoa",
    dono_id: String(conta.id),
    tipo: TIPO_SERVIDOR,
    rotulo: ROTULO_SERVIDOR,
    credencial: cifrar(chave),
    config: JSON.stringify({ host: alvo.host, porta, usuario: alvo.usuario }),
  });

  return NextResponse.json({ ok: true, mensagem: teste.mensagem }, { status: 201 });
}

/** Remove (desliga) o servidor guardado da pessoa. Só o dela. */
export async function DELETE(req: NextRequest) {
  const r = await exigirConta(req);
  if (!r.ok) return r.resposta;
  const { conta } = r;

  const srv = meuServidor(conta.id);
  if (!srv) {
    return NextResponse.json({ ok: false, mensagem: "não há servidor conectado nesta conta" }, { status: 404 });
  }
  // O `dono_id` vai na condição do UPDATE: não existe caminho para desligar a
  // integração de outra pessoa por esta rota.
  desligarIntegracao(srv.id, "pessoa", String(conta.id));
  return NextResponse.json({ ok: true, removido: true });
}
