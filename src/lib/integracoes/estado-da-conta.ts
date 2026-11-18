/* ── A REGRA ÚNICA de "esta integração está conectada NESTA conta" ─────────
 *
 * Fonte da verdade extraída de `src/app/dashboard/connect/page.tsx`
 * (08/10/2026), quando a grade `/dashboard/integracoes` nasceu. As DUAS telas
 * chamam ESTAS funções — nenhuma decide sozinha. Se a regra mudar, muda aqui
 * uma vez, e não existe como a mesma integração aparecer "ligada" numa tela e
 * "não conectada" na outra (o defeito que motivou a fonte única).
 *
 * De onde o estado sai, nesta ordem:
 *   1. as LINHAS de integração DESTA CONTA (GET /api/integracoes): `minhas`
 *      (as da pessoa) primeiro, `daEmpresa` como apoio;
 *   2. para o CRM, a confirmação AO VIVO (GET /api/integracoes/saaso) — sem
 *      resposta do CRM ele NÃO aparece conectado: nunca se finge conexão;
 *   3. por fim o cofre DESTA CONTA (platform_config), onde OAuth e chaves de
 *      API gravam.
 */

import { estaLigada, type Integracao } from "./catalogo";

/* Uma linha de integração desta conta (o que /api/integracoes devolve — sem
   a credencial, só o rótulo e a impressão digital). */
export interface LinhaIntegracao {
  id: number;
  dono_tipo: "pessoa" | "organizacao";
  dono_id: string;
  tipo: string;
  rotulo: string;
  config: string | null;
  ativa: number;
  criada_em: string;
  atualizada_em: string;
  impressao: string;
}

export interface LinhasDaConta {
  minhas: LinhaIntegracao[];
  daEmpresa: LinhaIntegracao[];
}

/* O CRM (produto Saaso) é o único item com fluxo de credencial própria hoje.
   No catálogo o id é "saaso"; nas linhas de integração o tipo é "crm". */
export const CRM_ID = "saaso";

export const ehCrm = (i: Integracao): boolean => i.id === CRM_ID;

/* item do catálogo -> tipo da LINHA em /api/integracoes. Só o que tem
   correspondência declarada mapeia; o resto se apoia no cofre da conta. */
export const TIPO_DA_LINHA: Record<string, string> = {
  [CRM_ID]: "crm",
  telegram: "telegram",
  whatsapp: "whatsapp",
  // O servidor SSH mora na tabela `integracoes` (tipo `servidor`), não no cofre
  // do `platform_config` — por isso ele precisa do mapa para o cartão saber que
  // está conectado. Sem esta linha, quem tem servidor plugado veria "não
  // conectado" na grade, que é a mesma mentira ao contrário.
  servidor: "servidor",
};

/* a LINHA desta conta para um item: a DA PESSOA primeiro, a da EMPRESA como
   apoio. */
export function linhaDaContaEm(i: Integracao, linhas: LinhasDaConta): LinhaIntegracao | null {
  const tipo = TIPO_DA_LINHA[i.id];
  if (!tipo) return null;
  return (
    linhas.minhas.find((r) => r.tipo === tipo) ??
    linhas.daEmpresa.find((r) => r.tipo === tipo) ??
    null
  );
}

/* ═══ A FONTE ÚNICA ═══════════════════════════════════════════════════════
   Toda tela chama ESTA função para saber se uma integração está conectada. */
export function estaConectadaNaConta(
  i: Integracao,
  ctx: {
    /** o MCP do CRM confirmou AO VIVO nesta conta? */
    saasoAoVivo: boolean;
    linhas: LinhasDaConta;
    /** o cofre desta conta (user.platform_config). */
    config: Record<string, unknown> | null | undefined;
    /**
     * Ids de integração ligados em OUTRO espaço que a pessoa alcança (a
     * organização). Vem pronto do servidor (`GET /api/integracoes/cofres`), que
     * lê o cofre de cada espaço e devolve só os IDS — nunca credencial.
     *
     * Existe porque o cofre pessoal não é o único lugar onde uma conexão pode
     * morar: sem isto, uma caixa de email conectada no espaço da organização
     * aparecia como "não conectada" no cartão, que é a mesma mentira ao
     * contrário que esta fonte única nasceu para evitar.
     */
    ligadasEmOutrosEspacos?: string[];
  },
): boolean {
  if (ehCrm(i)) {
    // O CRM conta como conectado quando o MCP CONFIRMA AO VIVO. Sem resposta
    // do CRM, não conecta: nunca se finge conexão.
    return ctx.saasoAoVivo;
  }
  /* ARCA (17/11/2026, especificação do dono): SEMPRE HABILITADA. Não existe
     passo de "conectar" — o cartão já nasce ligado e o token da organização da
     pessoa é emitido pelo servidor a partir do e-mail da sessão
     (`/api/integracoes/arca`, idempotente). Por isso a regra não olha o cofre:
     ele pode estar vazio no primeiro carregamento da tela e a Arca continua
     sendo um recurso disponível desta conta — dizer "não conectada" ali seria a
     mentira ao contrário. A exceção é o ambiente SEM a credencial de serviço,
     onde o cartão é declarado "indisponível" pela prontidão do servidor. */
  if (i.id === "arca") return true;
  // Demais itens: a linha desta conta (ex.: Telegram/WhatsApp)...
  if (linhaDaContaEm(i, ctx.linhas)) return true;
  // ...e, no fim, o cofre desta conta, onde OAuth e chaves de API gravam.
  if (estaLigada(i, ctx.config)) return true;
  // ...e os outros espaços da pessoa (a organização), por id.
  return (ctx.ligadasEmOutrosEspacos || []).includes(i.id);
}
