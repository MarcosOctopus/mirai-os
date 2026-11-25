/**
 * TESTAR A CREDENCIAL DE UM PROVEDOR — uma chamada barata que PROVA a chave.
 *
 * POR QUE existe: a mesma doutrina do CRM. Antes de gravar, o CRM é confirmado
 * AO VIVO (`saasoValidarCredencial`). Os provedores da ponte (supabase, github,
 * openai, groq, openrouter, google) precisam da mesma garantia: nunca se guarda
 * uma chave não testada e nunca se diz "conectado" sem o provedor ter
 * respondido. A tela só mostra "conectado" quando há prova.
 *
 * COMO: a chamada é montada pelo CATÁLOGO (`provedorDaPonte(id).comoMontar`) —
 * o mesmo lugar que a ponte usa — para endereço e cabeçalhos. Aqui só se
 * escolhe o caminho MAIS BARATO de cada provedor para responder "esta chave
 * vale?" (listar o que já é público na conta; nunca criar, nunca gastar).
 *
 * SEGREDO: a credencial só entra nos cabeçalhos da chamada ao provedor. NUNCA é
 * logada, NUNCA volta em mensagem, NUNCA é devolvida. O retorno é só
 * `{ ok, mensagem }`, sempre em PT-BR e honesto.
 *
 * NUNCA lança: falha de rede vira `{ ok: false }` com recado. Timeout de 12s.
 */

import { provedorDaPonte, semBarraFinal } from "./ponte-provedores";

export type ResultadoTeste = { ok: boolean; mensagem: string };

/** Tempo máximo de espera do provedor — acima disto é "não alcançei agora". */
const TIMEOUT_MS = 12000;

/**
 * O caminho de menor custo de cada provedor para provar a credencial (todos
 * GET, todos de leitura). A chave do mapa é o `id` do catálogo.
 *   - github     → /user          (quem sou eu — exige token válido);
 *   - openai     → /v1/models     (lista modelos da conta);
 *   - groq       → /openai/v1/models
 *   - openrouter → /v1/models
 *   - google     → /v1beta/models (Gemini);
 *   - supabase   → /rest/v1/       (raiz da API REST do projeto);
 *   - telegram   → /getMe          (devolve o próprio bot — sem número da pessoa);
 *   - instagram  → /me?fields=id,username (prova a credencial e diz de quem é).
 */
const CAMINHO_DE_TESTE: Record<string, string> = {
  github: "/user",
  openai: "/v1/models",
  groq: "/openai/v1/models",
  openrouter: "/v1/models",
  google: "/v1beta/models",
  supabase: "/rest/v1/",
  telegram: "/getMe",
  instagram: "/me?fields=id,username",
};

/**
 * Testa UMA credencial de provedor ao vivo. Devolve `{ ok, mensagem }` em PT-BR.
 *
 * Nunca lança e nunca devolve a credencial. `config` é o mesmo objeto que será
 * guardado na integração (é de lá que o Supabase tira o endereço do projeto).
 */
export async function testarCredencial(
  tipo: string,
  credencial: string,
  config: Record<string, unknown> | null,
): Promise<ResultadoTeste> {
  const id = (tipo || "").trim().toLowerCase();
  const chave = (credencial || "").trim();
  if (!chave) {
    return { ok: false, mensagem: "credencial é obrigatória" };
  }

  const provedor = provedorDaPonte(id);
  if (!provedor) {
    return { ok: false, mensagem: `não sei testar a credencial de ${id}` };
  }

  const caminho = CAMINHO_DE_TESTE[provedor.id];
  if (!caminho) {
    return { ok: false, mensagem: `ainda não sei testar a credencial de ${id}` };
  }

  // O CATÁLOGO monta endereço e cabeçalhos. Supabase devolve null sem o
  // endereço do projeto — e aí a resposta honesta é pedir esse endereço.
  const alvo = provedor.comoMontar(chave, config);
  if (!alvo) {
    return {
      ok: false,
      mensagem:
        provedor.id === "supabase"
          ? "informe o endereço do projeto Supabase"
          : `a integração ${id} está sem endereço configurado`,
    };
  }

  const url = `${semBarraFinal(alvo.base)}${caminho}`;

  let resposta: Response;
  try {
    resposta = await fetch(url, {
      method: "GET",
      headers: alvo.cabecalhos,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // Sem detalhe do erro de rede: recado curto, nada da credencial.
    return { ok: false, mensagem: "não alcançei o provedor agora" };
  }

  if (resposta.ok) {
    return { ok: true, mensagem: "credencial aceita pelo provedor" };
  }
  if (resposta.status === 401 || resposta.status === 403) {
    return { ok: false, mensagem: "credencial recusada pelo provedor" };
  }
  return {
    ok: false,
    mensagem: `o provedor respondeu com erro (HTTP ${resposta.status})`,
  };
}
