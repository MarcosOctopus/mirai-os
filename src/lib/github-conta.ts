/**
 * A CONEXÃO DE GITHUB DA CONTA (dono, 13/10/2026).
 *
 * Pedido do dono, verbatim: "tem que liberar dentro de integrações só pro cara
 * entrar com auth do git dele e entrar e já ficar integrado pra tudo".
 *
 * Antes disto o GitHub era POR PROJETO: cada projeto pedia o consentimento de
 * novo e guardava o token na própria linha (`arquiteto_projetos`). Agora a
 * pessoa conecta UMA vez, em Integrações, e o token fica no cofre DESTA conta
 * (`users.platform_config`) — valendo para todos os projetos dela.
 *
 * O token é SEGREDO: vive CIFRADO (`segredo-guardado.ts`), nunca vai para log e
 * NUNCA é devolvido ao navegador (ver a limpeza em `/api/auth/me`).
 *
 * A leitura de "está conectada?" é a MESMA função que a tela usa
 * (`estaLigada`, via `chaveConfig: "github"` no catálogo) — não há duas
 * verdades sobre o mesmo estado.
 */
import { getUserPlatformConfig, updateUserPlatformConfig } from "./auth";

/** A chave no cofre da conta. É a mesma do `chaveConfig` no catálogo. */
export const CHAVE_GITHUB = "github";

export type GithubDaConta = {
  /** o blob CIFRADO (o servidor decifra só na hora de usar). */
  tokenCifrado: string;
  login: string | null;
  em: string | null;
  /** O `refresh_token` CIFRADO, quando o GitHub deu um. */
  refreshCifrado: string | null;
  /** ISO-8601 de quando o token vence; `null` = sem prazo declarado. */
  expiraEm: string | null;
};

/** Grava a conexão no cofre da conta (chamado pelo retorno do consentimento). */
export function guardarGithubDaConta(
  userId: number,
  tokenCifrado: string,
  login: string,
  refreshCifrado: string | null = null,
  expiraEm: string | null = null,
): void {
  updateUserPlatformConfig(userId, {
    [CHAVE_GITHUB]: {
      token_cifrado: tokenCifrado,
      login: login || null,
      connected_at: new Date().toISOString(),
      refresh_cifrado: refreshCifrado,
      expira_em: expiraEm,
    },
  });
}

/** A conexão da conta, ou null se não houver. Nunca inventa: só lê o que existe. */
export function githubDaConta(userId: number): GithubDaConta | null {
  const config = getUserPlatformConfig(userId) as Record<string, unknown>;
  const v = config?.[CHAVE_GITHUB];
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.token_cifrado !== "string" || !o.token_cifrado) return null;
  return {
    tokenCifrado: o.token_cifrado,
    login: typeof o.login === "string" ? o.login : null,
    em: typeof o.connected_at === "string" ? o.connected_at : null,
    refreshCifrado: typeof o.refresh_cifrado === "string" && o.refresh_cifrado ? o.refresh_cifrado : null,
    expiraEm: typeof o.expira_em === "string" ? o.expira_em : null,
  };
}

/**
 * O TOKEN VÁLIDO da conta — o ÚNICO lugar que decide se precisa renovar.
 *
 * Por que existe (16/10/2026): o `access_token` do GitHub pode ter prazo, e o
 * app guardava só ele. Medido: as duas conexões do app estavam em 401
 * `Bad credentials` com a tela dizendo "conectado" — a pessoa pedia algo no
 * chat e recebia "reconecte" sem nunca ter visto a conexão cair. Aqui, antes de
 * entregar o token, ele é renovado se venceu; o novo par é gravado no cofre.
 *
 * Devolve `null` só quando NÃO HÁ conexão. Se houver e a renovação falhar,
 * devolve o token atual (o consumidor trata o 401 e manda reconectar) — nunca
 * inventa, nunca esconde.
 */
export async function tokenGithubDaConta(userId: number): Promise<string | null> {
  const { decifrar, cifrar } = await import("./segredo-guardado");
  const c = githubDaConta(userId);
  if (!c) return null;

  const atual = decifrar(c.tokenCifrado);
  if (!atual) return null;

  const venceu = c.expiraEm ? Date.parse(c.expiraEm) <= Date.now() : false;
  if (!venceu) return atual;

  const refresh = c.refreshCifrado ? decifrar(c.refreshCifrado) : null;
  if (!refresh) return atual;

  const { renovarTokenGithub } = await import("./github-oauth");
  const r = await renovarTokenGithub(refresh);
  if (!r.ok) return atual;

  // O refresh do GitHub é de uso único: guarda o par NOVO (o antigo morre).
  guardarGithubDaConta(
    userId,
    cifrar(r.token),
    c.login || "",
    r.refreshToken ? cifrar(r.refreshToken) : null,
    r.expiraEm,
  );
  return r.token;
}

/** Desconecta (o dono tirou o GitHub da conta). Grava `null`: a chave some da
 *  leitura sem apagar o resto do cofre — `updateUserPlatformConfig` mescla. */
export function esquecerGithubDaConta(userId: number): void {
  updateUserPlatformConfig(userId, { [CHAVE_GITHUB]: null });
}

/**
 * O cofre da conta SEM o segredo, para ir ao navegador.
 *
 * O token é CIFRADO, mas nem o cifrado precisa sair do servidor: a tela só
 * precisa saber QUE a conexão existe — `estaLigada` lê a presença da chave, não
 * o valor. Assim o navegador nunca recebe nem o blob (dono, 13/10/2026).
 */
export function cofreSemSegredos(config: Record<string, unknown>): Record<string, unknown> {
  const copia: Record<string, unknown> = { ...config };
  // Cada provedor diz aqui QUAIS chaves são segredo. O navegador recebe só o
  // que a tela precisa saber (que a conexão existe) — nem o blob cifrado sai.
  const SEGREDOS: Record<string, string[]> = {
    [CHAVE_GITHUB]: ["token_cifrado", "refresh_cifrado"],
    // Canva (19/10/2026): conexão POR PESSOA, guarda access + refresh cifrados.
    canva: ["token_cifrado", "refresh_cifrado"],
    // Arca (17/11/2026): o token da organização da pessoa, cifrado. A tela só
    // precisa saber QUE existe (o painel mostra org + digital); o token em si,
    // quando a pessoa quer copiar, sai pela rota própria da Arca.
    arca: ["token_cifrado"],
  };
  for (const [chave, campos] of Object.entries(SEGREDOS)) {
    const v = copia[chave];
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    const semSegredo: Record<string, unknown> = {};
    for (const k of Object.keys(o)) {
      if (!campos.includes(k)) semSegredo[k] = o[k];
    }
    copia[chave] = semSegredo;
  }
  return copia;
}

/** Um repositório como a LISTA mostra — só o que o GitHub devolve, nada inventado. */
export type RepoDaConta = {
  nome: string;
  slug: string;
  privado: boolean;
  descricao: string;
  linguagem: string;
  atualizado_em: string;
};

/**
 * LISTA os repositórios de uma CONTA (organização ou usuário) — dono, 16/10/2026.
 *
 * Pedido do dono, verbatim: *"apaga e acerta isso"* — sobre o cliente que colou
 * `https://github.com/orgs/Mesh2Motion/repositories` e recebeu *"não achei o
 * repositório 'orgs/Mesh2Motion'"*. Quem cola a URL de uma organização quer VER os
 * repositórios dela e escolher. Devolver erro ali é devolver o trabalho.
 *
 * A consulta é a API do GitHub, COM o token da conta quando existe: sem token, só
 * os públicos; com token, também os privados que a pessoa enxerga. Nunca lança —
 * devolve `{ok:false}` com um motivo que a tela pode mostrar.
 */
export async function listarReposDoDono(
  dono: string,
  token: string | null,
): Promise<{ ok: true; repos: RepoDaConta[] } | { ok: false; erro: string; precisa_token: boolean }> {
  const cab: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "mirai-arquiteto",
  };
  if (token) cab.Authorization = `Bearer ${token}`;

  // `/orgs/<dono>/repos` cobre ORGANIZAÇÃO; `/users/<dono>/repos` cobre usuário. A
  // tela não sabe qual dos dois é, então tenta a organização primeiro e cai para o
  // usuário — um 404 no primeiro não é erro, é "não é organização".
  const urls = [
    `https://api.github.com/orgs/${encodeURIComponent(dono)}/repos?per_page=100&sort=updated`,
    `https://api.github.com/users/${encodeURIComponent(dono)}/repos?per_page=100&sort=updated`,
  ];

  let motivo = "";
  let recusou = false;
  for (const url of urls) {
    try {
      const r = await fetch(url, { headers: cab, signal: AbortSignal.timeout(12000) });
      if (r.status === 404) {
        motivo = `não achei a conta "${dono}" no GitHub`;
        continue;
      }
      if (r.status === 401) {
        recusou = true;
        motivo = "a conexão de GitHub desta conta não vale mais — reconecte em Integrações";
        continue;
      }
      if (r.status === 403) {
        recusou = true;
        motivo = "o GitHub recusou a consulta (permissão ou limite) — tente de novo em instantes";
        continue;
      }
      if (!r.ok) {
        motivo = `o GitHub respondeu ${r.status}`;
        continue;
      }
      const lista = (await r.json()) as unknown;
      if (!Array.isArray(lista)) {
        motivo = "resposta inesperada do GitHub";
        continue;
      }
      const repos: RepoDaConta[] = lista
        .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
        .map((x) => ({
          nome: String(x.name || ""),
          slug: `${dono}/${String(x.name || "")}`,
          privado: x.private === true,
          descricao: typeof x.description === "string" ? x.description : "",
          linguagem: typeof x.language === "string" ? x.language : "",
          atualizado_em: typeof x.updated_at === "string" ? x.updated_at : "",
        }))
        .filter((x) => x.nome);
      return { ok: true, repos };
    } catch (e) {
      motivo = e instanceof Error ? e.message : "falha de rede";
    }
  }
  return {
    ok: false,
    erro: motivo || "não consegui listar os repositórios",
    precisa_token: recusou,
  };
}
