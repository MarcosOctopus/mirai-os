// 🔗 Conta Mirai (OIDC) — o app deixa de ter senha própria.
//
// Quem decide SE a pessoa entrou é o id.miraitohope.com. Aqui mora só o que é
// preciso para: começar o pedido (start), conferir a volta (callback) e provar
// que o id_token veio mesmo dele (assinatura contra o JWKS público).
//
// Nada de senha trafegando pelo app. O `client_secret` vive no .env.local (600)
// e só é usado na troca do código, server-side.
import { SignJWT, jwtVerify, createRemoteJWKSet } from "jose";

const ISSUER = process.env.MIRAI_OIDC_ISSUER || "https://id.miraitohope.com";
const CLIENT_ID = process.env.MIRAI_OIDC_CLIENT_ID || "";
const CLIENT_SECRET = process.env.MIRAI_OIDC_CLIENT_SECRET || "";
const REDIRECT = process.env.MIRAI_OIDC_REDIRECT || "";

export const MIRAI = { ISSUER, CLIENT_ID, CLIENT_SECRET, REDIRECT };

// Onde o navegador da pessoa está, de fato. O servidor roda atrás do túnel e
// enxerga a si mesmo como `localhost:3333` — redirecionar para ali manda o
// visitante para um endereço que não existe na máquina dele. A origem pública
// sai da própria redirect_uri registrada, então não depende de header nenhum.
export function origemPublica(): string | null {
  try {
    return new URL(REDIRECT).origin;
  } catch {
    return null;
  }
}

export function destino(caminho: string, urlDaRequisicao: string): URL {
  return new URL(caminho, origemPublica() || urlDaRequisicao);
}

export function configurado(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET && REDIRECT);
}

// Chaves públicas do Conta Mirai — cacheadas; é contra elas que a assinatura
// do id_token é conferida. Token assinado por outra chave não passa.
export const JWKS = createRemoteJWKSet(
  new URL(`${ISSUER}/.well-known/jwks.json`),
  { cacheMaxAge: 10 * 60 * 1000 },
);

// ─── Bilhete de ida e volta (state + nonce + pkce), assinado por nós ───────
// Sem ele, um `code` devolvido por terceiro não fecha: o state tem que casar
// com o bilhete que ESTE navegador recebeu.
export type Bilhete = { state: string; nonce: string; verifier: string; next: string };

function segredoBilhete(): Uint8Array {
  return new TextEncoder().encode(`${process.env.JWT_SECRET || "fallback"}:mirai-oidc`);
}

export async function assinarBilhete(b: Bilhete): Promise<string> {
  return new SignJWT({ ...b })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(segredoBilhete());
}

export async function lerBilhete(t?: string): Promise<Bilhete | null> {
  if (!t) return null;
  try {
    const { payload } = await jwtVerify(t, segredoBilhete());
    return payload as unknown as Bilhete;
  } catch {
    return null;
  }
}

// ─── PKCE ─────────────────────────────────────────────────────────────────
function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function novoVerifier(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function desafio(verifier: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(d));
}

// ─── Troca do código por tokens (server-side, com o nosso segredo) ────────
export async function trocarCodigo(
  code: string,
  verifier: string,
): Promise<{ id_token?: string }> {
  const r = await fetch(`${ISSUER}/v1/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code_verifier: verifier,
    }),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`troca recusada (${r.status})`);
  return (await r.json()) as { id_token?: string };
}

// ─── Conferência do id_token ──────────────────────────────────────────────
export type ClaimsMirai = {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  email_verified?: boolean;
};

export async function conferirIdToken(
  idToken: string,
  nonce: string,
): Promise<ClaimsMirai> {
  if (!idToken) throw new Error("sem id_token");
  const { payload } = await jwtVerify(idToken, JWKS, {
    issuer: ISSUER,
    audience: CLIENT_ID,
  });
  if (!payload.email) throw new Error("id_token sem e-mail");
  if (nonce && payload.nonce !== nonce) throw new Error("nonce não confere");
  return payload as unknown as ClaimsMirai;
}
