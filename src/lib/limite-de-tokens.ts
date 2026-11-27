/**
 * O TETO DE TOKENS DO PLANO, DO LADO DO APP.
 *
 * Existem duas autoridades, e as duas contam a MESMA história:
 *
 *   1. o plano de controle (serviço de identidade) recusa com **402** quando a
 *      conta estourou a franquia do mês — é a autoridade final, porque o gasto
 *      é medido lá;
 *   2. este módulo, que LÊ o mesmo medidor antes de chamar o modelo.
 *
 * Por que ler antes (se o gateway já recusa): a recusa do gateway chega depois
 * de a rota ter feito todo o trabalho caro — consultar a Arca, processar
 * anexos, montar o prompt — e, no caso do Arquiteto, o caminho antigo ainda
 * caía num provedor de reserva com a chave da casa, ou seja: gastava token de
 * verdade depois do teto. Ler antes fecha isso na porta e deixa o motivo no log
 * do servidor, em uma linha, em vez de encher o log de erro a cada mensagem.
 *
 * O QUE ESTE MÓDULO NUNCA FAZ:
 *   - barrar o DONO/ADMIN (a isenção vive no plano de controle; aqui ela é
 *     espelhada — `conta.ehDono` nunca é barrado);
 *   - barrar quem usa a PRÓPRIA chave (BYOK): esse gasto não é nosso e não
 *     entra no teto;
 *   - fechar por falta de leitura: se o medidor não responde, devolve `null` e
 *     a chamada segue. Na dúvida entre barrar quem pagou e deixar passar, a
 *     casa escolhe não barrar — e o gateway ainda tem a palavra final.
 */
import { tokensDoTenant } from "@/lib/consumo-cliente";
import { lerVinculo } from "@/lib/vinculo-conta-mirai";
import {
  mensagemDeTokensEsgotados,
  marcadorDeTokensEsgotados,
  TITULO_TOKENS_ESGOTADOS,
} from "@/lib/tokens-esgotados";

export type TetoDeTokens = { usado: number; teto: number };

/**
 * A conta estourou a franquia do mês? `null` = não estourou, ou não deu para ler.
 * Nunca lança.
 */
export async function tetoEstouradoDaConta(userId: number | null | undefined): Promise<TetoDeTokens | null> {
  if (!userId) return null;
  try {
    const tenant = lerVinculo(userId)?.tenant_id || "";
    if (!tenant) return null; // sem vínculo, quem decide é o gateway (402 ou nada)
    const leitura = await tokensDoTenant(tenant);
    if (leitura.leitura !== "ok") return null; // falha aberta: a chamada segue
    if (leitura.teto === null) return null; // plano sem cota declarada: não é teto zero
    if (leitura.usado < leitura.teto) return null;
    return { usado: leitura.usado, teto: leitura.teto };
  } catch {
    return null;
  }
}

export type CorpoDeTokensEsgotados = {
  /** Identificador próprio no código: NÃO é erro genérico. */
  erro: "tokens-esgotados";
  titulo: string;
  /** O recado humano, em parágrafos (sem HTTP, sem stack trace). */
  mensagem: string;
  usado: number | null;
  teto: number | null;
  /** O que a tela põe na conversa (o bloco próprio, mesmo padrão do chat). */
  conversa: string;
};

/**
 * A resposta canônica. Status 402 porque é o contrato com o plano de controle
 * (o mesmo código para o mesmo fato) — mas o cliente NUNCA mostra o código: ele
 * lê `erro`/`conversa` e desenha o bloco.
 */
export function respostaDeTokensEsgotados(estado: TetoDeTokens | null): Response {
  const usado = estado?.usado ?? null;
  const teto = estado?.teto ?? null;
  const corpo: CorpoDeTokensEsgotados = {
    erro: "tokens-esgotados",
    titulo: TITULO_TOKENS_ESGOTADOS,
    mensagem: mensagemDeTokensEsgotados(usado, teto),
    usado,
    teto,
    conversa: marcadorDeTokensEsgotados(usado, teto),
  };
  return Response.json(corpo, {
    status: 402,
    headers: {
      "cache-control": "no-store",
      // Rótulo para log/monitoramento: "esta recusa é teto de tokens".
      "x-mirai-limite": "tokens",
    },
  });
}
