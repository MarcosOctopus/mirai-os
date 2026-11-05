/**
 * PUBLICAR + CONSTRUIR num passo só — o que faltava para "cola o link e está no ar".
 *
 * Medido (19/10/2026): importar um repositório deixava o projeto **não publicado**.
 * O cliente precisava, na ordem: importar → achar o botão Publicar → esperar o
 * build → abrir o endereço. Quatro passos com espera no meio, e o mais provável é
 * ele travar no último ("Aplicação subindo…").
 *
 * Esta função junta os passos que já existiam (publicar, dar endereço, construir).
 * Não inventa caminho novo: usa as MESMAS funções da rota /publicar, para as duas
 * portas não divergirem com o tempo.
 *
 * O encadeamento `preparar → subir` fica no runner (é lá que o estado do disco diz
 * se o projeto é estático ou servidor) — aqui só se pede `preparar`.
 */
import {
  publicarProjeto,
  garantirSlug,
  obterProjeto,
  podePublicarMaisUmApp,
} from "./arquiteto-projetos";
import { enderecoDoSlug } from "./dominio-projetos";
import { comecarNoRunner, runnerConfigurado } from "./runner";

export type ResultadoPublicacao = {
  publicado: boolean;
  /** Endereço `<slug>.miraitohope.com`, quando há slug. */
  endereco: string | null;
  slug: string | null;
  token: string | null;
  /** O runner foi acionado para construir (e, se for servidor, subir). */
  construindo: boolean;
  /** Presente quando a publicação foi recusada (teto do plano, etc.). */
  erro?: string;
};

/**
 * Publica e manda construir. NUNCA lança: uma falha aqui não pode desfazer um
 * import que já deu certo — o projeto fica salvo, só não publicado.
 */
export async function publicarEConstruir(
  userId: number,
  projetoId: string,
): Promise<ResultadoPublicacao> {
  const vazio: ResultadoPublicacao = {
    publicado: false,
    endereco: null,
    slug: null,
    token: null,
    construindo: false,
  };

  const antes = obterProjeto(userId, projetoId);
  if (!antes) return { ...vazio, erro: "Projeto não encontrado." };

  // Teto de apps no ar do plano: mesma porteira da rota /publicar. Republicar o
  // que já está publicado passa direto; app estático não conta.
  const ehApp = antes.arquivos.some((a) => a.nome.toLowerCase() === "package.json");
  if (ehApp && !antes.publicado_em) {
    const pode = await podePublicarMaisUmApp(userId, projetoId);
    if (!pode.ok) return { ...vazio, erro: pode.erro };
  }

  const r = publicarProjeto(userId, projetoId);
  if (!r) return { ...vazio, erro: "Não consegui registrar a publicação." };

  const slug = garantirSlug(userId, projetoId);

  let construindo = false;
  if (ehApp && runnerConfigurado()) {
    const envio = await comecarNoRunner(userId, projetoId, "preparar");
    // 409 = já existe execução em curso; não é erro, é "já está indo".
    construindo = envio.ok || /já existe uma execução/i.test(envio.erro || "");
  }

  return {
    publicado: true,
    endereco: slug ? enderecoDoSlug(slug) : null,
    slug,
    token: r.token,
    construindo,
  };
}
