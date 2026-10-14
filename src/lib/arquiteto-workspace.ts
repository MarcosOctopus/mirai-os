/**
 * WORKSPACE DO ARQUITETO — trazer um projeto de fora para dentro, ISOLADO.
 *
 * ─── O que o dono pediu (14/10/2026, verbatim) ───────────────────────────────
 *
 *   "Eu quero que consiga editar coisas em outros servidores ou instalar de
 *    forma isolada githubs e projetos pelo arquiteto"
 *
 * ─── Por que existe um workspace em DISCO (e não só o banco) ─────────────────
 *
 * Até aqui o projeto do Arquiteto vivia só como texto no SQLite: dava para
 * escrever um app do zero, mas não para TRAZER um projeto que já existe — um
 * repositório tem estrutura, muitos arquivos e histórico, e nada disso caberia
 * num campo de texto mantido à mão.
 *
 * O workspace dá a cada projeto um DIRETÓRIO PRÓPRIO. É a mesma regra da casa
 * aplicada ao código: cada projeto com o seu lugar, nada misturado, e o que é de
 * uma conta nunca encosta no de outra.
 *
 * ─── A fronteira (isto é o que torna a capacidade segura) ────────────────────
 *
 * 1. **Caminho confinado.** Todo caminho é resolvido e conferido contra a raiz
 *    do projeto. `../` não escapa, link simbólico não escapa, caminho absoluto
 *    não entra. A checagem é no SERVIDOR, sobre o caminho já resolvido — nunca
 *    sobre o texto que o cliente mandou.
 * 2. **Só HTTPS de host conhecido.** `git://`, `ssh://`, `file://`, `git@` e
 *    qualquer coisa começando com `-` (que viraria flag do git) são recusados
 *    antes de tocar no git. Repositório é para ser lido, não para virar comando.
 * 3. **Clone raso e sem ganchos.** `--depth 1 --single-branch --no-tags`, sem
 *    submódulos e com `core.hooksPath` desarmado — o repositório não executa
 *    nada nosso.
 * 4. **Nada é executado.** Aqui NÃO se roda `npm install`, build nem teste. O
 *    código de fora é LIDO e EDITADO, nunca rodado dentro do processo do app.
 *    (Rodar código de terceiro exige ambiente isolado de verdade — o desenho
 *    disso está no fim deste arquivo, e depende de decisão do dono.)
 * 5. **Tetos.** Tamanho em disco, número de arquivos e tamanho por arquivo, com
 *    o que ficou de fora DITO na resposta. Estouro não vira silêncio: vira aviso.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, rmSync, existsSync, readdirSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join, relative, sep, dirname } from "node:path";

const execFileAsync = promisify(execFile);

/** Onde os workspaces vivem. Fora do código: é dado, e é dado de gente. */
export const RAIZ_WORKSPACES = resolve(process.cwd(), "data", "arquiteto-workspaces");

/** Tetos. Medidos para caber folgado no disco e não travar a resposta. */
export const TETO = {
  /** Tamanho total do clone, em bytes (25 MB — código, não mídia). */
  bytes: 25 * 1024 * 1024,
  /** Quantos arquivos entram no projeto do Arquiteto. */
  arquivos: 400,
  /** Tamanho de cada arquivo que entra (256 KB). */
  porArquivo: 256 * 1024,
  /** Segundos para o clone. */
  segundos: 90,
} as const;

export type ResultadoImportacao = {
  ok: boolean;
  /** Pasta do workspace, relativa (nunca o caminho absoluto do servidor). */
  workspace?: string;
  arquivos?: { nome: string; conteudo: string }[];
  /** O que foi lido, o que ficou de fora e por quê — para a resposta ser honesta. */
  relatorio: {
    repo: string;
    lidos: number;
    incluidos: number;
    bytes: number;
    pulados: { caminho: string; motivo: string }[];
    avisos: string[];
  };
  erro?: string;
};

/** Extensões que são claramente binárias — não viram arquivo de projeto. */
const BINARIAS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "avif", "ico", "bmp", "tiff", "svgz",
  "woff", "woff2", "ttf", "otf", "eot",
  "mp3", "mp4", "webm", "mov", "avi", "wav", "ogg", "flac", "m4a",
  "zip", "gz", "tgz", "bz2", "xz", "7z", "rar", "jar", "war",
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "exe", "dll", "so", "dylib", "bin", "class", "pyc", "wasm",
  "db", "sqlite", "sqlite3", "lock", "pack", "idx",
]);

/** Pastas que nunca importam (dependência instalada, build, cache, VCS). */
const IGNORADAS = new Set([
  ".git", "node_modules", ".next", "dist", "build", "out", "target", "vendor",
  "__pycache__", ".venv", "venv", "env", ".cache", ".turbo", "coverage",
  ".idea", ".vscode", "bower_components", ".gradle", ".mvn", "Pods",
]);

/**
 * Valida o endereço do repositório. Recusa ANTES de tocar no git.
 *
 * O que se protege aqui: um endereço é entrada de usuário, e entrada de usuário
 * que chega num comando é onde mora a falha. `-` no começo viraria flag do git;
 * esquemas que não sejam https:// poderiam ler do disco (`file://`) ou falar
 * por outro canal. Só passa `https://` de host conhecido, com dono/repo limpos.
 */
export function validarRepo(bruto: string): { ok: true; url: string; slug: string } | { ok: false; erro: string } {
  const t = (bruto || "").trim();
  if (!t) return { ok: false, erro: "informe o endereço do repositório" };
  if (t.length > 300) return { ok: false, erro: "endereço longo demais" };
  // Flag disfarçada de endereço.
  if (t.startsWith("-")) return { ok: false, erro: "endereço inválido" };

  let u: URL;
  try {
    // Aceita a forma como a pessoa cola ("github.com/dono/repo") — exigir o
    // esquema digitado à mão é atrito sem ganho, já que ele é imposto aqui.
    u = new URL(/^[a-z]+:\/\//i.test(t) ? t : `https://${t}`);
  } catch {
    return { ok: false, erro: "endereço inválido — use https://github.com/dono/repo" };
  }
  if (u.protocol !== "https:") {
    return { ok: false, erro: "só endereço https:// é aceito (nada de ssh://, git:// ou file://)" };
  }
  const host = u.hostname.toLowerCase();
  const permitidos = ["github.com", "www.github.com", "gitlab.com", "www.gitlab.com", "codeberg.org"];
  if (!permitidos.includes(host)) {
    return { ok: false, erro: `host não aceito (${host}) — aceito: github.com, gitlab.com, codeberg.org` };
  }
  // dono/repo, sem nada estranho no caminho
  const partes = u.pathname.replace(/^\/+|\/+$/g, "").split("/");
  if (partes.length < 2 || !partes[0] || !partes[1]) {
    return { ok: false, erro: "endereço incompleto — falta o repositório (ex.: https://github.com/dono/repo)" };
  }
  const limpo = (s: string) => /^[A-Za-z0-9._-]+$/.test(s);
  if (!limpo(partes[0]) || !limpo(partes[1].replace(/\.git$/, ""))) {
    return { ok: false, erro: "nome de dono/repositório com caractere não aceito" };
  }
  const dono = partes[0];
  const repo = partes[1].replace(/\.git$/, "");
  return { ok: true, url: `https://${host}/${dono}/${repo}.git`, slug: `${dono}/${repo}` };
}

/** A pasta de UM projeto. É a fronteira: nada fora dela é alcançável. */
export function pastaDoProjeto(userId: number, projetoId: string): string {
  const seguro = String(projetoId).replace(/[^A-Za-z0-9._-]/g, "");
  if (!seguro) throw new Error("id de projeto inválido");
  return join(RAIZ_WORKSPACES, String(userId), seguro);
}

/**
 * Resolve um caminho DENTRO do projeto e confere que ele não escapou.
 *
 * A conferência é sobre o caminho já resolvido (`resolve`), não sobre o texto —
 * é o que faz `..`, link simbólico e caminho absoluto pararem no mesmo lugar.
 */
export function caminhoSeguro(pastaProjeto: string, relativo: string): string | null {
  const r = (relativo || "").replace(/\\/g, "/").trim();
  if (!r) return null;
  if (r.startsWith("/") || /^[A-Za-z]:/.test(r)) return null; // absoluto

  // CAMADA 2 — traversal CODIFICADO. `%2e%2e%2f` passa pela checagem de texto
  // (não tem "..") mas vira ".." quando algum consumidor decodifica. Decodifica
  // AQUI e confere o resultado: quem decodifica depois não encontra surpresa.
  let decodificado = r;
  try {
    decodificado = decodeURIComponent(r);
  } catch {
    return null; // percentual malformado não é nome de arquivo legítimo
  }
  if (decodificado !== r) {
    // Depois de decodificar não pode haver traversal nem barra nova.
    if (decodificado.includes("..") || decodificado.includes("\u0000")) return null;
    const alvoDec = resolve(pastaProjeto, decodificado);
    const raizDec = resolve(pastaProjeto);
    if (alvoDec !== raizDec && !alvoDec.startsWith(raizDec + sep)) return null;
  }
  if (r.includes("\u0000")) return null;

  const alvo = resolve(pastaProjeto, r);
  const raiz = resolve(pastaProjeto);
  if (alvo !== raiz && !alvo.startsWith(raiz + sep)) return null; // escapou
  return alvo;
}

/** Percorre o workspace e devolve os arquivos de texto que cabem nos tetos. */
function colherArquivos(
  pasta: string,
  rel: string,
  saida: { nome: string; conteudo: string }[],
  pulados: { caminho: string; motivo: string }[],
  avisos: string[],
  contador: { bytes: number; lidos: number },
): void {
  let itens: string[];
  try {
    itens = readdirSync(pasta);
  } catch {
    return;
  }
  for (const item of itens) {
    if (saida.length >= TETO.arquivos) {
      if (!avisos.includes("limite de arquivos atingido")) avisos.push("limite de arquivos atingido");
      return;
    }
    const completo = join(pasta, item);
    const caminhoRel = rel ? `${rel}/${item}` : item;
    let st;
    try {
      st = statSync(completo);
    } catch {
      continue;
    }
    if (st.isSymbolicLink?.()) {
      pulados.push({ caminho: caminhoRel, motivo: "link simbólico" });
      continue;
    }
    if (st.isDirectory()) {
      if (IGNORADAS.has(item)) continue;
      colherArquivos(completo, caminhoRel, saida, pulados, avisos, contador);
      continue;
    }
    contador.lidos++;
    const ext = (item.split(".").pop() || "").toLowerCase();
    if (BINARIAS.has(ext)) {
      pulados.push({ caminho: caminhoRel, motivo: "arquivo binário" });
      continue;
    }
    if (st.size > TETO.porArquivo) {
      pulados.push({ caminho: caminhoRel, motivo: `grande demais (${Math.round(st.size / 1024)} KB)` });
      continue;
    }
    let conteudo: string;
    try {
      conteudo = readFileSync(completo, "utf8");
    } catch {
      pulados.push({ caminho: caminhoRel, motivo: "não foi possível ler" });
      continue;
    }
    // Byte nulo = binário disfarçado de texto (extensão mente).
    if (conteudo.includes("\u0000")) {
      pulados.push({ caminho: caminhoRel, motivo: "binário (conteúdo)" });
      continue;
    }
    saida.push({ nome: caminhoRel, conteudo });
    contador.bytes += st.size;
  }
}

/** Quanto um workspace ocupa — usado para o teto por conta. */
export function tamanhoDoWorkspace(userId: number): number {
  const raiz = join(RAIZ_WORKSPACES, String(userId));
  if (!existsSync(raiz)) return 0;
  let total = 0;
  const anda = (d: string) => {
    let itens: string[];
    try {
      itens = readdirSync(d);
    } catch {
      return;
    }
    for (const i of itens) {
      const p = join(d, i);
      try {
        const st = statSync(p);
        if (st.isDirectory()) anda(p);
        else total += st.size;
      } catch {
        /* ignora o que não dá para medir */
      }
    }
  };
  anda(raiz);
  return total;
}

/**
 * IMPORTA um repositório para o workspace do projeto — isolado.
 *
 * Clona num diretório temporário (fora do projeto), CONFERE o tamanho e só então
 * move para o lugar definitivo. Se o repositório for grande demais, o temporário
 * é removido e nada fica pela metade: o projeto não recebe um clone truncado sem
 * saber.
 */
export async function importarDoGit(
  userId: number,
  projetoId: string,
  endereco: string,
): Promise<ResultadoImportacao> {
  const relatorio: ResultadoImportacao["relatorio"] = {
    repo: endereco,
    lidos: 0,
    incluidos: 0,
    bytes: 0,
    pulados: [],
    avisos: [],
  };

  const v = validarRepo(endereco);
  if (!v.ok) return { ok: false, relatorio, erro: v.erro };
  relatorio.repo = v.slug;

  const destino = pastaDoProjeto(userId, projetoId);
  const temporario = `${destino}.importando-${Date.now()}`;

  try {
    mkdirSync(dirname(temporario), { recursive: true });
    rmSync(temporario, { recursive: true, force: true });

    // Clone RASO e SEM GANCHOS: o repositório é dado a ler, não programa a rodar.
    await execFileAsync(
      "git",
      [
        "-c", "core.hooksPath=/dev/null",
        "-c", "core.symlinks=false",
        "-c", "protocol.file.allow=never",
        "clone",
        "--depth", "1",
        "--single-branch",
        "--no-tags",
        "--no-recurse-submodules",
        v.url,
        temporario,
      ],
      {
        timeout: TETO.segundos * 1000,
        env: {
          ...process.env,
          // Sem pedir credencial: repositório privado não é acessível por aqui
          // (e é assim de propósito — credencial não entra nesta camada).
          GIT_TERMINAL_PROMPT: "0",
          GIT_ASKPASS: "echo",
          GIT_CONFIG_NOSYSTEM: "1",
        },
        maxBuffer: 4 * 1024 * 1024,
      },
    );
  } catch (e) {
    rmSync(temporario, { recursive: true, force: true });
    const msg = e instanceof Error ? e.message : String(e);
    const amigavel = /could not resolve|unable to access|repository not found|authentication/i.test(msg)
      ? "não consegui acessar esse repositório (não existe, é privado, ou o endereço está errado)"
      : /timed? ?out/i.test(msg)
        ? `o repositório demorou mais de ${TETO.segundos}s para clonar`
        : "não consegui clonar esse repositório";
    return { ok: false, relatorio, erro: amigavel };
  }

  // Tamanho do clone, antes de aceitar.
  const bytesClone = tamanhoDePasta(temporario);
  if (bytesClone > TETO.bytes) {
    rmSync(temporario, { recursive: true, force: true });
    return {
      ok: false,
      relatorio,
      erro: `o repositório tem ${(bytesClone / 1048576).toFixed(1)} MB e o limite é ${TETO.bytes / 1048576} MB`,
    };
  }

  // Colhe os arquivos de texto, respeitando os tetos.
  const arquivos: { nome: string; conteudo: string }[] = [];
  const contador = { bytes: 0, lidos: 0 };
  colherArquivos(temporario, "", arquivos, relatorio.pulados, relatorio.avisos, contador);

  if (!arquivos.length) {
    rmSync(temporario, { recursive: true, force: true });
    return { ok: false, relatorio, erro: "não encontrei arquivos de texto nesse repositório" };
  }

  // Troca atômica: o antigo só sai quando o novo está pronto.
  const anterior = `${destino}.anterior-${Date.now()}`;
  try {
    if (existsSync(destino)) {
      rmSync(anterior, { recursive: true, force: true });
      // `rename` entre pastas do mesmo sistema é atômico.
      const { renameSync } = await import("node:fs");
      renameSync(destino, anterior);
      renameSync(temporario, destino);
      rmSync(anterior, { recursive: true, force: true });
    } else {
      const { renameSync } = await import("node:fs");
      renameSync(temporario, destino);
    }
  } catch {
    rmSync(temporario, { recursive: true, force: true });
    return { ok: false, relatorio, erro: "não consegui preparar o workspace do projeto" };
  }

  relatorio.lidos = contador.lidos;
  relatorio.incluidos = arquivos.length;
  relatorio.bytes = contador.bytes;
  if (contador.lidos > arquivos.length) {
    relatorio.avisos.push(`${contador.lidos - arquivos.length} arquivo(s) não entraram (binário, grande ou link)`);
  }

  return {
    ok: true,
    workspace: relative(RAIZ_WORKSPACES, destino),
    arquivos,
    relatorio,
  };
}

/** Tamanho de uma pasta, em bytes (para medir o clone antes de aceitar). */
function tamanhoDePasta(d: string): number {
  let total = 0;
  const anda = (p: string) => {
    let itens: string[];
    try {
      itens = readdirSync(p);
    } catch {
      return;
    }
    for (const i of itens) {
      const c = join(p, i);
      try {
        const st = statSync(c);
        if (st.isDirectory()) anda(c);
        else total += st.size;
      } catch {
        /* ignora */
      }
    }
  };
  anda(d);
  return total;
}

/** Lê um arquivo do workspace (confinado). */
/**
 * IMPORTAÇÃO DO SERVIDOR DELE (dono, 14/10/2026) — grava no workspace ISOLADO os
 * arquivos que vieram do servidor da pessoa.
 *
 * Mesma confinação do clone: cada caminho passa por `caminhoSeguro`, então nada
 * pode escapar da pasta DESTE projeto, e os mesmos tetos valem (por arquivo e
 * total). O servidor dele não é tocado — a importação é uma CÓPIA.
 */
export function importarDoServidor(
  userId: number,
  projetoId: string,
  arquivos: { nome: string; conteudo: string }[],
  origem: string,
): ResultadoImportacao {
  const relatorio: ResultadoImportacao["relatorio"] = {
    repo: origem,
    lidos: arquivos.length,
    incluidos: 0,
    bytes: 0,
    pulados: [],
    avisos: [],
  };

  const pasta = pastaDoProjeto(userId, projetoId);
  try {
    mkdirSync(pasta, { recursive: true });
  } catch {
    return { ok: false, relatorio, erro: "não consegui criar o workspace do projeto" };
  }

  const dentro: { nome: string; conteudo: string }[] = [];
  for (const a of arquivos) {
    if (dentro.length >= TETO.arquivos) {
      if (!relatorio.avisos.includes("limite de arquivos atingido")) relatorio.avisos.push("limite de arquivos atingido");
      break;
    }
    const alvo = caminhoSeguro(pasta, a.nome);
    if (!alvo) {
      relatorio.pulados.push({ caminho: a.nome, motivo: "caminho fora do projeto" });
      continue;
    }
    const bytes = Buffer.byteLength(a.conteudo, "utf8");
    if (bytes > TETO.porArquivo) {
      relatorio.pulados.push({ caminho: a.nome, motivo: "arquivo grande demais" });
      continue;
    }
    if (relatorio.bytes + bytes > TETO.bytes) {
      relatorio.pulados.push({ caminho: a.nome, motivo: "teto total do projeto atingido" });
      continue;
    }
    try {
      mkdirSync(dirname(alvo), { recursive: true });
      writeFileSync(alvo, a.conteudo, "utf8");
    } catch {
      relatorio.pulados.push({ caminho: a.nome, motivo: "não consegui gravar" });
      continue;
    }
    relatorio.incluidos += 1;
    relatorio.bytes += bytes;
    dentro.push({ nome: a.nome, conteudo: a.conteudo });
  }

  if (!dentro.length) {
    return { ok: false, relatorio, erro: "não encontrei arquivos de texto nessa pasta do servidor" };
  }
  return { ok: true, workspace: `${userId}/${projetoId}`, arquivos: dentro, relatorio };
}

export function lerArquivoDoWorkspace(
  userId: number,
  projetoId: string,
  relativo: string,
): { ok: true; conteudo: string } | { ok: false; erro: string } {
  const pasta = pastaDoProjeto(userId, projetoId);
  const alvo = caminhoSeguro(pasta, relativo);
  if (!alvo) return { ok: false, erro: "caminho fora do projeto" };
  if (!existsSync(alvo)) return { ok: false, erro: "arquivo não existe" };
  try {
    const st = statSync(alvo);
    if (st.isDirectory()) return { ok: false, erro: "é uma pasta, não um arquivo" };
    if (st.size > TETO.porArquivo) return { ok: false, erro: "arquivo grande demais" };
    return { ok: true, conteudo: readFileSync(alvo, "utf8") };
  } catch {
    return { ok: false, erro: "não consegui ler o arquivo" };
  }
}

/** Escreve um arquivo do workspace (confinado), criando as pastas do caminho. */
export function escreverArquivoDoWorkspace(
  userId: number,
  projetoId: string,
  relativo: string,
  conteudo: string,
): { ok: true } | { ok: false; erro: string } {
  const pasta = pastaDoProjeto(userId, projetoId);
  if (!existsSync(pasta)) return { ok: false, erro: "este projeto não tem workspace" };
  const alvo = caminhoSeguro(pasta, relativo);
  if (!alvo) return { ok: false, erro: "caminho fora do projeto" };
  if (Buffer.byteLength(conteudo, "utf8") > TETO.porArquivo) {
    return { ok: false, erro: "conteúdo grande demais para um arquivo" };
  }
  try {
    mkdirSync(dirname(alvo), { recursive: true });
    writeFileSync(alvo, conteudo, "utf8");
    return { ok: true };
  } catch {
    return { ok: false, erro: "não consegui gravar o arquivo" };
  }
}

/** Lista o que existe no workspace (para a tela mostrar o que veio). */
export function listarWorkspace(userId: number, projetoId: string): string[] {
  const pasta = pastaDoProjeto(userId, projetoId);
  if (!existsSync(pasta)) return [];
  const saida: string[] = [];
  const anda = (d: string, rel: string) => {
    let itens: string[];
    try {
      itens = readdirSync(d);
    } catch {
      return;
    }
    for (const i of itens) {
      const c = join(d, i);
      const r = rel ? `${rel}/${i}` : i;
      try {
        if (statSync(c).isDirectory()) anda(c, r);
        else saida.push(r);
      } catch {
        /* ignora */
      }
    }
  };
  anda(pasta, "");
  return saida.sort();
}

/* ─────────────────────────────────────────────────────────────────────────────
 * O QUE FALTA — e depende de decisão do dono (não construir sem ela)
 *
 * **Rodar o código de fora.** Importar já funciona; EXECUTAR (npm install,
 * build, teste) não — e não pode ser aqui. Rodar código de terceiro dentro do
 * processo do app é entregar a máquina. O caminho certo tem duas peças:
 *
 *   1. Um **runner no host** (onde há Docker) expondo uma porta ESTREITA:
 *      criar workspace, rodar comando PERMITIDO, ler arquivo. Não um shell.
 *   2. O app fala com essa porta por token, como fala com o MCP de um produto.
 *
 * **Editar em outro servidor.** Mesma forma: uma porta instalada LÁ (agente
 * pequeno, com acesso só à pasta do projeto), nunca SSH com chave-mestra a
 * partir do app de cliente. Um servidor comprometido com chave-mestra é o
 * ecossistema inteiro comprometido.
 *
 * Enquanto isso não for decidido, esta camada é honesta: importa e edita o que
 * está AQUI, e diz que não executa.
 * ──────────────────────────────────────────────────────────────────────────── */
