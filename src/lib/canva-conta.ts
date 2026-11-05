/**
 * A CONEXÃO DE CANVA DA CONTA — cada pessoa na própria conta.
 *
 * Pedido do dono (19/10/2026), verbatim: *"Each person can use their own account
 * of the Canva, each client, you know? And not just one account."*
 *
 * Por que não usar o MCP do Hermes para isso: `mcp_servers.canva` guarda UM
 * token, de quem autorizou. Design pertence à conta que o criou — o token do
 * dono não abre o Canva do cliente. Então o caminho multi-tenant é este: token
 * por PESSOA, no cofre da conta (`users.platform_config`), cifrado.
 *
 * Espelha `github-conta.ts` de propósito: mesma forma de guardar, mesma leitura
 * de "está conectado" (`estaLigada` via `chaveConfig: "canva"` no catálogo),
 * mesma renovação antes de vencer.
 *
 * ⚠️ O REFRESH DO CANVA É DE USO ÚNICO. Cada renovação devolve outro e mata o
 * anterior. Este arquivo regrava o par novo a cada renovação — sem isso a
 * conexão do cliente morre em ~4h e a tela continua dizendo "conectado".
 */
import { getUserPlatformConfig, updateUserPlatformConfig } from "./auth";

/** A chave no cofre da conta. É a mesma do `chaveConfig` no catálogo. */
export const CHAVE_CANVA = "canva";

export type CanvaDaConta = {
  /** o blob CIFRADO (o servidor decifra só na hora de usar). */
  tokenCifrado: string;
  /** o refresh CIFRADO — sem ele a conexão morre em 4h. */
  refreshCifrado: string | null;
  /** nome da conta Canva (para a tela mostrar QUEM conectou). */
  nome: string | null;
  em: string | null;
  /** ISO-8601 do vencimento; `null` = o Canva não declarou prazo. */
  expiraEm: string | null;
};

/** Grava a conexão no cofre da conta (chamado pelo retorno do consentimento). */
export function guardarCanvaDaConta(
  userId: number,
  tokenCifrado: string,
  refreshCifrado: string | null = null,
  expiraEm: string | null = null,
  nome = "",
): void {
  updateUserPlatformConfig(userId, {
    [CHAVE_CANVA]: {
      token_cifrado: tokenCifrado,
      refresh_cifrado: refreshCifrado,
      nome: nome || null,
      connected_at: new Date().toISOString(),
      expira_em: expiraEm,
    },
  });
}

/** A conexão da conta, ou null. Nunca inventa: só lê o que existe. */
export function canvaDaConta(userId: number): CanvaDaConta | null {
  const config = getUserPlatformConfig(userId) as Record<string, unknown>;
  const v = config?.[CHAVE_CANVA];
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.token_cifrado !== "string" || !o.token_cifrado) return null;
  return {
    tokenCifrado: o.token_cifrado,
    refreshCifrado: typeof o.refresh_cifrado === "string" && o.refresh_cifrado ? o.refresh_cifrado : null,
    nome: typeof o.nome === "string" ? o.nome : null,
    em: typeof o.connected_at === "string" ? o.connected_at : null,
    expiraEm: typeof o.expira_em === "string" ? o.expira_em : null,
  };
}

/**
 * O TOKEN VÁLIDO da conta — o ÚNICO lugar que decide se precisa renovar.
 *
 * O access_token do Canva vive 4h. Antes de entregar, confere o prazo e renova
 * se venceu; o par NOVO (access + refresh rotacionado) é regravado no cofre.
 *
 * Devolve `null` só quando NÃO HÁ conexão. Se houver e a renovação falhar,
 * devolve o token atual (o consumidor trata o 401 e manda reconectar) — nunca
 * inventa, nunca esconde.
 */
export async function tokenCanvaDaConta(userId: number): Promise<string | null> {
  const { decifrar, cifrar } = await import("./segredo-guardado");
  const c = canvaDaConta(userId);
  if (!c) return null;

  const atual = decifrar(c.tokenCifrado);
  if (!atual) return null;

  const venceu = c.expiraEm ? Date.parse(c.expiraEm) <= Date.now() : false;
  if (!venceu) return atual;

  const refresh = c.refreshCifrado ? decifrar(c.refreshCifrado) : null;
  if (!refresh) {
    // Sem refresh nao ha como renovar. Devolver o token VENCIDO faz o
    // fornecedor devolver 401 e a pessoa esperar 40s por um token morto.
    // `null` e o que faz a ferramenta dizer "reconecte" na hora.
    return null;
  }

  const { renovarTokenCanva } = await import("./canva-oauth");
  const r = await renovarTokenCanva(refresh);
  if (!r.ok) {
    // O refresh e de USO UNICO: se a renovacao falhou, ele pode ter sido
    // consumido mesmo assim (e a resposta chegou quebrada). Devolver o token
    // vencido so adia o erro e custa a espera. Sem Renovacao = reconectar.
    return null;
  }

  // Uso único: o refresh que acabou de ser usado já morreu. Grava o par NOVO.
  guardarCanvaDaConta(
    userId,
    cifrar(r.token),
    r.refreshToken ? cifrar(r.refreshToken) : null,
    r.expiraEm,
    c.nome || "",
  );
  return r.token;
}

/** Desconecta (a pessoa tirou o Canva da conta). */
export function esquecerCanvaDaConta(userId: number): void {
  updateUserPlatformConfig(userId, { [CHAVE_CANVA]: null });
}

/**
 * O CANVA DESTA CONTA RESPONDE? — e o que fazer quando não responde.
 *
 * Mesmo desenho do `conferirGithubDaConta`: o selo "conectado" não pode ser
 * otimismo. Mas com um cuidado de custo: o `access_token` do Canva vale 4h, e
 * consultar o fornecedor a CADA carregamento da tela de Integrações atrasaria a
 * página de todo mundo. Então:
 *
 *   1. `tokenCanvaDaConta` já renova quando venceu. Se depois da chamada o
 *      `expira_em` continua no futuro, o token está NOVO → está vivo, e não
 *      gastamos uma chamada de rede para confirmar o óbvio.
 *   2. Só quando o token segue vencido (não havia refresh, ou a renovação
 *      falhou) é que perguntamos ao Canva (`/oauth/introspect`).
 *   3. `morto` → ESQUECE: o botão de conectar volta a aparecer. `indefinido`
 *      (rede, 5xx) → NÃO mexe. Falha nossa não apaga credencial de ninguém.
 */
export async function conferirCanvaDaConta(userId: number): Promise<void> {
  try {
    if (!canvaDaConta(userId)) return;
    const token = await tokenCanvaDaConta(userId);
    if (!token) return;

    const depois = canvaDaConta(userId);
    const aindaVencido = depois?.expiraEm ? Date.parse(depois.expiraEm) <= Date.now() : false;
    if (!aindaVencido) return; // renovado agora ou ainda válido

    const { introspectarToken } = await import("./canva-oauth");
    const estado = await introspectarToken(token);
    if (estado === "morto") esquecerCanvaDaConta(userId);
  } catch {
    /* conferir integração não pode derrubar a lista de integrações */
  }
}
