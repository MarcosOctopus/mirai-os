/**
 * A FERRAMENTA DO PAINEL MANDA NA ROTA.
 *
 * Dono, 24/11/2026: *"tem esse controle pra mim no painel? pq n quero ficar
 * pedindo pra bloquear as coisas de cada plano"*. O painel (`/admin/planos`) já
 * deixa montar o plano com o carrinho de ferramentas — o que faltava era o APP
 * OBEDECER. Antes disto só o Arquiteto e o chat respeitavam o plano; A Arca, o
 * Synapse, a Reunião e o resto serviam igual para todo mundo, então o clique do
 * dono no painel era decorativo.
 *
 * A régua é a MESMA do plano de controle: as capacidades da organização (do
 * plano + as avulsas que o dono concedeu a dedo na aba Ferramentas). Nada é
 * copiado para o app — a lista mora só lá, como manda a regra da casa.
 *
 * SEM PLANO DE CONTROLE NÃO SE TRANCA NINGUÉM: se não deu para perguntar
 * (rede/instabilidade), a ferramenta passa e fica registrado. Trancar quem paga
 * por um tropeço de infraestrutura é pior do que um aproveitador a mais — e
 * aproveitador não derruba o plano de controle para se liberar.
 */
import type { NextRequest } from "next/server";
import { exigirConta, type Conta } from "@/lib/orgs";
import { capacidadesDaConta } from "@/lib/acesso-plano";
import { FERRAMENTAS_OS } from "@/lib/ferramentas-os";

/** Rota → ferramenta do painel. Prefixo mais específico primeiro.
 *
 * Regra do dono (24/11/2026): ele controla no painel, o app obedece. Ficam de
 * FORA, de propósito: autenticação, perfil, organizações, convite, admin (menos
 * o acervo), Chaves de API (ferramenta de gestão, `semCapacidade`) e as rotas de
 * infraestrutura da própria casa (agendador, stt, tts, config).
 */
const ROTAS: Array<{ prefixo: string; ferramenta: string }> = [
  // A Arca
  { prefixo: "/api/admin/acervo", ferramenta: "arca" },
  { prefixo: "/api/acervo", ferramenta: "arca" },
  { prefixo: "/api/arca", ferramenta: "arca" },
  { prefixo: "/api/integracoes/arca", ferramenta: "arca" },
  // Synapse
  { prefixo: "/api/integracoes/cofres", ferramenta: "synapse" },
  { prefixo: "/api/integracoes/saaso", ferramenta: "synapse" },
  { prefixo: "/api/integracoes", ferramenta: "synapse" },
  { prefixo: "/api/ponte", ferramenta: "synapse" },
  { prefixo: "/api/gmail", ferramenta: "synapse" },
  // Reunião
  { prefixo: "/api/reuniao", ferramenta: "reuniao" },
  // Documentos
  { prefixo: "/api/arquivo", ferramenta: "documentos" },
  // Agentes
  { prefixo: "/api/skills", ferramenta: "agentes" },
  { prefixo: "/api/pipeline", ferramenta: "agentes" },
  // Infraestrutura
  { prefixo: "/api/servidor", ferramenta: "infra" },
  { prefixo: "/api/system", ferramenta: "infra" },
  // Telegram
  { prefixo: "/api/canais", ferramenta: "telegram" },
  // Análise de negócio
  { prefixo: "/api/media-factory", ferramenta: "negocio" },
];

export function ferramentaDaRota(caminho: string): string | null {
  const achou = ROTAS.find((r) => caminho === r.prefixo || caminho.startsWith(r.prefixo + "/"));
  return achou?.ferramenta || null;
}

/** Capacidades que a ferramenta exige (a união do que o painel marcou nela). */
export function capacidadesDaFerramenta(ferramentaId: string): string[] {
  const f = FERRAMENTAS_OS.find((x) => x.id === ferramentaId);
  return f?.capacidades || [];
}

export type ResultadoFerramenta = { permitido: boolean; motivo: string; ferramenta: string };

/** Decide se a conta pode usar ESTA ferramenta. Nunca lança. */
export async function podeUsarFerramenta(
  conta: Conta,
  ferramentaId: string,
): Promise<ResultadoFerramenta> {
  if (conta.ehDono) return { permitido: true, motivo: "dono", ferramenta: ferramentaId };
  const exigidas = capacidadesDaFerramenta(ferramentaId);
  // Ferramenta de gestão (sem capacidade, ex.: Chaves de API) não se cobra aqui.
  if (exigidas.length === 0) return { permitido: true, motivo: "sem_capacidade", ferramenta: ferramentaId };
  const caps = await capacidadesDaConta(conta);
  if (caps === null) return { permitido: true, motivo: "indisponivel", ferramenta: ferramentaId };
  const liberado = exigidas.some((c) => caps.includes(c));
  return {
    permitido: liberado,
    motivo: liberado ? "plano" : "fora_do_plano",
    ferramenta: ferramentaId,
  };
}

/**
 * Porteira pronta para a rota: devolve `null` quando pode seguir e a RESPOSTA
 * quando não pode (402, com o nome da ferramenta e o motivo, para a tela saber
 * oferecer o plano certo em vez de um erro seco).
 */
export async function exigirFerramenta(
  req: NextRequest,
  ferramentaId: string,
): Promise<Response | null> {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;
  const d = await podeUsarFerramenta(g.conta, ferramentaId);
  if (d.permitido) return null;
  const f = FERRAMENTAS_OS.find((x) => x.id === ferramentaId);
  return Response.json(
    {
      erro: "ferramenta-fora-do-plano",
      ferramenta: ferramentaId,
      nome: f?.nome || ferramentaId,
      mensagem: `A ferramenta ${f?.nome || ferramentaId} não está no seu plano. Veja os planos para liberar.`,
      motivo: d.motivo,
    },
    { status: 402 },
  );
}
