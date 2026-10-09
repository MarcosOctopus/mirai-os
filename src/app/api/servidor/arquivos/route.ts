/**
 * /api/servidor/arquivos — lista uma pasta no servidor do cliente (LEITURA SÓ).
 *
 * Usa a credencial SSH já guardada (cifrada) da PESSOA que está falando; a
 * chave é decifrada na hora, usada e some. NUNCA volta na resposta. O comando
 * remoto é `ls -1ap -- <caminho>` (via servidor-cliente.ts), com o caminho
 * entre aspas simples: o conteúdo lido é tratado como texto, nunca como comando.
 */
import { NextRequest, NextResponse } from "next/server";

import { exigirConta } from "@/lib/orgs";
import { decifrar } from "@/lib/segredo-guardado";
import { integracoesDaPessoa } from "@/lib/integracoes";
import { TIPO_SERVIDOR, lerAlvo, listar } from "@/lib/servidor-cliente";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const r = await exigirConta(req);
  if (!r.ok) return r.resposta;
  const { conta } = r;

  const srv = integracoesDaPessoa(conta.id).find((i) => i.tipo === TIPO_SERVIDOR);
  if (!srv) {
    return NextResponse.json({ ok: false, itens: [], erro: "nenhum servidor conectado nesta conta" }, { status: 400 });
  }
  const alvo = lerAlvo(srv.config);
  if (!alvo) {
    return NextResponse.json({ ok: false, itens: [], erro: "o servidor guardado está incompleto" }, { status: 400 });
  }
  const chave = decifrar(srv.credencial);
  if (!chave) {
    return NextResponse.json({ ok: false, itens: [], erro: "não consegui ler a credencial guardada" }, { status: 400 });
  }

  const caminho = new URL(req.url).searchParams.get("caminho") || "/";
  const resultado = await listar({
    host: alvo.host,
    porta: alvo.porta,
    usuario: alvo.usuario,
    chave,
    caminho,
  });

  return NextResponse.json(resultado, { status: resultado.ok ? 200 : 400 });
}
