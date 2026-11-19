/**
 * REUNIÕES — GET lista / POST registra.
 *
 * A fonte da verdade é a ARCA (`05_REUNIOES`), não este app. Aqui só há uma
 * porta de leitura e uma de registro; nenhum banco paralelo.
 */

import { NextRequest, NextResponse } from "next/server";
import { exigirConta } from "@/lib/orgs";
import { listarReunioes, registrarReuniao, tokenDaPessoa } from "@/lib/reuniao-arca";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Sem credencial da Arca a tela NÃO mostra o acervo de outra organização: ela diz que falta. */
const SEM_ARCA = {
  error: "Sua Arca não está conectada nesta conta. Conecte em Integrações para ver suas reuniões.",
};

export async function GET(req: NextRequest) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  const token = await tokenDaPessoa(g.conta.id, g.conta.email);
  if (!token) return NextResponse.json(SEM_ARCA, { status: 409 });

  try {
    const reunioes = await listarReunioes(token);
    return NextResponse.json({ reunioes });
  } catch (e) {
    // Falha de leitura não pode virar lista vazia: lista vazia mente ("não tenho reunião").
    return NextResponse.json(
      { error: "Não consegui ler as reuniões da Arca agora.", detail: String(e).slice(0, 200) },
      { status: 502 },
    );
  }
}

export async function POST(req: NextRequest) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  const token = await tokenDaPessoa(g.conta.id, g.conta.email);
  if (!token) return NextResponse.json(SEM_ARCA, { status: 409 });

  let corpo: {
    titulo?: string;
    plataforma?: string;
    link?: string;
    quando?: string;
    participantes?: string[];
    notas?: string;
  };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const titulo = (corpo.titulo || "").trim();
  if (titulo.length < 3) return NextResponse.json({ error: "informe o título da reunião" }, { status: 400 });

  const r = await registrarReuniao(token, { ...corpo, titulo });
  if (r.erro) return NextResponse.json({ error: r.erro }, { status: 502 });
  return NextResponse.json({ ok: true, nota: r.nota }, { status: 201 });
}