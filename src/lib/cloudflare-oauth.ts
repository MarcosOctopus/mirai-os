// CLOUDFLARE OAuth — "Conectar com Cloudflare" (dono, 09/10/2026).
//
// Por que este arquivo existe: o dono escolheu o BOTÃO — "In this case I prefer
// to connect the cloudflare button". Em vez de o cliente criar o registro A à
// mão, ele autoriza o Cloudflare e a gente cria o registro sozinho.
//
// COMO FOI DESENHADO (tudo conferido na fonte oficial antes de escrever):
//  - Cliente OAuth PÚBLICO + PKCE S256 (`token_endpoint_auth_method: "none"`,
//    `code_challenge_methods_supported: ["plain","S256"]` — visto no
//    `https://dash.cloudflare.com/.well-known/openid-configuration`).
//    Consequência prática: **não existe client secret**. O dono só precisa me
//    passar o CLIENT ID, que não é segredo.
//  - Endpoints oficiais (developers.cloudflare.com/fundamentals/oauth):
//    autorizar `https://dash.cloudflare.com/oauth2/auth`,
//    token     `https://dash.cloudflare.com/oauth2/token`.
//  - Escopos = mesmos nomes das permissões de token do CF: "Zone Read" e
//    "DNS Edit" (registrados NO CLIENTE; o consentimento mostra os obrigatórios).
//
// O `access_token` devolvido é SEGREDO: fica cifrado (`segredo-guardado.ts`) e
// nunca vai para log. Só é usado para criar/atualizar o registro A do domínio.
import { createHash, randomBytes } from "crypto";

export const CF_AUTORIZAR = "https://dash.cloudflare.com/oauth2/auth";
export const CF_TOKEN = "https://dash.cloudflare.com/oauth2/token";
export const CF_API = "https://api.cloudflare.com/client/v4";

/** Onde o Cloudflare devolve o cliente. Precisa bater EXATAMENTE com o cadastro.
 *  25/11/2026: era uma string fixa em app.miraitohope.com e não acompanhava a troca
 *  de domínio (todo o resto do app segue MIRAI_OIDC_REDIRECT). Agora vem do ambiente,
 *  por COLCHETE para não congelar no build. */
export const CF_VOLTA = process.env["CLOUDFLARE_REDIRECT_URI"] ||
  "https://app.miraitohope.com/api/oauth/cloudflare/volta";

/** O client id do nosso app no Cloudflare (não é segredo). */
export function clientId(): string {
  // Acesso por COLCHETE de propósito: assim o Next NÃO embute o valor no build
  // (com `process.env.X` ele congela em tempo de compilação) — dá para ligar o
  // Cloudflare depois, só reiniciando o app, sem rebuild.
  return process.env["CLOUDFLARE_OAUTH_CLIENT_ID"] || "";
}

// ─── O BILHETE DO CONSENTIMENTO ─────────────────────────────────────────────
// Entre "clicou no botão" e "voltou do Cloudflare" o navegador sai do nosso
// site. O que precisa sobreviver é: QUEM pediu (projeto ou o link do cliente),
// o `state` (anti-CSRF) e o verificador do PKCE. Vai tudo num cookie ASSINADO
// (HMAC do mesmo JWT_SECRET): sem a assinatura, o callback não confia em nada.
import { createHmac, timingSafeEqual } from "crypto";

const SEGREDO = process.env.JWT_SECRET || "dev-fallback-change-me";

export type Bilhete = { projetoId: string; state: string; verificador: string; volta: string };

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
    return { projetoId: j.projetoId, state: j.state, verificador: j.verificador, volta: j.volta || "/arquiteto" };
  } catch {
    return null;
  }
}

export function configurado(): boolean {
  return !!clientId();
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

/** A URL de consentimento do Cloudflare. */
export function urlDeAutorizacao(state: string, desafio: string): string {
  const p = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: CF_VOLTA,
    response_type: "code",
    state,
    code_challenge: desafio,
    code_challenge_method: "S256",
  });
  return `${CF_AUTORIZAR}?${p.toString()}`;
}

type RespostaToken = { access_token?: string; error?: string; error_description?: string };

/**
 * Troca o `code` pelo `access_token` (PKCE: manda o verificador, NÃO manda
 * segredo — o cliente é público). Nunca lança: erro volta como recado.
 */
export async function trocarCodigoPorToken(
  codigo: string,
  verificador: string,
): Promise<{ ok: true; token: string } | { ok: false; erro: string }> {
  try {
    const corpo = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId(),
      code: codigo,
      redirect_uri: CF_VOLTA,
      code_verifier: verificador,
    });
    const r = await fetch(CF_TOKEN, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: corpo.toString(),
      signal: AbortSignal.timeout(20000),
    });
    const j = (await r.json().catch(() => ({}))) as RespostaToken;
    if (!r.ok || !j.access_token) {
      return { ok: false, erro: j.error_description || j.error || `Cloudflare recusou (${r.status}).` };
    }
    return { ok: true, token: j.access_token };
  } catch {
    return { ok: false, erro: "Não consegui falar com o Cloudflare agora. Tente de novo." };
  }
}

type Zona = { id: string; name: string };

/** As zonas que este token enxerga. */
export async function zonasDoToken(
  token: string,
): Promise<{ ok: true; zonas: Zona[] } | { ok: false; erro: string }> {
  try {
    const r = await fetch(`${CF_API}/zones?per_page=50`, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      signal: AbortSignal.timeout(20000),
    });
    const j = (await r.json().catch(() => ({}))) as { result?: Zona[]; errors?: { message?: string }[] };
    if (!r.ok) {
      return { ok: false, erro: j.errors?.[0]?.message || `Cloudflare recusou (${r.status}).` };
    }
    return { ok: true, zonas: (j.result ?? []).map((z) => ({ id: z.id, name: z.name })) };
  } catch {
    return { ok: false, erro: "Não consegui listar os domínios no Cloudflare." };
  }
}

/** A zona que contém este domínio (o mais específico ganha). */
export function zonaParaDominio(zonas: Zona[], dominio: string): Zona | null {
  const d = dominio.toLowerCase();
  const candidatas = zonas
    .filter((z) => d === z.name.toLowerCase() || d.endsWith(`.${z.name.toLowerCase()}`))
    .sort((a, b) => b.name.length - a.name.length);
  return candidatas[0] ?? null;
}

type Registro = { id: string; type: string; name: string; content: string };

/**
 * Cria (ou atualiza) o registro A do domínio apontando para nós, em DNS-only.
 *
 * `proxied: false` é decisão, não detalhe: com a nuvem laranja ligada o DNS
 * devolve IP do Cloudflare e a conferência do fluxo nunca vira "apontando".
 * Idempotente: se já existe um A com esse nome, ATUALIZA em vez de duplicar.
 */
export async function apontarDominio(
  token: string,
  zonaId: string,
  nome: string,
  ip: string,
): Promise<{ ok: true; acao: "criado" | "atualizado"; nome: string } | { ok: false; erro: string }> {
  const cab = { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" };
  try {
    const busca = await fetch(
      `${CF_API}/zones/${zonaId}/dns_records?type=A&name=${encodeURIComponent(nome)}&per_page=5`,
      { headers: cab, signal: AbortSignal.timeout(20000) },
    );
    const jb = (await busca.json().catch(() => ({}))) as { result?: Registro[] };
    const existente = (jb.result ?? [])[0];

    const corpo = JSON.stringify({ type: "A", name: nome, content: ip, ttl: 1, proxied: false });
    const r = existente
      ? await fetch(`${CF_API}/zones/${zonaId}/dns_records/${existente.id}`, {
          method: "PUT",
          headers: cab,
          body: corpo,
          signal: AbortSignal.timeout(20000),
        })
      : await fetch(`${CF_API}/zones/${zonaId}/dns_records`, {
          method: "POST",
          headers: cab,
          body: corpo,
          signal: AbortSignal.timeout(20000),
        });
    const j = (await r.json().catch(() => ({}))) as { success?: boolean; errors?: { message?: string }[] };
    if (!r.ok || j.success === false) {
      return { ok: false, erro: j.errors?.[0]?.message || `Cloudflare recusou o registro (${r.status}).` };
    }
    return { ok: true, acao: existente ? "atualizado" : "criado", nome };
  } catch {
    return { ok: false, erro: "Não consegui criar o registro no Cloudflare agora." };
  }
}