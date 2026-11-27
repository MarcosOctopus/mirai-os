"use client";

/**
 * O card de arquivo da conversa (item 2 do pedido do dono, 27/11/2026).
 *
 * O problema: hoje a conversa só devolve texto. Quando a Mirai produz ou
 * encontra um arquivo, a pessoa recebe um caminho cru e tem que caçar aquilo
 * na mão. GPT e Claude entregam uma peça: nome, tipo, tamanho e o que dá para
 * fazer com ela.
 *
 * COMO ISTO ENTRA NA CONVERSA: o texto do modelo carrega um marcador em linha
 * própria, e a tela o troca por este card. O marcador é
 *
 *   [[arquivo:midia:<id>|<nome>]]   ou   [[arquivo:acervo:<caminho>|<nome>]]
 *
 * O caminho é o do acervo ou o do upload. Nada de HTML cru: o marcador é texto,
 * então continua seguro e continua funcionando em histórico antigo (vira uma
 * linha com o nome, não quebra).
 *
 * Regra de escopo herdada: o caminho pode vir com o prefixo do espaço
 * (`pessoal-17/...` ou `slug-da-org/...`). O card NÃO mexe no caminho, só o
 * mostra — quem resolve escopo é a rota que serve o arquivo.
 */

export type ArquivoDaConversa = {
  /** "midia" (upload, servido por id) ou "acervo" (nota, servida por caminho). */
  trilho: "midia" | "acervo";
  /**
   * A referência do arquivo. Para mídia é o ID do upload (36 caracteres), nunca
   * um caminho de disco: a rota `/api/arquivo/[id]` confere a posse a cada
   * leitura e pega o caminho do banco. Para acervo é o caminho da nota.
   */
  ref: string;
  /** Nome mostrado na tela. Sem ele, usa o último pedaço da referência. */
  nome?: string;
  mime?: string;
  tamanho?: number;
};

const ICONE_POR_TIPO: Record<string, string> = {
  texto: "TXT",
  imagem: "IMG",
  audio: "SOM",
  video: "VID",
  planilha: "PLAN",
  documento: "DOC",
  outro: "ARQ",
};

function tipoDoArquivo(mime?: string, nome?: string): string {
  const m = (mime || "").toLowerCase();
  const n = (nome || "").toLowerCase();
  if (m.startsWith("image/") || /\.(png|jpe?g|webp|gif|svg)$/.test(n)) return "imagem";
  if (m.startsWith("audio/") || /\.(mp3|m4a|wav|ogg|opus)$/.test(n)) return "audio";
  if (m.startsWith("video/") || /\.(mp4|mov|webm)$/.test(n)) return "video";
  if (/spreadsheet|csv|excel/.test(m) || /\.(csv|xlsx?|ods)$/.test(n)) return "planilha";
  if (/word|pdf|presentation|opendocument/.test(m) || /\.(pdf|docx?|pptx?|md|txt)$/.test(n)) return "documento";
  return "texto";
}

function tamanhoLegivel(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  const unidades = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < unidades.length - 1) {
    v = v / 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${unidades[i]}`;
}

export function CardArquivo({ arquivo }: { arquivo: ArquivoDaConversa }) {
  const nome = arquivo.nome || arquivo.ref.split("/").pop() || "arquivo";
  const tipo = tipoDoArquivo(arquivo.mime, nome);
  const etiqueta = ICONE_POR_TIPO[tipo] || "ARQ";
  const tamanho = tamanhoLegivel(arquivo.tamanho);
  const midia = arquivo.trilho === "midia";

  // Mídia: a rota confere a POSSE pelo id a cada leitura e pega o caminho do
  // banco — nunca um caminho de disco vindo da tela.
  // Acervo: a nota é servida por caminho, e o escopo é resolvido pela rota.
  const base = midia
    ? `/api/arquivo/${encodeURIComponent(arquivo.ref)}`
    : `/api/acervo/nota?path=${encodeURIComponent(arquivo.ref)}`;

  return (
    <div className="my-2 flex items-center gap-3 rounded-[14px] border border-[#2A2A2A] bg-[#111] px-3.5 py-3">
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border border-[#333] text-[10px] font-semibold text-[#E85002]"
        style={{ fontFamily: "var(--fonte-mono, monospace)" }}
      >
        {etiqueta}
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[13px] font-medium text-[#F9F9F9]">{nome}</span>
        <span className="truncate text-[11px] uppercase tracking-[0.12em] text-[#646464]">
          {tipo}
          {tamanho ? ` · ${tamanho}` : ""}
          {midia ? " · mídia" : " · acervo"}
        </span>
      </span>

      <span className="flex shrink-0 items-center gap-1.5">
        <a
          href={base}
          target="_blank"
          rel="noreferrer"
          className="rounded-[8px] border border-[#333] px-2.5 py-1.5 text-[12px] text-[#F9F9F9] hover:border-[#E85002]"
        >
          Abrir
        </a>
        <a
          href={`${base}&baixar=1`}
          className="rounded-[8px] border border-[#333] px-2.5 py-1.5 text-[12px] text-[#F9F9F9] hover:border-[#E85002]"
        >
          Baixar
        </a>
      </span>
    </div>
  );
}

/**
 * O marcador que o modelo emite, em linha própria:
 *   [[arquivo:midia:<id-do-upload>|<nome>]]
 *   [[arquivo:acervo:<caminho-da-nota>|<nome>]]
 * O trilho vem primeiro de propósito: sem ele, um caminho de acervo poderia
 * ser confundido com id de upload, e a posse do arquivo é coisa séria aqui.
 */
export const MARCADOR_ARQUIVO = /^\[\[arquivo:(midia|acervo):(.+?)(?:\|(.+?))?\]\]$/i;

/** Quebra o texto da conversa em pedaços de texto e pedaços de arquivo. */
export function partesDaConversa(texto: string): ({ tipo: "texto"; valor: string } | { tipo: "arquivo"; valor: ArquivoDaConversa })[] {
  const saida: ({ tipo: "texto"; valor: string } | { tipo: "arquivo"; valor: ArquivoDaConversa })[] = [];
  let acumulado: string[] = [];

  const despejar = () => {
    if (acumulado.length) {
      saida.push({ tipo: "texto", valor: acumulado.join("\n") });
      acumulado = [];
    }
  };

  for (const linha of (texto || "").split("\n")) {
    const m = linha.trim().match(MARCADOR_ARQUIVO);
    if (m) {
      despejar();
      saida.push({
        tipo: "arquivo",
        valor: {
          trilho: (m[1] || "").trim().toLowerCase() === "midia" ? "midia" : "acervo",
          ref: (m[2] || "").trim(),
          nome: m[3]?.trim(),
        },
      });
      continue;
    }
    acumulado.push(linha);
  }
  despejar();
  return saida;
}
