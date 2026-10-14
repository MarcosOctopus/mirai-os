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
 *     `crm_...` da organização é quem responde por qual CRM);
 *   - exceção única: o dono da plataforma atravessa contas, e isso é auditado.
 */

import type { Conta } from "./orgs";
import { credencialSaasoDaConta } from "./orgs";
import { integracoesDaPessoa, integracoesDaOrganizacao } from "./integracoes";
import { leituraDeCredencial } from "./segredo-guardado";
import { lerVinculo } from "./vinculo-conta-mirai";

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
  /** DE QUEM é esta integração — é isto que a resolução por pessoa expõe. */
  origem: "pessoa" | "organizacao";
  /** Rótulo que a pessoa deu na integração ("meu CRM", "CRM da loja"). */
  rotulo: string;
  pronto: boolean;
  ferramentas: FerramentaDoConector[];
  /** Resumo curto do que já está ligado — vira contexto do modelo. */
  contexto: string;
  erro?: string;
  /** SEGREDO. Nunca é serializado, nunca entra no prompt: só executarFerramenta lê. */
  credencial?: string;
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
    /** Presente quando a via é o gateway: a conta (tenant) que responde. */
    tenant?: string;
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
 * Monta o conector de CRM a partir de UMA credencial — da pessoa ou da empresa.
 * O token nunca sai daqui: entra no conector e só `executarFerramenta` o lê.
 */
async function montarConectorDeCrm(opts: {
  id: string;
  nome: string;
  origem: "pessoa" | "organizacao";
  rotulo: string;
  token: string;
  timeoutMs: number;
}): Promise<Conector> {
  const conector: Conector = {
    id: opts.id,
    nome: opts.nome,
    origem: opts.origem,
    rotulo: opts.rotulo,
    pronto: false,
    ferramentas: [],
    contexto: "",
    credencial: opts.token,
  };
  try {
    const { saasoFerramentasCompletas, saasoContexto, saasoConfigurado } = await import("./saaso");
    if (!saasoConfigurado(opts.token)) {
      conector.erro = "credencial do CRM em formato inválido";
    } else {
      const [ferramentas, contexto] = await Promise.all([
        saasoFerramentasCompletas(opts.token, opts.timeoutMs),
        saasoContexto(opts.token, opts.timeoutMs),
      ]);
      conector.ferramentas = ferramentas;
      conector.contexto = contexto;
      conector.pronto = ferramentas.length > 0;
      if (!conector.pronto) conector.erro = "o CRM não devolveu a lista de ferramentas";
    }
  } catch (e) {
    conector.erro = e instanceof Error ? e.message : "falha ao falar com o CRM";
  }
  return conector;
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

  // ── Conectores: primeiro o que é DESTA PESSOA ───────────────────
  //
  // Correção do dono (07/out/2026): a credencial vinha sempre da ORGANIZAÇÃO —
  // a integração de um servia para todos. Agora a ordem é: integrações DA
  // PESSOA; as da EMPRESA entram como apoio e o contexto diz que são da
  // empresa. Quando a pessoa não plugou nada, o CRM da empresa continua
  // valendo (nada quebra) — mas nunca no lugar do que é dela.
  let minhas: { tipo: string; rotulo: string; credencial: string | null; id: number }[] = [];
  let daEmpresa: typeof minhas = [];
  try {
    minhas = integracoesDaPessoa(conta.id);
    daEmpresa = conta.org ? integracoesDaOrganizacao(conta.org.id) : [];
  } catch (e) {
    avisos.push(`não consegui ler as integrações: ${e instanceof Error ? e.message : "?"}`);
  }

  const crmDaPessoa = minhas.find((i) => i.tipo === "crm" && i.credencial);
  const crmDaEmpresa = daEmpresa.find((i) => i.tipo === "crm" && i.credencial);
  const crm = crmDaPessoa || crmDaEmpresa || null;

  if (!crm) {
    // Compatibilidade: se ninguém plugou nada e a empresa tem a credencial só
    // na tabela antiga, ela continua valendo — declarada como da empresa.
    const legado = credencialSaasoDaConta(conta);
    if (legado) {
      conectores.push(
        await montarConectorDeCrm({
          id: "crm",
          nome: "CRM",
          origem: "organizacao",
          rotulo: "CRM da empresa",
          token: legado.token,
          timeoutMs,
        }),
      );
    } else {
      avisos.push("esta pessoa não tem CRM plugado (e a empresa também não)");
    }
  } else {
    conectores.push(
      await montarConectorDeCrm({
        id: "crm",
        nome: "CRM",
        origem: crmDaPessoa ? "pessoa" : "organizacao",
        rotulo: crm.rotulo || (crmDaPessoa ? "meu CRM" : "CRM da empresa"),
        token: leituraDeCredencial(crm.credencial),
        timeoutMs,
      }),
    );
  }

  // Outros tipos que a pessoa plugou: declarados, não ignorados. Porta que
  // ainda não existe é dita como pendente — nunca fingida ligada.
  for (const i of minhas) {
    if (i.tipo === "crm") continue;
    conectores.push({
      id: i.tipo,
      nome: i.tipo.charAt(0).toUpperCase() + i.tipo.slice(1),
      origem: "pessoa",
      rotulo: i.rotulo || i.tipo,
      pronto: false,
      ferramentas: [],
      contexto: "",
      erro: "plugado por você, mas esta porta ainda não fala com ele",
    });
  }

  // ── Memória ─────────────────────────────────────────────────────
  const camadas = camadasDeMemoria(conta);

  // ── IA ──────────────────────────────────────────────────────────
  // Com vínculo fechado, a resposta sai pela inteligência da PRÓPRIA conta
  // (gateway: plano e medição por tenant). Sem vínculo, continua pelas chaves
  // deste app — e o motivo diz isso, em vez de prometer o que não acontece.
  const vinculoDaConta = lerVinculo(conta.id);
  const ia = vinculoDaConta?.tenant_id
    ? {
        via: "gateway-da-conta" as const,
        tenant: vinculoDaConta.tenant_id,
        motivo:
          "a resposta sai pela inteligência da própria conta (plano e medição dela)",
      }
    : {
        via: "propria" as const,
        motivo:
          "esta conta ainda não está vinculada à Conta Mirai: a resposta sai pela inteligência do próprio app",
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

  const crm = ctx.conectores.find((c) => c.id === "crm");
  const deQuem = crm?.origem === "pessoa" ? "plugado pela própria pessoa" : "da empresa";
  if (crm?.pronto) {
    linhas.push(crm.contexto);
    // FATO ASSERTADO: a integração DESTA conta está conectada e responde agora.
    // Vem daqui — o MESMO resolutor que entrega as ferramentas ao modelo — para
    // que o que a Mirai fala e o que ela consegue executar nunca se contradigam.
    linhas.push(
      `FATO DESTA CONTA: o CRM (rótulo "${crm.rotulo}") ESTÁ CONECTADO — é ${deQuem} — e responde agora. Trate como fato consumado: esta conta TEM o CRM integrado. NUNCA diga que não está integrado e NUNCA diga que "vai sincronizar depois" nem que está "aguardando sincronização" — já está ligado e sendo lido ao vivo. Você PODE agir nele pelas ferramentas dele (consultar e também marcar, cadastrar, atualizar e enviar). Antes de qualquer ação que mude dados, confirme com a pessoa. Nunca cite o nome do método, só o resultado.`,
    );
  } else if (crm) {
    linhas.push(
      `FATO DESTA CONTA: o CRM (rótulo "${crm.rotulo}", ${deQuem}) ESTÁ CONECTADO, mas não respondeu neste instante. Diga que ele está conectado e que você consulta de novo na próxima mensagem — nunca diga que não está integrado e nunca invente número, nome ou data.`,
    );
  } else {
    linhas.push(
      'FATO DESTA CONTA: não vejo NENHUMA integração conectada nesta conta. Se pedirem algo que dependa de um sistema externo (CRM, Drive, Telegram e afins), diga exatamente e só isto: que não vê nenhuma integração nesta conta, e mostre como conectar (em Integrações, no painel). NUNCA finja que existe algo, NUNCA adivinhe e NUNCA diga que vai sincronizar sozinho ou que os dados aparecem depois — sem integração, nada aparece por conta própria.',
    );
  }

  // Integrações plugadas que ainda não têm porta: ditas como pendentes.
  const pendentes = ctx.conectores.filter((c) => !c.pronto && c.erro && c.id !== "crm");
  if (pendentes.length) {
    linhas.push(
      `Integrações que a pessoa já plugou e ainda não estão ligadas nesta porta: ${pendentes
        .map((p) => p.rotulo)
        .join(", ")}. Se ela pedir algo disso, diga que está plugado mas ainda não ligado — não invente dado.`,
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

/** Nomes das ferramentas de BASE do chat (não são de conector nem de plano). */
export const FERRAMENTA_BUSCAR = "buscar_na_web";
export const FERRAMENTA_LER = "ler_pagina";

/**
 * As ferramentas que o modelo pode chamar, no formato do provider ([OI]).
 * Só entram as de conectores PRONTOS — ferramenta de conector que não responde
 * não é oferecida (evita o modelo tentar e a pessoa ver erro).
 *
 * As de BASE entram SEMPRE, para toda conta: BUSCAR NA WEB e LER PÁGINA. Não são
 * recurso de plano nem de integração — são o mínimo para o chat olhar o mundo em
 * vez de dizer que não consegue (dono, 14/10/2026).
 */
export function ferramentasParaOModelo(ctx: ContextoDaPessoa): {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}[] {
  const defs: {
    type: "function";
    function: { name: string; description: string; parameters: Record<string, unknown> };
  }[] = [
    {
      type: "function",
      function: {
        name: FERRAMENTA_BUSCAR,
        description:
          "Busca na internet agora e devolve títulos, endereços e trechos reais. " +
          "Use SEMPRE que a resposta depender de algo atual ou de fora: tempo/clima, " +
          "notícia, preço, cotação, agenda, dado de empresa, comparação de sites, " +
          "qualquer coisa que mude com o tempo. Não diga que não consegue acessar " +
          "dados em tempo real: chame esta ferramenta.",
        parameters: {
          type: "object",
          properties: {
            consulta: { type: "string", description: "o que buscar, em linguagem natural" },
            limite: { type: "integer", description: "quantos resultados (padrão 5)" },
          },
          required: ["consulta"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: FERRAMENTA_LER,
        description:
          "Abre um endereço da internet e devolve o texto da página. Use depois de " +
          "buscar quando precisar do conteúdo de verdade (números, tabela, detalhe " +
          "de uma matéria, comparar dois sites).",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string", description: "endereço completo, começando com https://" },
          },
          required: ["url"],
        },
      },
    },
  ];
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
  // ── as de BASE vêm primeiro: não têm dono entre os conectores ────────────
  if (nome === FERRAMENTA_BUSCAR) {
    const { buscarNaWeb, buscaEmTexto } = await import("./busca-web");
    const limite = Number(args?.limite) > 0 ? Math.min(Number(args.limite), 10) : 5;
    return buscaEmTexto(await buscarNaWeb(String(args?.consulta || ""), limite));
  }
  if (nome === FERRAMENTA_LER) {
    const { lerPagina } = await import("./busca-web");
    const p = await lerPagina(String(args?.url || ""));
    if (!p.ok) return `Não consegui abrir essa página (${p.erro}).`;
    return `${p.titulo ? p.titulo + "\n" : ""}${p.texto}`;
  }

  const dono = ctx.conectores.find((c) => c.ferramentas.some((f) => f.nome === nome));
  if (!dono) return `erro: ferramenta não disponível para esta conta (${nome})`;
  if (dono.id === "crm" || dono.id === "saaso") {
    const token = leituraDeCredencial(dono.credencial) || credencialSaasoDaConta(conta)?.token;
    if (!token) return "erro: integração sem credencial";
    const { saasoChamar } = await import("./saaso");
    // Registra QUAL integração executou — sem despejar o segredo.
    console.log(`[conhecimento] executando em integração ${dono.origem}:${dono.rotulo}`);
    return saasoChamar(token, nome, args);
  }
  return `erro: conector desconhecido (${dono.id})`;
}
