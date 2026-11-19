/**
 * A CONTA DA PESSOA NA ARCA — token da PRÓPRIA organização, sem segundo login.
 *
 * O que resolve (dono, 17/11/2026): a Arca é a memória da organização e cada
 * pessoa já entra no MIRAI OS com a conta Mirai. Pedir um segundo login (ou
 * mandar colar um token) para usar o próprio acervo é trabalho inventado. Aqui
 * a credencial nasce a partir do E-MAIL DA SESSÃO:
 *
 *   POST {ARCA}/org/token-servico      header X-Arca-Servico: <segredo do serviço>
 *        {"email": "<email da sessão>"}
 *     -> 200 {"org","usuario","token","criado_em"}   (IDEMPOTENTE: mesma chamada,
 *        mesmo token — não empilha credencial na organização)
 *
 *   DELETE {ARCA}/org/token-servico?email=<email da sessão>
 *     -> 200 {"email","revogado":true,...}
 *
 * Regras que este arquivo NÃO negocia:
 *   - a identidade vem do E-MAIL DA SESSÃO, nunca de um campo que o navegador
 *     escolhe — ninguém pede token da organização de outra pessoa;
 *   - o token vai para o cofre da CONTA (`users.platform_config.arca`) CIFRADO
 *     (`segredo-guardado.ts`, o mesmo AES-256-GCM do Canva/GitHub);
 *   - o token NUNCA é logado, nunca entra em mensagem de erro e nunca é o corpo
 *     de um `console.*`. Quem precisa mostrar o token para a pessoa copiar pede
 *     por uma rota própria (GET /api/integracoes/arca/credencial);
 *   - o segredo do serviço vive em variável de ambiente (`ARCA_SERVICO_CREDENCIAL`),
 *     nunca em código, nunca em comentário, nunca em resposta de API.
 *
 * Espelha `canva-conta.ts` / `github-conta.ts` de propósito: mesma forma de
 * guardar, mesma leitura de "está conectado" (`estaLigada` via
 * `chaveConfig: "arca"` no catálogo) e mesma disciplina de conferir antes de
 * afirmar.
 */
import { getUserPlatformConfig, updateUserPlatformConfig } from "./auth";
import { cifrar } from "./segredo-guardado";

/** A chave no cofre da conta. É a mesma do `chaveConfig` no catálogo. */
export const CHAVE_ARCA = "arca";

/** Endereço público da Arca (API/MCP). Não é segredo: é o produto. */
export const ARCA_URL = "https://arca.miraitohope.com";

/** O que a pessoa cola em qualquer ambiente (Claude Code, Cursor, VS Code). */
export const ARCA_MCP_URL = `${ARCA_URL}/mcp`;

/** Teto de tempo de cada chamada à Arca. Integração lenta não segura a tela. */
const TETO_MS = 8000;

/** De quanto em quanto tempo revalidamos o token antes de dizer "conectado". */
const INTERVALO_CONFERIR_MS = 10 * 60 * 1000;

export type ArcaDaConta = {
  /** o token CIFRADO (o servidor decifra só na hora de usar). */
  tokenCifrado: string;
  /** o slug da organização na Arca (para a tela dizer DE QUEM é o acervo). */
  org: string | null;
  /** o e-mail que a Arca reconheceu. */
  usuario: string | null;
  /** ISO-8601 de quando a Arca cunhou a credencial. */
  criadoEm: string | null;
  /** ISO-8601 de quando esta conta conectou. */
  conectadoEm: string | null;
  /** ISO-8601 da última conferência ao vivo (evita conferir a cada clique). */
  conferidoEm: string | null;
};

/**
 * O segredo do serviço está configurado NESTE ambiente?
 * É o que a tela usa para dizer "indisponível" em vez de oferecer um botão que
 * vai falhar na cara do cliente. Não devolve o valor — só se existe.
 */
export function servicoConfigurado(): boolean {
  const s = (process.env.ARCA_SERVICO_CREDENCIAL || "").trim();
  return s.length >= 20;
}

/** O que o app diz de si para a Arca (Cloudflare da borda rejeita cliente anônimo). */
const UA_APP = "mirai-os/1.0 (+https://app.miraitohope.com)";

function cabecalhoServico(): Record<string, string> {
  const s = (process.env.ARCA_SERVICO_CREDENCIAL || "").trim();
  return { "X-Arca-Servico": s, "content-type": "application/json", "user-agent": UA_APP };
}

/** A conexão da conta, ou null. Nunca inventa: só lê o que existe. */
export function arcaDaConta(userId: number): ArcaDaConta | null {
  const config = getUserPlatformConfig(userId) as Record<string, unknown>;
  const v = config?.[CHAVE_ARCA];
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.token_cifrado !== "string" || !o.token_cifrado) return null;
  const texto = (k: string): string | null => (typeof o[k] === "string" && o[k] ? (o[k] as string) : null);
  return {
    tokenCifrado: o.token_cifrado as string,
    org: texto("org"),
    usuario: texto("usuario"),
    criadoEm: texto("criado_em"),
    conectadoEm: texto("connected_at"),
    conferidoEm: texto("conferido_em"),
  };
}

/** Grava a conexão no cofre da conta. Recebe o token JÁ cifrado. */
export function guardarArcaDaConta(
  userId: number,
  dados: { tokenCifrado: string; org: string | null; usuario: string | null; criadoEm: string | null },
): void {
  updateUserPlatformConfig(userId, {
    [CHAVE_ARCA]: {
      token_cifrado: dados.tokenCifrado,
      org: dados.org,
      usuario: dados.usuario,
      criado_em: dados.criadoEm,
      connected_at: new Date().toISOString(),
      conferido_em: new Date().toISOString(),
    },
  });
}

/** Desconecta do lado do app (o cofre esquece a credencial). */
export function esquecerArcaDaConta(userId: number): void {
  updateUserPlatformConfig(userId, { [CHAVE_ARCA]: null });
}

/** Marca a conferência, sem mexer no resto do que está guardado. */
function marcarConferido(userId: number): void {
  const c = arcaDaConta(userId);
  if (!c) return;
  updateUserPlatformConfig(userId, {
    [CHAVE_ARCA]: {
      token_cifrado: c.tokenCifrado,
      org: c.org,
      usuario: c.usuario,
      criado_em: c.criadoEm,
      connected_at: c.conectadoEm,
      conferido_em: new Date().toISOString(),
    },
  });
}

/** O token em claro desta conta — para usar no cabeçalho. Nunca sai daqui. */
export async function tokenArcaDaConta(userId: number): Promise<string | null> {
  const c = arcaDaConta(userId);
  if (!c) return null;
  const { decifrar } = await import("./segredo-guardado");
  return decifrar(c.tokenCifrado);
}

export type ResultadoArca =
  | { ok: true; token: string; org: string | null; usuario: string | null; criadoEm: string | null }
  | { ok: false; erro: string };

/**
 * Pede à Arca o token da organização do e-mail. IDEMPOTENTE no lado da Arca:
 * chamar de novo devolve a MESMA credencial, então conectar duas vezes não
 * empilha token na organização da pessoa.
 *
 * Mensagem de erro é sempre UM código curto — nunca o corpo da resposta, nunca
 * o token, nunca o segredo do serviço.
 */
export async function pedirTokenNaArca(email: string): Promise<ResultadoArca> {
  const e = (email || "").trim().toLowerCase();
  if (!e) return { ok: false, erro: "sem-email" };
  if (!servicoConfigurado()) return { ok: false, erro: "servico-nao-configurado" };

  let resposta: Response;
  try {
    resposta = await fetch(`${ARCA_URL}/org/token-servico`, {
      method: "POST",
      headers: cabecalhoServico(),
      body: JSON.stringify({ email: e }),
      cache: "no-store",
      signal: AbortSignal.timeout(TETO_MS),
    });
  } catch {
    // Rede/tempo esgotado: nada foi cunhado do nosso lado, nada a limpar.
    return { ok: false, erro: "arca-sem-resposta" };
  }

  if (!resposta.ok) {
    // 401 = o segredo do serviço deste ambiente não vale (configuração, não cliente).
    // 403 NÃO é tratado como "sem autorização": a borda da Arca devolve 403 quando
    // o pedido é barrado por WAF — doutrina da casa, falha nossa não vira recado
    // de culpa para o cliente.
    if (resposta.status === 401) return { ok: false, erro: "servico-recusado" };
    return { ok: false, erro: `arca-recusou-${resposta.status}` };
  }

  const corpo = (await resposta.json().catch(() => null)) as {
    token?: unknown;
    org?: unknown;
    usuario?: unknown;
    criado_em?: unknown;
  } | null;

  const token = typeof corpo?.token === "string" ? corpo.token : "";
  if (!token) return { ok: false, erro: "arca-sem-token" };

  return {
    ok: true,
    token,
    org: typeof corpo?.org === "string" ? corpo.org : null,
    usuario: typeof corpo?.usuario === "string" ? corpo.usuario : e,
    criadoEm: typeof corpo?.criado_em === "string" ? corpo.criado_em : null,
  };
}

/**
 * Revoga na Arca a credencial do e-mail.
 *
 * Devolve `true` também quando a Arca diz que não havia nada para revogar: o
 * objetivo do usuário é "não ter mais acesso", e não ter é o resultado.
 * Falha de rede devolve `false` — aí o app NÃO pode apagar o cofre e fingir que
 * revogou: credencial viva com a tela dizendo "desconectado" é o pior estado.
 */
export async function revogarTokenNaArca(email: string): Promise<{ ok: boolean; erro?: string }> {
  const e = (email || "").trim().toLowerCase();
  if (!e) return { ok: false, erro: "sem-email" };
  if (!servicoConfigurado()) return { ok: false, erro: "servico-nao-configurado" };

  let resposta: Response;
  try {
    resposta = await fetch(`${ARCA_URL}/org/token-servico?email=${encodeURIComponent(e)}`, {
      method: "DELETE",
      headers: cabecalhoServico(),
      cache: "no-store",
      signal: AbortSignal.timeout(TETO_MS),
    });
  } catch {
    return { ok: false, erro: "arca-sem-resposta" };
  }

  if (resposta.ok) return { ok: true };
  // 404 = já não existia. Para quem pediu "me tira daqui", é sucesso.
  if (resposta.status === 404) return { ok: true };
  if (resposta.status === 401) return { ok: false, erro: "servico-recusado" };
  return { ok: false, erro: `arca-recusou-${resposta.status}` };
}

/**
 * O TOKEN DESTA CONTA AINDA ABRE A ARCA? — o selo "conectado" não é otimismo.
 *
 *   viva       → nada muda;
 *   morta      → ESQUECE: o botão de conectar volta a aparecer (manter o blob
 *                só faria a tela afirmar o que não é verdade);
 *   indefinido → NÃO mexe. Falha nossa (rede, 5xx) não apaga credencial de
 *                ninguém.
 *
 * Conferência é CARA para a tela: ela roda quando a conexão tem mais de 10
 * minutos sem ser checada — não a cada carregamento da página de Integrações.
 */
export async function conferirArcaDaConta(userId: number): Promise<"viva" | "morta" | "indefinido"> {
  const c = arcaDaConta(userId);
  if (!c) return "morta";

  const recente = c.conferidoEm ? Date.now() - Date.parse(c.conferidoEm) < INTERVALO_CONFERIR_MS : false;
  if (recente) return "viva";

  const token = await tokenArcaDaConta(userId);
  if (!token) return "morta";

  try {
    const resposta = await fetch(`${ARCA_URL}/org/pessoas`, {
      headers: { Authorization: `Bearer ${token}`, "user-agent": UA_APP },
      cache: "no-store",
      signal: AbortSignal.timeout(TETO_MS),
    });
    if (resposta.ok) {
      marcarConferido(userId);
      return "viva";
    }
    /* SÓ o 401 é prova de credencial inválida — e é o que a Arca devolve para
       token morto (medido 17/11/2026). 403 pode ser WAF da borda: apagar a
       credencial de alguém por causa de um bloqueio de borda seria destruir a
       conexão do cliente por um erro nosso. */
    if (resposta.status === 401) {
      esquecerArcaDaConta(userId);
      return "morta";
    }
    return "indefinido";
  } catch {
    return "indefinido";
  }
}

/* ── CREDENCIAL DE CONTA (18/11/2026) ────────────────────────────────────────
 * Pedido do dono: "o MCP tem de ser da conta, não dividido por empresa" — e
 * "no compartilha você escolhe: pessoal + organizações · só pessoal · só
 * organizações".
 *
 * Por que uma chave SEPARADA do cofre: `arca` (token de organização) continua
 * sendo o que o app usa para LER o acervo (as rotas /vault/* exigem token de
 * espaço). O MCP é outra coisa: usa credencial de CONTA, com alcance escolhido.
 * Misturar as duas quebraria a leitura do acervo.
 */
export const CHAVE_ARCA_CONTA = "arca_conta";

export type EscopoConta = "tudo" | "pessoal" | "organizacoes";

export type ContaNaArca = {
  tokenCifrado: string;
  escopo: EscopoConta;
  espacos: { espaco: string; nome: string; papel: string; pessoal: boolean; escreve?: boolean }[];
  criadoEm: string | null;
  mcp: string;
};

export function contaNaArca(userId: number): ContaNaArca | null {
  const config = getUserPlatformConfig(userId) as Record<string, unknown>;
  const v = config?.[CHAVE_ARCA_CONTA];
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.token_cifrado !== "string" || !o.token_cifrado) return null;
  const modo = String(o.escopo || "pessoal"); // padrão conservador (dono, 18/11/2026)
  const escopo: EscopoConta =
    modo === "tudo" || modo === "organizacoes" ? modo : "pessoal";
  return {
    tokenCifrado: o.token_cifrado as string,
    escopo,
    espacos: Array.isArray(o.espacos) ? (o.espacos as ContaNaArca["espacos"]) : [],
    criadoEm: typeof o.criado_em === "string" ? o.criado_em : null,
    mcp: typeof o.mcp === "string" ? o.mcp : ARCA_MCP_URL,
  };
}

export function guardarContaNaArca(
  userId: number,
  dados: { tokenClaro: string; escopo: EscopoConta; espacos: ContaNaArca["espacos"]; criadoEm: string | null; mcp: string },
): void {
  updateUserPlatformConfig(userId, {
    [CHAVE_ARCA_CONTA]: {
      token_cifrado: cifrar(dados.tokenClaro),
      escopo: dados.escopo,
      espacos: dados.espacos,
      criado_em: dados.criadoEm,
      mcp: dados.mcp,
      guardado_em: new Date().toISOString(),
    },
  });
}

export function esquecerContaNaArca(userId: number): void {
  updateUserPlatformConfig(userId, { [CHAVE_ARCA_CONTA]: null });
}

export type ResultadoContaArca = {
  ok: boolean;
  token?: string;
  escopo?: EscopoConta;
  espacos?: ContaNaArca["espacos"];
  criadoEm?: string | null;
  mcp?: string;
  erro?: string;
};

/** Provisiona (ou relê) a credencial de CONTA para o MCP, com o alcance pedido.
 *  Idempotente na Arca: o token não muda ao trocar o alcance. */
export async function pedirContaNaArca(
  email: string,
  escopo: EscopoConta = "pessoal",
): Promise<ResultadoContaArca> {
  const segredo = (process.env.ARCA_SERVICO_CREDENCIAL || "").trim();
  if (segredo.length < 20) return { ok: false, erro: "serviço da Arca não configurado neste ambiente" };
  try {
    const r = await fetch(`${ARCA_URL}/org/token-conta`, {
      method: "POST",
      headers: cabecalhoServico(),
      body: JSON.stringify({ email, escopo }),
      cache: "no-store",
      signal: AbortSignal.timeout(TETO_MS),
    });
    const d = (await r.json().catch(() => null)) as Record<string, unknown> | null;
    if (!r.ok || !d || typeof d.token !== "string") {
      return { ok: false, erro: `a Arca recusou a credencial de conta (HTTP ${r.status})` };
    }
    const modo = String((d.escopo as Record<string, unknown> | undefined)?.modo || escopo);
    const final: EscopoConta = modo === "pessoal" || modo === "organizacoes" ? modo : "tudo";
    return {
      ok: true,
      token: d.token as string,
      escopo: final,
      espacos: Array.isArray(d.espacos) ? (d.espacos as ContaNaArca["espacos"]) : [],
      criadoEm: typeof d.criado_em === "string" ? d.criado_em : null,
      mcp: typeof d.mcp === "string" ? d.mcp : ARCA_MCP_URL,
    };
  } catch (e) {
    return { ok: false, erro: `não consegui falar com a Arca: ${(e as Error).name}` };
  }
}

/** Revoga a credencial de conta do e-mail (o token deixa de valer no MCP). */
export async function revogarContaNaArca(email: string): Promise<{ ok: boolean; erro?: string }> {
  const segredo = (process.env.ARCA_SERVICO_CREDENCIAL || "").trim();
  if (segredo.length < 20) return { ok: false, erro: "serviço da Arca não configurado" };
  try {
    const r = await fetch(`${ARCA_URL}/org/token-conta?email=${encodeURIComponent(email)}`, {
      method: "DELETE",
      headers: cabecalhoServico(),
      cache: "no-store",
      signal: AbortSignal.timeout(TETO_MS),
    });
    if (!r.ok) return { ok: false, erro: `a Arca respondeu HTTP ${r.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: `não consegui falar com a Arca: ${(e as Error).name}` };
  }
}
