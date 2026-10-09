// Tipos e limites dos ASSETS do Arquiteto (imagens do projeto) — seguro para
// CLIENTE e SERVIDOR: nada de fs/node aqui (o navegador importa isto para
// validar antes de subir). A validação de VERDADE (magic bytes) roda no
// servidor, na rota de upload — nunca confiamos no que o navegador diz.
//
// O QUE É: uma imagem que a pessoa sobe para o PROJETO e referencia no código
// por caminho relativo (`<img src="assets/logo.png">`, CSS
// `url("assets/x.png")`). O arquivo mora no banco como BLOB, escopado ao
// projeto (ver `arquiteto-projetos.ts`), e é servido por uma rota de sessão.

export const MAX_ASSET_BYTES = 5 * 1024 * 1024; // 5 MB (teto duro, vale nos dois lados)
export const MAX_ASSET_ROTULO = "5 MB";

/** A pasta do projeto onde as imagens vivem. */
export const PASTA_ASSETS = "assets";

export type TipoAsset = { ext: string; mime: string; rotulo: string };

// Tipos aceitos: imagens comuns da web. SVG entra com cuidado (ver rota de
// serviço: Content-Type image/svg+xml + CSP restritiva com `sandbox`).
export const TIPOS_ASSET: Record<string, TipoAsset> = {
  "image/png": { ext: "png", mime: "image/png", rotulo: "PNG" },
  "image/jpeg": { ext: "jpg", mime: "image/jpeg", rotulo: "JPEG" },
  "image/webp": { ext: "webp", mime: "image/webp", rotulo: "WEBP" },
  "image/gif": { ext: "gif", mime: "image/gif", rotulo: "GIF" },
  "image/svg+xml": { ext: "svg", mime: "image/svg+xml", rotulo: "SVG" },
  // FONTES DA WEB (dono, 09/10/2026 — "essa parte de upar fonte… quero algo
  // assim"). É o que o Figma Make chama de "fonte da web que precisa de upload":
  // só o formato que o NAVEGADOR usa. TTF/OTF ficam de fora de propósito (são de
  // desktop e 2-3x maiores) — converter para WOFF2 é o caminho.
  "font/woff2": { ext: "woff2", mime: "font/woff2", rotulo: "WOFF2" },
  "font/woff": { ext: "woff", mime: "font/woff", rotulo: "WOFF" },
  // DE DESKTOP, ACEITAS E CONVERTIDAS (dono, 09/10/2026: "no caso de mandar em
  // ttf e otf converte entao ne?"): entram como estão e viram WOFF2 aqui dentro,
  // na hora de guardar. O projeto guarda SEMPRE o formato que o navegador usa.
  "font/ttf": { ext: "ttf", mime: "font/ttf", rotulo: "TTF" },
  "font/otf": { ext: "otf", mime: "font/otf", rotulo: "OTF" },
};

// Extensão -> mime (usado quando o navegador não informa `file.type`).
export const EXT_PARA_MIME_ASSET: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  woff2: "font/woff2",
  woff: "font/woff",
  ttf: "font/ttf",
  otf: "font/otf",
};

export function extensaoAsset(nome: string): string {
  const base = (nome || "").split(/[\\/]/).pop() || "";
  const i = base.lastIndexOf(".");
  return i >= 0 ? base.slice(i + 1).toLowerCase() : "";
}

/** Mime declarado pelo navegador (ou pela extensão) — só para validar no cliente. */
export function mimeDeclaradoAsset(file: { name: string; type?: string }): string {
  const t = (file.type || "").toLowerCase().trim();
  if (t && TIPOS_ASSET[t]) return t;
  const ext = extensaoAsset(file.name);
  return EXT_PARA_MIME_ASSET[ext] || t;
}

export function ehMimeAssetPermitido(mime: string): boolean {
  return !!TIPOS_ASSET[mime];
}

/** O rótulo curto do tipo (PNG, JPEG, …) ou "Arquivo". */
export function rotuloDeMimeAsset(mime: string): string {
  return TIPOS_ASSET[mime]?.rotulo ?? "Arquivo";
}

export const LISTA_ASSETS_ACEITOS = "PNG, JPG, JPEG, WEBP, GIF, SVG";
export const LISTA_FONTES_ACEITAS = "WOFF2, WOFF, TTF, OTF";

export const MENSAGEM_ASSET_TIPO =
  `Tipo de arquivo não aceito. Imagens: ${LISTA_ASSETS_ACEITOS}. ` +
  `Fontes: ${LISTA_FONTES_ACEITAS} (TTF e OTF são convertidos para WOFF2).`;

/** A fonte é um dos tipos de fonte da web? (o que muda o serviço dela: CORS) */
export function ehFonte(mime: string): boolean {
  return (mime || "").toLowerCase().startsWith("font/");
}

/**
 * TTF/OTF são de DESKTOP: entram, mas são convertidos para WOFF2 antes de
 * guardar (o projeto — e o site publicado — ficam só com o formato da web).
 */
export function precisaConverterParaWoff2(mime: string): boolean {
  const m = (mime || "").toLowerCase();
  return m === "font/ttf" || m === "font/otf";
}

/** As extensões de fonte — é o que o seletor de arquivos aceita. */
export const EXTENSOES_FONTE = ["woff2", "woff", "ttf", "otf"];

/**
 * O NOME DA FAMÍLIA a partir do arquivo da fonte — é o que a pessoa escreve no
 * CSS (`font-family: "Minha Fonte"`). `minha-fonte-bold.woff2` → `Minha Fonte
 * Bold`. Nunca inventa peso/estilo: só limpa o nome do arquivo.
 */
export function familiaDaFonte(caminho: string): string {
  const base = (caminho || "").split(/[\\/]/).pop() || "";
  const semExt = base.replace(/\.[a-z0-9]+$/i, "");
  const partes = semExt
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[-_.\s]+/)
    .filter(Boolean);
  const nome = partes.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
  return nome || "Fonte do projeto";
}

/** Tamanho legível (KB/MB), em pt-BR. */
export function tamanhoLegivel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Limpa o nome de um arquivo para virar o caminho do asset dentro do projeto.
 * Tira qualquer diretório (nada de path), troca o que não for seguro por "-" e
 * força a pasta `assets/`. Vazio → null (nome inútil, recusamos).
 */
export function caminhoDeAsset(nomeOriginal: string, mime: string): string | null {
  const base = (nomeOriginal || "").split(/[\\/]/).pop() || "";
  const ext = extensaoAsset(base);
  const semExt = base.slice(0, base.length - (ext ? ext.length + 1 : 0));
  let limpo = semExt
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  if (!limpo) limpo = "arquivo";
  const e = TIPOS_ASSET[mime]?.ext || (ext || "bin").toLowerCase().replace(/[^a-z0-9]+/g, "");
  return `${PASTA_ASSETS}/${limpo}.${e}`;
}

/** Valida no NAVEGADOR — devolve null se passou, ou a mensagem de recusa (PT-BR). */
export function validarAssetNoNavegador(file: { name: string; size: number; type?: string }): string | null {
  if (file.size <= 0) return `"${file.name}" está vazio — não há arquivo para enviar.`;
  if (file.size > MAX_ASSET_BYTES) {
    return `"${file.name}" tem ${(file.size / 1024 / 1024).toFixed(1)} MB — o limite por arquivo é ${MAX_ASSET_ROTULO}.`;
  }
  const mime = mimeDeclaradoAsset(file);
  if (!mime || !ehMimeAssetPermitido(mime)) return `"${file.name}": ${MENSAGEM_ASSET_TIPO}`;
  return null;
}

/**
 * Normaliza um caminho de asset vindo de fora (nome do arquivo OU segmentos de
 * URL) para a forma canônica `assets/<...>/<nome>` em minúsculas. Recusa
 * qualquer coisa com `..`, segmento vazio, ponto solto ou caractere fora do
 * conjunto seguro — e força a pasta `assets/`. Devolve null se for inválido.
 * É a trava contra path traversal: aqui nunca sai um caminho que fuja da pasta.
 */
export function normalizarCaminhoAsset(cru: string): string | null {
  const base = (cru || "").trim().replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/{2,}/g, "/");
  if (!base) return null;
  const segs = base.split("/").filter((s) => s.length > 0);
  if (!segs.length) return null;
  if (segs.some((s) => s === "." || s === "..")) return null;
  // Força a pasta `assets/` como raiz (com ou sem ela no caminho recebido).
  if ((segs[0] || "").toLowerCase() !== PASTA_ASSETS) segs.unshift(PASTA_ASSETS);
  const nome = (segs[segs.length - 1] || "").toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(nome)) return null;
  const meio = segs.slice(1, -1).map((s) => s.toLowerCase());
  if (!meio.every((s) => /^[a-z0-9._-]+$/.test(s))) return null;
  return [PASTA_ASSETS, ...meio, nome].join("/");
}

/** A parte do caminho DEPOIS de `assets/` — é o sufixo da URL de serviço. */
export function sufixoDoAsset(caminho: string): string {
  const c = (caminho || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const prefixo = `${PASTA_ASSETS}/`;
  return c.toLowerCase().startsWith(prefixo) ? c.slice(prefixo.length) : c.split("/").pop() || c;
}
