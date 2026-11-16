import crypto from "node:crypto";

import { basePublica } from "@/lib/base-publica";

/**
 * google-oauth.ts — o corredor de INTEGRAÇÃO com o Google (não é login).
 *
 * Diferença que importa: /api/auth/google usa "openid email profile" e serve para
 * ENTRAR no app. Aqui o escopo inclui Gmail, para a Mirai LER e ENVIAR email em
 * nome da pessoa. São consentimentos diferentes e não se misturam.
 *
 * Decisões:
 *  - `access_type=offline` + `prompt=consent`: sem isso o Google NÃO devolve
 *    refresh_token, e a conexão morre em 1h fingindo estar viva (foi o defeito
 *    medido no GitHub em 16/10/2026 — não repetir).
 *  - `state` vai num cookie ASSINADO (HMAC), httpOnly: o callback não confia em
 *    nada que venha da URL.
 *  - Nenhum segredo aqui é logado. Token só sai daqui cifrado por quem chama.
 */

const ESCOPOS = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
];

export function configurado(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function estadoAleatorio(): string {
  return crypto.randomBytes(24).toString("hex");
}

function chave(): Buffer {
  // O segredo do próprio client assina o bilhete: não inventa variável nova que
  // alguém esqueça de configurar no Stage.
  return crypto.createHash("sha256").update(`bilhete-google:${process.env.GOOGLE_CLIENT_SECRET || ""}`).digest();
}

export type Bilhete = { state: string; volta: string; userId?: number; orgId?: string };

export function assinarBilhete(b: Bilhete): string {
  const corpo = Buffer.from(JSON.stringify(b)).toString("base64url");
  const mac = crypto.createHmac("sha256", chave()).update(corpo).digest("base64url");
  return `${corpo}.${mac}`;
}

export function lerBilhete(bruto: string | undefined | null): Bilhete | null {
  if (!bruto || !bruto.includes(".")) return null;
  const [corpo, mac] = bruto.split(".");
  const esperado = crypto.createHmac("sha256", chave()).update(corpo).digest("base64url");
  const a = Buffer.from(mac || ""), b = Buffer.from(esperado);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const d = JSON.parse(Buffer.from(corpo, "base64url").toString("utf8"));
    return typeof d?.state === "string" ? (d as Bilhete) : null;
  } catch {
    return null;
  }
}

export function urlDeVolta(req: Request): string {
  // ORDEM IMPORTA — e cada degrau existe por um motivo medido:
  //   1. GOOGLE_REDIRECT_BASE, se alguém quiser apontar à mão;
  //   2. a ORIGEM do GOOGLE_REDIRECT_URI já configurado no servidor (o login usa
  //      esse nome). Atrás de proxy, `new URL(req.url).origin` vira
  //      `http://127.0.0.1:3000` — e o Google REJEITA http com o erro
  //      "não cumpre a política de segurança OAuth 2.0" (medido em 12/11/2026).
  //      Reaproveitar o que já está configurado evita depender de env nova;
  //   3. por último, o endereço público resolvido pelo próprio app.
  const explicito = process.env.GOOGLE_REDIRECT_BASE || process.env.GOOGLE_REDIRECT_URI || "";
  let origem = "";
  if (explicito) {
    try {
      origem = new URL(explicito).origin;
    } catch {
      origem = explicito.replace(/\/$/, "");
    }
  }
  if (!origem) {
    try {
      origem = basePublica(req);
    } catch {
      origem = new URL(req.url).origin;
    }
  }
  if (!origem.startsWith("http")) origem = `https://${origem}`;
  return `${origem.replace(/\/$/, "")}/api/oauth/google/volta`;
}

export function urlDeAutorizacao(state: string, redirectUri: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: ESCOPOS.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

export type Troca = {
  ok: boolean;
  token?: string;
  refreshToken?: string;
  expiraEm?: string;
  erro?: string;
};

export async function trocarCodigoPorToken(code: string, redirectUri: string): Promise<Troca> {
  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.access_token) return { ok: false, erro: `google ${r.status}` };
    return {
      ok: true,
      token: d.access_token,
      refreshToken: d.refresh_token,
      expiraEm: new Date(Date.now() + (Number(d.expires_in) || 3600) * 1000).toISOString(),
    };
  } catch (e) {
    return { ok: false, erro: String(e).slice(0, 80) };
  }
}

/** Quem conectou: o email aparece na tela e evita "conectado" anônimo. */
export async function emailDoToken(token: string): Promise<string> {
  try {
    const r = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return "";
    const d = await r.json();
    return typeof d?.email === "string" ? d.email : "";
  } catch {
    return "";
  }
}
