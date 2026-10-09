// TOKENS DE DESIGN do Arquiteto — o conjunto CURADO de cores, tipografia e
// espaçamento que dá ao projeto uma base de estilo de verdade, em vez de "só o
// que o modelo escreveu".
//
// POR QUE um conjunto pequeno: é a lista que o dono ditou (item 8). Um punhado
// de tokens que se usa em todo lugar vale mais que um editor de tema inteiro.
//
// SEGURO para CLIENTE e SERVIDOR: nada de fs/node aqui. O cliente monta o CSS
// para a prévia; o servidor usa o MESMO `normalizarTokens` para não guardar
// lixo e para montar o prompt do modelo. Uma única fonte para o formato.
//
// O FORMATO GUARDADO é este objeto plano (as chaves são os NOMES dos tokens sem
// o `--`). Na prévia ele vira `:root { --cor-primaria: …; … }`.

export const TOKENS_PADRAO = {
  "cor-primaria": "#ff751f",
  "cor-fundo": "#ffffff",
  "cor-texto": "#1a1c1f",
  "fonte": "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  "raio": "12px",
  "espaco": "16px",
} as const;

export type NomeToken = keyof typeof TOKENS_PADRAO;
export type Tokens = Record<NomeToken, string>;

/** A ordem canônica dos tokens (é a ordem do CSS e a ordem da tela). */
export const NOMES_TOKENS = Object.keys(TOKENS_PADRAO) as NomeToken[];

/** O nome da VARIÁVEL CSS de cada token (o `--` na frente). */
export function varDoToken(nome: NomeToken): string {
  return `--${nome}`;
}

/** Só texto: tira controle, `<`, `>`, `{`, `}`, `;`, chaves de CSS e o `--`. */
function textoLimpo(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>{};]/g, "")
    .replace(/--/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** Cor em hexadecimal (`#rgb`, `#rrggbb`, `#rrggbbaa`). O que não casar cai no padrão. */
function pareceCor(v: string): boolean {
  return /^#[0-9a-f]{3}$/i.test(v) || /^#[0-9a-f]{6}$/i.test(v) || /^#[0-9a-f]{8}$/i.test(v);
}

/** Medida de tamanho em px (`0`..`999` → `"Npx"`). Qualquer unidade vira px sem drama. */
function normalizarMedida(v: unknown): string {
  if (typeof v === "number" && Number.isFinite(v)) {
    const n = Math.max(0, Math.min(999, Math.round(v)));
    return `${n}px`;
  }
  if (typeof v === "string") {
    const m = v.trim().match(/^(\d{1,3}(?:\.\d+)?)\s*(?:px)?$/i);
    if (m) {
      const n = Math.max(0, Math.min(999, Math.round(Number(m[1]))));
      return `${n}px`;
    }
  }
  return "";
}

/**
 * Normaliza QUALQUER coisa num conjunto COMPLETO e seguro de tokens. Campo
 * ausente/inválido cai no PADRÃO — o resultado nunca tem buraco nem valor capaz
 * de escapar do `<style>`. Nunca lança. É a validação usada nos dois lados.
 */
export function normalizarTokens(bruto: unknown): Tokens {
  const o = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const saida = { ...TOKENS_PADRAO } as Tokens;

  const cor1 = textoLimpo(o["cor-primaria"], 9);
  if (pareceCor(cor1)) saida["cor-primaria"] = cor1.toLowerCase();

  const cor2 = textoLimpo(o["cor-fundo"], 9);
  if (pareceCor(cor2)) saida["cor-fundo"] = cor2.toLowerCase();

  const cor3 = textoLimpo(o["cor-texto"], 9);
  if (pareceCor(cor3)) saida["cor-texto"] = cor3.toLowerCase();

  const fonte = textoLimpo(o["fonte"], 120);
  if (fonte) saida["fonte"] = fonte;

  const raio = normalizarMedida(o["raio"]);
  if (raio) saida["raio"] = raio;

  const espaco = normalizarMedida(o["espaco"]);
  if (espaco) saida["espaco"] = espaco;

  return saida;
}

/** Dois conjuntos de tokens são iguais? (comparação por valor, ordem canônica) */
export function tokensIguais(a: Tokens, b: Tokens): boolean {
  return NOMES_TOKENS.every((n) => a[n] === b[n]);
}

/** Impressão estável dos tokens — para comparar "mudou?" no servidor. */
export function assinaturaTokens(t: Tokens): string {
  return NOMES_TOKENS.map((n) => `${n}=${t[n]}`).join(";");
}

/**
 * O CSS dos tokens como um bloco `<style>` para a PRÉVIA. Só as variáveis na
 * raiz — NENHUMA regra de layout/pintura. Os tokens são a CAMADA DE BASE: quem
 * pinta de verdade é o CSS do projeto (via `var(--…)`), e como o bloco é
 * injetado ANTES do CSS do projeto, o projeto vence em caso de empate (ver a
 * decisão de cascata em `montarPrevia`, em page.tsx).
 */
export function cssDeTokens(tokens: Tokens): string {
  const t = normalizarTokens(tokens);
  const corpo = NOMES_TOKENS.map((n) => `${varDoToken(n)}:${t[n]}`).join(";");
  return `<style id="__arquiteto_tokens" data-arquiteto-tokens>:root{${corpo}}</style>`;
}

/** A leitura dos tokens como pares `--nome: valor` legíveis (para a tela). */
export function listarTokens(tokens: Tokens): { nome: NomeToken; variavel: string; valor: string }[] {
  const t = normalizarTokens(tokens);
  return NOMES_TOKENS.map((n) => ({ nome: n, variavel: varDoToken(n), valor: t[n] }));
}
