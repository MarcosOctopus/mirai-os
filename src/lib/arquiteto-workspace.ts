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
import { mkdirSync, rmSync, existsSync, readdirSync, statSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { resolve, join, relative, sep, dirname } from "node:path";
import { limitesDoUsuario, espacoLegivel } from "./limites-da-conta";
import { baixarTarball, repositorio } from "./github-api";

const execFileAsync = promisify(execFile);

/** Onde os workspaces vivem. Fora do código: é dado, e é dado de gente. */
export const RAIZ_WORKSPACES = resolve(process.cwd(), "data", "arquiteto-workspaces");

/**
 * Tetos. (DONO, 15/10/2026: *"pode colocar o limite até 500mb sei la"*.)
 *
 * O 25 MB anterior rejeitava repositório de verdade: medido, `flowiseai/flowise`
 * (64,4 MB) foi recusado ANTES de qualquer análise — o clone inteiro era medido
 * e reprovado. Mas o que o Arquiteto GUARDA não é o clone: `colherArquivos` já
 * descarta `node_modules`, binários, imagens e arquivos grandes. O teto do clone
 * não protegia nada que os tetos de baixo não protejam — só impediacia de ler o
 * repositório para descobrir isso.
 *
 * Os números são LIGADOS: subir `bytes` sem subir `segundos` faz o clone de
 * 500 MB morrer no timeout; e subir `arquivos`/`porArquivo` sem `guardados` deixa
 * o total guardado sem teto (o que derrubaria a leitura do projeto no chat).
 */
export const TETO = {
  /** Tamanho total do clone, em bytes (500 MB). É a PORTEIRA do repositório. */
  bytes: 500 * 1024 * 1024,
  /**
   * Quantos arquivos entram no projeto do Arquiteto.
   *
   * ERAM 2000 — E ISSO QUEBRAVA O PROJETO (medido, 16/10/2026). O flowise tem
   * mais de 2000 arquivos de texto: a coleta parava no 2000º e o repositório
   * chegava com pedaços faltando (`packages/ui/src/store` sumiu), então o build
   * falhava DENTRO do código do cliente — `Could not load /app/packages/ui/src/store`.
   * Um repositório truncado não é um repositório: é um erro esperando alguém
   * publicar. O freio real é `guardados` (bytes) — o teto de CONTAGEM só servia
   * para cortar código-fonte, que é justamente o que se quer trazer.
   */
  arquivos: 20000,
  /** Tamanho de cada arquivo que entra (512 KB). */
  porArquivo: 512 * 1024,
  /**
   * Teto PRÓPRIO para arquivo de trava de dependência (8 MB).
   *
   * POR QUE EXISTE (dono, 16/10/2026): medido no flowise — o `pnpm-lock.yaml`
   * tem ~1,5 MB e ficava de fora pelo teto de 512 KB. Sem ele a instalação
   * funciona, mas RESOLVE TUDO DE NOVO (versões podem sair diferentes das que o
   * projeto testou). O lockfile é texto, é pequeno para o que vale, e é ele que
   * diz ao runner qual gerenciador usar.
   */
  porArquivoLock: 8 * 1024 * 1024,
  /**
   * Teto de cada arquivo BINÁRIO que vai para o DISCO (8 MB).
   *
   * POR QUE EXISTE (medido, 16/10/2026): o build do flowise morreu em
   * `[vite:asset] Could not load /app/packages/ui/src/assets/images/llamaindex.png`.
   * Um app REAL tem imagens, fontes, ícones — e o import descartava TODO binário
   * ("arquivo binário", 93 no flowise). O projeto chegava sem os assets e não
   * construía. Código-fonte que não constrói não é entrega.
   *
   * Estes NÃO vão para o banco (o banco é o texto editável e a prévia): vão só
   * para o disco, que é o que o runner monta para instalar e construir. O
   * relatório diz quantos foram, em vez de fingir que o repositório não tinha.
   */
  porArquivoBinario: 8 * 1024 * 1024,
  /** Teto do total de binários por projeto (150 MB). */
  binarios: 150 * 1024 * 1024,
  /**
   * TETO DO QUE É GUARDADO, em bytes (100 MB) — o freio real.
   *
   * POR QUE EXISTE: `arquivos` e `porArquivo` sozinhos são multiplicativos (2000
   * × 512 KB = 1 GB no pior caso). Sem este teto, um repositório grande encheria
   * o projeto de texto e a leitura do projeto (que carrega os arquivos para
   * trabalhar) estouraria a memória. É o teto do clone que pode ser generoso; o
   * do que fica, não.
   */
  guardados: 100 * 1024 * 1024,
  /** Segundos para o clone. 500 MB não clona em 90s. */
  segundos: 300,
  /**
   * TETO DA CONTA, em bytes — quanto UMA conta pode ocupar no Arquiteto.
   *
   * POR QUE EXISTE (dono, 15/10/2026): *"o cliente pode criar, trazer projetos do
   * server deles, github, mas tudo dentro do limite dele e que n afete outros
   * clientes"*. Os tetos acima são POR PROJETO — sem um teto por CONTA, um cliente
   * podia encher o disco com projetos sem fim e afetar todo mundo, que é
   * exatamente o que a regra proíbe. O comentário de `tamanhoDoWorkspace` já dizia
   * "usado para o teto por conta" desde que nasceu, mas o número nunca era
   * comparado com nada: mediava-se o uso e não se fazia nada com ele.
   *
   * 2 GB. Era 250 MB — e com o teto por projeto agora em 500 MB, manter 250 MB
   * aqui DUPLICARIA a porta: um projeto grande passaria na primeira checagem e
   * seria recusado na segunda. O teto que vale de verdade é o do PLANO
   * (`limites.espacoBytes`); este é o piso do código.
   */
  porConta: 2 * 1024 * 1024 * 1024,
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
    /** Binários que foram para o DISCO (não para o banco). Ver `porArquivoBinario`. */
    binarios?: { copiados: number; bytes: number };
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
 * O que um endereço colado SIGNIFICA (dono, 16/10/2026).
 *
 * Recusa ANTES de tocar no git: um endereço é entrada de usuário, e entrada de
 * usuário que chega num comando é onde mora a falha. `-` no começo viraria flag do
 * git; esquemas que não sejam https:// poderiam ler do disco (`file://`) ou falar
 * por outro canal. Só passa `https://` de host conhecido.
 *
 * DEFEITO MEDIDO: o cliente colou `https://github.com/orgs/Mesh2Motion/repositories`
 * (a LISTA de repositórios da organização) e o app leu "orgs" como se fosse o dono
 * e "Mesh2Motion" como se fosse o repositório — depois respondeu *"não achei o
 * repositório 'orgs/Mesh2Motion'"*, um erro que não faz sentido para quem colou a
 * URL certa da organização. E `https://github.com/Mesh2Motion` respondia *"falta o
 * repositório"* — verdade, mas inútil: quem cola isso quer VER os repositórios.
 *
 * A regra: se o endereço aponta para uma CONTA (organização ou usuário), a resposta
 * certa não é erro — é a LISTA de repositórios dela, para escolher. Quem decide é a
 * tela/chat, que mostra a lista; aqui só se classifica.
 */
export type AlvoDoEndereco =
  | { tipo: "repo"; url: string; slug: string; host: string }
  | { tipo: "lista"; dono: string; host: string }
  | { tipo: "invalido"; erro: string };

export function alvoDoEndereco(bruto: string): AlvoDoEndereco {
  const t = (bruto || "").trim();
  if (!t) return { tipo: "invalido", erro: "informe o endereço do repositório" };
  if (t.length > 300) return { tipo: "invalido", erro: "endereço longo demais" };
  // Flag disfarçada de endereço.
  if (t.startsWith("-")) return { tipo: "invalido", erro: "endereço inválido" };

  let u: URL;
  try {
    // A FORMA CURTA 'dono/repo' (dono, 15/10/2026).
    //
    // DEFEITO MEDIDO: era a forma DOCUMENTADA na ferramenta (`arquiteto_trazer_git`
    // anuncia "aceita 'dono/repo' ou a URL completa") e NÃO funcionava. Sem esquema,
    // `new URL("https://" + "flowiseai/flowise")` produz host = "flowiseai" — que
    // não está na lista de hosts aceitos — e a resposta era *"o host que chegou foi
    // flowiseai"*, um erro que não faz sentido para quem digitou dono/repo.
    //
    // Quem escreve 'dono/repo' quer o GITHUB: é o formato canônico dele. Então a
    // forma curta (exatamente um '/') ganha o host aqui, em vez de ser lida como
    // endereço sem host.
    const curta = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(t);
    // A forma curta SEM barra é uma CONTA do GitHub: quem digita "flowiseai" quer os
    // repositórios de flowiseai. Sem isto, `new URL("https://flowiseai")` produz
    // host="flowiseai" e a resposta era *"host não aceito (flowiseai)"*.
    const soConta = /^[A-Za-z0-9._-]+$/.test(t);
    const alvo = curta || soConta ? `https://github.com/${t}` : t;
    // Aceita a forma como a pessoa cola ("github.com/dono/repo") — exigir o
    // esquema digitado à mão é atrito sem ganho, já que ele é imposto aqui.
    u = new URL(/^[a-z]+:\/\//i.test(alvo) ? alvo : `https://${alvo}`);
  } catch {
    return { tipo: "invalido", erro: "endereço inválido — use https://github.com/dono/repo ou dono/repo" };
  }
  if (u.protocol !== "https:") {
    return { tipo: "invalido", erro: "só endereço https:// é aceito (nada de ssh://, git:// ou file://)" };
  }
  const host = u.hostname.toLowerCase();
  const permitidos = ["github.com", "www.github.com", "gitlab.com", "www.gitlab.com", "codeberg.org"];
  if (!permitidos.includes(host)) {
    return { tipo: "invalido", erro: `host não aceito (${host}) — aceito: github.com, gitlab.com, codeberg.org` };
  }

  const limpo = (s: string) => /^[A-Za-z0-9._-]+$/.test(s);
  let partes = u.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  // `github.com/orgs/<org>` é a forma CANÔNICA da organização — "orgs" é segmento
  // do GitHub, não nome de dono. Tirá-lo faz `orgs/<org>/<repo>` virar
  // `<org>/<repo>`, que é o MESMO repositório. Sem isto, a URL
  // `github.com/orgs/Mesh2Motion/nao-existe` era lida como a LISTA da organização.
  if (partes[0] === "orgs") partes = partes.slice(1);

  // ── A CONTA, não o repositório: devolve a LISTA para escolher ─────────────
  //   github.com/<dono>                (sem repositório)
  //   github.com/<dono>/repositories
  //   gitlab.com/<dono> · codeberg.org/<dono>
  if (partes.length === 1 && limpo(partes[0])) {
    return { tipo: "lista", dono: partes[0], host };
  }
  if (partes.length === 2 && partes[1] === "repositories" && limpo(partes[0])) {
    return { tipo: "lista", dono: partes[0], host };
  }

  // ── O REPOSITÓRIO ─────────────────────────────────────────────────────────
  if (partes.length < 2 || !partes[0] || !partes[1]) {
    return {
      tipo: "invalido",
      erro: "endereço incompleto — falta o repositório (ex.: https://github.com/dono/repo)",
    };
  }
  if (!limpo(partes[0]) || !limpo(partes[1].replace(/\.git$/, ""))) {
    return { tipo: "invalido", erro: "nome de dono/repositório com caractere não aceito" };
  }
  const dono = partes[0];
  const repo = partes[1].replace(/\.git$/, "");
  return { tipo: "repo", url: `https://${host}/${dono}/${repo}.git`, slug: `${dono}/${repo}`, host };
}

/**
 * A validação estrita de UM repositório. Delega a `alvoDoEndereco` — assim todo
 * chamador (tela, chat, ferramentas) ganha de graça a mensagem CERTA quando o que
 * chegou foi uma conta em vez de um repositório.
 */
export function validarRepo(bruto: string): { ok: true; url: string; slug: string } | { ok: false; erro: string } {
  const a = alvoDoEndereco(bruto);
  if (a.tipo === "repo") return { ok: true, url: a.url, slug: a.slug };
  if (a.tipo === "lista") {
    return {
      ok: false,
      erro: `"${a.dono}" é uma conta (organização ou usuário), não um repositório — abra a lista e escolha um projeto`,
    };
  }
  return { ok: false, erro: a.erro };
}

/** A pasta de UM projeto. É a fronteira: nada fora dela é alcançável. */
export function pastaDoProjeto(userId: number, projetoId: string): string {
  const seguro = String(projetoId).replace(/[^A-Za-z0-9._-]/g, "");
  if (!seguro) throw new Error("id de projeto inválido");
  return join(RAIZ_WORKSPACES, String(userId), seguro);
}

/**
 * Apaga o workspace de um projeto NA DISCO (dono, 16/10/2026).
 *
 * Quem apaga o projeto tem de apagar os arquivos. MEDIDO: `apagarProjeto`
 * removia só o banco e as pastas ficavam — 6 órfãs, 56,6 MB na conta do dono. Como
 * a cota da conta é medida na disco, o espaço de um projeto apagado continuava
 * sendo cobrado dele; e o código do cliente continuava no servidor.
 *
 * Não lança: quem chama já apagou o registro, e falhar aqui só deixaria espaço
 * ocupado — nunca um projeto "meio apagado".
 */
export function apagarWorkspace(userId: number, projetoId: string): void {
  try {
    rmSync(pastaDoProjeto(userId, projetoId), { recursive: true, force: true });
  } catch (e) {
    console.error("Workspace do projeto não saiu:", e instanceof Error ? e.message : e);
  }
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

/** Arquivos primeiro, pastas depois (e cada grupo ordenado) — ver `colherArquivos`. */
function arquivosPrimeiro(pasta: string, itens: string[]): string[] {
  const arquivos: string[] = [];
  const pastas: string[] = [];
  for (const i of itens) {
    try {
      if (statSync(join(pasta, i)).isDirectory()) pastas.push(i);
      else arquivos.push(i);
    } catch {
      arquivos.push(i);
    }
  }
  return [...arquivos.sort(), ...pastas.sort()];
}

/**
 * COPIA o binário para o disco do projeto (não para o banco).
 *
 * Medido (16/10/2026): sem isto o build do flowise morria em `[vite:asset]
 * Could not load .../llamaindex.png`. O banco guarda o TEXTO (edição e prévia);
 * o disco guarda o projeto INTEIRO, que é o que o runner monta para construir.
 * O que passa do teto continua sendo "pulado" — e continua aparecendo no
 * relatório, para relatório e disco contarem a MESMA história.
 */
function guardaBinario(
  origem: string,
  caminhoRel: string,
  tamanho: number,
  destinoBin: string | undefined,
  bin: { copiados: number; bytes: number; lista?: string[] } | undefined,
  pulados: { caminho: string; motivo: string }[],
  semCopiar?: boolean,
): void {
  if (!destinoBin || !bin) {
    pulados.push({ caminho: caminhoRel, motivo: "arquivo binário" });
    return;
  }
  if (tamanho > TETO.porArquivoBinario) {
    pulados.push({ caminho: caminhoRel, motivo: `binário grande demais (${Math.round(tamanho / 1048576)} MB)` });
    return;
  }
  if (bin.bytes + tamanho > TETO.binarios) {
    pulados.push({ caminho: caminhoRel, motivo: "teto de binários do projeto atingido" });
    return;
  }
  try {
    if (!semCopiar) {
      const alvo = join(destinoBin, ...caminhoRel.split("/"));
      mkdirSync(dirname(alvo), { recursive: true });
      copyFileSync(origem, alvo);
    }
    bin.copiados += 1;
    bin.bytes += tamanho;
    bin.lista?.push(caminhoRel);
  } catch {
    pulados.push({ caminho: caminhoRel, motivo: "não consegui copiar o binário" });
  }
}

/** Percorre o workspace e devolve os arquivos de texto que cabem nos tetos. */
function colherArquivos(
  pasta: string,
  rel: string,
  saida: { nome: string; conteudo: string }[],
  pulados: { caminho: string; motivo: string }[],
  avisos: string[],
  contador: { bytes: number; lidos: number },
  /** Onde os BINÁRIOS serão copiados (disco). Sem isto, nenhum binário entra. */
  destinoBin?: string,
  bin?: { copiados: number; bytes: number; lista?: string[] },
  /** `true` quando o binário JÁ está no lugar (clone): conta sem copiar. */
  semCopiar?: boolean,
): void {
  let itens: string[];
  try {
    itens = readdirSync(pasta);
  } catch {
    return;
  }
  // ARQUIVOS ANTES DE PASTAS (dono, 16/10/2026). O teto de 2.000 arquivos é
  // GLOBAL e a varredura descia em profundidade: medido no flowise, a raiz
  // perdeu `pnpm-lock.yaml` e `pnpm-workspace.yaml` — e sem eles o projeto ficou
  // impossível de instalar, porque é por eles que se descobre o gerenciador.
  // Os arquivos da raiz são poucos e são justamente os que dizem COMO o projeto
  // se instala: entram primeiro, em todo nível.
  itens = arquivosPrimeiro(pasta, itens);
  for (const item of itens) {
    if (saida.length >= TETO.arquivos) {
      // O aviso tem de dizer a CONSEQUÊNCIA, não o mecanismo: quem lê "limite de
      // arquivos atingido" não conclui que o build vai falhar por falta de um
      // arquivo que ele nem sabe que existe.
      const aviso = `projeto INCOMPLETO: parou em ${TETO.arquivos} arquivos — o build pode falhar por arquivo que ficou de fora`;
      if (!avisos.includes(aviso)) avisos.push(aviso);
      return;
    }
    // O FREIO REAL (dono, 15/10/2026): `arquivos` × `porArquivo` é multiplicativo
    // e no pior caso dá 1 GB de texto guardado. Aqui o total guardado PARA no
    // teto — e o aviso conta o que aconteceu, para a pessoa saber que o projeto
    // veio parcial (e não achar que o repositório é que é pequeno).
    if (contador.bytes >= TETO.guardados) {
      const aviso = `limite de espaço guardado atingido (${Math.round(TETO.guardados / 1048576)} MB)`;
      if (!avisos.includes(aviso)) avisos.push(aviso);
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
      colherArquivos(completo, caminhoRel, saida, pulados, avisos, contador, destinoBin, bin, semCopiar);
      continue;
    }
    contador.lidos++;
    const ext = (item.split(".").pop() || "").toLowerCase();
    if (BINARIAS.has(ext)) {
      guardaBinario(completo, caminhoRel, st.size, destinoBin, bin, pulados, semCopiar);
      continue;
    }
    // LOCKFILE tem teto PRÓPRIO (dono, 16/10/2026): é texto, e é ele que diz ao
    // runner qual gerenciador usar e QUAIS versões. Medido no flowise: o
    // `pnpm-lock.yaml` (1,5 MB) ficava de fora pelo teto de 512 KB e a
    // instalação resolvia tudo de novo — versões podendo sair diferentes das que
    // o projeto testou.
    const eLock = /^(package-lock\.json|pnpm-lock\.ya?ml|yarn\.lock|npm-shrinkwrap\.json|bun\.lockb?)$/i.test(item);
    if (st.size > (eLock ? TETO.porArquivoLock : TETO.porArquivo)) {
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
      guardaBinario(completo, caminhoRel, st.size, destinoBin, bin, pulados, semCopiar);
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
      // Mesma regra da listagem: a dependência INSTALADA não é cota de ninguém.
      // Medido em 16/10/2026: instalar o `justy` criou 96.488 arquivos / 1,1 GB
      // em `node_modules` — contá-los fazia a conta estourar o plano por causa
      // de dependência, e a varredura ficava lenta a ponto de estourar o tempo
      // da tela.
      if (IGNORADAS.has(i)) continue;
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
 * TRAZ UM REPOSITÓRIO PELO TOKEN DA CONTA (dono, 15/10/2026).
 *
 * Pedido do dono, verbatim: *"Vamos pensaer de uma outra forma. Puxar direto do
 * Git hub do cliente que ja ta integrado. oq acha?"* — e é a forma certa.
 *
 * O `importarDoGit` acima faz `git clone` ANÔNIMO: só alcança repositório
 * PÚBLICO e baixa o repositório INTEIRO para só depois descobrir o que presta.
 * Foi por isso que `flowiseai/flowise` (64,4 MB) foi recusado: mediu-se o clone,
 * não o código.
 *
 * Aqui a leitura vai pela API, com o token que a conta JÁ conectou em Integrações:
 *
 *  - alcança repositório PRIVADO do cliente (o clone anônimo não alcança — e é o
 *    caso comum: o projeto dele);
 *  - lê a ÁRVORE primeiro e baixa SÓ os arquivos de texto que interessam — nada
 *    de trazer `node_modules`, imagem ou binário para descartar depois;
 *  - o freio deixa de ser "tamanho do clone" e passa a ser o que fica guardado.
 *
 * O token entra por PARÂMETRO: quem resolve o segredo é a camada de ferramentas
 * (`githubDaConta` + `decifrar`). Esta lib continua sem saber o que é credencial.
 */
export async function importarDoGitComToken(
  userId: number,
  projetoId: string,
  endereco: string,
  token: string,
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

  // A branch vem do PRÓPRIO repositório — chutar "main" falha em repo "master".
  const info = await repositorio(token, v.slug);
  if (!info.ok) return { ok: false, relatorio, erro: info.erro };

  // UMA requisição: o repositório inteiro num .tar.gz, pelo token da conta.
  //
  // MEDIDO: ler a árvore e pedir arquivo por arquivo passou de 290s no
  // `flowiseai/flowise` (centenas de idas e voltas à API) e estourou o tempo da
  // conversa. O tarball é a mesma informação em UMA requisição — e o token vale
  // nele, então repositório PRIVADO do cliente também vem por aqui.
  const pacote = await baixarTarball(token, info.fullName, info.branchPadrao);
  if (!pacote.ok) return { ok: false, relatorio, erro: pacote.erro };

  const base = pastaDoProjeto(userId, projetoId);
  // A extração vai para um diretório BRUTO, separado do workspace final: quem
  // decide o que entra é o `colherArquivos` (pula node_modules, binário, arquivo
  // grande). Se a extração virasse o workspace, os "pulados" ficariam na disco —
  // MEDIDO: 93 binários/mídia do flowise presentes, com o relatório dizendo
  // "pulados: 84". Relatório e disco têm de contar a MESMA história.
  const bruto = `${base}.bruto-${Date.now()}`;
  const arquivoTar = `${bruto}.tar.gz`;
  const arquivos: { nome: string; conteudo: string }[] = [];
  const contador = { bytes: 0, lidos: 0 };
  // Binários do repositório (imagens, fontes, ícones) — vão para o DISCO no
  // momento da gravação, junto com os textos. Sem eles o app não constrói.
  const bin: { copiados: number; bytes: number; lista: string[] } = { copiados: 0, bytes: 0, lista: [] };

  try {
    rmSync(bruto, { recursive: true, force: true });
    mkdirSync(bruto, { recursive: true });
    writeFileSync(arquivoTar, pacote.bytes);
    // `--strip-components=1` tira a pasta raiz que o GitHub põe no pacote
    // (`dono-repo-sha/`) — os arquivos ficam direto no workspace.
    await execFileAsync("tar", ["-xzf", arquivoTar, "-C", bruto, "--strip-components=1"], {
      timeout: TETO.segundos * 1000,
      maxBuffer: 4 * 1024 * 1024,
    });
    // A MESMA colheita do import por clone: ela pula `node_modules`, binário,
    // arquivo grande e respeita os tetos (inclusive o total guardado).
    colherArquivos(bruto, "", arquivos, relatorio.pulados, relatorio.avisos, contador, bruto, bin);
  } catch {
    rmSync(bruto, { recursive: true, force: true });
    return { ok: false, relatorio, erro: "não consegui preparar o workspace do projeto" };
  } finally {
    rmSync(arquivoTar, { force: true });
  }

  relatorio.lidos = contador.lidos;
  relatorio.binarios = { copiados: bin.copiados, bytes: bin.bytes };
  const guardados = contador.bytes;

  if (!arquivos.length) {
    return { ok: false, relatorio, erro: "não encontrei arquivos de texto nesse repositório" };
  }

  // O teto da CONTA, antes de gravar (mesma régua do import por clone).
  const limites = await limitesDoUsuario(userId);
  const tetoConta = limites.espacoBytes;
  const destino = pastaDoProjeto(userId, projetoId);
  if (tetoConta !== null) {
    const ocupadoFora = Math.max(0, tamanhoDoWorkspace(userId) - tamanhoDePasta(destino));
    if (ocupadoFora + guardados > tetoConta) {
      rmSync(bruto, { recursive: true, force: true });
      return {
        ok: false,
        relatorio,
        erro:
          `esta conta já usa ${espacoLegivel(ocupadoFora)} e este repositório traz mais ` +
          `${espacoLegivel(guardados)} — o limite do plano` +
          `${limites.plano ? ` ${limites.plano}` : ""} é ${espacoLegivel(tetoConta)}. ` +
          `Apague um projeto do Arquiteto para liberar espaço.`,
      };
    }
  }

  // Só AGORA os arquivos colhidos viram workspace: grava-se o que passou pela
  // colheita (o resto NÃO vai para a disco) e o bruto é descartado.
  const temporario = `${base}.importando-${Date.now()}`;
  try {
    mkdirSync(temporario, { recursive: true });
    for (const a of arquivos) {
      const alvo = join(temporario, ...a.nome.split("/"));
      mkdirSync(dirname(alvo), { recursive: true });
      writeFileSync(alvo, a.conteudo, "utf8");
    }
    // Os BINÁRIOS ainda estão no bruto — é agora que eles precisam ser copiados,
    // antes do bruto ser apagado. É o que faz o projeto CONSTRUIR.
    for (let i = 0; i < bin.copiados; i++) {
      const a = bin.lista[i];
      const alvo = join(temporario, ...a.split("/"));
      mkdirSync(dirname(alvo), { recursive: true });
      copyFileSync(join(bruto, ...a.split("/")), alvo);
    }
  } catch {
    rmSync(temporario, { recursive: true, force: true });
    rmSync(bruto, { recursive: true, force: true });
    return { ok: false, relatorio, erro: "não consegui preparar o workspace do projeto" };
  }
  rmSync(bruto, { recursive: true, force: true });

  // Troca atômica: o antigo só sai quando o novo está pronto (mesmo desenho do
  // import por clone — nada fica pela metade).
  const anterior = `${destino}.anterior-${Date.now()}`;
  try {
    const { renameSync } = await import("node:fs");
    if (existsSync(destino)) {
      rmSync(anterior, { recursive: true, force: true });
      renameSync(destino, anterior);
      renameSync(temporario, destino);
      rmSync(anterior, { recursive: true, force: true });
    } else {
      renameSync(temporario, destino);
    }
  } catch {
    rmSync(temporario, { recursive: true, force: true });
    return { ok: false, relatorio, erro: "não consegui preparar o workspace do projeto" };
  }

  relatorio.incluidos = arquivos.length;
  relatorio.bytes = guardados;
  // Devolve os arquivos TAMBÉM (dono, 16/10/2026). A rota da tela grava o
  // conteúdo no projeto (`salvarProjeto`) para o editor e o histórico o verem;
  // sem esta lista ela recebia `ok: true` SEM arquivos, caía no teste
  // `!r.arquivos` e respondia **422 "não consegui importar"** — com o import
  // tendo funcionado (2.000 arquivos no disco). Medido no flowise: relatório
  // dizia incluídos 2000 e a tela dizia que falhou.
  return { ok: true, relatorio, arquivos, workspace: relative(RAIZ_WORKSPACES, destino) };
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

  // O TETO DA CONTA (dono, 15/10/2026): o projeto cabe no limite dele — mas a
  // CONTA inteira também tem de caber. É o que impede um cliente de encher o
  // disco com projetos sem fim e afetar os outros. O que ESTE projeto já ocupa
  // não entra na conta duas vezes: ele vai ser substituído pelo que chegou.
  //
  // O NÚMERO vem do PLANO da conta (`storage_gb`); `null` = SEM TETO (não deu
  // para ler o plano — regra de continuidade, ver limites-da-conta.ts).
  const limites = await limitesDoUsuario(userId);
  const tetoConta = limites.espacoBytes;
  if (tetoConta !== null) {
    const ocupadoFora = Math.max(0, tamanhoDoWorkspace(userId) - tamanhoDePasta(destino));
    if (ocupadoFora + bytesClone > tetoConta) {
      rmSync(temporario, { recursive: true, force: true });
      return {
        ok: false,
        relatorio,
        erro:
          `esta conta já usa ${espacoLegivel(ocupadoFora)} e este repositório traz mais ` +
          `${espacoLegivel(bytesClone)} — o limite do plano` +
          `${limites.plano ? ` ${limites.plano}` : ""} é ${espacoLegivel(tetoConta)}. ` +
          `Apague um projeto do Arquiteto para liberar espaço.`,
      };
    }
  }

  // Colhe os arquivos de texto, respeitando os tetos.
  const arquivos: { nome: string; conteudo: string }[] = [];
  const contador = { bytes: 0, lidos: 0 };
  // No clone o repositório INTEIRO já está em `temporario` (e ele vira o
  // workspace): os binários já estão no lugar. Aqui só se CONTA o que ficou —
  // antes eles apareciam como "pulados" e estavam no disco, e relatório e disco
  // contavam histórias diferentes.
  const binClone = { copiados: 0, bytes: 0, lista: [] as string[] };
  colherArquivos(temporario, "", arquivos, relatorio.pulados, relatorio.avisos, contador,
                 temporario, binClone, true);
  relatorio.binarios = { copiados: binClone.copiados, bytes: binClone.bytes };

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
      // `node_modules` e irmãos ficam FORA da conta: depois que o runner
      // instala de verdade (16/10/2026), a pasta de dependências mora dentro do
      // projeto — e contá-la faria a cota do plano estourar por causa de
      // dependência, não de código.
      if (IGNORADAS.has(i)) continue;
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
export async function importarDoServidor(
  userId: number,
  projetoId: string,
  arquivos: { nome: string; conteudo: string }[],
  origem: string,
): Promise<ResultadoImportacao> {
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

  // O TETO DA CONTA (dono, 15/10/2026): o que já existe FORA deste projeto é o
  // que sobra de orçamento para ele. A importação do servidor não limpa a pasta
  // antes de escrever, então o orçamento conta só os bytes NOVOS — se um arquivo
  // for sobrescrito, o cálculo fica conservador (conta duas vezes), nunca frouxo.
  //
  // O NÚMERO vem do PLANO (`storage_gb`); `null` = SEM TETO (não deu para ler o
  // plano) e aí só o teto por projeto continua valendo.
  const limites = await limitesDoUsuario(userId);
  const tetoConta = limites.espacoBytes;
  const ocupadoFora = Math.max(0, tamanhoDoWorkspace(userId) - tamanhoDePasta(pasta));
  const orcamento = tetoConta === null ? Number.MAX_SAFE_INTEGER : Math.max(0, tetoConta - ocupadoFora);
  const tetoDesteImport = Math.min(TETO.bytes, orcamento);

  const dentro: { nome: string; conteudo: string }[] = [];
  for (const a of arquivos) {
    if (dentro.length >= TETO.arquivos) {
      // O aviso diz a CONSEQUÊNCIA, não o mecanismo: quem lê "limite de arquivos
      // atingido" não conclui que o build vai falhar por falta de um arquivo que
      // ele nem sabe que existe.
      const aviso = `projeto INCOMPLETO: parou em ${TETO.arquivos} arquivos — o build pode falhar por arquivo que ficou de fora`;
      if (!relatorio.avisos.includes(aviso)) relatorio.avisos.push(aviso);
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
    if (relatorio.bytes + bytes > tetoDesteImport) {
      relatorio.pulados.push({
        caminho: a.nome,
        motivo:
          orcamento < TETO.bytes
            ? `teto do plano atingido${tetoConta !== null ? ` (${espacoLegivel(tetoConta)})` : ""}`
            : "teto total do projeto atingido",
      });
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
export async function escreverArquivoDoWorkspace(
  userId: number,
  projetoId: string,
  relativo: string,
  conteudo: string,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const pasta = pastaDoProjeto(userId, projetoId);
  if (!existsSync(pasta)) return { ok: false, erro: "este projeto não tem workspace" };
  const alvo = caminhoSeguro(pasta, relativo);
  if (!alvo) return { ok: false, erro: "caminho fora do projeto" };
  if (Buffer.byteLength(conteudo, "utf8") > TETO.porArquivo) {
    return { ok: false, erro: "conteúdo grande demais para um arquivo" };
  }
  // O teto da CONTA vale aqui também: sem esta checagem, gravar arquivo atrás de
  // arquivo seria um caminho para crescer sem limite, driblando o teto do import.
  // Conservador de propósito — conta o arquivo novo inteiro mesmo quando ele
  // sobrescreve um que já existia; errar para o lado de barrar é o certo.
  //
  // O NÚMERO vem do PLANO (`storage_gb`); `null` = SEM TETO (não deu para ler).
  const limites = await limitesDoUsuario(userId);
  const tetoConta = limites.espacoBytes;
  const bytesNovos = Buffer.byteLength(conteudo, "utf8");
  if (tetoConta !== null && tamanhoDoWorkspace(userId) + bytesNovos > tetoConta) {
    return {
      ok: false,
      erro: `esta conta chegou ao limite de ${espacoLegivel(tetoConta)} no Arquiteto — apague um projeto para liberar espaço`,
    };
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
      // O que a tela mostra é o CÓDIGO do projeto, não a dependência instalada:
      // `node_modules` pode ter 100 mil arquivos e não é o que a pessoa quer ver
      // (nem editar) — e a instalação real passou a criá-lo aqui (16/10/2026).
      if (IGNORADAS.has(i)) continue;
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
