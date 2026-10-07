/**
 * O CONTEXTO DA PESSOA — o resolutor único do Mirai OS.
 *
 * Regra do dono (07/out/2026, textual):
 *   "as pessoas pluguem seus whatsapps, conecte ao telegram e o chat de voz e
 *    texto. que independente de onde ela chamar, vai ter todo contexto dela,
 *    projetos, plugins, mcps e apis e etc... mas sempre das coisas dela."
 *
 * PRINCÍPIO: porta nenhuma decide acesso. Chat, voz, Telegram, WhatsApp, MCP e
 * API são PORTAS — todas apresentam a identidade e chamam ESTE resolutor. Se
 * cada porta inventar a sua regra, o acesso deixa de ser auditável (era o
 * estado antes deste arquivo: o chat puxava o CRM por atalho com credencial
 * própria, sem passar por lugar nenhum).
 *
 * O que este arquivo decide, a partir da CONTA:
 *   1. identidade  — quem é (pessoa, organização, papel, dono ou não);
 *   2. conectores  — quais sistemas da pessoa estão ligados e QUAIS ferramentas
 *                    dela podem ser usadas (a lista sai do MCP, nunca é
 *                    chumbada aqui);
 *   3. camadas     — a memória da pessoa: pessoal, da organização e comunitária.
 *                    Camada que não existe é declarada indisponível COM O MOTIVO
 *                    — nunca fingida como vazia (vazio e "não existe" são coisas
 *                    diferentes e a diferença importa para quem já usou);
 *   4. ia          — por qual caminho a inteligência responde.
 *
 * ISOLAMENTO (o que NÃO pode acontecer, nunca):
 *   - ninguém lê a camada pessoal de outra pessoa — nem outro cliente, nem
 *     outro produto, nem outro agente;
 *   - a credencial de um conector só é usada para a conta dona dela (o token
 *     `dsk_...` da organização é quem responde por qual CRM);
 *   - exceção única: o dono da plataforma atravessa contas, e isso é auditado.
 */

import type { Conta } from "./orgs";
import { credencialSaasoDaConta } from "./orgs";

export type FerramentaDoConector = {
  /** Nome técnico do método. NUNCA é falado à pessoa (ver regra anti-vazamento). */
  nome: string;
  descricao: string;
  esquema: Record<string, unknown>;
};

export type Conector = {
  id: string;
  /** Nome que a pessoa entende ("CRM", "Agenda"). */
  nome: string;
  pronto: boolean;
  ferramentas: FerramentaDoConector[];
  /** Resumo curto do que já está ligado — vira contexto do modelo. */
  contexto: string;
  erro?: string;
};

export type CamadaDeMemoria = {
  id: "pessoal" | "organizacao" | "comunitaria";
  nome: string;
  disponivel: boolean;
  /** Quando indisponível: o motivo REAL. Nunca "vazio". */
  motivo?: string;
  itens?: number;
};

export type ContextoDaPessoa = {
  identidade: {
    contaId: number;
    nome: string;
    email: string;
    ehDono: boolean;
    org: { id: string; nome: string } | null;
    papel: "dono" | "org" | "pessoa";
  };
  conectores: Conector[];
  camadas: CamadaDeMemoria[];
  ia: {
    via: "gateway-da-conta" | "propria";
    motivo: string;
  };
  /** O que dissemos ao modelo sobre o que existe e o que não existe. */
  avisos: string[];
};

/** Ferramentas que MUDAM dados. Exigem confirmação antes de agir. */
const ACOES_QUE_MUDAM = [
  "book", "cancel", "create", "update", "save", "send", "propose", "start", "reactivation", "followup",
];

export function ferramentaEhEscrita(nome: string): boolean {
  const n = nome.toLowerCase();
  return ACOES_QUE_MUDAM.some((k) => n.includes(k));
}

/**
 * Camadas de memória da pessoa.
 *
 * Hoje as três estão declaradas e NENHUMA está ligada: o plano de controle já
 * tem o modelo (`memories`/`memory_permissions`, por conta e por pessoa, com
 * visibilidade) mas ainda não expõe rota de memória — e a Arca que existe é
 * single-tenant (a do dono). Declarar isso com o motivo é o combinado: o chat
 * pode dizer "isso ainda não está ligado" e ser verdade, em vez de responder
 * como se não houvesse nada guardado.
 *
 * Quando a rota existir, é AQUI que a leitura entra — uma vez, para todas as
 * portas.
 */
function camadasDeMemoria(conta: Conta): CamadaDeMemoria[] {
  const semRota =
    "a memória por conta ainda não está ligada neste app (o plano de controle já tem o modelo, falta a rota de leitura/escrita)";
  return [
    {
      id: "pessoal",
      nome: "Memória pessoal",
      disponivel: false,
      motivo: semRota,
    },
    {
      id: "organizacao",
      nome: "Memória da organização",
      disponivel: false,
      motivo: `${semRota} — hoje o CRM guarda o que é da organização`,
    },
    {
      id: "comunitaria",
      nome: "Aprendizado comunitário",
      disponivel: false,
      motivo:
        "a camada comunitária ainda não foi publicada (o pipeline de curadoria não existe ainda); quando existir, entra só o aprendizado generalizado, nunca dado de conta",
    },
  ];
}

/**
 * Resolve TUDO o que a pessoa pode a partir da conta.
 *
 * Nunca lança: porta que não responde vira `pronto: false` com o motivo. Chat
 * não pode cair porque um conector piscou.
 */
export async function montarContextoDaPessoa(
  conta: Conta,
  opts: { timeoutMs?: number } = {},
): Promise<ContextoDaPessoa> {
  const timeoutMs = opts.timeoutMs ?? 9000;
  const avisos: string[] = [];
  const conectores: Conector[] = [];

  // ── Conector: CRM (o MCP do produto Saaso) ──────────────────────
  // A credencial é da ORGANIZAÇÃO da conta. Sem vínculo, sem token, sem dado.
  const cred = credencialSaasoDaConta(conta);
  if (!cred) {
    avisos.push("esta conta não tem CRM vinculado (sem credencial da organização)");
  } else {
    const conector: Conector = {
      id: "saaso",
      nome: "CRM",
      pronto: false,
      ferramentas: [],
      contexto: "",
    };
    try {
      const { saasoFerramentasCompletas, saasoContexto, saasoConfigurado } = await import("./saaso");
      if (!saasoConfigurado(cred.token)) {
        conector.erro = "credencial do CRM em formato inválido";
      } else {
        const [ferramentas, contexto] = await Promise.all([
          saasoFerramentasCompletas(cred.token, timeoutMs),
          saasoContexto(cred.token, timeoutMs),
        ]);
        conector.ferramentas = ferramentas;
        conector.contexto = contexto;
        conector.pronto = ferramentas.length > 0;
        if (!conector.pronto) conector.erro = "o CRM não devolveu a lista de ferramentas";
      }
    } catch (e) {
      conector.erro = e instanceof Error ? e.message : "falha ao falar com o CRM";
    }
    if (conector.erro) avisos.push(`CRM: ${conector.erro}`);
    conectores.push(conector);
  }

  // ── Memória ─────────────────────────────────────────────────────
  const camadas = camadasDeMemoria(conta);

  // ── IA ──────────────────────────────────────────────────────────
  // Nesta porta a inteligência ainda responde pelas chaves do próprio app.
  // O caminho da conta (gateway, com plano e medição por tenant) depende do
  // vínculo do usuário com o plano de controle — está declarado assim porque é
  // o que é verdade hoje; quando o vínculo existir, muda aqui e vale para todas
  // as portas de uma vez.
  const ia = {
    via: "propria" as const,
    motivo:
      "a resposta ainda usa a inteligência do próprio app; o vínculo da conta com o gateway (plano + medição por conta) é o próximo passo",
  };

  const papel: ContextoDaPessoa["identidade"]["papel"] = conta.ehDono
    ? "dono"
    : conta.org
      ? "org"
      : "pessoa";

  return {
    identidade: {
      contaId: conta.id,
      nome: conta.nome,
      email: conta.email,
      ehDono: conta.ehDono,
      org: conta.org ? { id: conta.org.id, nome: conta.org.nome } : null,
      papel,
    },
    conectores,
    camadas,
    ia,
    avisos,
  };
}

/**
 * Bloco de contexto que entra no system prompt.
 *
 * O que a pessoa TEM entra como dado. O que ela NÃO tem entra como ausência
 * declarada — assim o modelo diz "isso ainda não está ligado" em vez de
 * inventar. Nome técnico de ferramenta nunca aparece aqui.
 */
export function blocoDeContexto(ctx: ContextoDaPessoa): string {
  const linhas: string[] = [];

  const crm = ctx.conectores.find((c) => c.id === "saaso");
  if (crm?.pronto) {
    linhas.push(crm.contexto);
    linhas.push(
      "Você PODE agir no CRM desta conta pelas ferramentas dela (consultar e também marcar, cadastrar, atualizar e enviar). Antes de qualquer ação que mude dados, confirme com a pessoa. Nunca cite o nome do método, só o resultado.",
    );
  } else if (crm) {
    linhas.push(
      "O CRM desta conta está vinculado mas não respondeu agora. Diga que vai consultar de novo na próxima mensagem — nunca invente número, nome ou data.",
    );
  } else {
    linhas.push(
      "Esta conta ainda não tem CRM vinculado. Se pedirem dados de CRM, diga que falta vincular a conta.",
    );
  }

  const indisponiveis = ctx.camadas.filter((c) => !c.disponivel);
  if (indisponiveis.length === ctx.camadas.length) {
    linhas.push(
      "Memória desta conta: ainda não ligada (pessoal, da organização e o aprendizado comunitário). Se a pessoa perguntar o que você sabe sobre ela, diga que a memória dela ainda não está ligada neste app — não invente lembrança.",
    );
  } else {
    for (const c of ctx.camadas.filter((x) => x.disponivel)) {
      linhas.push(`${c.nome}: ligada${typeof c.itens === "number" ? ` (${c.itens} itens)` : ""}.`);
    }
  }

  return linhas.filter(Boolean).join("\n");
}

/**
 * As ferramentas que o modelo pode chamar, no formato do provider (OpenAI).
 * Só entram as de conectores PRONTOS — ferramenta de conector que não responde
 * não é oferecida (evita o modelo tentar e a pessoa ver erro).
 */
export function ferramentasParaOModelo(ctx: ContextoDaPessoa): {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}[] {
  const defs: {
    type: "function";
    function: { name: string; description: string; parameters: Record<string, unknown> };
  }[] = [];
  for (const c of ctx.conectores) {
    if (!c.pronto) continue;
    for (const f of c.ferramentas) {
      defs.push({
        type: "function",
        function: {
          name: f.nome,
          description: `${f.descricao || f.nome}${ferramentaEhEscrita(f.nome) ? " [MUDA DADOS: confirme com a pessoa antes]" : ""}`,
          parameters:
            (f.esquema as { type?: string })?.type === "object"
              ? f.esquema
              : { type: "object", properties: {} },
        },
      });
    }
  }
  return defs;
}

/** Executa uma ferramenta pelo conector dono dela. Erro vira texto, não exceção. */
export async function executarFerramenta(
  ctx: ContextoDaPessoa,
  nome: string,
  args: Record<string, unknown>,
  conta: Conta,
): Promise<string> {
  const dono = ctx.conectores.find((c) => c.ferramentas.some((f) => f.nome === nome));
  if (!dono) return `erro: ferramenta não disponível para esta conta (${nome})`;
  if (dono.id === "saaso") {
    const cred = credencialSaasoDaConta(conta);
    if (!cred) return "erro: conta sem credencial de CRM";
    const { saasoChamar } = await import("./saaso");
    return saasoChamar(cred.token, nome, args);
  }
  return `erro: conector desconhecido (${dono.id})`;
}
