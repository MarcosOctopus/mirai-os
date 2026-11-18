import crypto from "crypto";

import { basePublica } from "@/lib/base-publica";

/**
 * OAuth do GOOGLE DRIVE — conexão por PESSOA (ou por organização), para a Arca.
 *
 * POR QUE UM ARQUIVO PRÓPRIO (18/11/2026): o fluxo Google que já existia
 * (`lib/google-oauth.ts` + `/api/oauth/google/*`) pede Gmail e serve para a Mirai LER e ENVIAR
 * email. Aqui é outro consentimento e outro propósito: **ler o Drive inteiro** de quem conecta
 * para o conteúdo cair no acervo DAQUELA pessoa. Misturar os dois escopos faria todo mundo
 * autorizar Gmail sem querer — e consentimento enganoso é defeito, não atalho.
 *
 * Escopo escolhido: `drive.readonly` (só leitura, nunca escreve de volta). É escopo SENSÍVEL no
 * Google: enquanto o app estiver em modo "Teste", só entram contas cadastradas como test users.
 * Publicar/verificar é decisão do dono — o código é o mesmo.
 *
 * O refresh token vai CIFRADO no cofre daquele escopo (`google_drive`), ao lado — não dentro — das
 * outras conexões Google da mesma pessoa. Cada pessoa vê o próprio Drive; ninguém vê o do outro.
 */

export const ESCOPO_DRIVE = "https://www.googleapis.com/auth/drive.readonly";

export type BilheteDrive = {
  state: string;
  volta: string;
  userId: number;
  orgId?: string;
};

export function configurado(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function estadoAleatorio(): string {
  return crypto.randomBytes(24).toString("hex");
}

/** Chave de assinatura PRÓPRIA: nunca reaproveitar a mesma chave para fins diferentes. */
function chaveDoBilhete(): Buffer {
  return crypto
    .createHash("sha256")
    .update(`bilhete-gdrive:${process.env.GOOGLE_CLIENT_SECRET || ""}`)
    .digest();
}

export function assinarBilhete(b: BilheteDrive): string {
  const corpo = Buffer.from(JSON.stringify(b), "utf8").toString("base64url");
  const mac = crypto.createHmac("sha256", chaveDoBilhete()).update(corpo).digest("base64url");
  return `${corpo}.${mac}`;
}

export function lerBilhete(bruto: string | undefined | null): BilheteDrive | null {
  if (!bruto || !bruto.includes(".")) return null;
  const [corpo, mac] = bruto.split(".");
  const esperado = crypto.createHmac("sha256", chaveDoBilhete()).update(corpo).digest("base64url");
  // comparação de tempo constante: assinatura não se compara com `===`
  const a = Buffer.from(mac || "");
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(corpo, "base64url").toString("utf8")) as BilheteDrive;
  } catch {
    return null;
  }
}

export function urlDeVoltaDrive(req: Request): string {
  return `${basePublica(req).replace(/\/$/, "")}/api/oauth/gdrive/volta`;
}

export function urlDeAutorizacaoDrive(state: string, redirectUri: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: ESCOPO_DRIVE,
    access_type: "offline",
    // `consent` de propósito: sem ele o Google devolve refresh token só na primeira vez — e sem
    // refresh a fonte morre em 1h dizendo "conectado". Defeito já medido no fluxo do Gmail.
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

export type TrocaDrive = {
  ok: boolean;
  token?: string;
  refreshToken?: string;
  expiraEm?: string;
  erro?: string;
};

export async function trocarCodigoPorToken(code: string, redirectUri: string): Promise<TrocaDrive> {
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
    const d = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok || !d.access_token) return { ok: false, erro: `google ${r.status}` };
    return {
      ok: true,
      token: String(d.access_token),
      refreshToken: typeof d.refresh_token === "string" ? d.refresh_token : undefined,
      expiraEm: new Date(Date.now() + (Number(d.expires_in) || 3600) * 1000).toISOString(),
    };
  } catch (e) {
    return { ok: false, erro: String(e).slice(0, 80) };
  }
}

/** Renova o acesso a partir do refresh token. É o que mantém a fonte viva rodando sozinha. */
export async function renovarAcesso(refreshToken: string): Promise<TrocaDrive> {
  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        grant_type: "refresh_token",
      }),
    });
    const d = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok || !d.access_token) return { ok: false, erro: `google ${r.status}` };
    return {
      ok: true,
      token: String(d.access_token),
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
    const d = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    return typeof d.email === "string" ? d.email : "";
  } catch {
    return "";
  }
}
