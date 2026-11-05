// CLIENTE DA API DO GITHUB (dono, 09/10/2026).
//
// Por que este arquivo existe: depois que o cliente autoriza o GitHub
// (`github-oauth.ts`), o servidor passa a agir em nome dele — listar
// repositórios, ler a árvore, ler/escrever arquivos, criar branch e abrir pull
// request. Tudo isso bate em `https://api.github.com` com o token guardado
// (CIFRADO no banco; quem decifra é a rota, nunca este arquivo).
//
// REGRA DE OURO desta camada: NENHUMA função lança exceção para fora. Erro vira
// `{ ok: false, erro: "recado curto em PT-BR" }`. Quem chama (rota) nunca
// precisa de try/catch e a tela sempre tem o que mostrar.
//
// Cabeçalhos exigidos pela API (docs.github.com/rest): Bearer do token,
// `Accept: application/vnd.github+json`, a versão fixada `2022-11-28` e um
// `User-Agent` (o GitHub recusa requisição sem ele).
import { clientId } from "./github-oauth";

const API = "https://api.github.com";
const VERSAO_API = "2022-11-28";

function cabecalhos(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": VERSAO_API,
    "user-agent": "mirai-os",
  };
}

/** Codifica cada segmento do caminho sem estragar as barras (`a/b.ts`). */
function caminhoSeguro(caminho: string): string {
  return (caminho || "")
    .split("/")
    .filter((s) => s.length > 0)
    .map(encodeURIComponent)
    .join("/");
}

/** Extensões que tratamos como TEXTO (o resto é binário/asset). Heurística. */
const EXTENSOES_TEXTO = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "json", "md", "mdx", "txt", "css", "scss",
  "sass", "less", "html", "htm", "xml", "yml", "yaml", "toml", "ini", "env", "sh",
  "bash", "zsh", "py", "rb", "go", "rs", "java", "kt", "c", "h", "cpp", "hpp", "cs",
  "php", "swift", "sql", "graphql", "gql", "vue", "svelte", "astro", "svg", "csv",
  "tsv", "lock", "gitignore", "editorconfig", "prettierrc", "eslintrc",
]);

/** Um caminho parece ser um blob de TEXTO? (para não tentar decodificar imagem). */
function pareceTexto(caminho: string): boolean {
  const nome = (caminho || "").split("/").pop() || "";
  const ponto = nome.lastIndexOf(".");
  if (ponto <= 0) return true; // sem extensão (ex.: README, LICENSE) → tratamos como texto
  return EXTENSOES_TEXTO.has(nome.slice(ponto + 1).toLowerCase());
}

/**
 * TRADUZ O ERRO DO GITHUB (dono, 15/10/2026: *"já deixe o caminho da liberação do app"*).
 *
 * MEDIDO: com o token VIVO e correto, a escrita falhou com **403** — e a causa
 * não é token nem escopo: é POLÍTICA DA ORGANIZAÇÃO. Resposta crua do GitHub:
 *   "Although you appear to have the correct authorization credentials, the
 *    `<ORG>` organization has enabled OAuth App access restrictions, meaning
 *    that data access to third-parties is limited."
 *
 * Sem tradução isso chega como "o GitHub recusou (403)" — que não diz a ninguém
 * o que fazer. Aqui a resposta passa a TRAZER O CAMINHO, com DOIS endereços:
 *
 *  1. a página do PRÓPRIO APP na conta da pessoa — é onde aparece o NOME dele
 *     (para achar na lista da organização) e onde se PEDE o acesso à org;
 *  2. a página da ORGANIZAÇÃO onde o admin aprova.
 *
 * A ARMADILHA que motivou o segundo link (medido 15/10/2026): o dono aprovou e
 * continuou bloqueado. O manifesto cria um **GitHub App**, mas o token que
 * escreve nos repositórios é de um **OAuth App** — são coisas diferentes, com
 * telas diferentes ("Installed GitHub Apps" × "OAuth app policy"). Aprovar um não
 * libera o outro. O recado diz isso com todas as letras.
 */
function traduzErroGithub(status: number, msg: string): string {
  const m = msg || "";
  // A organização vem entre crases na própria mensagem do GitHub.
  const org = /`([^`]+)`\s+organization has enabled OAuth App access restrictions/i.exec(m)?.[1];
  if (org) {
    const id = (() => {
      try {
        return clientId();
      } catch {
        return "";
      }
    })();
    const paginaDoApp = id
      ? `\n1) Para ver o NOME deste app e pedir o acesso dele à organização:\n` +
        `https://github.com/settings/connections/applications/${encodeURIComponent(id)}\n`
      : "";
    return (
      `A organização **${org}** mantém restrição de apps OAuth: ela precisa aprovar este app antes de ` +
      `qualquer escrita nos repositórios dela. Não é o seu token (ele está válido) nem falta de ` +
      `permissão sua.\n` +
      paginaDoApp +
      `\n2) Quem aprova precisa ser admin da organização:\n` +
      `https://github.com/organizations/${encodeURIComponent(org)}/settings/oauth_application_policy\n\n` +
      `Na tela da organização, em "OAuth app policy", ache este app, clique em Review e depois em ` +
      `Grant access. É o app de **OAuth** (o que você autorizou ao conectar) — não confundir com o ` +
      `"GitHub App" em "Installed GitHub Apps", que é outro e não libera este acesso.`
    );
  }
  if (status === 401) {
    return "A conexão do GitHub desta conta não está mais válida — reconecte e eu sigo de onde parei.";
  }
  return "";
}

/** O recado do GitHub: TRADUZIDO quando é um caso conhecido, senão o dele mesmo. */
function erroDoGithub(status: number, msg: string, padrao: string): string {
  return traduzErroGithub(status, msg) || msg || padrao;
}

export type RepositorioResumo = {
  full_name: string;
  private: boolean;
  default_branch: string;
  updated_at: string;
  description: string | null;
};
/** Os repositórios que este token enxerga (mais recentes primeiro). */
export async function listarRepositorios(
  token: string,
): Promise<{ ok: true; repos: RepositorioResumo[] } | { ok: false; erro: string }> {
  try {
    const r = await fetch(`${API}/user/repos?per_page=100&sort=updated`, {
      headers: cabecalhos(token),
      signal: AbortSignal.timeout(20000),
    });
    const j = (await r.json().catch(() => null)) as
      | { message?: string }[]
      | { message?: string }
      | null;
    if (!r.ok || !Array.isArray(j)) {
      const msg = (!Array.isArray(j) && j && typeof j === "object" ? j.message : "") || "";
      return { ok: false, erro: erroDoGithub(r.status, msg, `O GitHub recusou a lista de repositórios (${r.status}).`) };
    }
    const repos = (j as Record<string, unknown>[]).map((x) => ({
      full_name: String(x.full_name ?? ""),
      private: Boolean(x.private),
      default_branch: String(x.default_branch ?? "main"),
      updated_at: String(x.updated_at ?? ""),
      description: typeof x.description === "string" ? x.description : null,
    }));
    return { ok: true, repos };
  } catch {
    return { ok: false, erro: "Não consegui listar os repositórios no GitHub agora." };
  }
}

export type CaminhoArvore = { caminho: string; texto: boolean; tamanho: number };

/** A árvore de arquivos de um repositório (recursiva), a partir de uma branch. */
export async function lerArvore(
  token: string,
  repo: string,
  branch: string,
): Promise<{ ok: true; caminhos: CaminhoArvore[] } | { ok: false; erro: string }> {
  try {
    const ref = encodeURIComponent(branch || "main");
    const r = await fetch(`${API}/repos/${repo}/git/trees/${ref}?recursive=1`, {
      headers: cabecalhos(token),
      signal: AbortSignal.timeout(20000),
    });
    const j = (await r.json().catch(() => ({}))) as {
      tree?: { path?: string; type?: string; size?: number }[];
      message?: string;
    };
    if (!r.ok || !Array.isArray(j.tree)) {
      return { ok: false, erro: erroDoGithub(r.status, j.message || "", `O GitHub recusou a árvore do repositório (${r.status}).`) };
    }
    // Só os ARQUIVOS (blobs): a árvore traz também os diretórios (`tree`).
    const caminhos = j.tree
      .filter((e) => e.type === "blob" && typeof e.path === "string" && e.path)
      .map((e) => ({
        caminho: e.path as string,
        texto: pareceTexto(e.path as string),
        tamanho: typeof e.size === "number" ? e.size : 0,
      }));
    return { ok: true, caminhos };
  } catch {
    return { ok: false, erro: "Não consegui ler a árvore do repositório no GitHub." };
  }
}

/** Lê um arquivo: devolve o conteúdo já decodificado (base64 → utf8) e o sha. */
export async function lerArquivo(
  token: string,
  repo: string,
  caminho: string,
  ref?: string,
): Promise<{ ok: true; conteudo: string; sha: string } | { ok: false; erro: string }> {
  try {
    const busca = ref ? `?ref=${encodeURIComponent(ref)}` : "";
    const r = await fetch(`${API}/repos/${repo}/contents/${caminhoSeguro(caminho)}${busca}`, {
      headers: cabecalhos(token),
      signal: AbortSignal.timeout(20000),
    });
    if (r.status === 404) return { ok: false, erro: "Arquivo não encontrado no repositório." };
    const j = (await r.json().catch(() => ({}))) as {
      content?: string;
      encoding?: string;
      sha?: string;
      message?: string;
    };
    if (!r.ok || typeof j.content !== "string") {
      return { ok: false, erro: erroDoGithub(r.status, j.message || "", `O GitHub recusou a leitura do arquivo (${r.status}).`) };
    }
    // O conteúdo vem em base64 (com quebras de linha) — decodifica para texto.
    const conteudo = Buffer.from(j.content.replace(/\n/g, ""), "base64").toString("utf8");
    return { ok: true, conteudo, sha: j.sha || "" };
  } catch {
    return { ok: false, erro: "Não consegui ler o arquivo no GitHub agora." };
  }
}

/**
 * Escreve (cria ou ATUALIZA) um arquivo numa branch. Se o arquivo já existe,
 * busca o `sha` atual — o GitHub exige o sha para atualizar (sem ele, recusa).
 * `mensagem` é a mensagem do commit.
 */
export async function escreverArquivo(
  token: string,
  repo: string,
  caminho: string,
  conteudo: string,
  mensagem: string,
  branch: string,
): Promise<{ ok: true; sha: string } | { ok: false; erro: string }> {
  try {
    // O sha atual: só existe se o arquivo já está na branch. 404 = criar.
    let sha: string | undefined;
    const atual = await fetch(
      `${API}/repos/${repo}/contents/${caminhoSeguro(caminho)}?ref=${encodeURIComponent(branch)}`,
      { headers: cabecalhos(token), signal: AbortSignal.timeout(20000) },
    );
    if (atual.ok) {
      const ja = (await atual.json().catch(() => ({}))) as { sha?: string };
      if (typeof ja.sha === "string") sha = ja.sha;
    }

    const corpo: Record<string, unknown> = {
      message: mensagem,
      content: Buffer.from(conteudo, "utf8").toString("base64"),
      branch,
    };
    if (sha) corpo.sha = sha;

    const r = await fetch(`${API}/repos/${repo}/contents/${caminhoSeguro(caminho)}`, {
      method: "PUT",
      headers: { ...cabecalhos(token), "content-type": "application/json" },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(20000),
    });
    const j = (await r.json().catch(() => ({}))) as { content?: { sha?: string }; message?: string };
    if (!r.ok) {
      return { ok: false, erro: erroDoGithub(r.status, j.message || "", `O GitHub recusou a escrita do arquivo (${r.status}).`) };
    }
    return { ok: true, sha: j.content?.sha || "" };
  } catch {
    return { ok: false, erro: "Não consegui escrever o arquivo no GitHub agora." };
  }
}

/** Cria uma branch nova a partir de um commit (`deSha`). */
export async function criarBranch(
  token: string,
  repo: string,
  nome: string,
  deSha: string,
): Promise<{ ok: true; ref: string } | { ok: false; erro: string }> {
  try {
    const r = await fetch(`${API}/repos/${repo}/git/refs`, {
      method: "POST",
      headers: { ...cabecalhos(token), "content-type": "application/json" },
      body: JSON.stringify({ ref: `refs/heads/${nome}`, sha: deSha }),
      signal: AbortSignal.timeout(20000),
    });
    const j = (await r.json().catch(() => ({}))) as { ref?: string; message?: string };
    if (!r.ok) {
      return { ok: false, erro: erroDoGithub(r.status, j.message || "", `O GitHub recusou criar a branch (${r.status}).`) };
    }
    return { ok: true, ref: j.ref || `refs/heads/${nome}` };
  } catch {
    return { ok: false, erro: "Não consegui criar a branch no GitHub agora." };
  }
}

/** Abre um pull request de `head` para `base`. */
export async function abrirPullRequest(
  token: string,
  repo: string,
  titulo: string,
  head: string,
  base: string,
  corpo: string,
): Promise<{ ok: true; numero: number; url: string } | { ok: false; erro: string }> {
  try {
    const r = await fetch(`${API}/repos/${repo}/pulls`, {
      method: "POST",
      headers: { ...cabecalhos(token), "content-type": "application/json" },
      body: JSON.stringify({ title: titulo, head, base, body: corpo }),
      signal: AbortSignal.timeout(20000),
    });
    const j = (await r.json().catch(() => ({}))) as {
      number?: number;
      html_url?: string;
      message?: string;
    };
    if (!r.ok || typeof j.number !== "number") {
      return { ok: false, erro: erroDoGithub(r.status, j.message || "", `O GitHub recusou abrir o pull request (${r.status}).`) };
    }
    return { ok: true, numero: j.number, url: j.html_url || "" };
  } catch {
    return { ok: false, erro: "Não consegui abrir o pull request no GitHub agora." };
  }
}

/**
 * BAIXA O REPOSITÓRIO COMO TARBALL — UMA requisição (dono, 15/10/2026).
 *
 * POR QUE EXISTE: a primeira versão do import pelo token lia a árvore e pedia
 * arquivo por arquivo. Medido no `flowiseai/flowise`: o pedido passou de 290
 * segundos e estourou o tempo da conversa — porque são CENTENAS de idas e voltas
 * à API. O GitHub oferece o repositório inteiro num único `.tar.gz`
 * (`/repos/{dono}/{repo}/tarball/{ref}`), e o token vale nesse endereço: uma
 * requisição, repositório privado incluído.
 *
 * O freio continua sendo o que FICA guardado (`colherArquivos` + tetos) — não o
 * tamanho do download. É o download que pode ser generoso; o que fica, não.
 */
export async function baixarTarball(
  token: string,
  repo: string,
  ref: string,
): Promise<{ ok: true; bytes: Buffer } | { ok: false; erro: string }> {
  try {
    const r = await fetch(`${API}/repos/${repo}/tarball/${encodeURIComponent(ref)}`, {
      headers: cabecalhos(token),
      // O GitHub responde 302 para o `codeload` — seguir é o caminho normal.
      redirect: "follow",
      signal: AbortSignal.timeout(180000),
    });
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { message?: string };
      return {
        ok: false,
        erro: erroDoGithub(r.status, j.message || "", `O GitHub recusou baixar o repositório (${r.status}).`),
      };
    }
    const bytes = Buffer.from(await r.arrayBuffer());
    if (!bytes.length) return { ok: false, erro: "o GitHub devolveu o repositório vazio" };
    return { ok: true, bytes };
  } catch {
    return { ok: false, erro: "não consegui baixar o repositório do GitHub agora" };
  }
}

/** Quem é o dono deste token (o `login` que guardamos junto da conexão). */
export async function usuarioDoToken(
  token: string,
): Promise<{ ok: true; login: string } | { ok: false; erro: string }> {
  try {
    const r = await fetch(`${API}/user`, {
      headers: cabecalhos(token),
      signal: AbortSignal.timeout(20000),
    });
    const j = (await r.json().catch(() => ({}))) as { login?: string; message?: string };
    if (!r.ok || typeof j.login !== "string") {
      return { ok: false, erro: j.message || `O GitHub recusou ler o perfil (${r.status}).` };
    }
    return { ok: true, login: j.login };
  } catch {
    return { ok: false, erro: "Não consegui ler o perfil no GitHub agora." };
  }
}

/**
 * O REPOSITÓRIO: existe? qual a branch padrão? (dono, 15/10/2026)
 *
 * Por que existe: subir arquivo exige saber em QUE branch escrever. Chutar "main"
 * funciona em repositório novo e FALHA em repositório que nasceu "master" — e o
 * erro que o GitHub devolve ("Branch not found") não diz o que fazer. Aqui a
 * pergunta é feita ao próprio GitHub, uma vez, e a resposta é a verdade do repo.
 *
 * 404 = não existe OU o token não alcança (o GitHub não distingue os dois de
 * propósito). A mensagem diz exatamente isso, sem inventar qual dos dois é.
 */
export async function repositorio(
  token: string,
  repo: string,
): Promise<
  { ok: true; fullName: string; branchPadrao: string; privado: boolean } | { ok: false; erro: string }
> {
  const nome = (repo || "").trim().replace(/^\/+|\/+$/g, "");
  if (!nome || !nome.includes("/")) {
    return { ok: false, erro: "o repositório precisa ser 'dono/repo'." };
  }
  try {
    const r = await fetch(`${API}/repos/${nome}`, {
      headers: cabecalhos(token),
      signal: AbortSignal.timeout(20000),
    });
    const j = (await r.json().catch(() => ({}))) as {
      full_name?: string;
      default_branch?: string;
      private?: boolean;
      message?: string;
    };
    if (r.status === 404) {
      return {
        ok: false,
        erro:
          `não achei o repositório '${nome}'. Ou ele não existe, ou a conexão de GitHub ` +
          `desta conta não tem acesso a ele (o GitHub responde igual nos dois casos).`,
      };
    }
    if (!r.ok) {
      return { ok: false, erro: erroDoGithub(r.status, j.message || "", `O GitHub recusou ler o repositório (${r.status}).`) };
    }
    return {
      ok: true,
      fullName: j.full_name || nome,
      branchPadrao: j.default_branch || "main",
      privado: Boolean(j.private),
    };
  } catch {
    return { ok: false, erro: "Não consegui falar com o GitHub agora." };
  }
}
