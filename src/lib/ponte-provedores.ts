// CATÁLOGO DOS PROVEDORES DA PONTE DAS INTEGRAÇÕES (só no servidor).
//
// POR QUE existe: o Arquiteto gera SITES ESTÁTICOS. Um site estático NÃO pode
// guardar chave — ela viraria pública no navegador. Então a chave fica no NOSSO
// servidor e o site PUBLICADO pede POR NÓS: chama
// `/api/ponte/<projeto>/<integração>/...` e ESTA camada diz para onde ir e como
// se identificar. A chave NUNCA chega ao navegador.
//
// O QUE é cada entrada: `{ id, base?, comoMontar(credencial, config) }`.
//   - `base`  = o endereço FIXO do provedor, quando existe (ex.: api.github.com).
//   - `comoMontar` = devolve `{ base, cabecalhos }` para a chamada. Quando o
//     endereço é DA CONTA (ex.: Supabase — cada cliente tem o seu), ele lê do
//     `config`/`credencial` guardados e devolve `null` se faltar o essencial —
//     a rota então responde 409 com recado, em vez de chamar o lugar errado.
//
// COMO ADICIONAR UM PROVEDOR NOVO (uma linha + a entrada no mapa): para provedor
// de endereço FIXO, use `fixo(id, url, (credencial) => cabecalhos)`; para
// endereço DA CONTA, escreva um `comoMontar` curto que lê do `config`. Depois
// inclua a constante em `PROVEDORES`. Nada mais precisa mudar — a rota lê daqui.
//
// SEGREDO: nenhuma função daqui devolve a credencial em log ou mensagem; ela só
// entra no cabeçalho da chamada ao provedor.

/** O destino montado de uma chamada: base + cabeçalhos (com a credencial). */
export type AlvoProvedor = {
  base: string;
  cabecalhos: Record<string, string>;
};

export type ProvedorPonte = {
  id: string;
  /** Endereço fixo, quando o provedor tem um só (Supabase não tem — é da conta). */
  base?: string;
  comoMontar: (
    credencial: string,
    config: Record<string, unknown> | null,
  ) => AlvoProvedor | null;
};

/** Tira a barra final, para não montar `//` ao juntar com o caminho. */
export function semBarraFinal(url: string): string {
  return (url || "").trim().replace(/\/+$/, "");
}

/** Primeiro valor de TEXTO não vazio entre as chaves dadas no `config`. */
function textoDe(config: Record<string, unknown> | null, ...chaves: string[]): string {
  if (!config) return "";
  for (const c of chaves) {
    const v = config[c];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/** Atalho para provedor de endereço FIXO: só a credencial muda por conta. */
function fixo(
  id: string,
  base: string,
  cabecalhos: (credencial: string) => Record<string, string>,
): ProvedorPonte {
  return {
    id,
    base,
    comoMontar: (credencial) => ({ base, cabecalhos: cabecalhos(credencial) }),
  };
}

/* ── Provedores ───────────────────────────────────────────────────────────── */

/**
 * Supabase — o endereço é DA CONTA (cada projeto Supabase tem o seu
 * `https://<ref>.supabase.co`). Ele vem do `config` da integração. A credencial
 * (service_role/anon) entra em `apikey` E em `Authorization: Bearer`: a API REST
 * aceita os dois e assim funciona tanto para leitura pública quanto autenticada.
 * Sem o endereço no `config`, não há alvo — a rota responde 409 com recado.
 */
const supabase: ProvedorPonte = {
  id: "supabase",
  comoMontar(credencial, config) {
    const base = semBarraFinal(
      textoDe(config, "url", "supabase_url", "project_url", "endpoint"),
    );
    if (!base) return null;
    return {
      base,
      cabecalhos: {
        apikey: credencial,
        authorization: `Bearer ${credencial}`,
      },
    };
  },
};

/** GitHub — endereço FIXO. Cabeçalhos que a API exige (versão + User-Agent). */
const github = fixo("github", "https://api.github.com", (credencial) => ({
  authorization: `Bearer ${credencial}`,
  accept: "application/vnd.github+json",
  "x-github-api-version": "2022-11-28",
  "user-agent": "mirai-os",
}));

/** [OI] — endereço FIXO. O caminho da chamada já traz a versão (`v1/...`). */
const openai = fixo("openai", "https://api.openai.com", (credencial) => ({
  authorization: `Bearer ${credencial}`,
}));

/** Groq — endereço FIXO (compatível com a API da [OI]; o caminho traz `openai/v1`). */
const groq = fixo("groq", "https://api.groq.com", (credencial) => ({
  authorization: `Bearer ${credencial}`,
}));

/** OpenRouter — endereço FIXO; o caminho traz `v1/...` depois de `/api`. */
const openrouter = fixo("openrouter", "https://openrouter.ai/api", (credencial) => ({
  authorization: `Bearer ${credencial}`,
}));

/** Google Gemini — endereço FIXO. A chave vai no cabeçalho `x-goog-api-key`. */
const google = fixo("google", "https://generativelanguage.googleapis.com", (credencial) => ({
  "x-goog-api-key": credencial,
}));

/** O mapa ID → provedor. É a ÚNICA lista que a rota consulta. */
export const PROVEDORES: Record<string, ProvedorPonte> = {
  supabase,
  github,
  openai,
  groq,
  openrouter,
  google,
};

/**
 * Os ids que a ponte fala, na ordem do mapa. Quem precisa ACEITAR um tipo de
 * provedor (ex.: o POST de /api/integracoes) importa ESTA lista — assim não
 * existe uma segunda lista para divergir do catálogo; cadastrar um provedor
 * novo é acrescentar a entrada acima, só.
 */
export const IDS_PROVEDORES: readonly string[] = Object.keys(PROVEDORES);

/** O provedor de um id (`null` quando a ponte ainda não fala com ele → 501). */
export function provedorDaPonte(id: string): ProvedorPonte | null {
  return PROVEDORES[(id || "").trim().toLowerCase()] || null;
}
