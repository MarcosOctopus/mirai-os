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
};

/** Grava a conexão no cofre da conta (chamado pelo retorno do consentimento). */
export function guardarGithubDaConta(userId: number, tokenCifrado: string, login: string): void {
  updateUserPlatformConfig(userId, {
    [CHAVE_GITHUB]: {
      token_cifrado: tokenCifrado,
      login: login || null,
      connected_at: new Date().toISOString(),
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
  };
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
  const g = copia[CHAVE_GITHUB];
  if (g && typeof g === "object") {
    const o = g as Record<string, unknown>;
    const semSegredo: Record<string, unknown> = {};
    for (const k of Object.keys(o)) {
      if (k !== "token_cifrado") semSegredo[k] = o[k];
    }
    copia[CHAVE_GITHUB] = semSegredo;
  }
  return copia;
}
