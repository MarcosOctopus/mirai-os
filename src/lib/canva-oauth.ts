// CANVA OAuth — "Conectar com Canva", cada pessoa na PRÓPRIA conta.
//
// Por que este arquivo existe (dono, 19/10/2026, verbatim):
//   "Each person can use their own account of the Canva, each client, you know?
//    And not just one account."
//
// O MCP do Hermes (mcp_servers.canva) guarda UM token — o de quem autorizou.
// Isso serve para o dono e para mais ninguém: design/documento pertence à conta
// de quem criou. Para o CLIENTE usar o Canva dele, o token tem de ser por
// PESSOA, no cofre da conta — que é exatamente o padrão que o GitHub já usa
// (`github-oauth.ts` + `github-conta.ts`). Este arquivo espelha aquele.
//
// FATOS CONFERIDOS NA FONTE (canva.dev/docs, 19/10/2026):
//  - Autorizar  https://www.canva.com/api/oauth/authorize
//    token     https://api.canva.com/rest/v1/oauth/token
//  - PKCE S256 é OBRIGATÓRIO (o Canva não aceita fluxo sem ele).
//  - Cliente CONFIDENCIAL: o token endpoint exige `client_secret`, por Basic
//    auth (`base64(client_id:client_secret)`). Diferente do Cloudflare.
//  - `access_token` vive 4 HORAS (expires_in ≈ 14400).
//  - `refresh_token` é de USO ÚNICO: cada renovação devolve outro e invalida o
//    anterior. Quem não regravar o novo perde a conexão para sempre — é o
//    defeito clássico deste fluxo.
//  - Escopos precisam estar LIGADOS no Developer Portal do app; pedir um que
//    não esteja lá devolve erro. Por isso a lista abaixo é a fonte da verdade
//    do que o app precisa habilitar.
//
// O token NUNCA vai para o navegador: fica cifrado (`segredo-guardado.ts`).
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

import { basePublica } from "./base-publica";
import { lerConfig } from "./plataforma-config";

export const CV_AUTORIZAR = "https://www.canva.com/api/oauth/authorize";
export const CV_TOKEN = "https://api.canva.com/rest/v1/oauth/token";
export const CV_API = "https://api.canva.com/rest/v1";

/**
 * O que o app pede no consentimento — e o que precisa estar HABILITADO no
 * Developer Portal (Canva não deixa pedir escopo que o app não tem).
 *
 * Escolha (dono: "pedir modificações e automações pelo chat"):
 *   design:*        ler, criar e editar designs
 *   asset:*         enviar imagens/arquivos para usar nos designs
 *   folder:*        organizar (listar, mover, criar pasta)
 *   brandtemplate:* ler templates da marca (autofill)
 *   profile:read    saber DE QUEM é a conta conectada (mostrar na tela)
 * Comentários ficaram de fora de propósito: não é o pedido e só aumenta o
 * atrito do consentimento. Se um dia precisar, é acrescentar aqui E no portal.
 */
export const CV_ESCOPO = [
  "profile:read",
  "design:meta:read",
  "design:content:read",
  "design:content:write",
  "asset:read",
  "asset:write",
  "folder:read",
  "folder:write",
  "brandtemplate:meta:read",
  "brandtemplate:content:read",
].join(" ");

/** O client id do nosso app no Canva (não é segredo). */
export function clientId(): string {
  // Colchete de propósito: com `process.env.X` o Next congela no build. Assim o
  // Canva pode ser ligado depois só reiniciando o app.
  //
  // Duas grafias de propósito (19/10/2026): `CANVA_CLIENT_ID` é o nome que já
  // está no `.env` desde 08/10 (o app Canva existe há semanas); o prefixo
  // `CANVA_OAUTH_` fica como alternativa explícita para o app do MIRAI OS.
  const env = process.env["CANVA_OAUTH_CLIENT_ID"] || process.env["CANVA_CLIENT_ID"];
  if (env) return env;
  try {
    return lerConfig("canva_client_id") || "";
  } catch {
    return "";
  }
}

/** O client secret do app no Canva (começa com `cnvca`). SÓ o servidor usa. */
export function clientSecret(): string {
  const env = process.env["CANVA_OAUTH_CLIENT_SECRET"] || process.env["CANVA_CLIENT_SECRET"];
  if (env) return env;
  try {
    return lerConfig("canva_client_secret") || "";
  } catch {
    return "";
  }
}

export function configurado(): boolean {
  return !!clientId() && !!clientSecret();
}

/**
 * O endereço de volta do consentimento. SEMPRE do endereço PÚBLICO: atrás do
 * proxy o servidor se enxerga como `localhost`, e o navegador do cliente não
 * consegue voltar para lá. Tem de ser idêntico ao cadastrado no portal.
 */
export function urlDeVolta(req: { headers: { get(n: string): string | null } }): string {
  return `${basePublica(req)}/api/oauth/canva/volta`;
}

// ─── O BILHETE DO CONSENTIMENTO ─────────────────────────────────────────────
// Entre o clique e a volta o navegador sai do site. Precisa sobreviver: QUEM
// pediu, o `state` (anti-CSRF) e o verificador do PKCE. Cookie ASSINADO
// (HMAC-SHA256 do JWT_SECRET) — sem assinatura válida o callback não confia.
const SEGREDO = process.env.JWT_SECRET || "dev-fallback-change-me";

export type Bilhete = {
  /** vazio = conexão da CONTA (vale para todos os projetos dela). */
  projetoId: string;
  state: string;
  verificador: string;
  volta: string;
  /** quem conectou — o callback é rota pública, sem sessão. */
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
      volta: j.volta || "/dashboard/connect",
      userId: typeof j.userId === "number" ? j.userId : undefined,
    };
  } catch {
    return null;
  }
}

/** Verificador do PKCE (43–128 chars) e o desafio S256. */
export function novoVerificador(): string {
  return randomBytes(48).toString("base64url");
}

export function desafioDe(verificador: string): string {
  return createHash("sha256").update(verificador).digest("base64url");
}

export function estadoAleatorio(): string {
  return randomBytes(24).toString("base64url");
}

/** A URL de consentimento. `volta` tem de bater com a usada na troca. */
export function urlDeAutorizacao(state: string, desafio: string, volta: string): string {
  const p = new URLSearchParams({
    client_id: clientId(),
    response_type: "code",
    redirect_uri: volta,
    scope: CV_ESCOPO,
    state,
    code_challenge: desafio,
    // O Canva documenta `s256` minúsculo no exemplo, mas o parâmetro é o
    // padrão PKCE (`S256`). Os dois são aceitos; mandamos o canônico.
    code_challenge_method: "S256",
  });
  return `${CV_AUTORIZAR}?${p.toString()}`;
}

type RespostaToken = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  /** erro no padrão do Canva */
  code?: string;
  message?: string;
  error?: string;
  error_description?: string;
};

/** O que uma troca/renovação devolve: o token e como renová-lo depois. */
export type TokenTrocado = {
  token: string;
  /**
   * O refresh token NOVO. O Canva rotaciona: o anterior morre a cada uso. Quem
   * guarda só o primeiro renova uma vez e perde a conexão.
   */
  refreshToken: string | null;
  /** ISO-8601 do vencimento (o Canva declara 4h), com 60s de margem. */
  expiraEm: string | null;
  /** Escopos realmente concedidos. */
  escopo: string | null;
};

function comoToken(j: RespostaToken): TokenTrocado {
  const segundos = Number(j.expires_in);
  return {
    token: String(j.access_token),
    refreshToken: typeof j.refresh_token === "string" && j.refresh_token ? j.refresh_token : null,
    // Margem de 60s: renova ANTES de vencer, senão a primeira chamada já toma 401.
    expiraEm: Number.isFinite(segundos) && segundos > 0
      ? new Date(Date.now() + (segundos - 60) * 1000).toISOString()
      : null,
    escopo: typeof j.scope === "string" ? j.scope : null,
  };
}

/** Basic auth `base64(client_id:client_secret)` — exigência do Canva. */
function basico(): string {
  return `Basic ${Buffer.from(`${clientId()}:${clientSecret()}`).toString("base64")}`;
}

function recado(j: RespostaToken, status: number): string {
  return j.message || j.error_description || j.error || j.code || `Canva recusou (${status}).`;
}

/**
 * Troca o `code` pelo token. O Canva exige client_secret (Basic auth), o
 * `code_verifier` do PKCE e o MESMO `redirect_uri` do consentimento.
 * Nunca lança: erro volta como recado em PT-BR.
 */
export async function trocarCodigoPorToken(
  codigo: string,
  verificador: string,
  volta: string,
): Promise<({ ok: true } & TokenTrocado) | { ok: false; erro: string }> {
  try {
    const corpo = new URLSearchParams({
      grant_type: "authorization_code",
      code: codigo,
      code_verifier: verificador,
      redirect_uri: volta,
    });
    const r = await fetch(CV_TOKEN, {
      method: "POST",
      headers: {
        authorization: basico(),
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: corpo.toString(),
      signal: AbortSignal.timeout(20000),
    });
    const j = (await r.json().catch(() => ({}))) as RespostaToken;
    if (!r.ok || !j.access_token) return { ok: false, erro: recado(j, r.status) };
    return { ok: true, ...comoToken(j) };
  } catch {
    return { ok: false, erro: "Não consegui falar com o Canva agora. Tente de novo." };
  }
}

/**
 * RENOVA o acesso a partir do `refresh_token`.
 *
 * ATENÇÃO, o detalhe que quebra tudo: o Canva é de uso ÚNICO — a resposta traz
 * um `refresh_token` novo e o antigo deixa de valer. Quem chama TEM de gravar o
 * novo (`guardarCanvaDaConta`). Nunca lança.
 */
export async function renovarTokenCanva(
  refreshToken: string,
): Promise<({ ok: true } & TokenTrocado) | { ok: false; erro: string }> {
  try {
    const corpo = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
    const r = await fetch(CV_TOKEN, {
      method: "POST",
      headers: {
        authorization: basico(),
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: corpo.toString(),
      signal: AbortSignal.timeout(20000),
    });
    const j = (await r.json().catch(() => ({}))) as RespostaToken;
    if (!r.ok || !j.access_token) return { ok: false, erro: recado(j, r.status) };
    return { ok: true, ...comoToken(j) };
  } catch {
    return { ok: false, erro: "Não consegui falar com o Canva para renovar agora." };
  }
}

/**
 * Quem é o dono do token (nome de exibição da conta Canva).
 * O Canva não tem um `/me` como o GitHub: o perfil vem por OIDC
 * (`/rest/v1/oidc/userinfo`) quando o escopo `profile:read` foi concedido.
 */
export async function perfilDoToken(
  token: string,
): Promise<{ ok: true; nome: string } | { ok: false; nome: "" }> {
  try {
    const r = await fetch(`${CV_API}/oidc/userinfo`, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) return { ok: false, nome: "" };
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    const nome = [j.display_name, j.name, j.email]
      .find((v) => typeof v === "string" && v) as string | undefined;
    return { ok: true, nome: nome || "" };
  } catch {
    return { ok: false, nome: "" };
  }
}

/**
 * O TOKEN ESTÁ VIVO? — pergunta ao próprio Canva (`/oauth/introspect`).
 *
 * Por que existe: o selo "conectado" do MIRAI OS não pode ser otimismo. O GitHub
 * já aprendeu isso em 16/10/2026 (tela dizia "conectado" com token em 401). Aqui
 * a resposta é do fornecedor, não nossa: `active: true` ou não.
 *
 * Três estados, e a diferença importa:
 *   - `vivo`      → o Canva confirmou;
 *   - `morto`     → o Canva RECUSOU explicitamente (pode esquecer a conexão);
 *   - `indefinido`→ não deu para perguntar (rede, 5xx, timeout). Falha NOSSA não
 *                   apaga credencial de ninguém.
 */
export async function introspectarToken(
  token: string,
): Promise<"vivo" | "morto" | "indefinido"> {
  try {
    const r = await fetch(`${CV_API}/oauth/introspect`, {
      method: "POST",
      headers: {
        authorization: basico(),
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: new URLSearchParams({ token }).toString(),
      // 4s: a conferência roda no carregamento da tela de Integrações — não pode
      // segurar a página. Sem resposta, é "indefinido" e nada é apagado.
      signal: AbortSignal.timeout(4000),
    });
    if (r.status === 401) return "morto";
    if (!r.ok) return "indefinido";
    const j = (await r.json().catch(() => ({}))) as { active?: boolean };
    return j.active === false ? "morto" : j.active === true ? "vivo" : "indefinido";
  } catch {
    return "indefinido";
  }
}
