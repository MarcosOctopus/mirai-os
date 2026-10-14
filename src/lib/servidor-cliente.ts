/**
 * SERVIDOR DO CLIENTE — entrar no servidor DELE e trabalhar lá dentro.
 *
 * Regra do dono (09/out/2026, textual): *"não trazer o projeto para o nosso
 * servidor — a gente entra no servidor DELE e trabalha lá dentro."*
 *
 * Este arquivo é a FUNDAÇÃO disso, e só isso por enquanto:
 *   - guardar a credencial SSH da pessoa DE FORMA CIFRADA (a cifra é feita
 *     fora daqui — aqui só se usa a chave já em claro, na hora, e some);
 *   - PROVAR que conecta (roda `true` no servidor dele);
 *   - LISTAR arquivos (`ls`), leitura só.
 *
 * NÃO HÁ ESCRITA AQUI. Criar, editar, subir e rodar arquivo no servidor do
 * cliente vem DEPOIS, com decisão explícita do dono — uma tarefa por vez, e
 * esta para na leitura. Enquanto a decisão não vier, nada neste app escreve,
 * move ou apaga um byte no servidor do cliente.
 *
 * COMO: usa o binário `ssh` que já existe, por `execFile` com ARRAY de
 * argumentos (NUNCA `shell`). Não há interpretador de shell no meio, então nada
 * do que vem do formulário pode virar comando. Além disso o alvo (host,
 * usuário, porta) é VALIDADO por regex estrita ANTES de qualquer uso — a chave
 * só é escrita em disco depois que o alvo passou.
 *
 * A CHAVE PRIVADA NUNCA aparece em resposta, log, mensagem de erro nem
 * relatório: ela chega do formulário, é escrita num arquivo temporário 600 só
 * para o `ssh` ler, e é apagada no fim. Nada aqui loga a chave nem o comando
 * completo com a chave.
 */
import { execFile } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { randomBytes } from "crypto";

/** Onde a chave temporária vive — o mesmo scratch do app, isolada por conta. */
const DIR_PREFERIDO = "/opt/data/cache/scratch/servidor-cliente";

/** `ConnectTimeout` do ssh (segundos) e o teto do processo (folga por cima). */
const CONNECT_TIMEOUT = "15";
const TIMEOUT_MS = 20000;

/** Limites de sanidade — recusam entrada absurda antes de qualquer uso. */
const MAX_HOST = 253;
const MAX_USUARIO = 64;
const MAX_CAMINHO = 4096;

/** Tipo e rótulo fixos da integração que guarda o servidor da pessoa. */
export const TIPO_SERVIDOR = "servidor";
export const ROTULO_SERVIDOR = "servidor do cliente";

export type AlvoDoServidor = { host: string; porta: number; usuario: string };

// ─── Validação do alvo (a defesa contra injeção) ──────────────────────────
//
// host: SÓ hostname ou IP. Nada de espaço, `@`, `:`, `;`, `|`, `$`, crase,
// aspas ou quebra de linha — nada que um shell (o local ou o remoto) pudesse
// reinterpretar. usuário: SÓ [a-zA-Z0-9._-]. Qualquer outra coisa é recusada
// aqui, antes de virar argumento do `ssh`.

function ehIPv4(h: string): boolean {
  const partes = h.split(".");
  if (partes.length !== 4) return false;
  return partes.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

function ehIPv6(h: string): boolean {
  if (!h.includes(":")) return false;
  // Só hex e `:` — o suficiente para um literal IPv6, e nada mais.
  return /^[0-9a-fA-F:]{2,45}$/.test(h);
}

const RE_HOSTNAME =
  /^(?=.{1,253}$)([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
const RE_USUARIO = /^[a-zA-Z0-9._-]{1,64}$/;

export type ResultadoAlvo =
  | { ok: true; host: string; usuario: string }
  | { ok: false; erro: string };

/** Valida host e usuário. NUNCA lança — devolve {ok:false, erro} no ruim. */
export function validarAlvo(host: unknown, usuario: unknown): ResultadoAlvo {
  const h = typeof host === "string" ? host.trim() : "";
  const u = typeof usuario === "string" ? usuario.trim() : "";

  if (!h) return { ok: false, erro: "informe o endereço do servidor (host ou IP)" };
  if (h.length > MAX_HOST) return { ok: false, erro: "endereço do servidor longo demais" };
  const hostOk = ehIPv4(h) || ehIPv6(h) || RE_HOSTNAME.test(h);
  if (!hostOk) {
    return {
      ok: false,
      erro: "endereço do servidor inválido — use um hostname (ex.: meusite.com.br) ou um IP",
    };
  }

  if (!u) return { ok: false, erro: "informe o usuário do SSH" };
  if (u.length > MAX_USUARIO || !RE_USUARIO.test(u)) {
    return { ok: false, erro: "usuário inválido — use apenas letras, números, ponto, hífen e sublinhado" };
  }

  return { ok: true, host: h, usuario: u };
}

/**
 * Porta: default 22 quando ausente; número inteiro 1–65535 quando informada.
 * Devolve null quando a porta informada é inválida (nunca cai no 22 por erro).
 */
export function normalizarPorta(valor: unknown): number | null {
  if (valor === undefined || valor === null || valor === "") return 22;
  const n = typeof valor === "number" ? valor : Number(String(valor).trim());
  if (!Number.isInteger(n) || n < 1 || n > 65535) return null;
  return n;
}

/** Caminho remoto: absoluto, sem caractere de controle. Só leitura por aqui. */
function validarCaminho(caminho: unknown): { ok: true; caminho: string } | { ok: false; erro: string } {
  const c = typeof caminho === "string" ? caminho.trim() : "";
  if (!c) return { ok: false, erro: "informe o caminho" };
  if (!c.startsWith("/")) return { ok: false, erro: "o caminho deve ser absoluto (começar com /)" };
  if (c.length > MAX_CAMINHO) return { ok: false, erro: "caminho longo demais" };
  // \u0000-\u001f e \u007f: nada de quebra de linha, tab ou null no caminho.
  if (/[\u0000-\u001f\u007f]/.test(c)) return { ok: false, erro: "o caminho contém caracteres inválidos" };
  return { ok: true, caminho: c };
}

/** Aspas simples para o shell do servidor REMOTO (o clássico `'\''`). */
function aspasSimples(texto: string): string {
  return `'${texto.replaceAll("'", "'\\''")}'`;
}

// ─── Chave temporária (600, criada só para o ssh ler) ─────────────────────

type ChavePreparada = { caminho: string; knownHosts: string; limpar: () => Promise<void> };

async function prepararChave(chave: string): Promise<ChavePreparada | null> {
  // O ssh exige que a chave termine em nova linha.
  const conteudo = chave.endsWith("\n") ? chave : `${chave}\n`;

  let dir = DIR_PREFERIDO;
  try {
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  } catch {
    // App pode rodar sem permissão no scratch fixo: cai no tmp do app.
    dir = path.join(os.tmpdir(), "servidor-cliente");
    try {
      await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    } catch {
      return null;
    }
  }

  const caminho = path.join(dir, `key-${randomBytes(9).toString("hex")}.pem`);
  try {
    await fs.writeFile(caminho, conteudo, { mode: 0o600 });
    // Não confia na umask: garante 600 explicitamente.
    await fs.chmod(caminho, 0o600);
  } catch {
    return null;
  }

  // known_hosts próprio da nossa pasta: a verificação de identidade continua
  // ligada (accept-new), só não depende de ~/.ssh existir e ser gravável.
  const knownHosts = path.join(dir, "known_hosts");

  return {
    caminho,
    knownHosts,
    limpar: async () => {
      try {
        await fs.unlink(caminho);
      } catch {
        /* já não existe — nada a fazer */
      }
    },
  };
}

// ─── Execução do ssh (execFile, array de argumentos, SEM shell) ───────────

type ResultadoBruto = {
  codigo: number | null;
  erro: string | null; // 'ETIMEDOUT' e afins, quando não houve código
  stdout: string;
  stderr: string;
};

function executarSsh(opts: {
  keyPath: string;
  knownHosts: string;
  host: string;
  porta: number;
  usuario: string;
  comando: string;
  /**
   * Conteúdo a enviar pela ENTRADA PADRÃO do ssh (usado na escrita).
   *
   * Por que por aqui e não no comando: o conteúdo de um arquivo é do usuário e
   * pode conter QUALQUER coisa — aspas, `$(...)`, crase, quebra de linha. Se ele
   * fosse para a linha de comando, teria de ser escapado, e escapar texto
   * arbitrário é exatamente onde nasce injeção. Pela entrada padrão ele nunca é
   * interpretado: o shell remoto só vê `cat > '<caminho>'`, e o texto é dado, não
   * comando.
   */
  entrada?: string;
}): Promise<ResultadoBruto> {
  const args = [
    "-i", opts.keyPath,
    "-p", String(opts.porta),
    "-o", "IdentitiesOnly=yes",
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", `UserKnownHostsFile=${opts.knownHosts}`,
    "-o", `ConnectTimeout=${CONNECT_TIMEOUT}`,
    "-o", "BatchMode=yes",
    "-o", "PreferredAuthentications=publickey",
    "-o", "LogLevel=ERROR",
    `${opts.usuario}@${opts.host}`,
    opts.comando,
  ];

  return new Promise((resolve) => {
    const filho = execFile(
      "ssh",
      args,
      { timeout: TIMEOUT_MS, maxBuffer: 1_048_576, encoding: "utf8" },
      (erro, stdout, stderr) => {
        // Nada do que sai daqui pode carregar o caminho da chave — troca por um
        // marcador neutro antes de virar qualquer coisa.
        const limpa = (t: string) => (t || "").replaceAll(opts.keyPath, "[chave]");
        let codigo: number | null = 0;
        let e: string | null = null;
        if (erro) {
          const ex = erro as Error & { code?: number | string; killed?: boolean };
          if (typeof ex.code === "number") codigo = ex.code;
          else {
            codigo = null;
            e = typeof ex.code === "string" ? ex.code : "erro";
          }
          if (ex.killed) e = "ETIMEDOUT";
        }
        resolve({ codigo, erro: e, stdout: limpa(stdout), stderr: limpa(stderr) });
      },
    );

    if (typeof opts.entrada === "string") {
      // Se o ssh já morreu (host inalcançável), escrever no stdin emite EPIPE —
      // que aqui é ruído, não falha: quem decide o resultado é o callback acima.
      filho.stdin?.on("error", () => {});
      try {
        filho.stdin?.end(opts.entrada, "utf8");
      } catch {
        /* o callback acima já vai reportar o motivo real */
      }
    }
  });
}

/** Traduz a falha do ssh numa frase honesta, em PT-BR. Nunca vaza segredo. */
function traduzirFalha(r: ResultadoBruto, usuario: string, host: string): string {
  if (r.erro === "ETIMEDOUT") return "tempo esgotado ao falar com o servidor";
  if (r.erro === "ENOENT") return "o `ssh` não está disponível neste servidor";

  const s = (r.stderr || "").toLowerCase();
  if (/permission denied|publickey|authentication failed|too many authentication/.test(s)) {
    return `${usuario}@${host}: o servidor respondeu, mas recusou a chave (autenticação por chave pública falhou)`;
  }
  if (/host key verification failed/.test(s)) {
    return "não consegui confirmar a identidade do servidor (a chave do host mudou ou não confere)";
  }
  if (/connection timed out|timed out|operation timed out/.test(s)) {
    return "tempo esgotado ao alcançar o servidor";
  }
  if (/connection refused/.test(s)) {
    return "o servidor respondeu, mas recusou a conexão na porta indicada";
  }
  if (/no route to host|network is unreachable/.test(s)) {
    return "não alcançou o servidor (sem rota até ele)";
  }
  if (/could not resolve hostname|name or service not known|nodename nor servname/.test(s)) {
    return "não encontrei esse endereço (nome do servidor não resolve)";
  }
  return "não foi possível conectar ao servidor";
}

// ─── API pública (todas devolvem {ok, ...} e NUNCA lançam) ────────────────

/**
 * Prova que a chave conecta: roda `true` no servidor do cliente.
 * Só serve para o POST gravar — nunca se diz "conectado" sem isto responder.
 */
export async function testarConexao(opts: {
  host: unknown;
  porta?: unknown;
  usuario: unknown;
  chave: unknown;
}): Promise<{ ok: boolean; mensagem: string }> {
  const alvo = validarAlvo(opts.host, opts.usuario);
  if (!alvo.ok) return { ok: false, mensagem: alvo.erro };

  const porta = normalizarPorta(opts.porta);
  if (porta === null) return { ok: false, mensagem: "porta inválida (use um número de 1 a 65535)" };

  const chave = typeof opts.chave === "string" ? opts.chave : "";
  if (!chave.trim()) return { ok: false, mensagem: "a chave privada SSH está vazia" };

  const prep = await prepararChave(chave);
  if (!prep) {
    return { ok: false, mensagem: "não consegui preparar a chave no servidor (arquivo temporário indisponível)" };
  }
  try {
    const r = await executarSsh({
      keyPath: prep.caminho,
      knownHosts: prep.knownHosts,
      host: alvo.host,
      porta,
      usuario: alvo.usuario,
      comando: "true",
    });
    if (r.codigo === 0 && !r.erro) {
      return { ok: true, mensagem: `conectado: autenticou como ${alvo.usuario}@${alvo.host}` };
    }
    return { ok: false, mensagem: traduzirFalha(r, alvo.usuario, alvo.host) };
  } finally {
    await prep.limpar();
  }
}

/**
 * Lista um diretório do servidor do cliente — LEITURA SÓ.
 * O comando remoto é `ls -1ap -- '<caminho>'`: as aspas simples e o `--` separam
 * o caminho de qualquer opção, e o conteúdo lido é tratado como TEXTO, nunca
 * como comando.
 */
export async function listar(opts: {
  host: unknown;
  porta?: unknown;
  usuario: unknown;
  chave: unknown;
  caminho: unknown;
}): Promise<{ ok: boolean; itens: string[]; erro?: string }> {
  const alvo = validarAlvo(opts.host, opts.usuario);
  if (!alvo.ok) return { ok: false, itens: [], erro: alvo.erro };

  const porta = normalizarPorta(opts.porta);
  if (porta === null) return { ok: false, itens: [], erro: "porta inválida (use um número de 1 a 65535)" };

  const camp = validarCaminho(opts.caminho);
  if (!camp.ok) return { ok: false, itens: [], erro: camp.erro };

  const chave = typeof opts.chave === "string" ? opts.chave : "";
  if (!chave.trim()) return { ok: false, itens: [], erro: "a credencial do servidor está vazia" };

  const prep = await prepararChave(chave);
  if (!prep) {
    return { ok: false, itens: [], erro: "não consegui preparar a chave no servidor (arquivo temporário indisponível)" };
  }
  try {
    const comando = `ls -1ap -- ${aspasSimples(camp.caminho)}`;
    const r = await executarSsh({
      keyPath: prep.caminho,
      knownHosts: prep.knownHosts,
      host: alvo.host,
      porta,
      usuario: alvo.usuario,
      comando,
    });
    if (r.erro === "ETIMEDOUT") return { ok: false, itens: [], erro: "tempo esgotado ao listar o diretório" };
    if (r.codigo !== 0) {
      const s = (r.stderr || "").toLowerCase();
      if (/no such file or directory/.test(s)) return { ok: false, itens: [], erro: "esse caminho não existe no servidor" };
      if (/not a directory/.test(s)) return { ok: false, itens: [], erro: "esse caminho não é uma pasta" };
      if (/permission denied/.test(s)) return { ok: false, itens: [], erro: "sem permissão para listar essa pasta" };
      return { ok: false, itens: [], erro: "não consegui listar a pasta no servidor" };
    }
    // Cada linha é um nome. `.` e `..` são descartados; nada mais é mexido.
    const itens = (r.stdout || "")
      .split("\n")
      .map((linha) => linha.trim())
      .filter((nome) => nome && nome !== "." && nome !== "..");
    return { ok: true, itens };
  } finally {
    await prep.limpar();
  }
}

// ─── LER E GRAVAR ARQUIVO (a escrita que o dono autorizou em 14/10/2026) ───
//
// A fundação deste arquivo parou na LEITURA de propósito: *"Criar, editar, subir
// e rodar arquivo no servidor do cliente vem DEPOIS, com decisão explícita do
// dono"*. A decisão veio:
//
//   "Eu quero que consiga editar coisas em outros servidores" — 14/10/2026.
//
// Então a escrita entra — com as travas que a decisão NÃO dispensa:
//   1. o CONTEÚDO vai pela entrada padrão do ssh, nunca na linha de comando
//      (texto do usuário jamais é interpretado pelo shell remoto);
//   2. o CAMINHO passa por `validarCaminho` e é citado com aspas simples;
//   3. antes de sobrescrever, o arquivo que já existe é COPIADO no próprio
//      servidor (`<nome>.bak-mirai-<carimbo>`) — a regra do dono vale lá também:
//      primeiro o backup, depois a mudança;
//   4. teto de tamanho na entrada e na saída;
//   5. binário não entra no editor: se tem byte nulo, recusa.

/** Teto do que se lê de um arquivo para editar (o que passa disso não é texto de editor). */
export const LIMITE_LEITURA = 512 * 1024;
/** Teto do que se grava de uma vez. */
export const LIMITE_ESCRITA = 512 * 1024;

/**
 * Lê o conteúdo de UM arquivo do servidor do cliente.
 * Comando remoto: `head -c <N+1> -- '<caminho>'` — lê no máximo N+1 bytes, e o
 * byte extra é o que denuncia "é maior que o teto" sem trazer o arquivo inteiro.
 */
export async function lerArquivo(opts: {
  host: unknown;
  porta?: unknown;
  usuario: unknown;
  chave: unknown;
  caminho: unknown;
}): Promise<{ ok: boolean; conteudo?: string; bytes?: number; erro?: string }> {
  const alvo = validarAlvo(opts.host, opts.usuario);
  if (!alvo.ok) return { ok: false, erro: alvo.erro };

  const porta = normalizarPorta(opts.porta);
  if (porta === null) return { ok: false, erro: "porta inválida (use um número de 1 a 65535)" };

  const camp = validarCaminho(opts.caminho);
  if (!camp.ok) return { ok: false, erro: camp.erro };

  const chave = typeof opts.chave === "string" ? opts.chave : "";
  if (!chave.trim()) return { ok: false, erro: "a credencial do servidor está vazia" };

  const prep = await prepararChave(chave);
  if (!prep) return { ok: false, erro: "não consegui preparar a chave no servidor (arquivo temporário indisponível)" };
  try {
    const r = await executarSsh({
      keyPath: prep.caminho,
      knownHosts: prep.knownHosts,
      host: alvo.host,
      porta,
      usuario: alvo.usuario,
      comando: `head -c ${LIMITE_LEITURA + 1} -- ${aspasSimples(camp.caminho)}`,
    });
    if (r.erro === "ETIMEDOUT") return { ok: false, erro: "tempo esgotado ao ler o arquivo" };
    if (r.codigo !== 0) {
      const s = (r.stderr || "").toLowerCase();
      if (/no such file or directory/.test(s)) return { ok: false, erro: "esse arquivo não existe no servidor" };
      if (/is a directory/.test(s)) return { ok: false, erro: "esse caminho é uma pasta, não um arquivo" };
      if (/permission denied/.test(s)) return { ok: false, erro: "sem permissão para ler esse arquivo" };
      return { ok: false, erro: "não consegui ler o arquivo no servidor" };
    }
    const conteudo = r.stdout || "";
    if (conteudo.length > LIMITE_LEITURA) {
      return { ok: false, erro: `esse arquivo passa de ${Math.round(LIMITE_LEITURA / 1024)} KB — não abro no editor` };
    }
    if (conteudo.includes("\u0000")) {
      return { ok: false, erro: "esse arquivo é binário — não abro no editor" };
    }
    return { ok: true, conteudo, bytes: Buffer.byteLength(conteudo, "utf8") };
  } finally {
    await prep.limpar();
  }
}

/**
 * Grava (cria ou substitui) um arquivo no servidor do cliente.
 *
 * O conteúdo vai por STDIN. O comando remoto é só:
 *   `if [ -e '<alvo>' ]; then cp -p -- '<alvo>' '<alvo>.bak-mirai-<carimbo>' || exit 3; fi; cat > '<alvo>'`
 *
 * O `cp` ANTES do `cat` é o backup da regra do dono, feito no próprio servidor:
 * se a gravação falhar no meio, o arquivo anterior ainda está lá.
 */
export async function gravarArquivo(opts: {
  host: unknown;
  porta?: unknown;
  usuario: unknown;
  chave: unknown;
  caminho: unknown;
  conteudo: unknown;
}): Promise<{ ok: boolean; bytes?: number; backup?: string | null; erro?: string }> {
  const alvo = validarAlvo(opts.host, opts.usuario);
  if (!alvo.ok) return { ok: false, erro: alvo.erro };

  const porta = normalizarPorta(opts.porta);
  if (porta === null) return { ok: false, erro: "porta inválida (use um número de 1 a 65535)" };

  const camp = validarCaminho(opts.caminho);
  if (!camp.ok) return { ok: false, erro: camp.erro };

  const conteudo = typeof opts.conteudo === "string" ? opts.conteudo : "";
  const bytes = Buffer.byteLength(conteudo, "utf8");
  if (bytes > LIMITE_ESCRITA) {
    return { ok: false, erro: `o conteúdo passa de ${Math.round(LIMITE_ESCRITA / 1024)} KB — não gravo de uma vez` };
  }
  if (conteudo.includes("\u0000")) return { ok: false, erro: "o conteúdo tem byte nulo — isto é um editor de texto" };

  const chave = typeof opts.chave === "string" ? opts.chave : "";
  if (!chave.trim()) return { ok: false, erro: "a credencial do servidor está vazia" };

  const prep = await prepararChave(chave);
  if (!prep) return { ok: false, erro: "não consegui preparar a chave no servidor (arquivo temporário indisponível)" };

  // Carimbo só de dígitos e hífen: nada que o shell remoto possa reinterpretar.
  const carimbo = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  const alvoCitado = aspasSimples(camp.caminho);
  const backup = `${camp.caminho}.bak-mirai-${carimbo}`;
  const comando =
    `if [ -e ${alvoCitado} ]; then cp -p -- ${alvoCitado} ${aspasSimples(backup)} || exit 3; fi; cat > ${alvoCitado}`;

  try {
    const r = await executarSsh({
      keyPath: prep.caminho,
      knownHosts: prep.knownHosts,
      host: alvo.host,
      porta,
      usuario: alvo.usuario,
      comando,
      entrada: conteudo,
    });
    if (r.erro === "ETIMEDOUT") return { ok: false, erro: "tempo esgotado ao gravar o arquivo" };
    if (r.codigo === 3) {
      return { ok: false, erro: "não consegui fazer o backup do arquivo atual no servidor — não sobrescrevi nada" };
    }
    if (r.codigo !== 0) {
      const s = (r.stderr || "").toLowerCase();
      if (/no such file or directory/.test(s)) return { ok: false, erro: "a pasta desse arquivo não existe no servidor" };
      if (/permission denied/.test(s)) return { ok: false, erro: "sem permissão para gravar nesse caminho" };
      if (/read-only file system/.test(s)) return { ok: false, erro: "o sistema de arquivos do servidor está somente leitura" };
      if (/no space left/.test(s)) return { ok: false, erro: "o servidor está sem espaço em disco" };
      return { ok: false, erro: "não consegui gravar o arquivo no servidor" };
    }
    return { ok: true, bytes, backup };
  } finally {
    await prep.limpar();
  }
}

// ─── Trazer um projeto DO SERVIDOR DELE (dono, 14/10/2026) ──────────────────
//
//   "Quero que o cara traga o projeto que ele quiser do git ou do seu proprio
//    servidor. Igual conseguimos fazer por aqui. Claro isolando ele pra n afetar
//    outras estruturas"
//
// A leitura recursiva serve para o Arquiteto LISTAR o que existe na pasta do
// projeto no servidor dele e trazer uma CÓPIA para o workspace isolado. Nada é
// movido, nada é alterado no servidor dele — é leitura.

/** Teto de arquivos que uma importação do servidor traz de uma vez. */
export const MAX_ARQUIVOS_IMPORT = 150;

/**
 * Lista os arquivos de uma pasta no servidor dele, recursivamente e com tetos.
 *
 * Comando remoto: um `find` recursivo com teto de tamanho e de quantidade, que
 * descarta os diretórios de peso (.git, node_modules, vendor, dist, build).
 * Tudo o que é listado passa pelos mesmos filtros do import de git: sem `.git`,
 * sem `node_modules`, sem `vendor`, sem arquivo acima do teto. O `head` corta a
 * listagem — o servidor dele nunca é varrido inteiro.
 */
export async function listarRecursivo(opts: {
  host: unknown;
  porta?: unknown;
  usuario: unknown;
  chave: unknown;
  caminho: unknown;
}): Promise<{ ok: boolean; arquivos: string[]; erro?: string }> {
  const alvo = validarAlvo(opts.host, opts.usuario);
  if (!alvo.ok) return { ok: false, arquivos: [], erro: alvo.erro };

  const porta = normalizarPorta(opts.porta);
  if (porta === null) return { ok: false, arquivos: [], erro: "porta inválida (use um número de 1 a 65535)" };

  const camp = validarCaminho(opts.caminho);
  if (!camp.ok) return { ok: false, arquivos: [], erro: camp.erro };

  const chave = typeof opts.chave === "string" ? opts.chave : "";
  if (!chave.trim()) return { ok: false, arquivos: [], erro: "a credencial do servidor está vazia" };

  const prep = await prepararChave(chave);
  if (!prep) return { ok: false, arquivos: [], erro: "não consegui preparar a chave no servidor (arquivo temporário indisponível)" };

  const d = aspasSimples(camp.caminho);
  // `-size -<N>c` corta arquivo acima do teto ANTES de ele ser lido.
  const comando =
    `find ${d} -type f -size -${LIMITE_LEITURA}c ` +
    `-not -path '*/.git/*' -not -path '*/node_modules/*' -not -path '*/vendor/*' ` +
    `-not -path '*/.next/*' -not -path '*/dist/*' -not -path '*/build/*' ` +
    `2>/dev/null | head -n ${MAX_ARQUIVOS_IMPORT}`;

  try {
    const r = await executarSsh({
      keyPath: prep.caminho,
      knownHosts: prep.knownHosts,
      host: alvo.host,
      porta,
      usuario: alvo.usuario,
      comando,
    });
    if (r.erro === "ETIMEDOUT") return { ok: false, arquivos: [], erro: "tempo esgotado ao listar a pasta" };
    if (r.codigo !== 0) {
      const s = (r.stderr || "").toLowerCase();
      if (/no such file or directory/.test(s)) return { ok: false, arquivos: [], erro: "essa pasta não existe no servidor" };
      if (/permission denied/.test(s)) return { ok: false, arquivos: [], erro: "sem permissão para ler essa pasta" };
      return { ok: false, arquivos: [], erro: "não consegui listar a pasta no servidor" };
    }
    // O `find` devolve caminhos ABSOLUTOS; guarda como veio, para ler depois.
    const arquivos = (r.stdout || "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, MAX_ARQUIVOS_IMPORT);
    return { ok: true, arquivos };
  } finally {
    await prep.limpar();
  }
}

// ─── Leitura do alvo guardado ─────────────────────────────────────────────

/** Lê `{host, porta, usuario}` do config JSON da integração (nunca a chave). */
export function lerAlvo(config: string | null | undefined): AlvoDoServidor | null {
  if (!config) return null;
  try {
    const v = JSON.parse(config) as { host?: unknown; porta?: unknown; usuario?: unknown };
    const alvo = validarAlvo(v.host, v.usuario);
    if (!alvo.ok) return null;
    const porta = normalizarPorta(v.porta);
    if (porta === null) return null;
    return { host: alvo.host, porta, usuario: alvo.usuario };
  } catch {
    return null;
  }
}
