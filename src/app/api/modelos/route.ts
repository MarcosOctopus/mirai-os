import { NextRequest, NextResponse } from "next/server";

import { exigirConta } from "@/lib/orgs";
import { escopoPessoal } from "@/lib/escopos";
import { chavePropriaDaConta } from "@/lib/byok";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/modelos — A LISTA DO SELETOR DE MODELO DO CHAT.
 *
 * ─── Por que existe (dono, 19/11/2026, verbatim) ──────────────────────────────
 *
 *   "no chat tem as opcoes de mais avancado e mais leve no nosso modelo que
 *    chamamos de super nova. Agora oq quero é coloque em dropdown e que quando
 *    as pessoas colcoarem a api deles apareca la blz?"
 *
 * Duas metades, e a segunda é a que faltava: quando a pessoa cadastra a PRÓPRIA
 * chave (BYOK, `/api/byok/chaves`), os modelos dela têm de aparecer no mesmo
 * seletor — senão ela traz a chave e continua presa aos nossos dois níveis.
 *
 * ─── A regra que decide o que entra ──────────────────────────────────────────
 *
 * 1. O SUPER NOVA é sempre a primeira metade: dois níveis, os motores do
 *    ecossistema por dentro. Existem para todo mundo, com ou sem chave própria.
 * 2. Os modelos DA PESSOA só entram quando há chave dela E o provedor responde.
 *    A chave sai decifrada daqui e NUNCA volta na resposta — o que viaja para a
 *    tela é só `id` + nome.
 * 3. Provedor fora do ar não vira erro: devolve só o Super Nova e marca
 *    `proprios: { erro }`. Um seletor que some por causa de terceiro é pior que
 *    um seletor incompleto.
 *
 * O `id` cru do modelo é o que o chat manda de volta — é exatamente o contrato
 * que `modeloDoPedido()` já espera (`id cru = modelo de outra API (BYOK)`).
 */

/** Os dois níveis do Super Nova — o white label nosso, com o esforço por dentro. */
const SUPER_NOVA = [
  {
    id: "supernova-flash",
    nome: "Super Nova Leve",
    dica: "resposta rápida — o dia a dia",
    nivel: "leve",
  },
  {
    id: "supernova-high",
    nome: "Super Nova Avançado",
    dica: "raciocínio profundo, código e análise",
    nivel: "avancado",
  },
];

type ModeloDaPessoa = { id: string; nome: string; provedor: string };

/**
 * O catálogo do provedor é buscado a cada 10 min, por conta. Sem isto, abrir o
 * seletor cinco vezes seriam cinco idas ao provedor da pessoa — e o provedor
 * cobra rate limit por isso.
 */
const TTL = 10 * 60 * 1000;
const cache = new Map<string, { em: number; modelos: ModeloDaPessoa[]; erro?: string }>();

async function modelosDoProvedor(
  base: string,
  chave: string,
  provedor: string,
): Promise<{ modelos: ModeloDaPessoa[]; erro?: string }> {
  try {
    const r = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${chave}` },
      cache: "no-store",
      signal: AbortSignal.timeout(9000),
    });
    if (!r.ok) {
      /* 401 aqui é a chave errada/expirada — vale dizer isso, não "falhou". */
      return {
        modelos: [],
        erro: r.status === 401 ? "chave recusada pelo provedor" : `provedor respondeu ${r.status}`,
      };
    }
    const d = (await r.json().catch(() => null)) as { data?: unknown } | null;
    const lista = Array.isArray(d?.data) ? d.data : [];
    const modelos = lista
      .map((m) => {
        const linha = (m || {}) as { id?: unknown; name?: unknown };
        const id = String(linha.id || "").trim();
        if (!id) return null;
        return { id, nome: String(linha.name || id).trim(), provedor };
      })
      .filter((m): m is ModeloDaPessoa => m !== null)
      .slice(0, 120);
    return { modelos };
  } catch (e) {
    return { modelos: [], erro: e instanceof Error ? e.message : "provedor inalcançável" };
  }
}

export async function GET(req: NextRequest) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  const escopo = escopoPessoal(g.conta);
  const propria = chavePropriaDaConta(escopo);

  // Sem chave própria: só o Super Nova. É o caminho da maioria e não custa rede.
  if (!propria) {
    return NextResponse.json({ supernova: SUPER_NOVA, proprios: [], comChavePropria: false });
  }

  const marca = `${escopo.id}:${propria.provider}`;
  const guardado = cache.get(marca);
  const agora = Date.now();
  let modelos: ModeloDaPessoa[] = [];
  let erro: string | undefined;

  if (guardado && agora - guardado.em < TTL) {
    modelos = guardado.modelos;
    erro = guardado.erro;
  } else {
    const r = await modelosDoProvedor(propria.base, propria.chave, propria.provider);
    modelos = r.modelos;
    erro = r.erro;
    /* Só guarda quando deu certo: cachear falha de provedor deixaria a lista
       vazia por 10 minutos mesmo depois de o provedor voltar. */
    if (!erro) cache.set(marca, { em: agora, modelos });
  }

  return NextResponse.json({
    supernova: SUPER_NOVA,
    proprios: modelos,
    comChavePropria: true,
    provedor: propria.provider,
    modeloPadraoDoProvedor: propria.modelo,
    ...(erro ? { erroProprio: erro } : {}),
  });
}
