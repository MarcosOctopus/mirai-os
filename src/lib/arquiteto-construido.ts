/**
 * O APP CONSTRUÍDO — servir o que o `buildar` produziu (dono, 16/10/2026).
 *
 * POR QUE EXISTE. Pedido do dono, verbatim: *"rurall ta a mesma coisa. Eu quero
 * eles funcionais. Rurall por exemplo foi minha empresa que fez. e tem area de
 * login e tudo. uma aplicação completa"*.
 *
 * Traduzido: um repositório trazido de fora NÃO é um "projeto de código" para
 * ficar parado numa tela padrão. É uma APLICAÇÃO — e aplicação que funciona tem
 * de RODAR. Medido no `Mesh2Motion/mesh2motion-app`: o `buildar` produz
 * `dist/` com 48 arquivos (index.html, create.html, retarget/index.html e os
 * `assets/*.js|css` com hash). Isso é um site completo, pronto para servir.
 *
 * O QUE ESTE MÓDULO NÃO É: não é o projeto HTML do Arquiteto. Aquele é bundlado
 * num documento só (index.html + CSS/JS embutidos) porque o código é TEXTO no
 * banco. Aqui são ARQUIVOS de verdade no disco, com caminhos próprios
 * (`/assets/main-abc.js`) e tipos próprios — servir bundlado quebraria os
 * `import` e as URLs. Cada arquivo vai como veio do build.
 *
 * A PASTA VEM DO WORKSPACE (`<projeto>/dist`), que o runner já ignora na cota —
 * dependência de build não é código do cliente e não deve ser cobrada dele.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, normalize, sep } from "node:path";

import { pastaDoProjeto } from "./arquiteto-workspace";

/** Onde um build costuma cair, na ordem em que se procura. */
const PASTAS_DE_BUILD = ["dist", "build", "out", ".output/public"];

/**
 * A pasta do APP CONSTRUÍDO deste projeto, ou `null` se não há build.
 *
 * O sinal é `index.html` na raiz da pasta: sem ele não há site — pode ser um
 * build de biblioteca, ou um build que falhou pela metade. Na dúvida, `null`:
 * quem chama volta ao comportamento antigo (projeto HTML / tela padrão).
 */
export function pastaConstruida(userId: number, projetoId: string): string | null {
  let base: string;
  try {
    base = pastaDoProjeto(userId, projetoId);
  } catch {
    return null;
  }
  for (const p of PASTAS_DE_BUILD) {
    const dir = join(base, p);
    try {
      if (existsSync(join(dir, "index.html"))) return dir;
    } catch {
      /* pasta ilegível: tenta a próxima */
    }
  }
  return null;
}

/** O projeto TEM app construído? (decide entre servir o app e a tela padrão) */
export function temConstruido(userId: number, projetoId: string): boolean {
  return pastaConstruida(userId, projetoId) !== null;
}

/**
 * Tipo do arquivo pelo sufixo. O build de um app real tem JS/CSS/WASM/mapa de
 * fonte — errar o `Content-Type` de um `.js` faz o navegador RECUSAR o módulo
 * (MIME estrito), e a página abre em branco sem erro visível. Por isso o mapa é
 * explícito, e o que não está nele sai como `application/octet-stream` (baixa em
 * vez de tentar adivinhar).
 */
const TIPOS: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8",
  map: "application/json; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  eot: "application/vnd.ms-fontobject",
  wasm: "application/wasm",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  webm: "video/webm",
  ogg: "audio/ogg",
  pdf: "application/pdf",
  glb: "model/gltf-binary",
  gltf: "model/gltf+json",
  bin: "application/octet-stream",
  vrm: "application/octet-stream",
};

function tipoDe(nome: string): string {
  const ext = nome.split(".").pop()?.toLowerCase() || "";
  return TIPOS[ext] || "application/octet-stream";
}

/** Resolve um caminho DENTRO da pasta construída, sem escapar dela. */
function dentroDaPasta(raiz: string, partes: string[]): string | null {
  // Cada segmento vem da URL: decodifica e recusa o que tenta subir.
  const limpos: string[] = [];
  for (const bruto of partes) {
    let p: string;
    try {
      p = decodeURIComponent(bruto);
    } catch {
      return null;
    }
    if (!p || p === "." || p === ".." || p.includes("/") || p.includes("\\") || p.includes("\0")) {
      return null;
    }
    limpos.push(p);
  }
  const alvo = normalize(join(raiz, ...limpos));
  const r = normalize(raiz);
  if (alvo !== r && !alvo.startsWith(r + sep)) return null;
  return alvo;
}

export type ArquivoServido = { bytes: Buffer; mime: string; caminho: string };

/**
 * O arquivo que responde por este caminho, dentro do app construído.
 *
 * Ordem: (1) o arquivo exato; (2) `<caminho>/index.html` (build multi-página,
 * como o do Mesh2Motion — `/retarget/` vira `retarget/index.html`); (3) se o
 * caminho NÃO tem sufixo, a raiz `index.html` — é o que faz um SPA com rotas no
 * cliente funcionar em `/qualquer/rota`. Caminho COM sufixo e sem arquivo é 404
 * de verdade (nunca servir a home fingindo que era o `.js` pedido).
 */
export function lerConstruido(
  userId: number,
  projetoId: string,
  partes: string[],
): ArquivoServido | null {
  const raiz = pastaConstruida(userId, projetoId);
  if (!raiz) return null;

  const tentativas: string[][] = [];
  if (partes.length) {
    tentativas.push(partes);
    tentativas.push([...partes, "index.html"]);
    // SPA: rota sem sufixo que não existe como arquivo cai na raiz — e a raiz é
    // `index.html`, NUNCA a pasta (a pasta é diretório: `statSync` a recusa e o
    // app não aparecia).
    const ultimo = partes[partes.length - 1];
    if (!ultimo.includes(".")) tentativas.push(["index.html"]);
  } else {
    // A RAIZ do site é `index.html`. Passar `[]` aqui resolve para o DIRETÓRIO —
    // que não é arquivo — e o app construído nunca era servido.
    tentativas.push(["index.html"]);
  }

  for (const t of tentativas) {
    const alvo = dentroDaPasta(raiz, t);
    if (!alvo) continue;
    try {
      const st = statSync(alvo);
      if (!st.isFile()) continue;
      const bytes = readFileSync(alvo);
      const nome = t.length ? t[t.length - 1] : "index.html";
      return { bytes, mime: tipoDe(nome), caminho: t.join("/") || "index.html" };
    } catch {
      continue;
    }
  }
  return null;
}
