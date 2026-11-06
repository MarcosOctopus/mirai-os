/**
 * O CLIENTE DA ARCA — uma porta só, com token explícito.
 *
 * POR QUE ESTE MÓDULO EXISTE (medido 05/11/2026): a app falava com a Arca em
 * três lugares, cada um com seu próprio `const ARCA_URL = "https://arca..."` e
 * SEM credencial nenhuma. Funcionava porque a Arca liberava por IP de origem
 * (`ARCA_TRUSTED_IPS`), mas essa regra não distingue o Core da Mirai 2: o
 * egress da VM sai pelo MESMO IP público do host (NAT do QEMU user-networking),
 * então o Cloudflare entrega `CF-Connecting-IP` = IP do Core e a guarda
 * abre. Ou seja: a app da VM entrava na Arca "por acidente de NAT", não por
 * autorização — e a Fase 3 vai precisar exatamente do contrário.
 *
 * A REGRA DESTE MÓDULO: a Arca é sempre chamada com `X-Arca-Token`. Sem
 * token, a chamada NÃO acontece (devolve vazio/erro honesto). Confiar na
 * liberação por IP é depender de accidents de NAT — e a Arca tem rota de
 * ESCRITA (`POST /memory`), então a Surface que importa é a de escrita.
 *
 * O token vem de `ARCA_TOKEN` (env do ambiente). Onde o ambiente não define
 * (o Core, que roda colado no mesmo host), o token é lido do arquivo
 * `.arca-token` — o mesmo arquivo que o servidor da Arca usa.
 */

const ARCA_URL = process.env.ARCA_URL || "https://arca.miraitohope.com";

/** Caminho do arquivo de token — o mesmo que o servidor da Arca lê. */
const ARCA_TOKEN_PATH =
  process.env.ARCA_TOKEN_PATH || "/opt/data/arca/api/.arca-token";

let tokenEmCache: string | null = null;

/**
 * O token da Arca, ou string vazia se este ambiente não tiver um.
 *
 * Ordem: env `ARCA_TOKEN` → arquivo `ARCA_TOKEN_PATH`. O cache é por
 * processo: o token não muda em runtime, e ler o disco a cada requisição
 * seria desperdício num caminho quente (o chat consulta a Arca por turno).
 */
export function tokenDaArca(): string {
  if (tokenEmCache !== null) return tokenEmCache;

  const doEnv = (process.env.ARCA_TOKEN || "").trim();
  if (doEnv) {
    tokenEmCache = doEnv;
    return tokenEmCache;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("fs") as typeof import("fs");
    if (fs.existsSync(ARCA_TOKEN_PATH)) {
      const bruto = fs.readFileSync(ARCA_TOKEN_PATH, "utf8").trim();
      tokenEmCache = bruto || "";
      return tokenEmCache;
    }
  } catch {
    // Sem acesso ao arquivo = sem token. Falha fechada, sem exception.
  }

  tokenEmCache = "";
  return tokenEmCache;
}

/** Este ambiente tem credencial para falar com a Arca? */
export function arcaConfigurada(): boolean {
  return tokenDaArca().length > 0;
}

/**
 * Headers de autenticação da Arca. Vazio quando não há token — e aí o
 * chamador precisa saber que a chamada não vai passar.
 */
export function headersDaArca(extra?: Record<string, string>): Record<string, string> {
  const token = tokenDaArca();
  const h: Record<string, string> = { ...(extra || {}) };
  if (token) h["X-Arca-Token"] = token;
  return h;
}

/**
 * A Arca está configurada NESTE ambiente?
 * Usado nas rotas para responder 503 honesto ("faltou credencial") em vez
 * de um 502 genérico que parece falha da Arca.
 */
export function erroDeCredencial(): string {
  return (
    "Arca sem credencial neste ambiente: defina ARCA_TOKEN " +
    "(ou o arquivo .arca-token) para poder chamar a Arca por token."
  );
}
