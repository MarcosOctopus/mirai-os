import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { exigirConta } from "@/lib/orgs";
import { basePublica } from "@/lib/base-publica";

/** Concessão de pasta vinda da Arca (compartilhamento estilo Drive). */
type ConcessaoArca = {
  id: string;
  org: string;
  alvo: string;
  convidado: string;
  ver: boolean;
  editar: boolean;
  excluir: boolean;
  criada_em?: string;
  por?: string;
};

const execFileP = promisify(execFile);

/**
 * ROTA DO ACERVO — a Arca de QUEM ESTÁ LOGADO.
 *
 * VIRADA DE CHAVE (item 2 do plano `Projeto/mirai-publico-plano-acesso-e-acervo`):
 *   Antes: org fixa (`core`) + só-dono. O acervo existia para uma pessoa só.
 *   Agora: a org vem da SESSÃO. Cada pessoa lê o acervo dela; o dono continua
 *          entrando em qualquer um (admin) e isso fica REGISTRADO.
 *
 * O QUE ESTA ROTA É: a PORTA do app para a CAMADA DE OPERAÇÕES da Arca
 * (`/acervo/*` em http://127.0.0.1:8080). Ela não decide catalogação: pede o
 * token da org e repassa. Ordem, nome e cor de pasta/tag vivem na camada — a
 * tela e o MCP caem na mesma árvore.
 *
 * O QUE ELA **NÃO** É:
 *  - NÃO aceita comando do cliente: a ação vem de lista fechada e o argv é nosso,
 *    com `execFile` (sem shell). `?acao=shell` não existe.
 *  - NÃO calcula o slug do usuário aqui. Quem sabe o slug é a Arca: pedimos
 *    `espaco criar <email>` (idempotente, rápido, sem palácio) e usamos o `org`
 *    que ELA devolve — duas implementações de slug divergiriam com o tempo.
 */

const CLI = "/opt/data/arca/integrity/cli.py";
const CLI_CWD = "/opt/data/arca/integrity";
const ORG_CORE = "core";
const TETO_PARAM = 200;
const LOG_CROSS = "/opt/data/arca/logs/acervo-cross-read.log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACOES = ["stats", "grafo", "listar", "buscar", "query", "backlinks", "links", "nota", "recentes", "arvore", "youniverse",
  "acesso", "recebidos", "pedidos", "avisos"] as const;
/** Escrita: as três primeiras são da camada; as duas últimas nasceram antes dela. */
const ACOES_ESCRITA = ["criar-pasta", "criar-nota", "mover-nota", "editar-pasta", "editar-tag",
  "apagar-pasta", "podar-pastas",
  // compartilhamento (F3, 11/11/2026): a verdade é da Arca, o app só veste
  "compartilhar", "descompartilhar", "link-convidado", "atender-pedido", "visto", "visto-tudo"] as const;
const SLUG_OK = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

/**
 * Arquivo que a Arca NÃO serve: parece credencial (mesma regra do vaultops, que
 * já exclui esses nomes do HISTÓRICO). Medido 10/11/2026: o vault do dono tem
 * `secrets/acervo-migrado/CLOUDFLARE_TOKEN.md (movido do acervo em 11/11/2026)` com o token em texto puro — a bancada de
 * leitura não pode ser a porta por onde ele vaza.
 */
const SEGREDO = [
  "*token*", "*credential*", "*secret*", "*senha*", "*password*",
  "*apikey*", "*_key*", "*.env", ".env*", "*privkey*", "*.pem",
];
function ehSegredo(rel: string): boolean {
  const nome = path.basename(rel).toLowerCase();
  return SEGREDO.some((p) => {
    const re = new RegExp("^" + p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
    return re.test(nome);
  });
}
function raizDoVault(org: string): string {
  return org === ORG_CORE ? "/opt/data/arca/vault" : `/opt/data/arca/tenants/${org}/vault`;
}

const API_ARCA = process.env.ARCA_API_URL || "http://127.0.0.1:8080";
const ARQUIVO_TOKENS = "/opt/data/mirai-app/data/arca-tokens.json";
/** Credencial por PESSOA (a chave antiga era por org, e todo mundo virava dono). */
const ARQUIVO_CREDENCIAIS = "/opt/data/mirai-app/data/arca-credenciais.json";
const REGISTRO_DIR = process.env.ARCA_ACERVO_DIR || "/opt/data/arca/acervo";

/**
 * Papel da PESSOA na Arca (F2, 11/11/2026).
 *
 * Antes: o app pegava UM token por org, papel `owner`, e qualquer pessoa que
 * chegasse naquela org virava dona na Arca — o papel do produto não chegava
 * lá. Agora o papel vem do vínculo da pessoa com a empresa:
 * `dono`/`admin` -> owner · `membro` -> member · `visitante` -> viewer.
 * Sem vínculo (o espaço pessoal de cada um) -> owner do PRÓPRIO espaço.
 */
async function papelNaArca(email: string, org: string, ehDono: boolean): Promise<"owner" | "member" | "viewer"> {
  if (ehDono || org === ORG_CORE) return "owner";
  try {
    const { papelNaOrg } = await import("@/lib/orgs");
    const papel = (papelNaOrg(email) || "").toLowerCase();
    if (papel === "visitante" || papel === "viewer") return "viewer";
    if (papel === "membro" || papel === "member") return "member";
  } catch {
    /* sem vínculo resolvido: o espaço é da própria pessoa */
  }
  return "owner";
}

/** sha256 do token — é assim que a Arca identifica a credencial no registro. */
function shaDoToken(token: string): string {
  return createHash("sha256").update(token.trim(), "utf-8").digest("hex");
}

/**
 * Token da Arca para ESTA pessoa nesta org.
 *
 * O token em claro só existe aqui (o registro da Arca guarda sha256) e os
 * arquivos são 0600. Se ainda não houver credencial da pessoa, EMITE uma com o
 * papel dela; se o papel mudou no produto, o papel é corrigido NA ARCA (a
 * credencial é a mesma — quem manda é o vínculo, não o cache).
 */
async function tokenDaArca(org: string, pessoa?: { email: string; ehDono: boolean }): Promise<string | null> {
  try {
    // O acervo do dono tem token próprio (o do Core, superuser). Os demais são
    // por pessoa, emitidos sob demanda e guardados aqui (0600).
    if (org === ORG_CORE) {
      const t = (await readFile("/opt/data/arca/api/.arca-token", "utf8")).trim();
      if (t) return t;
    }

    let mapa: Record<string, { token: string; papel: string; usuario?: string; criada_em?: string }> = {};
    try {
      const bruto = JSON.parse(await readFile(ARQUIVO_CREDENCIAIS, "utf8"));
      // compatível com o formato antigo (org -> "token")
      for (const [k, v] of Object.entries(bruto)) {
        mapa[k] = typeof v === "string" ? { token: v, papel: "owner" } : (v as { token: string; papel: string });
      }
    } catch {
      mapa = {};
    }

    const email = (pessoa?.email || "").trim().toLowerCase() || "app-mirai";
    const chave = `${org}|${email}`;
    const papel = pessoa ? await papelNaArca(pessoa.email, org, pessoa.ehDono) : "owner";
    const guardado = mapa[chave] || mapa[org];   // mapa[org] = formato antigo (por org)
    if (guardado?.token) {
      if (pessoa && guardado.papel !== papel) {
        // o vínculo mudou no produto: corrige o papel da credencial na Arca
        await fetch(`${API_ARCA}/org/pessoas/${shaDoToken(guardado.token)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "X-Arca-Token": guardado.token },
          body: JSON.stringify({ papel }),
        }).then((r) => {
          if (!r.ok) console.warn("[acervo] não consegui ajustar o papel na Arca:", r.status);
        }).catch(() => undefined);
      }
      return guardado.token;
    }

    // SEM PESSOA NÃO SE EMITE CREDENCIAL: era daqui que saía o token `owner`
    // anônimo por org (a pessoa virava dona na Arca). Sem vínculo identificado,
    // a rota segue pelo caminho seguro (ponte) em vez de inventar um dono.
    if (!pessoa) {
      console.warn("[acervo] sem pessoa identificada para", org, "— não emito credencial");
      return null;
    }

    const { stdout } = await execFileP(
      "python3",
      [
        "-c",
        "import sys; sys.path.insert(0,'.'); import tenancy; " +
        "print(tenancy.emitir_token(sys.argv[1], sys.argv[2], sys.argv[3]))",
        org,
        email,
        papel,
      ],
      { cwd: "/opt/data/arca/api/app", timeout: 25000, env: { ...process.env, PYTHONIOENCODING: "utf-8" } },
    );
    const tok = String(stdout).trim().split("\n").pop()?.trim() || "";
    if (!tok) return null;
    mapa[chave] = { token: tok, papel, usuario: email, criada_em: new Date().toISOString() };
    await mkdir("/opt/data/mirai-app/data", { recursive: true });
    await writeFile(ARQUIVO_CREDENCIAIS, JSON.stringify(mapa, null, 2), { mode: 0o600 });
    return tok;
  } catch (e) {
    console.warn("[acervo] não consegui obter token da Arca para", org, e);
    return null;
  }
}

/** Árvore de pastas do vault da org — a estante do segundo cérebro. */
async function arvoreDoVault(org: string, comNotas: boolean) {
  const raiz = path.resolve(raizDoVault(org));
  type No = {
    nome: string;
    path: string;
    notas: { path: string; nome: string; modificado?: string; bytes?: number }[];
    subpastas: No[];
    total_notas: number;
  };

  async function montar(dir: string, nivel: number, rel: string): Promise<No> {
    const no: No = { nome: path.basename(dir) || "(raiz)", path: rel, notas: [], subpastas: [], total_notas: 0 };
    let entradas: string[];
    try {
      entradas = await readdir(dir);
    } catch {
      return no;
    }
    for (const nome of entradas.sort((a, b) => a.localeCompare(b, "pt-BR"))) {
      if (nome.startsWith(".git")) continue;
      const abs = path.join(dir, nome);
      let s;
      try {
        s = await stat(abs);
      } catch {
        continue;
      }
      if (s.isDirectory()) {
        if (nivel + 1 > 5) continue;
        const filho = await montar(abs, nivel + 1, rel ? `${rel}/${nome}` : nome);
        filho.nome = nome;
        no.subpastas.push(filho);
        no.total_notas += filho.total_notas;
      } else if (nome.toLowerCase().endsWith(".md") && !ehSegredo(nome)) {
        const item: { path: string; nome: string; modificado?: string; bytes?: number } = {
          path: rel ? `${rel}/${nome}` : nome,
          nome,
        };
        if (comNotas) {
          item.modificado = s.mtime.toISOString();
          item.bytes = s.size;
        }
        no.notas.push(item);
        no.total_notas += 1;
      }
    }
    return no;
  }

  const arvore = await montar(raiz, 0, "");
  arvore.nome = "(raiz)";
  return arvore;
}

async function rodarCli(args: string[]): Promise<Record<string, unknown>> {
  const { stdout } = await execFileP("python3", [CLI, ...args], {
    cwd: CLI_CWD,
    timeout: 25000,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  });
  return JSON.parse(stdout);
}

function erro(status: number, msg: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: msg, ...(extra || {}) }, { status });
}

/** Leitura do dono no acervo de outra pessoa não pode ser invisível. */
async function auditarCross(quem: string, org: string, acao: string) {
  const linha = JSON.stringify({ ts: new Date().toISOString(), quem, org, acao }) + "\n";
  try {
    await mkdir("/opt/data/arca/logs", { recursive: true });
    await appendFile(LOG_CROSS, linha, "utf8");
  } catch (e) {
    console.warn("[acervo] falha ao auditar leitura cross-tenant:", e);
  }
  console.log(`[acervo] leitura cross-tenant: ${quem} -> ${org} (${acao})`);
}

// ── camada de operações: uma porta só ──────────────────────────────────────
type Resposta = { status: number; dados: Record<string, unknown> };

async function pedirCamada(tok: string, metodo: string, rota: string, corpo?: unknown): Promise<Resposta> {
  try {
    const r = await fetch(`${API_ARCA}${rota}`, {
      method: metodo,
      headers: { "Content-Type": "application/json", "X-Arca-Token": tok },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      cache: "no-store",
    });
    const dados = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: r.status, dados };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: 502, dados: { detail: `a Arca não respondeu: ${msg.slice(0, 160)}` } };
  }
}

/**
 * QUAL CAMADA ESTÁ NO AR? (cache de 30s)
 *
 * O processo da 8080 roda como root e só reinicia com root. Enquanto ele não
 * for reiniciado, o código NO AR não tem `/acervo/tag` e o PATCH de `ordem`
 * RENOMEIA o arquivo (recalcula `slug(titulo)`) — medido em 10/11/2026: 217 das
 * 248 notas do dono têm nome fora do slug, ou seja, arrastar uma nota renomearia
 * 87% do vault e quebraria os wikilinks.
 *
 * `/acervo/versao` conta o que a camada viva sabe fazer. Sem essa resposta, esta
 * rota usa a PONTE (escreve o metadado no MESMO registro por tenant e no próprio
 * arquivo, preservando o nome) em vez de apostar num PATCH que renomeia.
 */
type Versao = { nova: boolean; verificado: boolean };
let cacheVersao: { em: number; valor: Versao } | null = null;

async function camadaDoAr(org: string): Promise<Versao> {
  const agora = Date.now();
  if (cacheVersao && agora - cacheVersao.em < 30_000) return cacheVersao.valor;
  let valor: Versao = { nova: false, verificado: false };
  const tok = await tokenDaArca(org);
  if (tok) {
    const r = await pedirCamada(tok, "GET", "/acervo/versao");
    valor = {
      nova: r.status === 200 && r.dados?.ordem_preserva_nome === true && r.dados?.tags_com_nome_e_cor === true,
      verificado: r.status === 200,
    };
  }
  cacheVersao = { em: agora, valor };
  return valor;
}

/** Registro por tenant das PASTAS e TAGS (mesmo arquivo e formato da camada). */
async function lerRegistro(org: string): Promise<Record<string, any>> {
  const arq = path.join(REGISTRO_DIR, `${org}.json`);
  try {
    const d = JSON.parse(await readFile(arq, "utf8"));
    d.pastas = d.pastas || {};
    d.tags = d.tags || {};
    return d;
  } catch {
    return { org, pastas: {}, tags: {} };
  }
}

async function gravarRegistro(org: string, dados: Record<string, any>) {
  await mkdir(REGISTRO_DIR, { recursive: true });
  dados.org = org;
  dados.atualizado = new Date().toISOString();
  const arq = path.join(REGISTRO_DIR, `${org}.json`);
  const tmp = `${arq}.tmp`;
  await writeFile(tmp, JSON.stringify(dados, null, 2), { encoding: "utf8", mode: 0o600 });
  await rename(tmp, arq);
}

/**
 * Ajusta chaves do frontmatter sem tocar no corpo e SEM mexer no nome do
 * arquivo. Usado só pela PONTE (ver `camadaDoAr`).
 */
function ajustarFrontmatter(bruto: string, campos: Record<string, string | number>): string {
  const linhasNovas = Object.entries(campos).map(([k, v]) => `${k}: ${v}`);
  if (!bruto.startsWith("---")) return `---\n${linhasNovas.join("\n")}\n---\n\n${bruto}`;
  const fim = bruto.indexOf("\n---", 3);
  if (fim === -1) return `---\n${linhasNovas.join("\n")}\n` + bruto;
  const vistos = new Set<string>();
  const bloco = bruto
    .slice(3, fim)
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => {
      const i = l.indexOf(":");
      if (i <= 0) return l;
      const k = l.slice(0, i).trim();
      if (k in campos) {
        vistos.add(k);
        return `${k}: ${campos[k]}`;
      }
      return l;
    });
  for (const [k, v] of Object.entries(campos)) if (!vistos.has(k)) bloco.push(`${k}: ${v}`);
  return `---\n${bloco.join("\n")}\n` + bruto.slice(fim);
}

function diretorioSeguro(rel: string): string {
  const limpo = String(rel || "").replace(/^\/+|\/+$/g, "");
  if (limpo.split("/").some((p) => p === ".." || p === ".")) throw new Error("caminho inválido");
  return limpo;
}

/**
 * PONTE de escrita enquanto a camada viva for a antiga: move a nota MANTENDO o
 * nome do arquivo e grava `ordem`/`pasta`/`subpasta` no frontmatter — exatamente
 * o que a camada nova faz, sem o rename que a antiga faz de brinde.
 */
async function moverNotaNoArquivo(org: string, corpo: Record<string, unknown>): Promise<Resposta> {
  const raiz = path.resolve(raizDoVault(org));
  const de = diretorioSeguro(String(corpo.path || ""));
  if (!de.toLowerCase().endsWith(".md")) return { status: 400, dados: { detail: "só .md" } };
  if (ehSegredo(de)) return { status: 403, dados: { detail: "arquivo protegido" } };
  const origem = path.resolve(raiz, de);
  if (!origem.startsWith(raiz + path.sep)) return { status: 400, dados: { detail: "fora do acervo" } };

  let bruto: string;
  try {
    bruto = await readFile(origem, "utf8");
  } catch {
    return { status: 404, dados: { detail: "nota não encontrada no acervo" } };
  }

  const pastaAtual = diretorioSeguro(path.posix.dirname(de) === "." ? "" : path.posix.dirname(de));
  const destinoDir = String(corpo.nova_pasta ?? "").trim()
    ? diretorioSeguro(String(corpo.nova_pasta))
    : pastaAtual;
  const nomeAtual = path.posix.basename(de);
  const novoRel = [destinoDir, nomeAtual].filter(Boolean).join("/");

  const destino = path.resolve(raiz, novoRel);
  if (!destino.startsWith(raiz + path.sep)) return { status: 400, dados: { detail: "fora do acervo" } };
  if (destino !== origem) {
    const jaTem = await stat(destino).then(() => true).catch(() => false);
    if (jaTem) return { status: 409, dados: { detail: "já existe uma nota nesse caminho" } };
  }

  const partes = novoRel.replace(/\.md$/i, "").split("/");
  const campos: Record<string, string | number> = {
    pasta: partes[0] || "",
    subpasta: partes.slice(1, -1).join("/"),
  };
  const ordem = corpo.ordem;
  if (typeof ordem === "number" && Number.isFinite(ordem)) campos.ordem = Math.trunc(ordem);
  if (String(corpo.novo_titulo || "").trim()) campos.title = String(corpo.novo_titulo).trim();

  const conteudo = ajustarFrontmatter(bruto, campos);
  await mkdir(path.dirname(destino), { recursive: true });
  await writeFile(destino, conteudo, "utf8");
  if (destino !== origem) {
    const { unlink } = await import("node:fs/promises");
    await unlink(origem);
  }
  return {
    status: 200,
    dados: { ok: true, de, para: novoRel, ordem: campos.ordem ?? null, ponte: "arquivo" },
  };
}

/** PONTE de TAG: nome e cor no MESMO registro por tenant que a camada usa. */
async function editarTagNoRegistro(org: string, corpo: Record<string, unknown>): Promise<Resposta> {
  const tag = String(corpo.tag || "").trim().toLowerCase();
  if (!tag) return { status: 400, dados: { detail: "informe a tag" } };
  const cor = String(corpo.cor || "").trim();
  if (cor && !/^#[0-9a-fA-F]{6}$/.test(cor)) return { status: 400, dados: { detail: "cor inválida: use #RRGGBB" } };
  const dados = await lerRegistro(org);
  const atual = dados.tags[tag] || { ordem: 100 };
  const nome = String(corpo.novo_nome || "").trim();
  if (nome) atual.nome = nome;
  if (cor) atual.cor = cor;
  atual.editada = new Date().toISOString();
  dados.tags[tag] = atual;
  await gravarRegistro(org, dados);
  return { status: 200, dados: { ok: true, tag, meta: atual, ponte: "registro" } };
}

/** Pastas compartilhadas COM um e-mail (a verdade é da Arca). */
async function pastasRecebidas(email: string): Promise<Record<string, unknown>[]> {
  const quem = (email || "").trim().toLowerCase();
  if (!quem.includes("@")) return [];
  const tok = await tokenDaArca(ORG_CORE);
  if (!tok) return [];
  const r = await pedirCamada(tok, "GET", `/org/recebidos?email=${encodeURIComponent(quem)}`);
  return ((r.dados as { pastas?: Record<string, unknown>[] }).pastas || []) as Record<string, unknown>[];
}

/** A pasta concedida cobre ela mesma e tudo abaixo (herança, como o Drive). */
function concessaoCobre(pastas: Record<string, unknown>[], org: string, alvo: string): boolean {
  const caminho = String(alvo || "").replace(/^\/+/, "").replace(/\/+$/, "");
  return pastas.some((c) => {
    if (String(c.org || "") !== org) return false;
    const raiz = String(c.alvo || "").replace(/^\/+/, "").replace(/\/+$/, "");
    if (!raiz || raiz === "*") return true;
    return caminho === raiz || caminho.startsWith(raiz + "/");
  });
}

/** Recorta uma árvore para a pasta concedida (o resto não existe para o convidado). */
function recortarArvore(no: unknown, alvo: string): unknown {
  const raiz = String(alvo || "").replace(/^\/+|\/+$/g, "");
  /** Dentro do recorte: a pasta concedida, o que está abaixo dela, e os nós de
   *  PASSAGEM acima (senão o caminho até ela desaparece e o convidado fica sem
   *  árvore). A contagem é RECONTADA aqui: o total do acervo do dono não é
   *  assunto de quem recebeu uma pasta (o número vazava no cabeçalho). */
  const passa = (n: Record<string, unknown>): Record<string, unknown> | null => {
    const c = String(n.path || n.caminho || "").replace(/^\/+/, "").replace(/\/+$/, "");
    const ehAcervo = c === "" || c === ".";
    const dentro = ehAcervo || c === raiz || c.startsWith(raiz + "/") || raiz.startsWith(c + "/");
    if (!dentro) return null;
    const subs = (((n.subpastas as Record<string, unknown>[]) || []).map(passa).filter(Boolean)) as Record<string, unknown>[];
    const notas = (n.notas as unknown[]) || [];
    const total = notas.length + subs.reduce((soma, sub) => soma + Number((sub as { total_notas?: number }).total_notas || 0), 0);
    return { ...n, notas, subpastas: subs, total_notas: total };
  };
  return passa((no || {}) as Record<string, unknown>);
}

async function resolverOrg(conta: { ehDono: boolean; email: string; nome: string }, orgPedida: string, acao: string) {
  if (conta.ehDono && orgPedida) {
    if (!SLUG_OK.test(orgPedida)) return { erro: erro(400, "org inválida") };
    if (orgPedida !== ORG_CORE) await auditarCross(conta.email, orgPedida, acao);
    return { org: orgPedida };
  }
  if (conta.ehDono) return { org: ORG_CORE };
  const esp = await rodarCli(["espaco", "criar", conta.email, "--nome", conta.nome, "--sem-palacio"]);
  const devolvida = String(esp.org || "");
  if (!SLUG_OK.test(devolvida)) return { erro: erro(500, "a Arca devolveu um org inválido") };
  return { org: devolvida };
}

async function atenderAcervo(req: NextRequest) {
  const sessao = await exigirConta(req);
  if (!sessao.ok) return sessao.resposta;
  const conta = sessao.conta;

  const u = new URL(req.url);
  const acao = (u.searchParams.get("acao") || "stats").trim();
  const termo = (u.searchParams.get("termo") || "").slice(0, TETO_PARAM);
  const expr = (u.searchParams.get("expr") || "").slice(0, TETO_PARAM);
  const nota = (u.searchParams.get("nota") || "").slice(0, TETO_PARAM);
  const caminho = (u.searchParams.get("path") || "").slice(0, 300);
  const limite = Math.min(Math.max(Number(u.searchParams.get("limit") || 200) || 200, 1), 500);
  const orgPedida = (u.searchParams.get("org") || "").trim().toLowerCase();

  if (!ACOES.includes(acao as (typeof ACOES)[number])) {
    return erro(400, "ação desconhecida", { acoes: ACOES });
  }

  // ── "COMPARTILHADO COM VOCÊ": o que ESTA conta recebeu (cruza espaços) ──
  if (acao === "recebidos") {
    return NextResponse.json({
      email: conta.email,
      pastas: await pastasRecebidas(String(conta.email || "")),
    });
  }

  // ── AVISOS (o sininho): pasta compartilhada com esta conta ─────────────
  if (acao === "avisos") {
    const meu = String(conta.email || "").trim().toLowerCase();
    const pastas = await pastasRecebidas(meu);
    const { vistos } = await import("@/lib/avisos");
    const visto = vistos(meu);

    // nome e foto de QUEM compartilhou (o e-mail vem da concessão)
    const gente = new Map<string, { nome: string; foto: string | null }>();
    try {
      const deQuem = [
        ...new Set(
          pastas
            .map((c) => String(c.de || "").toLowerCase())
            .filter((e) => e.includes("@")),
        ),
      ];
      if (deQuem.length) {
        const { db } = await import("@/lib/auth");
        const marcas = deQuem.map(() => "?").join(",");
        const linhas = db()
          .prepare(`SELECT lower(email) AS e, name, avatar_url FROM users WHERE lower(email) IN (${marcas})`)
          .all(...deQuem) as { e: string; name: string; avatar_url: string | null }[];
        for (const l of linhas) gente.set(l.e, { nome: l.name, foto: l.avatar_url ?? null });
      }
    } catch {
      /* sem banco de contas: mostra o e-mail mesmo */
    }

    const avisos = pastas.map((c) => {
      const org = String(c.org || "");
      const alvo = String(c.alvo || "");
      const de = String(c.de || "").toLowerCase();
      const g = gente.get(de);
      const nivel = [
        c.ver !== false ? "ver" : "",
        c.editar === true ? "editar" : "",
        c.excluir === true ? "excluir" : "",
      ]
        .filter(Boolean)
        .join(" + ");
      const quando = (c.desde as string) || null;
      const vistoEm = visto.get(`${org}|${alvo}`);
      // Novo = nunca visto OU compartilhado depois do último visto (nível mudou).
      const novo = !vistoEm || (quando ? Date.parse(quando) > Date.parse(vistoEm) : false);
      return {
        org,
        alvo,
        de,
        nome: g?.nome || (de.includes("@") ? de : de || "alguém"),
        foto: g?.foto || null,
        nivel,
        quando,
        novo: Boolean(novo),
      };
    });
    return NextResponse.json({ email: meu, avisos, novos: avisos.filter((a) => a.novo).length });
  }

  // ── PEDIDOS de novo link (só o dono vê; a tela de link morto alimenta) ──
  if (acao === "pedidos") {
    if (!conta.ehDono) return NextResponse.json({ pedidos: [] });
    const tokPedidos = await tokenDaArca(ORG_CORE);
    if (!tokPedidos) return erro(503, "a Arca não respondeu — tente de novo em instantes");
    const r = await pedirCamada(tokPedidos, "GET", `/org/pedidos?org=${encodeURIComponent(ORG_CORE)}`);
    return NextResponse.json({ org: ORG_CORE, ...(r.dados as Record<string, unknown>) });
  }

  // ── De quem é o acervo desta leitura? ────────────────────────────────
  const recebido = (u.searchParams.get("recebido") || "").slice(0, 300).trim();
  let org: string;
  try {
    if (recebido && !conta.ehDono) {
      // Visão de pasta RECEBIDA: o espaço é o de quem compartilhou (a concessão
      // é conferida logo abaixo). Nada de criar espaço próprio para o convidado.
      if (!SLUG_OK.test(orgPedida)) return erro(400, "org inválida");
      org = orgPedida;
    } else {
      const r = await resolverOrg(conta as never, orgPedida, acao);
      if (r.erro) return r.erro;
      org = r.org as string;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return erro(500, "não consegui resolver o acervo desta conta", { detalhe: msg.slice(0, 300) });
  }

  // ── Leitura ─────────────────────────────────────────────────────────
  try {
    // A permissão vem da ARCA (concessão por e-mail), nunca do cliente.
    let concedidas: Record<string, unknown>[] = [];
    if (recebido) {
      concedidas = await pastasRecebidas(String(conta.email || ""));
      if (!concessaoCobre(concedidas, org, recebido)) {
        return erro(403, "esta pasta não foi compartilhada com você");
      }
      // O que é do espaço inteiro não é do convidado: mapa do cérebro, panorama
      // e números do acervo ficam de fora — ele vê a pasta, não a casa.
      if (acao === "stats") {
        return NextResponse.json({ org, escopo: recebido, somente_recebido: true, pastas: concedidas.length });
      }
      if (acao === "grafo" || acao === "youniverse" || acao === "query") {
        return NextResponse.json({ org, escopo: recebido, somente_recebido: true, nos: [], elos: [], resultados: [] });
      }
    }

    if (acao === "acesso") {
      // QUEM TEM ACESSO A ESTE ESPAÇO — as fotinhas ao lado da pasta (estilo Drive).
      // A verdade é da ARCA (concessão por pasta, com herança); aqui só vestimos
      // cada e-mail com o nome e a foto que a conta já tem.
      const tokAcesso = (await tokenDaArca(org, { email: conta.email || "", ehDono: conta.ehDono })) || "";
      if (!tokAcesso) return erro(503, "a Arca não respondeu — tente de novo em instantes");
      const r = await pedirCamada(tokAcesso, "GET", `/org/compartilhar?org=${encodeURIComponent(org)}`);
      if (r.status !== 200) {
        return NextResponse.json({
          org,
          concessoes: [],
          indisponivel: true,
          detalhe: "a camada de compartilhamento ainda não está no ar (a Arca precisa ser reiniciada para carregar o código novo)",
        });
      }
      const lista = ((r.dados as { concessoes?: ConcessaoArca[] }).concessoes) || [];
      const emails = [...new Set(lista.map((c) => (c.convidado || "").toLowerCase()).filter(Boolean))];
      const gente = new Map<string, { nome: string; foto: string | null }>();
      try {
        const { db } = await import("@/lib/auth");
        if (emails.length) {
          const marcas = emails.map(() => "?").join(",");
          const linhas = db()
            .prepare(`SELECT lower(email) AS e, name, avatar_url FROM users WHERE lower(email) IN (${marcas})`)
            .all(...emails) as { e: string; name: string; avatar_url: string | null }[];
          for (const l of linhas) gente.set(l.e, { nome: l.name, foto: l.avatar_url ?? null });
        }
      } catch {
        /* sem banco de contas: segue só com o e-mail */
      }
      return NextResponse.json({
        org,
        concessoes: lista.map((c) => {
          const g = gente.get((c.convidado || "").toLowerCase());
          return { ...c, nome: g?.nome || c.convidado, foto: g?.foto || null };
        }),
      });
    }

    if (acao === "stats") return NextResponse.json(await rodarCli(["vault", "stats", org]));
    if (acao === "grafo") return NextResponse.json(await rodarCli(["vault", "grafo", org]));
    if (acao === "listar") {
      return NextResponse.json(await rodarCli(["vault", "listar", org, "--limit", String(limite)]));
    }
    if (acao === "buscar") {
      if (!termo) return erro(400, "informe o termo da busca");
      return NextResponse.json(await rodarCli(["vault", "buscar", org, termo, "--limit", "30"]));
    }
    if (acao === "query") {
      if (!expr) return erro(400, "informe a consulta (ex.: tag=akil and status=active)");
      return NextResponse.json(await rodarCli(["vault", "query", org, expr, "--limit", "60"]));
    }
    if (acao === "recentes") {
      // A estante da frente: as notas mexidas por último. Lê o VAULT da org
      // (não o índice), então não precisa de CLI — e filtra segredo pela
      // mesma regra da Arca.
      const raiz = path.resolve(raizDoVault(org));
      const arquivos = await readdir(raiz, { recursive: true }).catch(() => [] as string[]);
      const md = arquivos
        .map((nome) => String(nome))
        .filter((nome) => nome.toLowerCase().endsWith(".md"))
        .filter((nome) => !nome.split(path.sep).includes(".git"))
        .filter((nome) => !ehSegredo(nome));
      const comData = await Promise.all(
        md.map(async (nome) => {
          const s = await stat(path.join(raiz, nome)).catch(() => null);
          return { path: nome, titulo: path.basename(nome, ".md"), modificado: s ? s.mtime.toISOString() : "", bytes: s?.size ?? 0 };
        }),
      );
      comData.sort((a, b) => (a.modificado < b.modificado ? 1 : -1));
      return NextResponse.json({ org, recentes: comData.slice(0, limite) });
    }
    if (acao === "youniverse") {
      // O MAPA DO CÉREBRO vive na ARCA (cache pré-computado por t-SNE). O app só
      // empresta o token da org — a projeção é trabalho do servidor da Arca.
      const tok = await tokenDaArca(org, { email: conta.email, ehDono: conta.ehDono });
      if (!tok) return erro(503, "a Arca não respondeu — tente de novo em instantes");
      try {
        const r = await fetch(`${API_ARCA}/vault/youniverse`, {
          headers: { "X-Arca-Token": tok },
          cache: "no-store",
        });
        const dados = await r.json().catch(() => ({}));
        return NextResponse.json(dados, { status: r.status });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return erro(502, "não consegui buscar o mapa do cérebro", { detalhe: msg.slice(0, 200) });
      }
    }

    if (acao === "arvore") {
      // A ESTANTE do segundo cérebro. A ÁRVORE VEM DA CAMADA quando ela está no
      // ar: é ela que guarda ORDEM, NOME EXIBIDO e COR de pasta e tag. O disco
      // não sabe nada disso — ler só o disco deixaria a tela sem como reordenar.
      const comNotas = u.searchParams.get("com_notas") !== "false";
      const tok = await tokenDaArca(org, { email: conta.email, ehDono: conta.ehDono });
      if (tok) {
        const r = await pedirCamada(tok, "GET", `/acervo/arvore?com_notas=${comNotas ? "true" : "false"}`);
        if (r.status === 200 && r.dados && (r.dados as { arvore?: unknown }).arvore) {
          const arv = recebido ? recortarArvore((r.dados as { arvore?: unknown }).arvore, recebido) : (r.dados as { arvore?: unknown }).arvore;
          return NextResponse.json({ org, ...r.dados, arvore: arv, origem: "camada", somente_recebido: Boolean(recebido) });
        }
      }
      // Degradar bem: sem camada, a estante ainda abre (sem ordem nem cor).
      const arvoreDisco = await arvoreDoVault(org, comNotas);
      return NextResponse.json({
        org,
        arvore: recebido ? recortarArvore(arvoreDisco, recebido) : arvoreDisco,
        tags: [],
        origem: "disco",
        somente_recebido: Boolean(recebido),
      });
    }
    if (acao === "nota") {
      // ABRIR a nota: o gesto principal de uma Arca. Sem isto a tela era um
      // índice sem livro. O corpo vem do arquivo; os elos vêm do grafo (CLI).
      if (!caminho) return erro(400, "informe a nota (path)");
      const rel = caminho.replace(/^\/+/, "");
      if (rel.includes("..") || !rel.toLowerCase().endsWith(".md")) return erro(400, "caminho inválido");
      if (recebido && !concessaoCobre(concedidas, org, rel)) {
        return erro(403, "esta nota não está na pasta compartilhada com você");
      }
      if (ehSegredo(rel)) return erro(403, "arquivo protegido: a Arca não serve credenciais");
      const raiz = path.resolve(raizDoVault(org));
      const alvo = path.resolve(raiz, rel);
      if (alvo !== raiz && !alvo.startsWith(raiz + path.sep)) return erro(400, "fora do acervo");
      const bruto = await readFile(alvo, "utf8").catch(() => null);
      if (bruto === null) return erro(404, "nota não encontrada no acervo");

      let frontmatter: Record<string, string> = {};
      let corpo = bruto;
      if (bruto.startsWith("---")) {
        const fim = bruto.indexOf("\n---", 3);
        if (fim !== -1) {
          corpo = bruto.slice(fim + 4).replace(/^\n+/, "");
          for (const linha of bruto.slice(3, fim).split("\n")) {
            const i = linha.indexOf(":");
            if (i > 0 && !linha.trimStart().startsWith("#")) {
              frontmatter[linha.slice(0, i).trim()] = linha
                .slice(i + 1)
                .trim()
                .replace(/^\[|\]$/g, "")
                .replace(/^["']|["']$/g, "");
            }
          }
        }
      }
      const noteId = rel.slice(0, -3);
      const [bl, lk] = await Promise.all([
        rodarCli(["vault", "backlinks", org, noteId]).catch(() => ({})),
        rodarCli(["vault", "links", org, noteId]).catch(() => ({})),
      ]);
      return NextResponse.json({
        org,
        path: rel,
        titulo: frontmatter.title || path.basename(rel, ".md"),
        frontmatter,
        corpo,
        palavras: corpo.split(/\s+/).filter(Boolean).length,
        backlinks: (bl as { backlinks?: unknown[] }).backlinks || [],
        links: (lk as { links?: unknown[] }).links || [],
      });
    }
    if (recebido && (acao === "buscar" || acao === "listar" || acao === "recentes")) {
      // Busca e listas do convidado ficam DENTRO da pasta concedida.
      const escopo = recebido.replace(/^\/+/, "").replace(/\/+$/, "");
      const dados = await rodarCli(acao === "buscar"
        ? ["vault", acao, org, termo, "--limit", "30"]
        : ["vault", acao, org, "--limit", String(limite)]);
      for (const campo of ["notas", "resultados", "itens", "recentes"]) {
        const lista = (dados as Record<string, unknown>)[campo];
        if (Array.isArray(lista)) {
          (dados as Record<string, unknown>)[campo] = (lista as Record<string, unknown>[]).filter((n) => {
            const pp = String(n.path || n.caminho || "").replace(/^\/+/, "");
            return pp === escopo || pp.startsWith(escopo + "/");
          });
        }
      }
      return NextResponse.json({ org, escopo, somente_recebido: true, ...dados });
    }

    // backlinks | links
    if (!nota) return erro(400, "informe a nota");
    return NextResponse.json(await rodarCli(["vault", acao, org, nota]));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return erro(500, "falha ao ler o acervo", { detalhe: msg.slice(0, 400) });
  }
}

/**
 * BLINDAGEM CONTRA "200 VAZIO" (medido em 10/11/2026, na tela da Arca):
 * em raras passadas a rota respondia HTTP 200 com corpo VAZIO — o app recebia nada
 * no lugar do acervo. Para o front isso é pior que um erro: `JSON.parse("")` estoura
 * e a tela inteira morre com "Application error: a client-side exception" (a queixa
 * do dono, intermitente). Regra nova: corpo vazio ou `{}` NÃO é resposta válida.
 * Tenta uma vez mais e, se persistir, devolve 502 com recado claro — o front já
 * sabe mostrar mensagem amigável, e o watchdog registra.
 */
function corpoUtil(texto: string): boolean {
  const t = texto.trim();
  return t.length > 2 && t !== "{}" && t !== "null";
}

export async function GET(req: NextRequest) {
  const primeira = await atenderAcervo(req);
  if (primeira.status !== 200) return primeira;

  const texto = await primeira
    .clone()
    .text()
    .catch(() => "");
  if (corpoUtil(texto)) return primeira;

  // Segunda tentativa: o vazio costuma ser soluço (upstream/CLI), não estado.
  const segunda = await atenderAcervo(req);
  const texto2 = await segunda
    .clone()
    .text()
    .catch(() => "");
  if (corpoUtil(texto2)) return segunda;

  console.warn("[acervo] resposta vazia em duas tentativas — devolvendo 502 ao cliente");
  return NextResponse.json(
    { error: "o acervo não devolveu dados agora — tente de novo em instantes", origem: "acervo", vazio: true },
    { status: 502 },
  );
}

/**
 * ESCRITA NA ARCA.
 *
 * POR QUE PASSA PELA ARCA: a governança é DELA — guard_write auditado, auto-commit
 * no histórico, caminhos protegidos. O app não reimplementa nada disso: pede o
 * token da org e repassa. Assim a pessoa escreve organizada, e a IA usa o mesmo
 * caminho auditado (nada de escrita paralela).
 */
export async function POST(req: NextRequest) {
  const sessao = await exigirConta(req);
  if (!sessao.ok) return sessao.resposta;
  const conta = sessao.conta;

  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const acao = String(corpo.acao || "").trim();
  const orgPedida = String(corpo.org || "").trim().toLowerCase();

  if (!ACOES_ESCRITA.includes(acao as (typeof ACOES_ESCRITA)[number])) {
    return erro(400, "ação de escrita desconhecida", { acoes: ACOES_ESCRITA });
  }

  // Pasta RECEBIDA é só-leitura para quem recebeu: nenhuma escrita do convidado
  // cai no espaço de quem compartilhou (a tela nem oferece os botões).
  if (String(corpo.recebido || "").trim()) {
    return erro(403, "esta pasta foi compartilhada com você em modo só-leitura");
  }

  // O AVISO FOI VISTO: o sininho perde o ponto (não é dado do dono, é estado da
  // pessoa — por isso vive no banco do app, não na Arca).
  if (acao === "visto" || acao === "visto-tudo") {
    const { marcarVisto, marcarTudoVisto } = await import("@/lib/avisos");
    const meu = String(conta.email || "");
    if (acao === "visto") {
      marcarVisto(meu, String(corpo.org || ""), String(corpo.alvo || ""));
      return NextResponse.json({ ok: true });
    }
    const pastas = (await pastasRecebidas(meu)).map((c) => ({
      org: String(c.org || ""),
      alvo: String(c.alvo || ""),
    }));
    return NextResponse.json({ ok: true, marcados: marcarTudoVisto(meu, pastas) });
  }

  // O dono já reenviou o link: marca o pedido como atendido.
  if (acao === "atender-pedido") {
    const tokAt = await tokenDaArca(ORG_CORE);
    if (!tokAt) return erro(503, "a Arca não respondeu — tente de novo em instantes");
    const r = await pedirCamada(tokAt, "POST", "/org/pedido/atender", {
      org: corpo.org || ORG_CORE,
      convidado: corpo.convidado || corpo.email || "",
      pasta: corpo.pasta || "",
    });
    if (r.status !== 200) {
      return erro(r.status, String((r.dados as { detail?: string }).detail || "não consegui marcar o pedido"));
    }
    return NextResponse.json(r.dados as Record<string, unknown>);
  }

  let org: string;
  try {
    const r = await resolverOrg(conta as never, orgPedida, acao);
    if (r.erro) return r.erro;
    org = r.org as string;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return erro(500, "não consegui resolver o acervo desta conta", { detalhe: msg.slice(0, 300) });
  }

  const tok = await tokenDaArca(org, { email: conta.email, ehDono: conta.ehDono });
  if (!tok) return erro(503, "a Arca não respondeu — tente de novo em instantes");

  const camada = await camadaDoAr(org);
  const responder = (r: Resposta) =>
    NextResponse.json({ ...r.dados, camada: camada.nova ? "viva" : "ponte" }, { status: r.status });

  try {
    if (acao === "compartilhar") {
      const pasta = String(corpo.pasta || "").replace(/^\/+|\/+$/g, "");
      const email = String(corpo.email || "").trim().toLowerCase();
      const r = await pedirCamada(tok, "POST", "/org/compartilhar", {
        org,
        alvo: pasta,
        convidado: email,
        por: String(conta.email || conta.nome || ""),
        ver: corpo.ver !== false,
        editar: corpo.editar === true,
        excluir: corpo.excluir === true,
      });
      if (r.status === 200) {
        const tk = (r.dados as { token?: string }).token;
        const base = basePublica(req);
        const linkConvite = tk ? `${base}/convite/${tk}` : null;
        const alvoPasta = pasta === "*" ? "toda a Arca" : pasta;

        // A pessoa JÁ TEM CONTA? Então ela não precisa de convite: cai DIRETO na
        // pasta, dentro da Arca dela ("compartilhado com você"), sem token na URL.
        let temConta = false;
        try {
          const { db } = await import("@/lib/auth");
          temConta = Boolean(
            db().prepare("SELECT 1 AS x FROM users WHERE lower(email) = ? LIMIT 1").get(email),
          );
        } catch {
          /* sem banco de contas: segue por link */
        }
        const linkConta =
          temConta && pasta !== "*"
            ? `${base}/dashboard/arca?recebido=${encodeURIComponent(`${org}/${pasta}`)}`
            : null;
        const ondeAbrir = linkConta || linkConvite;
        const niveis = [
          corpo.ver !== false ? "ver" : "",
          corpo.editar === true ? "editar" : "",
          corpo.excluir === true ? "excluir" : "",
        ]
          .filter(Boolean)
          .join(" + ");
        const deQuem = String(conta.nome || "alguém").trim();

        // O AVISO: sem ele a concessão existia e ninguém sabia. O e-mail é o
        // último passo e NUNCA derruba a concessão (ver lib/email/resend.ts).
        let envio: Record<string, unknown> = { ok: false, pulado: true, motivo: "não tentei" };
        try {
          const { emailPadrao } = await import("@/lib/email/padrao");
          const { enviarEmail } = await import("@/lib/email/resend");
          const { html, texto } = emailPadrao({
            sobretitulo: "a arca · pasta compartilhada",
            titulo: `${deQuem} compartilhou uma pasta com você`,
            paragrafos: [
              `${deQuem} liberou a pasta abaixo para este endereço.`,
              temConta
                ? "ela já aparece na sua Arca, na faixa “compartilhado com você”."
                : "o botão abre a pasta — sem criar conta, sem senha. o acesso é por este link.",
            ],
            destaque: `${alvoPasta} · ${niveis}`,
            botao: ondeAbrir ? { rotulo: "abrir a pasta", url: ondeAbrir } : undefined,
            linkCru: linkConvite || undefined,
            rodape:
              "você recebeu este aviso porque alguém compartilhou uma pasta da Arca com este endereço. quem compartilhou pode tirar o acesso a qualquer momento.",
          });
          envio = (await enviarEmail({
            para: email,
            assunto: `${deQuem} compartilhou “${alvoPasta}” com você`,
            html,
            texto,
          })) as unknown as Record<string, unknown>;
        } catch (e) {
          envio = { ok: false, motivo: e instanceof Error ? e.message.slice(0, 160) : "falha no aviso" };
        }

        return NextResponse.json({
          ...r.dados,
          link: ondeAbrir,
          link_convidado: linkConvite,
          tem_conta: temConta,
          email: envio,
          obs:
            envio.ok === true
              ? `aviso enviado para ${email}`
              : envio.pulado === true
                ? "acesso concedido — e-mail não configurado: mande o link abaixo"
                : `acesso concedido — o aviso por e-mail não saiu (${String(envio.motivo || "")})`,
        });
      }
      return responder(r);
    }

    if (acao === "descompartilhar") {
      const email = String(corpo.email || "").trim().toLowerCase();
      const pedido: Record<string, unknown> = { org, convidado: email };
      if (corpo.tudo === true) pedido.tudo = true;
      else pedido.alvo = String(corpo.pasta || "").replace(/^\/+|\/+$/g, "");
      return responder(await pedirCamada(tok, "DELETE", "/org/compartilhar", pedido));
    }

    if (acao === "link-convidado") {
      const email = String(corpo.email || "").trim().toLowerCase();
      const r = await pedirCamada(tok, "POST", "/org/convidado/rotacionar", { org, convidado: email });
      if (r.status === 200) {
        const tk = (r.dados as { token?: string }).token;
        return NextResponse.json({ ...r.dados, link: tk ? `${basePublica(req)}/convite/${tk}` : null });
      }
      return responder(r);
    }

    if (acao === "editar-pasta") {
      const r = await pedirCamada(tok, "PATCH", "/acervo/pasta", {
        caminho: String(corpo.caminho || ""),
        novo_nome: String(corpo.novo_nome || ""),
        cor: String(corpo.cor || ""),
        ...(typeof corpo.ordem === "number" ? { ordem: corpo.ordem } : {}),
      });
      return responder(r);
    }

    if (acao === "editar-tag") {
      const payload = {
        tag: String(corpo.tag || ""),
        novo_nome: String(corpo.novo_nome || ""),
        cor: String(corpo.cor || ""),
      };
      const r = await pedirCamada(tok, "PATCH", "/acervo/tag", payload);
      // Rota ausente = processo antigo no ar (é root, reinicia com root).
      if (r.status === 404) return responder(await editarTagNoRegistro(org, corpo));
      cacheVersao = null; // a resposta ensina o estado real da camada
      return responder(r);
    }

    if (acao === "mover-nota") {
      const payload = {
        path: String(corpo.path || ""),
        nova_pasta: String(corpo.nova_pasta || ""),
        ...(typeof corpo.ordem === "number" ? { ordem: corpo.ordem } : {}),
        ...(String(corpo.novo_titulo || "").trim() ? { novo_titulo: String(corpo.novo_titulo) } : {}),
      };
      // RENOMEAR (título + arquivo) exige a CAMADA: a ponte preserva o nome do
      // arquivo de propósito. Então quando a pessoa pede renomear, tenta-se a
      // camada mesmo que a sonda de versão diga "ponte" — a rota `/acervo/nota`
      // existe em processo intermediário que ainda não tem `/acervo/versao`.
      const querRenomear = String(corpo.novo_titulo || "").trim() !== "";
      if (!camada.nova && !querRenomear) {
        // Camada antiga renomearia o arquivo (slug do título): a ponte preserva.
        return responder(await moverNotaNoArquivo(org, payload));
      }
      const r = await pedirCamada(tok, "PATCH", "/acervo/nota", payload);
      // 404 = rota ausente (processo antigo): a ponte preserva o nome do arquivo.
      if (r.status === 404) return responder(await moverNotaNoArquivo(org, payload));
      return responder(r);
    }

    if (acao === "criar-pasta") {
      const r = await pedirCamada(tok, "POST", "/acervo/pasta", {
        caminho: String(corpo.caminho || ""),
        nome: String(corpo.nome || ""),
        cor: String(corpo.cor || ""),
        keywords: Array.isArray(corpo.keywords) ? corpo.keywords : [],
      });
      return responder(r);
    }

    if (acao === "apagar-pasta") {
      // A ÚNICA operação destrutiva do acervo: quem apaga é a CAMADA (roda como
      // root e é dona do vault e do registro). Não existe ponte para isto — a
      // ponte roda como o app e não alcança arquivo de root, então um "quase
      // apagou" aqui seria pior que um erro honesto.
      const caminho = String(corpo.caminho || "").trim();
      const recursivo = corpo.recursivo === true;
      const confirmar = String(corpo.confirmar || "").trim();
      if (!caminho) return erro(400, "diga qual pasta apagar");
      const q = new URLSearchParams({ caminho });
      if (recursivo) q.set("recursivo", "true");
      if (confirmar) q.set("confirmar", confirmar);
      const r = await pedirCamada(tok, "DELETE", `/acervo/pasta?${q.toString()}`);
      // 404 = rota não existe; 405 = a rota existe só com POST/PATCH (processo
      // antigo no ar). Os dois significam a MESMA coisa para quem está na tela:
      // a camada viva ainda não sabe apagar.
      if (r.status === 404 || r.status === 405) {
        return erro(503, "a Arca no ar ainda não sabe apagar pasta — o serviço da Arca precisa ser reiniciado (rota nova, processo antigo).");
      }
      cacheVersao = null;
      return responder(r);
    }

    if (acao === "podar-pastas") {
      const r = await pedirCamada(tok, "POST", "/acervo/podar", {});
      if (r.status === 404) {
        return erro(503, "a Arca no ar ainda não sabe podar o registro — reinicie o serviço da Arca.");
      }
      return responder(r);
    }

    // criar-nota: rota de TEMPLATE versionado (é dela que sai o "diário",
    // "reunião", "decisão"). Fica como está — o classificador da camada é para
    // o que nasce sem pasta escolhida.
    const r = await pedirCamada(tok, "POST", "/vault/nota", {
      titulo: String(corpo.titulo || ""),
      pasta: String(corpo.pasta || ""),
      template: String(corpo.template || "nota"),
    });
    return responder(r);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return erro(502, "a Arca não respondeu", { detalhe: msg.slice(0, 200) });
  }
}

/**
 * PATCH — a mesma escrita, no método que a camada usa.
 *
 * `PATCH /api/acervo` recebe `{path, nova_pasta?, ordem?}` (mover/reordenar nota)
 * ou `{caminho, novo_nome?, cor?, ordem?}` (pasta) e repassa para `/acervo/*`.
 * Sem a camada nova no ar, a nota cai na PONTE que preserva o nome do arquivo —
 * o mesmo comportamento do POST, uma régua só.
 */
export async function PATCH(req: NextRequest) {
  const sessao = await exigirConta(req);
  if (!sessao.ok) return sessao.resposta;
  const conta = sessao.conta;

  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  let org: string;
  try {
    const r = await resolverOrg(conta as never, String(corpo.org || "").trim().toLowerCase(), "editar-nota");
    if (r.erro) return r.erro;
    org = r.org as string;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return erro(500, "não consegui resolver o acervo desta conta", { detalhe: msg.slice(0, 300) });
  }

  const tok = await tokenDaArca(org, { email: conta.email, ehDono: conta.ehDono });
  if (!tok) return erro(503, "a Arca não respondeu — tente de novo em instantes");
  const camada = await camadaDoAr(org);
  const responder = (r: Resposta) =>
    NextResponse.json({ ...r.dados, camada: camada.nova ? "viva" : "ponte" }, { status: r.status });

  try {
    if (corpo.caminho !== undefined && corpo.path === undefined) {
      const r = await pedirCamada(tok, "PATCH", "/acervo/pasta", {
        caminho: String(corpo.caminho || ""),
        novo_nome: String(corpo.novo_nome || ""),
        cor: String(corpo.cor || ""),
        ...(typeof corpo.ordem === "number" ? { ordem: corpo.ordem } : {}),
      });
      return responder(r);
    }
    const payload = {
      path: String(corpo.path || ""),
      nova_pasta: String(corpo.nova_pasta || ""),
      ...(typeof corpo.ordem === "number" ? { ordem: corpo.ordem } : {}),
      ...(String(corpo.novo_titulo || "").trim() ? { novo_titulo: String(corpo.novo_titulo) } : {}),
    };
    const r = camada.nova || String(corpo.novo_titulo || "").trim() !== ""
      ? await pedirCamada(tok, "PATCH", "/acervo/nota", payload)
      : await moverNotaNoArquivo(org, payload);
    // Rota ausente no processo antigo: a ponte preserva o nome do arquivo.
    if (r.status === 404) return responder(await moverNotaNoArquivo(org, payload));
    return responder(r);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return erro(502, "a Arca não respondeu", { detalhe: msg.slice(0, 200) });
  }
}
