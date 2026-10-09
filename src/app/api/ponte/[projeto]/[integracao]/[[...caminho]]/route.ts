/**
 * /api/ponte/[projeto]/[integracao]/[[...caminho]] — a PONTE DAS INTEGRAÇÕES.
 *
 * O QUE É E POR QUÊ: o Arquiteto gera SITES ESTÁTICOS. Um site estático NÃO pode
 * guardar chave — ela viraria pública no navegador. Então a chave fica no NOSSO
 * servidor e o site publicado pede POR NÓS: chama ESTE endereço e nós falamos
 * com o provedor usando a credencial DA CONTA dona do projeto. A chave NUNCA
 * chega ao navegador.
 *
 * QUEM CHAMA: o site publicado (o `fetch` do próprio site). Ele não tem cookie
 * de sessão do app, então a porta é o TOKEN ASSINADO (`ponte-token.ts`), escopado
 * ao par (projeto, integração), no cabeçalho `x-mirai-ponte` (ou
 * `Authorization: Bearer <token>`). O dono TAMBÉM pode testar pelo painel: aí
 * vale a SESSÃO, desde que ele seja o dono DESTE projeto. É por isso que esta
 * rota é PÚBLICA no middleware — a autorização é o token (ou a sessão do dono),
 * conferida AQUI, nunca uma sessão presumida.
 *
 * ORDEM DAS CHECAGENS (cada uma com recado honesto em PT-BR):
 *   a) credencial de chamada (token da ponte do par OU sessão dona) → 401;
 *   b) o projeto USA esta integração? (`integracoesDoProjeto`) → 403;
 *   c) existe credencial desta integração para a conta dona? → 409;
 *   d) o provedor é conhecido pelo catálogo? (`ponte-provedores`) → 501;
 *   e) encaminha: mesmo método, mesmo corpo e um subconjunto SEGURO de
 *      cabeçalhos. Devolve status e corpo do provedor como vieram.
 *
 * SEGREDO: a credencial entra e sai daqui SEM nunca ser logada, devolvida nem
 * citada. Nunca repassamos `Authorization`/cookie DO CHAMADOR — só os cabeçalhos
 * do provedor (montados com a credencial da conta) e um subconjunto seguro.
 */
import { NextRequest, NextResponse } from "next/server";

import { getUserById } from "@/lib/auth";
import { contaDaRequisicao, orgPorEmail } from "@/lib/orgs";
import type { Integracao } from "@/lib/integracoes";
import { integracoesDaOrganizacao, integracoesDaPessoa } from "@/lib/integracoes";
import { donoDoProjeto, integracoesDoProjeto } from "@/lib/arquiteto-projetos";
import { decifrar } from "@/lib/segredo-guardado";
import { conferirTokenPonte } from "@/lib/ponte-token";
import { provedorDaPonte, semBarraFinal } from "@/lib/ponte-provedores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = {
  params: Promise<{ projeto: string; integracao: string; caminho?: string[] }>;
};

/** Os únicos cabeçalhos do CHAMADOR que repassamos — nunca identidade dele. */
const CABECALHOS_SEGUROS = ["content-type", "accept", "prefer", "range"] as const;

/** O Bearer do `Authorization`, se houver. Nunca confundir com o token da ponte. */
function bearerDoCabecalho(req: NextRequest): string {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : "";
}

/** Codifica cada segmento do caminho sem estragar as barras (`a/b`). */
function caminhoSeguro(caminho: string[] | undefined): string {
  return (caminho || [])
    .filter((s) => s.length > 0)
    .map(encodeURIComponent)
    .join("/");
}

/** Lê o `config` (JSON) guardado na integração. Corrompido vira `null`, nunca erro. */
function lerConfig(config: string | null): Record<string, unknown> | null {
  if (!config) return null;
  try {
    const j = JSON.parse(config) as unknown;
    return j && typeof j === "object" && !Array.isArray(j)
      ? (j as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** A linha da integração para um id de tipo — primeiro por `tipo`, depois por `rotulo`. */
function acharIntegracao(lista: Integracao[], integracao: string): Integracao | null {
  const alvo = integracao.trim().toLowerCase();
  return (
    lista.find((i) => (i.tipo || "").toLowerCase() === alvo && i.credencial) ||
    lista.find((i) => (i.rotulo || "").toLowerCase() === alvo && i.credencial) ||
    null
  );
}

/**
 * A credencial DA CONTA dona do projeto, na MESMA ordem do resolutor único
 * (`contexto-da-pessoa.ts`): primeiro o que é DA PESSOA; as da EMPRESA entram
 * como apoio. Devolve a credencial JÁ DECIFRADA (segredo-guardado: credencial
 * de OAuth vive cifrada; chave de API simples fica em claro e o `decifrar`
 * devolve null → usamos o valor cru). Nunca loga nem devolve o segredo.
 */
function credencialDaConta(
  donoId: number,
  integracao: string,
): { credencial: string; config: Record<string, unknown> | null } | null {
  const daPessoa = acharIntegracao(integracoesDaPessoa(donoId), integracao);
  if (daPessoa?.credencial) {
    return {
      credencial: decifrar(daPessoa.credencial) ?? daPessoa.credencial,
      config: lerConfig(daPessoa.config),
    };
  }
  // Apoio: a integração da EMPRESA da conta dona (mesma doutrina do resolutor).
  const usuario = getUserById(donoId) as { email?: string } | null;
  const org = usuario?.email ? orgPorEmail(usuario.email) : null;
  if (org) {
    const daEmpresa = acharIntegracao(integracoesDaOrganizacao(org.id), integracao);
    if (daEmpresa?.credencial) {
      return {
        credencial: decifrar(daEmpresa.credencial) ?? daEmpresa.credencial,
        config: lerConfig(daEmpresa.config),
      };
    }
  }
  return null;
}

/** O corpo da chamada permitido pelo método. GET/HEAD não têm corpo. */
function metodoTemCorpo(metodo: string): boolean {
  return metodo !== "GET" && metodo !== "HEAD";
}

async function encaminhar(req: NextRequest, ctx: Ctx) {
  const params = await ctx.params;
  const { projeto, integracao } = params;
  const caminho = caminhoSeguro(params.caminho);
  const dono = donoDoProjeto(projeto);

  // ── (a) credencial de chamada ─────────────────────────────────────────────
  // 1) o token da ponte (header próprio, ou o Bearer), escopado ao PAR pedido;
  // 2) ou a sessão, desde que seja DONA deste projeto (aí o dono testa o painel).
  const tokenCandidato =
    (req.headers.get("x-mirai-ponte") || "").trim() || bearerDoCabecalho(req);
  let autorizado = false;
  if (tokenCandidato) {
    const conferido = conferirTokenPonte(tokenCandidato);
    if (conferido && conferido.projetoId === projeto && conferido.integracao === integracao) {
      autorizado = true;
    }
  }
  if (!autorizado) {
    const conta = await contaDaRequisicao(req);
    if (conta && dono !== null && conta.id === dono) autorizado = true;
  }
  if (!autorizado) {
    return NextResponse.json(
      { erro: "para usar a ponte é preciso o token do site (x-mirai-ponte) ou ser o dono deste projeto" },
      { status: 401 },
    );
  }

  // Projeto inexistente (ou sumiu): 404 — sem vazar se algum dia existiu.
  if (dono === null) {
    return NextResponse.json({ erro: "projeto não encontrado" }, { status: 404 });
  }

  // ── (b) o projeto usa esta integração? ────────────────────────────────────
  if (!integracoesDoProjeto(projeto).includes(integracao)) {
    return NextResponse.json(
      { erro: `este projeto não usa ${integracao}` },
      { status: 403 },
    );
  }

  // ── (c) existe credencial desta integração para a conta dona? ─────────────
  let resolvida: ReturnType<typeof credencialDaConta>;
  try {
    resolvida = credencialDaConta(dono, integracao);
  } catch {
    return NextResponse.json(
      { erro: "não consegui ler as integrações da sua conta agora" },
      { status: 502 },
    );
  }
  if (!resolvida) {
    return NextResponse.json(
      { erro: `a integração ${integracao} ainda não foi conectada na sua conta` },
      { status: 409 },
    );
  }

  // ── (d) o provedor é conhecido? ───────────────────────────────────────────
  const provedor = provedorDaPonte(integracao);
  if (!provedor) {
    return NextResponse.json(
      { erro: `a ponte ainda não fala com ${integracao}` },
      { status: 501 },
    );
  }
  const alvo = provedor.comoMontar(resolvida.credencial, resolvida.config);
  if (!alvo) {
    return NextResponse.json(
      { erro: `a integração ${integracao} está sem endereço configurado` },
      { status: 409 },
    );
  }

  // ── (e) encaminha ─────────────────────────────────────────────────────────
  // Cabeçalhos: os do provedor (com a credencial da conta) + o subconjunto SEGURO
  // do chamador. NUNCA o Authorization/cookie DO CHAMADOR.
  const cabecalhos: Record<string, string> = { ...alvo.cabecalhos };
  for (const h of CABECALHOS_SEGUROS) {
    const v = req.headers.get(h);
    if (v) cabecalhos[h] = v;
  }

  const metodo = req.method.toUpperCase();
  // ArrayBuffer (não Buffer): é BodyInit válido sem depender dos tipos do Node.
  let corpo: ArrayBuffer | undefined;
  if (metodoTemCorpo(metodo)) {
    try {
      const buf = await req.arrayBuffer();
      if (buf.byteLength) corpo = buf;
    } catch {
      // sem corpo legível: segue como chamada sem corpo
    }
  }

  const url = `${semBarraFinal(alvo.base)}${caminho ? `/${caminho}` : ""}${req.nextUrl.search}`;

  let resposta: Response;
  try {
    resposta = await fetch(url, {
      method: metodo,
      headers: cabecalhos,
      body: corpo,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    // Sem detalhe do erro de rede: recado curto, nada da credencial.
    return NextResponse.json({ erro: "o provedor não respondeu agora" }, { status: 502 });
  }

  // Devolve status e corpo do provedor COMO VIERAM. Em respostas sem corpo
  // (204/205/304) o corpo é null — o construtor não aceita bytes ali.
  const semCorpo = resposta.status === 204 || resposta.status === 205 || resposta.status === 304;
  const bytes = semCorpo ? null : Buffer.from(await resposta.arrayBuffer());
  const devolver = new Headers();
  const tipo = resposta.headers.get("content-type");
  if (tipo) devolver.set("content-type", tipo);
  return new NextResponse(bytes, { status: resposta.status, headers: devolver });
}

export async function GET(req: NextRequest, ctx: Ctx) {
  return encaminhar(req, ctx);
}
export async function POST(req: NextRequest, ctx: Ctx) {
  return encaminhar(req, ctx);
}
export async function PUT(req: NextRequest, ctx: Ctx) {
  return encaminhar(req, ctx);
}
export async function PATCH(req: NextRequest, ctx: Ctx) {
  return encaminhar(req, ctx);
}
export async function DELETE(req: NextRequest, ctx: Ctx) {
  return encaminhar(req, ctx);
}
