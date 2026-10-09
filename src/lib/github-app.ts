// GITHUB APP — o FLUXO DE MANIFESTO (dono, 09/10/2026).
//
// POR QUE existe: o jeito antigo de ligar o GitHub era o dono abrir o GitHub,
// criar o app à mão e COLAR Client ID + Client Secret no app (env). O dono não
// quer preencher formulário nem ver segredo passando por chat. O FLUXO DE
// MANIFESTO resolve isso: o NOSSO app monta o manifesto, manda o navegador do
// dono para o GitHub, ele clica UMA vez em "Create GitHub App", e o GitHub cria
// o app e DEVOLVE tudo (inclusive a CHAVE PRIVADA) para um endereço nosso. Um
// clique, permissões finas (escolher repositório) e nenhum segredo digitado.
//
// COMO FOI DESENHADO (conferido na fonte oficial antes de escrever):
//  - Manifesto:      POST https://github.com/settings/apps/new?state=… (form
//                    com o campo `manifest`); a tela de aceite é do GitHub.
//  - Conversão:      POST https://api.github.com/app-manifests/{code}/conversions
//                    → devolve id, slug, client_id, client_secret, pem, webhook_secret.
//  - JWT do app:     RS256, `iss` = id do app, `exp` ~10 min, `iat` = agora-60s
//                    (folga para relógio dessincronizado — o GitHub recusa `iat`
//                    no futuro).
//  - Token de instalação: POST https://api.github.com/app/installations/{id}/access_tokens
//                    com o JWT do app → devolve um token curto (1h) para agir
//                    naquela instalação.
//
// REGRA DE OURO desta camada (igual a `github-api.ts`): NENHUMA função lança
// exceção para fora. Erro vira `{ ok: false, erro: "recado curto em PT-BR" }`.
//
// SEGREDO: o `pem` e o `client_secret` NUNCA são impressos em log, saída ou
// relatório. Quem os guarda é `plataforma-config.ts` (CIFRADO); aqui eles só
// passam pela memória.
import { createHmac, createSign, randomBytes, timingSafeEqual } from "crypto";

import { basePublica } from "./base-publica";

const API = "https://api.github.com";
const VERSAO_API = "2022-11-28";

// Mesmo segredo do bilhete do `github-oauth.ts`: o `state` do manifesto é
// assinado com ele, então só NÓS conseguimos emitir um state válido.
const SEGREDO = process.env.JWT_SECRET || "dev-fallback-change-me";

/** O manifesto do GitHub App — o que o dono vai aceitar com UM clique. */
export function manifesto(req: { headers: { get(n: string): string | null } }) {
  const base = basePublica(req);
  return {
    name: "Mirai OS",
    url: base,
    // Para onde o GitHub devolve o `code` depois de criar o app.
    redirect_url: `${base}/api/oauth/github/manifesto/volta`,
    // Para onde o GitHub manda depois que o dono INSTALA o app num repositório.
    callback_urls: [`${base}/api/oauth/github/instalado`],
    // App privado: só quem instalar enxerga (não é listado no Marketplace).
    public: false,
    // Já pede a autorização OAuth na hora de instalar (um passo a menos).
    request_oauth_on_install: true,
    // Permissões FINAS: escrever conteúdo (arquivos/PRs), ler metadados e
    // escrever pull requests. Nada de "tudo" — o app pede só o que usa.
    default_permissions: {
      contents: "write",
      metadata: "read",
      pull_requests: "write",
    },
    default_events: [] as string[],
  };
}

// ─── O BILHETE DO MANIFESTO ────────────────────────────────────────────────
// Entre "clicou em criar" e "o GitHub devolveu o code" o navegador sai do nosso
// site. O `state` que amarra as duas pontas vai ASSINADO (HMAC-SHA256 do mesmo
// `JWT_SECRET`, no MESMO formato `payload.assinatura` do bilhete do
// `github-oauth.ts`) e com EXPIRAÇÃO embutida: sem a assinatura, o callback não
// confia em nada; vencido, não vale mais. Aqui o bilhete é o próprio parâmetro
// `state` (não um cookie): o GitHub o devolve verbatim, e só quem tem o segredo
// consegue forjar um.
const VALIDADE_BILHETE_MS = 15 * 60 * 1000;

export function bilheteDoManifesto(): string {
  const corpo = {
    state: randomBytes(24).toString("base64url"),
    exp: Date.now() + VALIDADE_BILHETE_MS,
  };
  const p = Buffer.from(JSON.stringify(corpo)).toString("base64url");
  const s = createHmac("sha256", SEGREDO).update(p).digest("base64url");
  return `${p}.${s}`;
}

/** Confere o bilhete do manifesto: assinatura + validade. null se não vale. */
export function lerBilheteDoManifesto(token: string | null | undefined): { state: string } | null {
  if (typeof token !== "string" || token.split(".").length !== 2) return null;
  const [p, s] = token.split(".");
  const esperado = createHmac("sha256", SEGREDO).update(p).digest("base64url");
  const a = Buffer.from(s);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const j = JSON.parse(Buffer.from(p, "base64url").toString("utf8")) as {
      state?: unknown;
      exp?: unknown;
    };
    if (typeof j.state !== "string" || typeof j.exp !== "number") return null;
    if (Date.now() > j.exp) return null; // vencido
    return { state: j.state };
  } catch {
    return null;
  }
}

// ─── CONVERSÃO DO MANIFESTO ────────────────────────────────────────────────
// Troca o `code` (que o GitHub devolveu) pelos dados do app recém-criado.
// ATENÇÃO: a resposta traz o `pem` (chave privada) e o `client_secret` — são
// SEGREDOS e NUNCA podem ser impressos. Devolvemos os campos; quem persiste é a
// rota, CIFRADO (`plataforma-config.ts`).
export type AppCriado = {
  id: string;
  slug: string;
  client_id: string;
  client_secret: string;
  pem: string;
  webhook_secret: string;
};

export async function converterManifesto(
  codigo: string,
): Promise<({ ok: true } & AppCriado) | { ok: false; erro: string }> {
  try {
    const r = await fetch(`${API}/app-manifests/${encodeURIComponent(codigo)}/conversions`, {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        "x-github-api-version": VERSAO_API,
        "user-agent": "mirai-os",
      },
      signal: AbortSignal.timeout(30000),
    });
    const j = (await r.json().catch(() => ({}))) as {
      id?: number | string;
      slug?: string;
      client_id?: string;
      client_secret?: string;
      pem?: string;
      webhook_secret?: string;
      message?: string;
    };
    if (!r.ok || j.id == null || !j.pem) {
      return { ok: false, erro: j.message || `O GitHub recusou criar o app (${r.status}).` };
    }
    return {
      ok: true,
      id: String(j.id),
      slug: String(j.slug || ""),
      client_id: String(j.client_id || ""),
      client_secret: String(j.client_secret || ""),
      pem: String(j.pem),
      webhook_secret: String(j.webhook_secret || ""),
    };
  } catch {
    return { ok: false, erro: "Não consegui falar com o GitHub agora. Tente de novo." };
  }
}

// ─── JWT DO APP (RS256) ────────────────────────────────────────────────────
// Sem dependência nova: assinamos com `node:crypto` (`createSign`). O GitHub
// exige RS256 e um `iss` = id do app, com `exp` de no máximo 10 minutos.
function base64url(entrada: Buffer | string): string {
  return Buffer.from(entrada).toString("base64url");
}

export function assinarJWTdoApp(
  appId: string | number,
  pem: string,
): { ok: true; jwt: string } | { ok: false; erro: string } {
  try {
    const agora = Math.floor(Date.now() / 1000);
    const cabecalho = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    // `iat` 60s no passado: protege contra relógio adiantado (o GitHub recusa
    // `iat` no futuro). `exp` 10 min: o teto que o GitHub aceita.
    const corpo = base64url(
      JSON.stringify({ iat: agora - 60, exp: agora + 600, iss: String(appId) }),
    );
    const dados = `${cabecalho}.${corpo}`;
    const assinatura = createSign("RSA-SHA256").update(dados).sign(pem);
    return { ok: true, jwt: `${dados}.${assinatura.toString("base64url")}` };
  } catch {
    return { ok: false, erro: "A chave do app no GitHub está inválida — recrie o app pelo manifesto." };
  }
}

// ─── TOKEN DE INSTALAÇÃO ───────────────────────────────────────────────────
// Assina o JWT do app e troca por um token curto daquela INSTALAÇÃO (o app
// instalado num repositório/org). É esse token que age no repositório.
export async function tokenDeInstalacao(
  appId: string | number,
  pem: string,
  installationId: string | number,
): Promise<{ ok: true; token: string; expira_em: string } | { ok: false; erro: string }> {
  const j = assinarJWTdoApp(appId, pem);
  if (!j.ok) return j;
  try {
    const r = await fetch(
      `${API}/app/installations/${encodeURIComponent(String(installationId))}/access_tokens`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${j.jwt}`,
          accept: "application/vnd.github+json",
          "x-github-api-version": VERSAO_API,
          "user-agent": "mirai-os",
        },
        signal: AbortSignal.timeout(20000),
      },
    );
    const d = (await r.json().catch(() => ({}))) as {
      token?: string;
      expires_at?: string;
      message?: string;
    };
    if (!r.ok || !d.token) {
      return { ok: false, erro: d.message || `O GitHub recusou o token da instalação (${r.status}).` };
    }
    return { ok: true, token: d.token, expira_em: d.expires_at || "" };
  } catch {
    return { ok: false, erro: "Não consegui falar com o GitHub agora. Tente de novo." };
  }
}
