/**
 * /api/servidor/arquivos — LER e GRAVAR arquivos no servidor do cliente.
 *
 * ─── O que mudou em 14/10/2026 (decisão do dono, verbatim) ───────────────────
 *
 *   "Eu quero que consiga editar coisas em outros servidores"
 *
 * A fundação (`lib/servidor-cliente.ts`) tinha parado na LEITURA de propósito,
 * esperando esta decisão. Agora ela veio, e a escrita entrou — com o backup
 * automático no próprio servidor antes de sobrescrever (regra do dono: primeiro
 * o backup, depois a mudança) e com o conteúdo indo por ENTRADA PADRÃO do ssh,
 * nunca pela linha de comando.
 *
 * Usa a credencial SSH já guardada (cifrada) da PESSOA que está falando; a chave
 * é decifrada na hora, usada e some. NUNCA volta na resposta.
 *
 *   GET  ?caminho=/etc          → lista a pasta
 *   GET  ?arquivo=/caminho/x.md → devolve o conteúdo do arquivo
 *   PUT  { caminho, conteudo }  → grava o arquivo (com backup do anterior)
 */
import { NextRequest, NextResponse } from "next/server";

import { exigirConta } from "@/lib/orgs";
import { exigirFerramenta } from "@/lib/porteira-ferramenta";
import { decifrar } from "@/lib/segredo-guardado";
import { integracoesDaPessoa } from "@/lib/integracoes";
import { TIPO_SERVIDOR, lerAlvo, listar, lerArquivo, gravarArquivo } from "@/lib/servidor-cliente";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Junta a conta + o servidor guardado + a chave decifrada. Nunca devolve a chave. */
function preparar(contaId: number) {
  const srv = integracoesDaPessoa(contaId).find((i) => i.tipo === TIPO_SERVIDOR);
  if (!srv) return { erro: "nenhum servidor conectado nesta conta", status: 400 as const };

  const alvo = lerAlvo(srv.config);
  if (!alvo) return { erro: "o servidor guardado está incompleto", status: 400 as const };

  const chave = decifrar(srv.credencial);
  if (!chave) return { erro: "não consegui ler a credencial guardada", status: 400 as const };

  return { alvo, chave };
}

export async function GET(req: NextRequest) {
  const r = await exigirConta(req);
  if (!r.ok) return r.resposta;
  // O plano manda: sem "infra" marcado no plano, a rota não atende.
  {
    const barrado = await exigirFerramenta(req, "infra");
    if (barrado) return barrado;
  }

  const p = preparar(r.conta.id);
  if ("erro" in p) return NextResponse.json({ ok: false, erro: p.erro }, { status: p.status });

  const params = new URL(req.url).searchParams;
  const arquivo = params.get("arquivo");
  const base = { host: p.alvo.host, porta: p.alvo.porta, usuario: p.alvo.usuario, chave: p.chave };

  // Com `arquivo`, devolve o CONTEÚDO (é o que o editor abre).
  if (arquivo) {
    const resultado = await lerArquivo({ ...base, caminho: arquivo });
    return NextResponse.json(resultado, { status: resultado.ok ? 200 : 400 });
  }

  const caminho = params.get("caminho") || "/";
  const resultado = await listar({ ...base, caminho });
  return NextResponse.json(resultado, { status: resultado.ok ? 200 : 400 });
}

export async function PUT(req: NextRequest) {
  const r = await exigirConta(req);
  if (!r.ok) return r.resposta;

  const p = preparar(r.conta.id);
  if ("erro" in p) return NextResponse.json({ ok: false, erro: p.erro }, { status: p.status });

  let corpo: { caminho?: string; conteudo?: string } = {};
  try {
    corpo = (await req.json()) as typeof corpo;
  } catch {
    return NextResponse.json({ ok: false, erro: "corpo inválido" }, { status: 400 });
  }

  const resultado = await gravarArquivo({
    host: p.alvo.host,
    porta: p.alvo.porta,
    usuario: p.alvo.usuario,
    chave: p.chave,
    caminho: corpo.caminho || "",
    conteudo: corpo.conteudo ?? "",
  });

  return NextResponse.json(resultado, { status: resultado.ok ? 200 : 400 });
}
