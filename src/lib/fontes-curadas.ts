/**
 * FONTES CURADAS — o MOTOR do Observador, trazido para o chat.
 *
 * ─── O que isto é, e o que NÃO é ─────────────────────────────────────────────
 *
 * O Observador (o coletor noturno do ecossistema) roda sobre um conjunto de
 * fontes escolhidas à mão: Hacker News, Google News, Techmeme e GitHub. O que
 * vale nele não é o ACERVO — é o MOTOR: quais fontes, como consulta, como
 * ordena. É isso que este arquivo traz.
 *
 * O que fica de fora, e por decisão: o banco de descobertas acumulado (é
 * vantagem competitiva e não é dado do cliente), e as consultas a CPF/CNPJ por
 * API paga. O que entra são as fontes PÚBLICAS, consultadas na hora, sem chave.
 *
 * ─── Por que keyless ─────────────────────────────────────────────────────────
 *
 * Nenhuma destas quatro pede chave, e é isso que faz o modo valer para toda
 * conta sem depender de plano, cota ou cadastro. A cascata já provou o padrão:
 * se uma fonte cai, as outras seguem — nunca a resposta inteira por causa de
 * uma.
 *
 * Medido em 14/10/2026: as quatro respondem. (Reddit NÃO entra: devolve 403 de
 * forma consistente, e fonte que sempre falha é ruído no resultado.)
 */

export type ItemCurado = {
  titulo: string;
  url: string;
  fonte: string;
  /** Data em ISO quando a fonte informa; string vazia quando não. */
  quando: string;
  /** Pontos/estrelas quando a fonte tem esse conceito (HN, GitHub). */
  forca: number;
  trecho: string;
};

export type ResultadoCurado = {
  ok: boolean;
  itens: ItemCurado[];
  /** Quais fontes responderam e quais falharam — para o relatório ser honesto. */
  fontes: { nome: string; ok: boolean; itens: number; erro?: string }[];
  erro?: string;
};

const UA = "Mirai/1.0 (Research; +https://miraitohope.com)";
const TIMEOUT_MS = 20_000;

/** Google News: os tópicos são ids fixos do próprio serviço (não é chave). */
const TOPICOS_GOOGLE: Record<string, string> = {
  tecnologia: "CAAqJggKIiBDQkFTRWdvSUwyMHZNRFZxYUdjU0FtVnVHZ0pWVXlnQVAB",
  tecnologia_en: "CAAqJggKIiBDQkFTRWdvSUwyMHZNRFZxYUdjU0FtVnVHZ0pWVXlnQVAB",
  negocios: "CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx6TVdZU0FtVnVHZ0pWVXlnQVAB",
  ciencia: "CAAqJggKIiBDQkFTRWdvSUwyMHZNRFp0Y1RjU0FtVnVHZ0pWVXlnQVAB",
  mundo: "CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx1YlY4U0FtVnVHZ0pWVXlnQVAB",
  saude: "CAAqJggKIiBDQkFTRWdvSUwyMHZNR3BnWjJDU0FtVnVHZ0pWVXlnQVAB",
  esportes: "CAAqJggKIiBDQkFTRWdvSUwyMHZNRFp1ZEdvU0FtVnVHZ0pWVXlnQVAB",
};

/** Descasca o essencial do XML sem dependência nova. */
function limpaXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Recorta os <item>/<entry> de um feed e devolve título/link/data/trecho. */
function lerFeed(xml: string, limite: number): Omit<ItemCurado, "fonte">[] {
  const blocos =
    xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  const itens: Omit<ItemCurado, "fonte">[] = [];
  for (const b of blocos) {
    const titulo = limpaXml((b.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "");
    if (!titulo) continue;
    // <link href="..."> (Atom) ou <link>...</link> (RSS)
    const link =
      (b.match(/<link[^>]*href=["']([^"']+)["']/i) || [])[1] ||
      limpaXml((b.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1] || "");
    const quando = limpaXml(
      (b.match(/<(pubDate|published|updated|dc:date)[^>]*>([\s\S]*?)<\/\1>/i) || [])[2] || "",
    );
    const trecho = limpaXml(
      (b.match(/<(description|summary|content)[^>]*>([\s\S]*?)<\/\1>/i) || [])[2] || "",
    ).slice(0, 400);
    itens.push({ titulo, url: link, quando, forca: 0, trecho });
    if (itens.length >= limite) break;
  }
  return itens;
}

async function pegar(url: string): Promise<string> {
  const r = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, application/json, text/xml, */*" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

/** Hacker News — a Algolia devolve JSON puro; é a fonte mais estável das quatro. */
async function hackerNews(consulta: string, limite: number): Promise<ItemCurado[]> {
  const q = encodeURIComponent(consulta || "");
  const url = `https://hn.algolia.com/api/v1/search?query=${q}&tags=story&hitsPerPage=${limite}`;
  const d = (await pegar(url)) as unknown as string;
  const j = JSON.parse(d) as { hits?: Record<string, unknown>[] };
  return (j.hits || [])
    .map((h) => ({
      titulo: String(h.title || h.story_title || "").trim(),
      url: String(h.url || h.story_url || `https://news.ycombinator.com/item?id=${h.objectID ?? ""}`),
      fonte: "Hacker News",
      quando: String(h.created_at || ""),
      forca: Number(h.points || 0),
      trecho: "",
    }))
    .filter((i) => i.titulo);
}

/** Google News — busca POR CONSULTA quando há tema; tópico quando não há. */
async function googleNews(consulta: string, limite: number): Promise<ItemCurado[]> {
  const c = (consulta || "").trim();
  // MEDIDO: o feed de TÓPICO não filtra a consulta — pedir "energia solar
  // residencial" no tópico de tecnologia devolvia política. O endpoint de
  // BUSCA filtra de verdade. Tópico fica só para quando não há tema (aí o
  // pedido é "as manchetes de agora", e é isso que o tópico entrega).
  let url: string;
  if (c) {
    url = `https://news.google.com/rss/search?q=${encodeURIComponent(c)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
  } else {
    const baixo = c.toLowerCase();
    let topico = TOPICOS_GOOGLE.tecnologia;
    for (const [chave, id] of Object.entries(TOPICOS_GOOGLE)) {
      if (chave !== "tecnologia_en" && baixo.includes(chave)) {
        topico = id;
        break;
      }
    }
    url = `https://news.google.com/rss/topics/${topico}?hl=pt-BR&gl=BR&ceid=BR:pt-419`;
  }
  const xml = await pegar(url);
  return lerFeed(xml, limite).map((i) => ({ ...i, fonte: "Google News" }));
}

/** Techmeme — o feed de tecnologia mais "curado por gente" dos quatro. */
async function techmeme(limite: number): Promise<ItemCurado[]> {
  const xml = await pegar("https://techmeme.com/feed.xml");
  return lerFeed(xml, limite).map((i) => ({ ...i, fonte: "Techmeme" }));
}

/** GitHub — repos relevantes para o tema; sem tema, o que está crescendo agora. */
async function github(consulta: string, limite: number): Promise<ItemCurado[]> {
  // COM tema: relevância + estrelas, sem recorte de data — o filtro `created:>`
  // combinado com texto derruba o resultado para repos de 6 estrelas (medido).
  // SEM tema: aí sim o "trending" é o que nasceu agora e está subindo.
  const q = consulta
    ? consulta
    : `created:>${new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 10)}`;
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${limite}`;
  const txt = await pegar(url);
  const j = JSON.parse(txt) as { items?: Record<string, unknown>[] };
  return (j.items || []).map((r) => ({
    titulo: String(r.full_name || ""),
    url: String(r.html_url || ""),
    fonte: "GitHub",
    quando: String(r.created_at || ""),
    forca: Number(r.stargazers_count || 0),
    trecho: String(r.description || "").slice(0, 300),
  }));
}

/**
 * Consulta as fontes curadas e devolve o que veio, já ordenado.
 *
 * `fontes` permite escolher o subconjunto (ex.: só notícia, sem GitHub). Cada
 * fonte é independente: uma que falha vira uma linha em `fontes[]` com o erro, e
 * as outras seguem. Só devolve `ok: false` quando NENHUMA respondeu — aí o chat
 * não pode dizer que pesquisou.
 */
export async function buscarNasFontesCuradas(
  consulta: string,
  limite = 6,
  fontes: ("hn" | "google" | "techmeme" | "github")[] = ["hn", "google", "techmeme", "github"],
): Promise<ResultadoCurado> {
  const trabalho: { nome: string; rodar: () => Promise<ItemCurado[]> }[] = [];
  if (fontes.includes("hn")) trabalho.push({ nome: "Hacker News", rodar: () => hackerNews(consulta, limite) });
  if (fontes.includes("google")) trabalho.push({ nome: "Google News", rodar: () => googleNews(consulta, limite) });
  if (fontes.includes("techmeme")) trabalho.push({ nome: "Techmeme", rodar: () => techmeme(limite) });
  if (fontes.includes("github")) trabalho.push({ nome: "GitHub", rodar: () => github(consulta, limite) });

  const saidas = await Promise.all(
    trabalho.map(async (t) => {
      try {
        const itens = await t.rodar();
        return { nome: t.nome, ok: true, itens };
      } catch (e) {
        return {
          nome: t.nome,
          ok: false,
          itens: [] as ItemCurado[],
          erro: e instanceof Error ? e.message : "falhou",
        };
      }
    }),
  );

  const itens = saidas.flatMap((s) => s.itens);
  // INTERCALA as fontes em vez de ordenar tudo por um número só: "1574 pontos
  // no HN" e "8 estrelas no GitHub" não são a mesma régua, e ordenar por eles
  // juntos deixaria uma fonte engolir as outras. Dentro de cada fonte, os mais
  // fortes primeiro; entre as fontes, rodízio — assim as quatro aparecem.
  const porFonte = saidas.map((s) => s.itens.slice().sort((a, b) => b.forca - a.forca));
  const intercalados: ItemCurado[] = [];
  for (let volta = 0; intercalados.length < itens.length; volta++) {
    let achou = false;
    for (const lista of porFonte) {
      if (lista[volta]) {
        intercalados.push(lista[volta]);
        achou = true;
      }
    }
    if (!achou) break;
  }

  return {
    ok: itens.length > 0,
    itens: intercalados,
    fontes: saidas.map((s) => ({ nome: s.nome, ok: s.ok, itens: s.itens.length, erro: s.erro })),
    erro: itens.length ? undefined : "nenhuma fonte respondeu",
  };
}

/** Vira texto para o modelo — com fonte, data e link, para ele poder citar. */
export function fontesEmTexto(r: ResultadoCurado): string {
  if (!r.itens.length) return "Nenhuma das fontes curadas respondeu agora.";
  const linhas = r.itens.map((i, n) => {
    const data = i.quando ? ` (${i.quando.slice(0, 10)})` : "";
    const forca = i.forca ? ` · ${i.forca}${i.fonte === "GitHub" ? "★" : " pts"}` : "";
    const trecho = i.trecho ? `\n   ${i.trecho}` : "";
    return `${n + 1}. [${i.fonte}] ${i.titulo}${data}${forca}\n   ${i.url}${trecho}`;
  });
  const falhas = r.fontes.filter((f) => !f.ok).map((f) => `${f.nome} (${f.erro})`);
  return (
    `FONTES CURADAS — consultadas agora:\n\n${linhas.join("\n")}` +
    (falhas.length ? `\n\n(fontes que não responderam nesta chamada: ${falhas.join(", ")})` : "")
  );
}
