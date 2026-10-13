/**
 * O ÍNDICE DO PROJETO — o construtor para de "olhar o sistema inteiro" (dono, 13/10/2026).
 *
 * POR QUE EXISTE (medido no código, não suposto): o construtor mandava TODOS os arquivos
 * do projeto em TODO pedido (`promptComArquivos`, teto de 60 arquivos / 90 mil chars).
 * Prompt gigante → o modelo se perde → responde TEXTO em vez do bloco de projeto → a tela
 * mostrava "a resposta não veio no formato de projeto". E com um projeto de verdade grande
 * (um milhão de páginas, no limite) isso é impossível por definição: 90 mil chars nem
 * chegam perto.
 *
 * A CORREÇÃO (o que o dono descreveu — "agir de forma separada"):
 *  1. o modelo recebe o MAPA do projeto (nome + tamanho + papel de cada arquivo);
 *  2. viajam INTEIROS só os arquivos que o pedido toca (o "alvo");
 *  3. se o pedido precisar de um arquivo que não veio, o modelo PEDE
 *     (`=== PRECISA: nome ===`) e o servidor reenvia com ele — nunca inventa.
 *
 * Projeto pequeno NÃO muda de comportamento: manda tudo, como sempre. Só o projeto grande
 * entra no regime de índice — assim não há regressão no que já funciona.
 */

export type Arquivo = { nome: string; conteudo: string };

export type ItemIndice = {
  nome: string;
  chars: number;
  linhas: number;
  papel: string;
};

/** A partir daqui o projeto é "grande" e entra no regime de índice. */
export const LIMITE_ARQUIVOS_PEQUENO = 6;
export const LIMITE_CHARS_PEQUENO = 90000;

/** Papel de um arquivo, para o MAPA dizer o que ele É — nunca só o nome. */
function papelDe(nome: string, conteudo: string, docProjeto: string): string {
  // 1) O PROJETO.md é a fonte da verdade do papel — quando ele cita o arquivo, usa o que ele diz.
  const base = nome.split("/").pop() || nome;
  for (const linha of (docProjeto || "").split("\n")) {
    if (!linha.includes(base)) continue;
    const limpa = linha
      .replace(/^[\s>*\-|`]+/, "")
      .replace(/`/g, "")
      .replace(new RegExp(base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "")
      .replace(/^[\s:—–\-|]+/, "")
      .trim();
    if (limpa.length >= 4) return limpa.slice(0, 90);
  }
  // 2) Senão, o papel sai do TIPO do arquivo — explícito, sem adivinhação criativa.
  const n = base.toLowerCase();
  if (n === "projeto.md") return "o documento do projeto (decisões e papéis)";
  if (n === "leia-me.md" || n === "readme.md") return "as instruções de leitura";
  if (n.endsWith(".html") || n.endsWith(".htm")) return "a página (marcação)";
  if (n.endsWith(".css")) return "o estilo";
  if (n.endsWith(".js") || n.endsWith(".mjs")) return "o comportamento (JavaScript)";
  if (n.endsWith(".ts")) return "o código TypeScript";
  if (n.endsWith(".json")) return "os dados (JSON)";
  if (n.endsWith(".svg")) return "a arte vetorial";
  if (/\.(png|jpe?g|webp|gif|woff2?)$/.test(n)) return "um arquivo de mídia";
  // 3) Último recurso: o que dá para dizer olhando o conteúdo — e é honesto quando não dá.
  if (/^\s*<!doctype|^\s*<html/i.test(conteudo)) return "uma página (marcação)";
  if (/^\s*[{[]/.test(conteudo)) return "dados (JSON)";
  return "um arquivo do projeto";
}

/** O MAPA do projeto: todos os arquivos, com tamanho e papel. */
export function construirIndice(arquivos: Arquivo[], docProjeto = ""): ItemIndice[] {
  return (arquivos || [])
    .filter((a) => a && typeof a.nome === "string" && a.nome.trim())
    .map((a) => ({
      nome: a.nome.trim(),
      chars: (a.conteudo || "").length,
      linhas: (a.conteudo || "").split("\n").length,
      papel: papelDe(a.nome.trim(), a.conteudo || "", docProjeto),
    }));
}

/** "14234" → "14,2 mil" — para o MAPA não mentir sobre grandeza. */
export function tamanhoLegivel(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(".", ",")} mil`;
  return `${n}`;
}

/** O TEXTO do mapa, como entra na instrução. */
export function textoDoIndice(itens: ItemIndice[], alvos: string[]): string {
  const dentro = new Set(alvos.map((a) => a.toLowerCase()));
  return itens
    .map((i) => {
      const marca = dentro.has(i.nome.toLowerCase()) ? "  ← VEM INTEIRO ABAIXO" : "";
      return `- ${i.nome} — ${tamanhoLegivel(i.chars)} chars, ${i.linhas} linhas — ${i.papel}${marca}`;
    })
    .join("\n");
}

export function tamanhoTotal(arquivos: Arquivo[]): number {
  return (arquivos || []).reduce((s, a) => s + ((a && a.conteudo) || "").length, 0);
}

/** O projeto é pequeno? (manda tudo, como sempre — sem regressão) */
export function projetoPequeno(arquivos: Arquivo[]): boolean {
  return (arquivos || []).length <= LIMITE_ARQUIVOS_PEQUENO && tamanhoTotal(arquivos) <= LIMITE_CHARS_PEQUENO;
}

/**
 * Alvos CITADOS no pedido — a via determinística, sem gastar chamada de modelo.
 * Casa o NOME do arquivo e também o que a pessoa costuma dizer no lugar dele
 * ("o css", "o js", "o html"). Devolve [] quando o pedido não aponta nenhum.
 */
export function alvosCitados(arquivos: Arquivo[], pedido: string): string[] {
  const texto = (pedido || "").toLowerCase();
  if (!texto.trim()) return [];
  const achados: string[] = [];
  for (const a of arquivos) {
    const nome = a.nome.toLowerCase();
    const base = nome.split("/").pop() || nome;
    if (texto.includes(nome) || texto.includes(base)) achados.push(a.nome);
  }
  // Apelidos por TIPO: só entram quando o pedido não nomeou nenhum arquivo explícito.
  if (!achados.length) {
    const porTipo: { re: RegExp; teste: (n: string) => boolean }[] = [
      { re: /\b(css|estilo|estilos|aparência|aparencia)\b/i, teste: (n) => n.endsWith(".css") },
      { re: /\b(js|javascript|script|scripts)\b/i, teste: (n) => /\.(js|mjs|ts)$/.test(n) },
      { re: /\b(html|marcação|marcacao|marcacao)\b/i, teste: (n) => /\.html?$/.test(n) },
    ];
    for (const t of porTipo) {
      if (!t.re.test(texto)) continue;
      for (const a of arquivos) if (t.teste(a.nome.toLowerCase())) achados.push(a.nome);
    }
  }
  return [...new Set(achados)];
}

/**
 * Parser da ESCALAÇÃO: o modelo pede os arquivos que faltaram.
 * Formato: `=== PRECISA: nome, nome ===` (aceita uma linha por arquivo também).
 */
export function extrairPedidosDeArquivo(texto: string): string[] {
  const nomes: string[] = [];
  const linhas = (texto || "").split("\n");
  let coletando = false;
  for (const bruta of linhas) {
    const ln = bruta.trim();
    const m = ln.match(/^===\s*PRECISA:\s*(.+?)\s*===?$/i);
    if (m) {
      coletando = false;
      for (const n of m[1].split(/[,;]/)) if (n.trim()) nomes.push(n.trim());
      continue;
    }
    // Bloco aberto (sem o fecho na mesma linha): as linhas seguintes são nomes.
    if (/^===\s*PRECISA:\s*$/i.test(ln)) {
      coletando = true;
      continue;
    }
    if (coletando) {
      if (/^===/.test(ln)) {
        coletando = false;
        continue;
      }
      for (const n of ln.split(/[,;]/)) if (n.trim()) nomes.push(n.trim().replace(/^[-*]\s*/, ""));
    }
  }
  // Só nomes que EXISTEM no projeto — o modelo não inventa arquivo por aqui.
  return [...new Set(nomes.filter(Boolean))];
}

/**
 * A resposta é SÓ um pedido de arquivo? (então não houve edição: é escalação)
 * Uma resposta que peça arquivos E traga edição é tratada como edição — o pedido é
 * descartado e fica registrado, para não confundir quem lê o resumo.
 */
export function ehSoPedidoDeArquivo(texto: string): boolean {
  const semPedido = (texto || "")
    .replace(/^===\s*PRECISA:[\s\S]*?===?\s*$/gim, "")
    .replace(/^===\s*PRECISA:\s*$[\s\S]*?(?=^===|$)/gim, "")
    .trim();
  return extrairPedidosDeArquivo(texto).length > 0 && semPedido.length < 40;
}

/**
 * Fallback determinístico quando NÃO se consegue decidir os alvos (roteador fora do ar):
 * a entrada do projeto + os menores arquivos até um teto. Melhor que mandar tudo (que
 * estoura o teto e chega cortado) e a ESCALAÇÃO cobre o que ficou de fora.
 */
export function alvosPorPadrao(arquivos: Arquivo[], teto = 40000): string[] {
  const ordenados = [...arquivos].sort((a, b) => {
    const entrada = (x: Arquivo) => (/index\.html?$/i.test(x.nome) ? 0 : 1);
    if (entrada(a) !== entrada(b)) return entrada(a) - entrada(b);
    return (a.conteudo || "").length - (b.conteudo || "").length;
  });
  const escolhidos: string[] = [];
  let usado = 0;
  for (const a of ordenados) {
    const n = (a.conteudo || "").length;
    if (usado + n > teto && escolhidos.length) continue;
    escolhidos.push(a.nome);
    usado += n;
    if (usado >= teto) break;
  }
  return escolhidos;
}
