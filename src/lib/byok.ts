/**
 * BYOK — a chave de API PRÓPRIA da pessoa (dono, 13/11/2026).
 *
 * POR QUE existe: até aqui o chat gastava a chave GLOBAL do app. Quem tem
 * contrato próprio com a OpenRouter/OpenAI (o cliente que quer faturar no
 * cartão dele, sem depender da nossa fila) não tinha por onde cadastrar.
 *
 * REGRAS QUE NÃO SE NEGOCIAM (estão todas implementadas aqui, num lugar só,
 * para nenhuma rota reinventar):
 *   1. a chave é gravada CIFRADA — reusa `cifrar`/`decifrar` de
 *      `segredo-guardado.ts` (AES-256-GCM, chave derivada do JWT_SECRET por
 *      HKDF). Nada de cifra nova: duas cifras no mesmo app é duas chances de
 *      errar e uma delas fica sem manutenção;
 *   2. a chave NUNCA sai em claro de uma rota — o que a tela recebe é a
 *      MASCARADA (`sk-…4f2a`). Quem decifra é só o caminho do chat, no
 *      servidor;
 *   3. a chave NUNCA vai para log. Nenhum `console.*` deste arquivo imprime
 *      chave, blob ou prefixo grande;
 *   4. o cofre é POR ESCOPO e explícito: a chave pode viver no espaço PESSOAL
 *      de quem cadastrou (padrão) ou no espaço da ORGANIZAÇÃO, quando a pessoa
 *      escolhe. Quem decide os escopos válidos é `escopos.ts` — nunca uma
 *      adivinhação do tipo "org se existir, senão pessoal".
 *
 * Onde fica: `platform_config.byok_chaves` (lista) + `byok_padrao` (qual
 * provedor o chat usa quando há mais de um cadastrado).
 */
import { lerCofre, gravarCofre } from "./cofre-escopo";
import { cifrar, decifrar } from "./segredo-guardado";
import type { Escopo } from "./escopos";

/** Provedores aceitos hoje. Cada um tem base própria e formato OpenAI. */
export type ProvedorByok = "openrouter" | "openai";

export const PROVEDORES_BYOK: {
  id: ProvedorByok;
  nome: string;
  base: string;
  /** modelo usado quando a pessoa não escolhe um */
  modeloPadrao: string;
  /** onde ela pega a chave — a tela mostra o link, nunca pede por chat */
  ondePegar: string;
}[] = [
  {
    id: "openrouter",
    nome: "OpenRouter",
    base: "https://openrouter.ai/api/v1",
    modeloPadrao: "deepseek/deepseek-chat",
    ondePegar: "https://openrouter.ai/keys",
  },
  {
    id: "openai",
    nome: "OpenAI",
    base: "https://api.openai.com/v1",
    modeloPadrao: "gpt-4o-mini",
    ondePegar: "https://platform.openai.com/api-keys",
  },
];

export function provedorValido(p: unknown): p is ProvedorByok {
  return p === "openrouter" || p === "openai";
}

function metaDoProvedor(p: ProvedorByok) {
  return PROVEDORES_BYOK.find((x) => x.id === p) ?? PROVEDORES_BYOK[0];
}

/**
 * O que a TELA pode ver de uma chave: só o suficiente para a pessoa
 * reconhecer qual é ("ah, é a que termina em 4f2a"). Nunca a chave.
 */
export function mascararChave(chave: string): string {
  const s = (chave || "").trim();
  if (s.length <= 8) return "••••";
  return `${s.slice(0, 3)}…${s.slice(-4)}`;
}

/** Linha do cofre, como fica gravada. `blob` é o segredo cifrado. */
type LinhaCofre = {
  provider: ProvedorByok;
  blob: string;
  modelo: string;
  criado_em: string;
};

/** O que a tela recebe — SEM blob, SEM chave. */
export type ChaveNaTela = {
  provider: ProvedorByok;
  nome: string;
  modelo: string;
  mascarada: string;
  criado_em: string;
  padrao: boolean;
};

function lerLinhas(escopo: Escopo): LinhaCofre[] {
  const cfg = lerCofre(escopo);
  const lista = cfg?.byok_chaves;
  if (!Array.isArray(lista)) return [];
  const saida: LinhaCofre[] = [];
  for (const item of lista) {
    const c = item as Record<string, unknown>;
    if (!provedorValido(c?.provider)) continue;
    if (typeof c?.blob !== "string" || !c.blob) continue;
    saida.push({
      provider: c.provider,
      blob: c.blob,
      modelo: typeof c.modelo === "string" ? c.modelo : "",
      criado_em: typeof c.criado_em === "string" ? c.criado_em : "",
    });
  }
  return saida;
}

/**
 * A chave PADRÃO da pessoa, decifrada — e SÓ para o caminho do servidor que vai
 * falar com o provedor. Nome deliberadamente diferente do de listagem para
 * ninguém usar esta por engano numa resposta HTTP.
 */
export function chavePropriaDaConta(
  escopo: Escopo,
): { provider: ProvedorByok; base: string; chave: string; modelo: string } | null {
  const linhas = lerLinhas(escopo);
  if (!linhas.length) return null;

  // A ordem de preferência é a que a PESSOA escolheu; se não houver escolha
  // (ou a escolhida foi removida), vale a primeira cadastrada.
  const cfg = lerCofre(escopo);
  const preferida = cfg?.byok_padrao;
  const linha =
    (provedorValido(preferida) ? linhas.find((l) => l.provider === preferida) : undefined) ?? linhas[0];

  const cru = decifrar(linha.blob);
  // Blob adulterado ou o JWT_SECRET mudou: melhor cair na chave global do que
  // mandar um "Bearer null" ao provedor e parecer que a internet caiu.
  if (!cru || cru.length < 8) return null;

  const meta = metaDoProvedor(linha.provider);
  return {
    provider: linha.provider,
    base: meta.base,
    chave: cru,
    modelo: linha.modelo || meta.modeloPadrao,
  };
}

/** Lista para a tela — mascara cada chave e diz qual é a padrão. */
export function listarChaves(escopo: Escopo): ChaveNaTela[] {
  const linhas = lerLinhas(escopo);
  const cfg = lerCofre(escopo);
  const preferida = cfg?.byok_padrao;
  const padraoEfetiva = provedorValido(preferida)
    ? preferida
    : linhas[0]?.provider;

  return linhas.map((l) => {
    const meta = metaDoProvedor(l.provider);
    const cru = decifrar(l.blob) ?? "";
    return {
      provider: l.provider,
      nome: meta.nome,
      modelo: l.modelo || meta.modeloPadrao,
      mascarada: cru ? mascararChave(cru) : "••••",
      criado_em: l.criado_em,
      padrao: l.provider === padraoEfetiva,
    };
  });
}

/**
 * Grava (ou substitui) a chave de UM provedor para esta pessoa.
 *
 * Substitui em vez de acumular: recadastrar a mesma chave não pode virar duas
 * linhas — a lista é "uma chave por provedor", e a pessoa troca a dela.
 */
export function salvarChave(
  escopo: Escopo,
  provider: ProvedorByok,
  chave: string,
  modelo?: string,
): { ok: true } | { ok: false; motivo: string } {
  const limpa = (chave || "").trim();
  // Validação frouxa DE PROPÓSITO: o formato de chave de cada provedor muda
  // (a OpenRouter já mudou de prefixo). O que se exige é que pareça uma chave,
  // não que case com um regex que envelhece.
  if (limpa.length < 16) return { ok: false, motivo: "a chave parece curta demais (mínimo 16 caracteres)" };
  if (/\s/.test(limpa)) return { ok: false, motivo: "a chave não pode ter espaços ou quebra de linha" };

  const meta = metaDoProvedor(provider);
  const existentes = lerLinhas(escopo).filter((l) => l.provider !== provider);
  const linha: LinhaCofre = {
    provider,
    blob: cifrar(limpa),
    modelo: (modelo || "").trim() || meta.modeloPadrao,
    criado_em: new Date().toISOString(),
  };
  gravarCofre(escopo, {
    byok_chaves: [linha, ...existentes],
    // A recém-cadastrada passa a ser a padrão: quem acabou de colar a chave
    // espera que ela VALHA, não que continue valendo a anterior.
    byok_padrao: provider,
  });
  return { ok: true };
}

/** Remove a chave de um provedor. Devolve true se havia algo para remover. */
export function removerChave(escopo: Escopo, provider: ProvedorByok): boolean {
  const linhas = lerLinhas(escopo);
  const restantes = linhas.filter((l) => l.provider !== provider);
  if (restantes.length === linhas.length) return false;

  const cfg = lerCofre(escopo);
  const novaPadrao = provedorValido(cfg?.byok_padrao) && cfg.byok_padrao !== provider
    ? cfg.byok_padrao
    : restantes[0]?.provider ?? "";

  gravarCofre(escopo, {
    byok_chaves: restantes,
    byok_padrao: novaPadrao,
  });
  return true;
}

/** Define qual provedor cadastrado o chat usa. */
export function definirPadrao(escopo: Escopo, provider: ProvedorByok): boolean {
  const existe = lerLinhas(escopo).some((l) => l.provider === provider);
  if (!existe) return false;
  gravarCofre(escopo, { byok_padrao: provider });
  return true;
}
