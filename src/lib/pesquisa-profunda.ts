/**
 * PESQUISA PROFUNDA — o MÉTODO do Sr. Xi, trazido para o chat.
 *
 * ─── O que isto é, e o que NÃO é ─────────────────────────────────────────────
 *
 * O Sr. Xi (o pesquisador do ecossistema) trabalha em rodadas: decompõe o alvo
 * em perguntas, consulta várias fontes em paralelo, ABRE as páginas que
 * importam, e só então sintetiza. O valor está no MÉTODO — a ordem e a
 * insistência —, e é isso que este arquivo traz.
 *
 * O que fica de fora, e por decisão: as consultas a CPF/CNPJ/CEP por API paga
 * (dado de terceiro, custo por consulta, e não é do cliente) e o acervo interno
 * de descobertas. O que entra são fontes PÚBLICAS, sem chave.
 *
 * ─── Por que "rodadas" e não uma busca só ────────────────────────────────────
 *
 * Uma busca responde "o que existe sobre isto". Uma pesquisa profunda responde
 * a PERGUNTA — e pergunta de verdade tem lados: o que é, quanto custa, o que
 * dizem contra, o que existe de alternativo, o que mudou agora. Cada lado é uma
 * consulta própria, e é a soma delas que dá o dossiê. Buscar tudo com a mesma
 * frase devolve cinco vezes o mesmo link.
 *
 * Medido em 14/10/2026: as fontes usadas aqui (cascata sem chave + ArXiv)
 * respondem; a cascata já é a mesma do chat, com fallback entre provedores.
 */

import { buscarNaWeb, lerPagina, type HitBusca } from "./busca-web";
import { buscarNasFontesCuradas } from "./fontes-curadas";

/** Os ângulos que viram consulta. Determinístico de propósito: previsível, sem
 *  gastar uma chamada de modelo só para decidir o que perguntar. */
const ANGULOS: { rotulo: string; montar: (t: string) => string }[] = [
  { rotulo: "o que é / como funciona", montar: (t) => `${t} o que é como funciona` },
  { rotulo: "números e dados", montar: (t) => `${t} números dados estatísticas 2026` },
  { rotulo: "críticas e riscos", montar: (t) => `${t} críticas riscos problemas` },
  { rotulo: "alternativas e comparação", montar: (t) => `${t} alternativas comparação` },
  { rotulo: "o que mudou agora", montar: (t) => `${t} notícias recentes 2026` },
];

export type Dossie = {
  ok: boolean;
  consulta: string;
  /** As rodadas que de fato rodaram, com quantos resultados cada uma trouxe. */
  rodadas: { rotulo: string; consulta: string; achados: number; erro?: string }[];
  /** Páginas abertas de verdade (não só listadas). */
  abertas: { url: string; titulo: string; ok: boolean; tamanho: number; erro?: string }[];
  /** O material reunido, em texto, para o modelo sintetizar. */
  texto: string;
  erro?: string;
};

/** Tetos: pesquisa profunda é cara em tempo, não pode virar um minuto de espera. */
const PAGINAS_A_ABRIR = 6;
const POR_RODADA = 4;
const TETO_TEXTO = 4_000;

/** Tira o que se repete (mesma URL em rodadas diferentes) sem perder a 1ª. */
function semRepetir(hits: HitBusca[]): HitBusca[] {
  const vistos = new Set<string>();
  const saida: HitBusca[] = [];
  for (const h of hits) {
    const chave = (h.url || "").replace(/[#?].*$/, "").replace(/\/$/, "").toLowerCase();
    if (!chave || vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push(h);
  }
  return saida;
}

/** ArXiv — keyless, e a fonte certa quando o tema é técnico/científico. */
async function arxiv(consulta: string, limite = 4): Promise<HitBusca[]> {
  const url =
    `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(consulta)}` +
    `&max_results=${limite}&sortBy=relevance`;
  const r = await fetch(url, { signal: AbortSignal.timeout(20_000), cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const xml = await r.text();
  const blocos = xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
  return blocos.slice(0, limite).map((b) => {
    const limpa = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return {
      titulo: limpa((b.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || ""),
      url: limpa((b.match(/<id>([\s\S]*?)<\/id>/i) || [])[1] || ""),
      trecho: limpa((b.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i) || [])[1] || "").slice(0, 500),
    };
  });
}

/**
 * Roda a pesquisa profunda e devolve o DOSSIÊ (material bruto organizado).
 *
 * Quem escreve o relatório é o modelo, não esta função: aqui se reúne material
 * de verdade — e é isso que separa "pesquisei" de "achei cinco links". O dossiê
 * sempre diz o que falhou, para o modelo não tratar ausência como inexistência.
 */
export async function pesquisarAFundo(
  consulta: string,
  opcoes: { abrirPaginas?: number } = {},
): Promise<Dossie> {
  const alvo = (consulta || "").trim();
  if (alvo.length < 3) {
    return { ok: false, consulta: alvo, rodadas: [], abertas: [], texto: "", erro: "consulta curta demais" };
  }
  const quantasPaginas = Math.min(opcoes.abrirPaginas ?? PAGINAS_A_ABRIR, 10);

  // ── RODADA 1: os ângulos, em paralelo. Cada um é independente: um que falha
  //    não derruba a rodada inteira — vira uma linha dizendo que falhou.
  const rodadas: Dossie["rodadas"] = [];
  const porAngulo = await Promise.all(
    ANGULOS.map(async (a) => {
      const q = a.montar(alvo);
      try {
        const r = await buscarNaWeb(q, POR_RODADA);
        rodadas.push({ rotulo: a.rotulo, consulta: q, achados: r.resultados.length });
        return r.resultados;
      } catch (e) {
        rodadas.push({
          rotulo: a.rotulo,
          consulta: q,
          achados: 0,
          erro: e instanceof Error ? e.message : "falhou",
        });
        return [] as HitBusca[];
      }
    }),
  );

  // ── RODADA 2: as fontes curadas (o motor do Observador) e o ArXiv, em
  //    paralelo com a 1 — aqui já é a segunda frente de evidência.
  const [curadas, papers] = await Promise.all([
    buscarNasFontesCuradas(alvo, 4).catch(() => null),
    arxiv(alvo).catch(() => [] as HitBusca[]),
  ]);

  const daWeb = semRepetir(porAngulo.flat());
  const dosPapers = semRepetir(papers);
  const candidatos = semRepetir([...daWeb, ...dosPapers]);

  // ── RODADA 3: ABRIR as páginas. Listar não é pesquisar: o número, a tabela e
  //    a ressalva estão DENTRO da página. Só as primeiras, e em paralelo.
  const escolhidas = candidatos.slice(0, quantasPaginas);
  const abertas = await Promise.all(
    escolhidas.map(async (c) => {
      try {
        const p = await lerPagina(c.url);
        return {
          url: c.url,
          titulo: p.titulo || c.titulo,
          ok: p.ok && !!p.texto,
          tamanho: (p.texto || "").length,
          texto: p.texto || "",
          erro: p.ok ? undefined : p.erro || "sem texto",
        };
      } catch (e) {
        return {
          url: c.url,
          titulo: c.titulo,
          ok: false,
          tamanho: 0,
          texto: "",
          erro: e instanceof Error ? e.message : "falhou",
        };
      }
    }),
  );

  // ── O DOSSIÊ: o que veio, com procedência. O modelo recebe isto e escreve.
  const partes: string[] = [];
  partes.push(`CONSULTA: ${alvo}`);
  partes.push(`\n── RODADAS (o que foi perguntado, e o que voltou) ──`);
  for (const r of rodadas) {
    partes.push(
      r.erro
        ? `· ${r.rotulo}: FALHOU (${r.erro}) — não trate como "não existe"`
        : `· ${r.rotulo}: ${r.achados} resultado(s)`,
    );
  }

  if (curadas?.itens.length) {
    partes.push(`\n── FONTES CURADAS (Hacker News, Google News, Techmeme, GitHub) ──`);
    for (const i of curadas.itens.slice(0, 10)) {
      partes.push(`· [${i.fonte}] ${i.titulo}${i.forca ? ` (${i.forca})` : ""}\n  ${i.url}`);
    }
  }

  if (dosPapers.length) {
    partes.push(`\n── ARTIGOS CIENTÍFICOS (ArXiv) ──`);
    for (const p of dosPapers) {
      partes.push(`· ${p.titulo}\n  ${p.url}\n  ${p.trecho.slice(0, 300)}`);
    }
  }

  partes.push(`\n── PÁGINAS ABERTAS (o conteúdo de verdade) ──`);
  const comTexto = abertas.filter((a) => a.ok && a.texto);
  if (!comTexto.length) {
    partes.push("(nenhuma página pôde ser aberta — diga isso, não invente conteúdo)");
  }
  for (const a of comTexto) {
    partes.push(`\n### ${a.titulo}\n${a.url}\n${a.texto.slice(0, TETO_TEXTO)}`);
  }
  const falharam = abertas.filter((a) => !a.ok);
  if (falharam.length) {
    partes.push(
      `\n(páginas que não abriram: ${falharam.map((f) => f.url.slice(0, 60)).join(", ")})`,
    );
  }

  const linksSemAbrir = candidatos.slice(quantasPaginas, quantasPaginas + 12);
  if (linksSemAbrir.length) {
    partes.push(`\n── OUTROS CAMINHOS (listados, não abertos) ──`);
    for (const c of linksSemAbrir) partes.push(`· ${c.titulo} — ${c.url}`);
  }

  return {
    ok: comTexto.length > 0 || !!curadas?.itens.length,
    consulta: alvo,
    rodadas,
    abertas: abertas.map(({ url, titulo, ok, tamanho, erro }) => ({ url, titulo, ok, tamanho, erro })),
    texto: partes.join("\n"),
    erro: comTexto.length || curadas?.itens.length ? undefined : "nada pôde ser reunido",
  };
}
