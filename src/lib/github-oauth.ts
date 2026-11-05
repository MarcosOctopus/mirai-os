// GITHUB OAuth — "Conectar com GitHub" (dono, 09/10/2026).
//
// Por que este arquivo existe: espelha o OAuth do Cloudflare
// (`cloudflare-oauth.ts`), que já está provado nesta semana. O cliente autoriza
// o GitHub e a gente passa a agir em nome dele (ler repositórios, escrever
// arquivos, abrir pull request) — sem ele criar token à mão.
//
// COMO FOI DESENHADO (conferido na fonte oficial antes de escrever):
//  - Endpoints oficiais (docs.github.com/apps/oauth-apps):
//    autorizar `https://github.com/login/oauth/authorize`,
//    token     `https://github.com/login/oauth/access_token`.
//  - DIFERENÇA DO CLOUDFLARE: o GitHub NÃO é cliente público — o
//    `access_token` exige o `client_secret` junto do `code`. Então aqui existem
//    DOIS segredos de configuração (id e secret), ao contrário do Cloudflare
//    (só o id). O PKCE é enviado junto (o GitHub aceita `code_verifier`), mas
//    quem garante a troca é o par id+secret.
//  - Escopo pedido: `repo read:user` — ler/escrever repositórios e ler o perfil
//    (para saber o login de quem conectou).
//
// O `access_token` devolvido é SEGREDO: fica cifrado (`segredo-guardado.ts`) e
// nunca vai para log. Só é usado pelo servidor para falar com a API do GitHub.
import { createHash, randomBytes } from "crypto";

import { basePublica } from "./base-publica";
import { lerConfig } from "./plataforma-config";

export const GH_AUTORIZAR = "https://github.com/login/oauth/authorize";
export const GH_TOKEN = "https://github.com/login/oauth/access_token";
export const GH_API = "https://api.github.com";

/** Escopo pedido no consentimento: repositórios + leitura do perfil. */
export const GH_ESCOPO = "repo read:user";

/**
 * O client id do nosso app no GitHub (não é segredo).
 *
 * Ordem de confiança (dono, 09/10/2026 — FLUXO DE MANIFESTO): se a variável de
 * ambiente existir, ela manda (o fluxo antigo continua funcionando igual). Sem
 * env, cai para a CONFIG DO BANCO — que é onde o app criado pelo manifesto
 * guarda o `client_id`. Assim o fluxo novo passa a funcionar sozinho, sem o dono
 * colar nada.
 */
export function clientId(): string {
  // Acesso por COLCHETE de propósito: assim o Next NÃO embute o valor no build
  // (com `process.env.X` ele congela em tempo de compilação) — dá para ligar o
  // GitHub depois, só reiniciando o app, sem rebuild.
  const env = process.env["GITHUB_OAUTH_CLIENT_ID"];
  if (env) return env;
  try {
    return lerConfig("github_app_client_id") || "";
  } catch {
    return "";
  }
}

/** O client secret do nosso app no GitHub (SEGREDO — só o servidor usa). */
export function clientSecret(): string {
  // Mesma razão do `clientId`: colchete para não congelar no build; e mesma
  // queda para a config do banco quando a env está vazia.
  const env = process.env["GITHUB_OAUTH_CLIENT_SECRET"];
  if (env) return env;
  try {
    return lerConfig("github_app_client_secret") || "";
  } catch {
    return "";
  }
}

/**
 * O endereço de volta do consentimento. Vem SEMPRE do endereço PÚBLICO
 * (`base-publica.ts`), nunca do host da requisição: o servidor roda atrás do
 * túnel e enxerga a si mesmo como `localhost` — quem autoriza precisa voltar
 * para o endereço que existe no navegador dele.
 */
export function urlDeVolta(req: { headers: { get(n: string): string | null } }): string {
  return `${basePublica(req)}/api/oauth/github/volta`;
}

// ─── O BILHETE DO CONSENTIMENTO ─────────────────────────────────────────────
// Entre "clicou no botão" e "voltou do GitHub" o navegador sai do nosso site. O
// que precisa sobreviver é: QUEM pediu (projeto ou o link do cliente), o `state`
// (anti-CSRF) e o verificador do PKCE. Vai tudo num cookie ASSINADO (HMAC do
// mesmo JWT_SECRET): sem a assinatura, o callback não confia em nada.
import { createHmac, timingSafeEqual } from "crypto";

const SEGREDO = process.env.JWT_SECRET || "dev-fallback-change-me";

export type Bilhete = {
  /** vazio = conexão da CONTA (vale para TODOS os projetos dela). */
  projetoId: string;
  state: string;
  verificador: string;
  volta: string;
  /** quem pediu a conexão da conta — o callback é rota pública, sem sessão. */
  userId?: number;
};

export function assinarBilhete(b: Bilhete): string {
  const p = Buffer.from(JSON.stringify(b)).toString("base64url");
  const s = createHmac("sha256", SEGREDO).update(p).digest("base64url");
  return `${p}.${s}`;
}

export function lerBilhete(cookie: string | null | undefined): Bilhete | null {
  if (typeof cookie !== "string" || cookie.split(".").length !== 2) return null;
  const [p, s] = cookie.split(".");
  const esperado = createHmac("sha256", SEGREDO).update(p).digest("base64url");
  const a = Buffer.from(s);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const j = JSON.parse(Buffer.from(p, "base64url").toString("utf8")) as Partial<Bilhete>;
    if (typeof j.projetoId !== "string" || typeof j.state !== "string" || typeof j.verificador !== "string") {
      return null;
    }
    return {
      projetoId: j.projetoId,
      state: j.state,
      verificador: j.verificador,
      volta: j.volta || "/arquiteto",
      userId: typeof j.userId === "number" ? j.userId : undefined,
    };
  } catch {
    return null;
  }
}

export function configurado(): boolean {
  return !!clientId() && !!clientSecret();
}

/** Verificador do PKCE (43–128 chars, aleatório) e o desafio S256. */
export function novoVerificador(): string {
  return randomBytes(48).toString("base64url");
}

export function desafioDe(verificador: string): string {
  return createHash("sha256").update(verificador).digest("base64url");
}

export function estadoAleatorio(): string {
  return randomBytes(24).toString("base64url");
}

/** A URL de consentimento do GitHub. `volta` tem de bater com a do token. */
export function urlDeAutorizacao(state: string, desafio: string, volta: string): string {
  const p = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: volta,
    scope: GH_ESCOPO,
    state,
    code_challenge: desafio,
    code_challenge_method: "S256",
  });
  return `${GH_AUTORIZAR}?${p.toString()}`;
}

type RespostaToken = {
  access_token?: string;
  /**
   * O GitHub devolve `refresh_token` quando o OAuth App tem **tokens
   * expiráveis** ligados. Sem guardá-lo, a conexão morre no vencimento e o app
   * continua dizendo "conectado" — medido em 16/10/2026: dois tokens em 401
   * `Bad credentials` com a tela afirmando que estavam ligados.
   */
  refresh_token?: string;
  /** Segundos de vida do `access_token`. Ausente = token sem prazo. */
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

/** O que uma troca/renovação devolve: o token e como renová-lo depois. */
export type TokenTrocado = {
  token: string;
  refreshToken: string | null;
  /** ISO-8601 do vencimento, ou `null` quando o GitHub não declara prazo. */
  expiraEm: string | null;
};

/** Traduz a resposta do GitHub para o formato da casa. */
function comoToken(j: RespostaToken): TokenTrocado {
  const segundos = Number(j.expires_in);
  return {
    token: String(j.access_token),
    refreshToken: typeof j.refresh_token === "string" && j.refresh_token ? j.refresh_token : null,
    // Margem de 60s: renovar ANTES de vencer evita o 401 na primeira chamada.
    expiraEm: Number.isFinite(segundos) && segundos > 0
      ? new Date(Date.now() + (segundos - 60) * 1000).toISOString()
      : null,
  };
}

/**
 * Troca o `code` pelo `access_token`. Diferente do Cloudflare, o GitHub EXIGE o
 * `client_secret` (não é cliente público). Mandamos também o `code_verifier`
 * (PKCE) e o MESMO `redirect_uri` usado no consentimento. Nunca lança: erro
 * volta como recado em PT-BR.
 */
export async function trocarCodigoPorToken(
  codigo: string,
  verificador: string,
  volta: string,
): Promise<({ ok: true } & TokenTrocado) | { ok: false; erro: string }> {
  try {
    const r = await fetch(GH_TOKEN, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        client_id: clientId(),
        client_secret: clientSecret(),
        code: codigo,
        redirect_uri: volta,
        code_verifier: verificador,
      }),
      signal: AbortSignal.timeout(20000),
    });
    const j = (await r.json().catch(() => ({}))) as RespostaToken;
    if (!r.ok || !j.access_token) {
      return { ok: false, erro: j.error_description || j.error || `GitHub recusou (${r.status}).` };
    }
    return { ok: true, ...comoToken(j) };
  } catch {
    return { ok: false, erro: "Não consegui falar com o GitHub agora. Tente de novo." };
  }
}

/**
 * RENOVA o token a partir do `refresh_token` (GitHub, `grant_type=refresh_token`).
 *
 * Existe porque o `access_token` do GitHub pode ter prazo: sem esta renovação a
 * conexão da pessoa morre sozinha e o app segue dizendo "conectado" — o defeito
 * medido em 16/10/2026. Nunca lança: erro volta como recado em PT-BR.
 */
export async function renovarTokenGithub(
  refreshToken: string,
): Promise<({ ok: true } & TokenTrocado) | { ok: false; erro: string }> {
  try {
    const r = await fetch(GH_TOKEN, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        client_id: clientId(),
        client_secret: clientSecret(),
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
      signal: AbortSignal.timeout(20000),
    });
    const j = (await r.json().catch(() => ({}))) as RespostaToken;
    if (!r.ok || !j.access_token) {
      return { ok: false, erro: j.error_description || j.error || `GitHub recusou a renovação (${r.status}).` };
    }
    return { ok: true, ...comoToken(j) };
  } catch {
    return { ok: false, erro: "Não consegui falar com o GitHub para renovar agora." };
  }
}
