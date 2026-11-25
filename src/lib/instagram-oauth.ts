import crypto from "node:crypto";

import { basePublica } from "@/lib/base-publica";

/**
 * instagram-oauth.ts — o corredor de INTEGRAÇÃO com o Instagram, pelo LOGIN DO
 * FACEBOOK do app Mirai (que já existe e já tem estas permissões concedidas).
 *
 * NÃO é o Instagram Login novo da Meta: aquele exigiria instalar outro produto no
 * app e pedir revisão das permissões novas. Este caminho usa o app que já está de
 * pé, e o consentimento que já funciona.
 *
 * Decisões (mesmas do Google, cada uma por um motivo medido lá):
 *  - `state` vai num cookie ASSINADO (HMAC), httpOnly: o retorno não confia em
 *    nada que venha da URL.
 *  - O usuário autoriza com a conta DELE; o token que volta é DELE, e vai para o
 *    cofre do escopo dele. Nada de credencial compartilhada.
 *  - O token de página (que é longo e não expira) é o que guardamos: com ele
 *    publicamos e lemos em nome daquela conta, sem depender do login da pessoa
 *    continuar vivo.
 */

const VERSAO = "v21.0";

/** Permissões mínimas para LER e saber de quem é a conta. Publicar e métricas
 *  ficam de fora por enquanto: cada permissão a mais é mais revisão da Meta. */
const ESCOPOS = ["pages_show_list", "pages_read_engagement", "instagram_basic"];

export function appId(): string {
  return (
    process.env.META_APP_ID ||
    process.env.INSTAGRAM_APP_ID ||
    process.env.FACEBOOK_APP_ID ||
    ""
  );
}

export function appSecret(): string {
  return (
    process.env.META_APP_SECRET ||
    process.env.INSTAGRAM_APP_SECRET ||
    process.env.FACEBOOK_APP_SECRET ||
    ""
  );
}

export function configurado(): boolean {
  return Boolean(appId() && appSecret());
}

export function estadoAleatorio(): string {
  return crypto.randomBytes(24).toString("hex");
}

function chave(): Buffer {
  // O segredo do PRÓPRIO app assina o bilhete: não inventa variável nova que
  // alguém esqueça de configurar no Stage.
  return crypto.createHash("sha256").update(`bilhete-instagram:${appSecret()}`).digest();
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
  const explicito = process.env.META_REDIRECT_BASE || "";
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
  return `${origem.replace(/\/$/, "")}/api/oauth/instagram/volta`;
}

export function urlDeAutorizacao(state: string, redirectUri: string): string {
  const p = new URLSearchParams({
    client_id: appId(),
    redirect_uri: redirectUri,
    response_type: "code",
    // `reauthenticate` garante que a Meta mostre a tela mesmo se a pessoa já
    // autorizou antes — sem isso ela pode voltar sem consentir de novo e o
    // token sai sem os escopos novos.
    auth_type: "reauthenticate",
    scope: ESCOPOS.join(","),
    state,
  });
  return `https://www.facebook.com/${VERSAO}/dialog/oauth?${p.toString()}`;
}

type Resposta = { ok: boolean; dados?: Record<string, unknown>; erro?: string };

async function pedir(url: string): Promise<Resposta> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    const d = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok || d.error) {
      const e = d.error as Record<string, unknown> | undefined;
      return { ok: false, erro: `${r.status} ${String(e?.message || "").slice(0, 120)}` };
    }
    return { ok: true, dados: d };
  } catch (e) {
    return { ok: false, erro: String(e).slice(0, 120) };
  }
}

export type Troca = { ok: boolean; usuario?: string; erro?: string };

/** Uma conta profissional alcançada por este login. */
export type ContaInstagram = {
  page_id: string;
  page_nome: string;
  ig_id: string;
  ig_usuario: string;
  token: string; // token de página: longo, é o que faz o trabalho
};

/**
 * Troca o `code` pelo token do usuário, alonga o token e lista as contas
 * profissionais que essa pessoa alcança. A lista NÃO vai para a URL: quem
 * decide o que gravar é o retorno, no servidor.
 */
export async function contasDoCodigo(
  code: string,
  redirectUri: string,
): Promise<{ ok: boolean; contas?: ContaInstagram[]; erro?: string }> {
  const curto = await pedir(
    `https://graph.facebook.com/${VERSAO}/oauth/access_token?` +
      new URLSearchParams({
        client_id: appId(),
        client_secret: appSecret(),
        redirect_uri: redirectUri,
        code,
      }).toString(),
  );
  if (!curto.ok) return { ok: false, erro: curto.erro };
  const tokenCurto = String(curto.dados?.access_token || "");
  if (!tokenCurto) return { ok: false, erro: "sem token na resposta" };

  const longo = await pedir(
    `https://graph.facebook.com/${VERSAO}/oauth/access_token?` +
      new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: appId(),
        client_secret: appSecret(),
        fb_exchange_token: tokenCurto,
      }).toString(),
  );
  const token = String(longo.dados?.access_token || tokenCurto);

  const paginas = await pedir(
    `https://graph.facebook.com/${VERSAO}/me/accounts?` +
      new URLSearchParams({
        fields: "id,name,access_token,instagram_business_account{id,username}",
        access_token: token,
      }).toString(),
  );
  if (!paginas.ok) return { ok: false, erro: paginas.erro };

  const contas: ContaInstagram[] = [];
  for (const p of (paginas.dados?.data as Record<string, unknown>[]) || []) {
    const ig = p?.instagram_business_account as Record<string, unknown> | undefined;
    if (!ig?.id) continue;
    contas.push({
      page_id: String(p.id || ""),
      page_nome: String(p.name || ""),
      ig_id: String(ig.id || ""),
      ig_usuario: String(ig.username || ""),
      token: String(p.access_token || ""),
    });
  }
  if (!contas.length) {
    return {
      ok: false,
      erro:
        "Nenhuma conta profissional do Instagram ligada às suas páginas. " +
        "O Instagram precisa ser conta comercial ou de criador e estar ligada a uma página.",
    };
  }
  return { ok: true, contas };
}