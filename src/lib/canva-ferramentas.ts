/**
 * AS FERRAMENTAS DO CANVA NO CHAT (dono, 19/10/2026).
 *
 * Pedido do dono, verbatim: *"É que consiga pedir modificações e automações pelo
 * chat com o canva"* — e depois: *"Each person can use their own account of the
 * Canva, each client, you know? And not just one account."*
 *
 * ─── Por que este arquivo existe ────────────────────────────────────────────
 *
 * O OAuth por pessoa (`canva-oauth.ts` + `canva-conta.ts`) já guarda o token de
 * CADA conta. Mas guardar não é usar: sem estas ferramentas o chat recebia a
 * pergunta "cria um post pra mim" e não tinha por onde chamar o Canva — o token
 * ficava no cofre e a resposta era "não consigo".
 *
 * ─── O que NUNCA muda ───────────────────────────────────────────────────────
 *
 *  - o token é decifrado na hora, usado no cabeçalho e some: nunca volta numa
 *    resposta, nunca entra em log;
 *  - o token é SEMPRE o da conta que está falando (`conta.id`). Não existe
 *    caminho para agir no Canva de outra pessoa;
 *  - sem conexão, a resposta traz o LINK para conectar — nunca só um erro
 *    (regra do dono, 15/10/2026: *"N pode manda mensagem de erro. coloca um link
 *    pra ele integrar"*).
 *
 * Endpoints conferidos na fonte (canva.dev/docs, 19/10/2026):
 *   GET  /v1/designs          listar (design:meta:read)
 *   POST /v1/designs          criar (design:content:write)
 *   POST /v1/exports          exportar (design:content:read) — job assíncrono
 *   GET  /v1/exports/{jobId}  resultado do job
 */

import type { Conta } from "@/lib/orgs";
import { PUBLICO_PADRAO } from "@/lib/base-publica";
import { canvaDaConta, tokenCanvaDaConta } from "@/lib/canva-conta";
import { CV_API } from "@/lib/canva-oauth";
import { origemPublica } from "@/lib/mirai-oidc";
import { canvaEditarDesign, canvaCamposDoDesign } from "@/lib/canva-mcp";

type Def = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

/** O LINK para conectar o Canva desta conta (mesmo endereço do cartão). */
function linkCanva(): string {
  const base = (origemPublica() || PUBLICO_PADRAO).replace(/\/+$/, "");
  return `${base}/api/oauth/canva/iniciar`;
}

/**
 * Traduz o erro do MCP numa frase que o MODELO pode usar, sem vazar token.
 *
 * `TOKEN_REVOGADO` não é "algo deu errado": é a conexão do cliente ter expirado
 * ou sido revogada no Canva. A pessoa PRECISA saber disso com o link para
 * reconectar — senão ela acha que a conta está vazia.
 */
function erroCanva(erro?: string): string {
  if (erro === "SEM_CONEXAO") return SEM_CONEXAO;
  if (erro === "TOKEN_REVOGADO") {
    return (
      "A conexao com o Canva desta conta expirou ou foi revogada no Canva. " +
      "O cliente precisa reconectar (o token e renewed sozinho quando ainda vale, " +
      "mas revogacao no Canva nao tem volta). Mande este link para reconectar a " +
      "PROPRIA conta: " + linkCanva()
    );
  }
  return (
    "Nao consegui falar com o Canva agora: " +
    (erro ?? "erro desconhecido") +
    ". Nada foi alterado na conta."
  );
}

const SEM_CONEXAO =
  "O Canva ainda não está conectado nesta conta. Autorize aqui para listar, " +
  "criar, editar e exportar seus designs direto no chat: " +
  linkCanva();

export const NOMES_CANVA = new Set([
  "canva_estado",
  "canva_designs",
  "canva_criar",
  "canva_exportar",
  // via MCP (22/10/2026) — a Connect API nao edita; o MCP oficial sim.
  "canva_editar",
  "canva_campos",
]);

export function definicoesCanva(): Def[] {
  return [
    {
      type: "function",
      function: {
        name: "canva_estado",
        description:
          "Diz se o CANVA desta conta está conectado e com qual conta. Use ANTES de prometer " +
          "qualquer coisa de Canva: sem conexão não há o que listar nem criar. Se não estiver " +
          "conectado, a resposta já traz o link para a pessoa conectar.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      function: {
        name: "canva_designs",
        description:
          "LISTA os designs da conta Canva desta pessoa (os dela e os compartilhados com ela). " +
          "Use para descobrir o design_id antes de exportar, e para responder 'quais designs eu tenho'. " +
          "Devolve id, título, endereço de edição e data da última alteração.",
        parameters: {
          type: "object",
          properties: {
            busca: {
              type: "string",
              description: "Termo para filtrar pelo título/conteúdo. Opcional.",
            },
            quantidade: {
              type: "integer",
              description: "Quantos designs devolver (1 a 100). Padrão 20.",
            },
            ordenar: {
              type: "string",
              enum: ["modified_descending", "modified_ascending", "title_ascending", "title_descending", "relevance"],
              description: "Ordenação. Padrão: modificados por último primeiro.",
            },
            apenas_meus: {
              type: "boolean",
              description: "true = só os criados por ela; false/omitido = inclui os compartilhados.",
            },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "canva_criar",
        description:
          "CRIA um design novo na conta Canva desta pessoa e devolve o endereço para abrir e editar. " +
          "Serve para post, story, banner, apresentação, documento. Escolha entre um tipo pronto " +
          "(doc, email, presentation, whiteboard) OU largura/altura em pixels para formato livre " +
          "(ex.: post quadrado = 1080x1080; story = 1080x1920). Devolve o design_id e o link de edição — " +
          "NUNCA diga que criou sem o link.",
        parameters: {
          type: "object",
          properties: {
            tipo: {
              type: "string",
              enum: ["doc", "email", "presentation", "whiteboard"],
              description: "Tipo pronto. Omita se for usar largura/altura.",
            },
            largura: { type: "integer", description: "Largura em pixels (40 a 8000)." },
            altura: { type: "integer", description: "Altura em pixels (40 a 8000)." },
            titulo: { type: "string", description: "Título do design. Opcional." },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "canva_exportar",
        description:
          "EXPORTA um design do Canva desta pessoa em arquivo (png, jpg, pdf, pptx, mp4, gif) e devolve " +
          "os endereços de download. O link de download vale 24 horas. Precisa do design_id — use " +
          "canva_designs antes se não souber. A exportação é um trabalho do lado do Canva: pode levar " +
          "alguns segundos.",
        parameters: {
          type: "object",
          properties: {
            design_id: { type: "string", description: "O id do design (ex.: DAF...) ." },
            formato: {
              type: "string",
              enum: ["png", "jpg", "pdf", "pptx", "gif", "mp4"],
              description: "Formato do arquivo. Padrão: png.",
            },
          },
          required: ["design_id"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "canva_campos",
        description:
          "Lista os CAMPOS PREENCHIVEIS de um design Canva (Brand Template). " +
          "Chame ANTES de preencher: devolve os nomes e tipos dos campos que " +
          "existem naquele design. Sem isso, preencher por adivinhação erra o nome " +
          "e a edicao nao aplica.",
        parameters: {
          type: "object",
          properties: {
            design_id: {
              type: "string",
              description: "ID do design (formato DAHxxxxxxx). Vem de canva_designs.",
            },
          },
          required: ["design_id"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "canva_editar",
        description:
          "EDITA um design Canva existente e SALVA as alteracoes. Use para trocar " +
          "texto, ajustar fonte/tamanho/cor, mover ou redimensionar elementos, " +
          "trocar imagem de fundo ou apagar um elemento. " +
          "OPERACOES aceitas: replace_text, format_text (font_size, font_weight, " +
          "line_height, text_align, color), position_element (top, left), " +
          "resize_element (width, height), update_fill (asset_id, alt_text), " +
          "delete_element. " +
          "Cada operacao precisa de element_id: chame canva_designs com detalhes " +
          "para descobrir os ids, ou use canva_campos em Brand Templates. " +
          "Esta ferramenta SALVA de verdade — use com cuidado.",
        parameters: {
          type: "object",
          properties: {
            design_id: {
              type: "string",
              description: "ID do design a editar (formato DAHxxxxxxx).",
            },
            operacoes: {
              type: "array",
              description: "Lista de operacoes, aplicadas em ordem.",
              items: {
                type: "object",
                properties: {
                  type: {
                    type: "string",
                    enum: [
                      "replace_text",
                      "format_text",
                      "position_element",
                      "resize_element",
                      "update_fill",
                      "delete_element",
                    ],
                  },
                  element_id: { type: "string", description: "ID do elemento a alterar." },
                  text: { type: "string", description: "Novo texto (replace_text)." },
                  formatting: {
                    type: "object",
                    description: "format_text: font_size, font_weight, line_height, text_align, color.",
                  },
                  top: { type: "number", description: "position_element: posicao vertical." },
                  left: { type: "number", description: "position_element: posicao horizontal." },
                  width: { type: "number", description: "resize_element: largura." },
                  height: { type: "number", description: "resize_element: altura." },
                  asset_id: { type: "string", description: "update_fill: id do asset de imagem." },
                  alt_text: { type: "string", description: "update_fill: descricao da imagem." },
                },
                required: ["type", "element_id"],
              },
            },
            page_index: {
              type: "number",
              description: "Pagina do design (comeca em 1). Padrao 1.",
            },
          },
          required: ["design_id", "operacoes"],
        },
      },
    },
  ];
}

/**
 * O Canva limita cada lado a 8000 px e a ÁREA a 25.000.000 px² (ex.: 5000×5000).
 * Devolve o recado de recusa, ou `null` quando as dimensões servem.
 *
 * Função pura de propósito: dá para provar sem falar com o Canva, e o número
 * certo aparece antes de gastar uma chamada (e antes de a pessoa esperar).
 */
export function recusaDeDimensoes(largura: number, altura: number): string | null {
  if (!Number.isFinite(largura) || !Number.isFinite(altura) || largura < 40 || altura < 40) {
    return "Cada lado precisa ter pelo menos 40 pixels.";
  }
  if (largura > 8000 || altura > 8000 || largura * altura > 25_000_000) {
    return (
      "Essas dimensões passam do limite do Canva (cada lado até 8000 px e a área até " +
      "25.000.000 px²). Para um post quadrado use 1080x1080; story, 1080x1920."
    );
  }
  return null;
}

/** Chama a API do Canva com o token DESTA conta. Nunca devolve o token. */
async function chamar(
  token: string,
  caminho: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ ok: true; dados: Record<string, unknown> } | { ok: false; status: number; erro: string }> {
  try {
    const r = await fetch(`${CV_API}${caminho}`, {
      method: init.method || "GET",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/json",
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) {
      const msg =
        (typeof j.message === "string" && j.message) ||
        (typeof j.code === "string" && j.code) ||
        `Canva respondeu ${r.status}`;
      return { ok: false, status: r.status, erro: msg };
    }
    return { ok: true, dados: j };
  } catch {
    return { ok: false, status: 0, erro: "não consegui falar com o Canva agora" };
  }
}

/** Traduz a recusa para algo que a pessoa possa resolver. */
function recado(status: number, erro: string): string {
  if (status === 401) {
    return (
      "A conexão com o Canva desta conta não vale mais (o Canva recusou o acesso). " +
      `Reconecte aqui: ${linkCanva()}`
    );
  }
  if (status === 403) {
    return (
      "O Canva recusou por permissão — o escopo necessário pode não estar habilitado no app. " +
      `Reconecte e autorize tudo: ${linkCanva()}`
    );
  }
  if (status === 429) return "O Canva limitou a quantidade de pedidos agora. Tente de novo em instantes.";
  return `O Canva não completou: ${erro}.`;
}

export async function executarCanva(
  nome: string,
  args: Record<string, unknown>,
  conta: Conta,
): Promise<string | null> {
  if (!NOMES_CANVA.has(nome)) return null;
  const userId = conta.id;

  // ── 0. ESTADO ────────────────────────────────────────────────────────────
  if (nome === "canva_estado") {
    const c = canvaDaConta(userId);
    if (!c) return SEM_CONEXAO;
    const token = await tokenCanvaDaConta(userId);
    if (!token) return SEM_CONEXAO;
    return (
      `Canva conectado` +
      (c.nome ? ` — conta "${c.nome}"` : "") +
      `. Agora dá para listar, buscar, criar, editar e exportar seus designs aqui no chat.`
    );
  }

  // ── VIA MCP (22/10/2026) ────────────────────────────────────────────────
  // A Connect API (`api.canva.com/rest/v1`) NÃO edita design — ela cria e
  // exporta. Edição é só pelo MCP oficial (`mcp.canva.com/mcp`), que é o mesmo
  // caminho que o Mapa Paper usa (`canva_edit.py`, com 351 referencias).
  //
  // O token vem do COFRE DA CONTA (`tokenCanvaDaConta`), nunca do perfil do
  // Mapa Paper: cada cliente opera a conta Canva DELE.
  if (nome === "canva_campos") {
    const designId = String(args.design_id ?? "").trim();
    if (!designId) return "Preciso do design_id. Use canva_designs para ver os ids.";
    if (!canvaDaConta(userId)) return SEM_CONEXAO;
    const r = await canvaCamposDoDesign(userId, designId);
    if (!r.ok) return erroCanva(r.erro);
    return `Campos preenchíveis do design ${designId}:\n${r.texto}`;
  }

  if (nome === "canva_editar") {
    const designId = String(args.design_id ?? "").trim();
    const operacoes = Array.isArray(args.operacoes) ? (args.operacoes as Record<string, unknown>[]) : [];
    const pageIndex = Number.isFinite(Number(args.page_index)) ? Number(args.page_index) : 1;

    if (!designId) return "Preciso do design_id. Use canva_designs para ver os ids.";
    if (operacoes.length === 0) {
      return (
        "Preciso da lista de operacoes. Cada operacao tem type e element_id " +
        "(ex.: {\"type\":\"replace_text\",\"element_id\":\"...\",\"text\":\"Novo titulo\"}). " +
        "Use canva_designs com detalhes para descobrir os element_id deste design."
      );
    }

    // Validação ANTES de abrir transação: uma transação aberta na conta do
    // cliente e abandonada por erro de argumento é lixo que ele não vê.
    for (const [i, op] of operacoes.entries()) {
      const tipo = String(op?.type ?? "");
      if (!tipo) return `A operacao ${i + 1} não tem "type".`;
      if (!op?.element_id) return `A operacao ${i + 1} ("${tipo}") não tem "element_id".`;
    }

    // ConexaoSo depois dos argumentos: o modelo precisa aprender o formato do
    // argumento mesmo sem conta conectada — se devolvessemos o link primeiro, ele
    // nunca saberia o que `operacoes` espera e erraria de novo depois de conectar.
    if (!canvaDaConta(userId)) return SEM_CONEXAO;

    const r = await canvaEditarDesign(userId, designId, operacoes, pageIndex);
    if (!r.ok) return erroCanva(r.erro);
    return r.texto;
  }


  // Daqui para baixo, tudo exige conexão.
  const c = canvaDaConta(userId);
  if (!c) return SEM_CONEXAO;
  const token = await tokenCanvaDaConta(userId);
  if (!token) return SEM_CONEXAO;

  // ── 1. LISTAR ────────────────────────────────────────────────────────────
  if (nome === "canva_designs") {
    const q = new URLSearchParams();
    const busca = String(args?.busca || "").trim();
    if (busca) q.set("query", busca.slice(0, 255));
    const n = Number(args?.quantidade);
    q.set("limit", String(Number.isFinite(n) && n > 0 ? Math.min(100, Math.floor(n)) : 20));
    const ord = String(args?.ordenar || "modified_descending");
    if (["modified_descending", "modified_ascending", "title_ascending", "title_descending", "relevance"].includes(ord)) {
      q.set("sort_by", ord);
    }
    if (args?.apenas_meus === true) q.set("ownership", "owned");

    const r = await chamar(token, `/designs?${q.toString()}`);
    if (!r.ok) return recado(r.status, r.erro);

    const itens = Array.isArray(r.dados.items) ? (r.dados.items as Record<string, unknown>[]) : [];
    if (!itens.length) {
      return busca
        ? `Nenhum design do Canva desta conta combina com "${busca}".`
        : "Esta conta Canva ainda não tem designs.";
    }
    const linhas = itens.map((d) => {
      const id = String(d.id || "");
      const titulo = String(d.title || "(sem título)");
      const quando = d.updated_at ? new Date(String(d.updated_at)).toLocaleDateString("pt-BR") : "";
      const editar = d.urls && typeof d.urls === "object" ? String((d.urls as Record<string, unknown>).edit_url || "") : "";
      return `- ${titulo} · id ${id}${quando ? ` · alterado ${quando}` : ""}${editar ? `\n  editar: ${editar}` : ""}`;
    });
    return `${itens.length} design(s) na conta Canva desta pessoa:\n${linhas.join("\n")}`;
  }

  // ── 2. CRIAR ─────────────────────────────────────────────────────────────
  if (nome === "canva_criar") {
    const tipo = String(args?.tipo || "").trim();
    const largura = Number(args?.largura);
    const altura = Number(args?.altura);
    const titulo = String(args?.titulo || "").trim();

    let design_type: Record<string, unknown>;
    if (["doc", "email", "presentation", "whiteboard"].includes(tipo)) {
      design_type = { type: "preset", name: tipo };
    } else if (Number.isFinite(largura) && Number.isFinite(altura) && largura >= 40 && altura >= 40) {
      // Recusa local ANTES de falar com o Canva, com o número certo.
      const recusa = recusaDeDimensoes(largura, altura);
      if (recusa) return recusa;
      design_type = { type: "custom", width: Math.floor(largura), height: Math.floor(altura) };
    } else {
      return (
        "Preciso do formato: um tipo pronto (doc, email, presentation, whiteboard) OU largura e " +
        "altura em pixels (post quadrado = 1080x1080; story = 1080x1920)."
      );
    }

    const corpo: Record<string, unknown> = { design_type };
    if (titulo) corpo.title = titulo;

    const r = await chamar(token, "/designs", { method: "POST", body: corpo });
    if (!r.ok) return recado(r.status, r.erro);

    const d = (r.dados.design || {}) as Record<string, unknown>;
    const urls = (d.urls || {}) as Record<string, unknown>;
    const editar = String(urls.edit_url || "");
    const ver = String(urls.view_url || "");
    if (!d.id) return "O Canva aceitou o pedido mas não devolveu o design. Tente de novo.";
    return (
      `Design criado na conta Canva desta pessoa.\n` +
      `- id: ${d.id}${d.title ? `\n- título: ${d.title}` : ""}` +
      (editar ? `\n- editar: ${editar}` : "") +
      (ver ? `\n- ver: ${ver}` : "") +
      `\n\nO design nasce VAZIO (o Canva não deixa escrever o conteúdo por esta API). ` +
      `O conteúdo se cria/editando no próprio Canva, ou preenchendo um template da marca.`
    );
  }

  // ── 3. EXPORTAR ──────────────────────────────────────────────────────────
  if (nome === "canva_exportar") {
    const designId = String(args?.design_id || "").trim();
    if (!designId) return "Informe o design_id — use canva_designs para descobrir.";
    const formato = String(args?.formato || "png").trim();
    const permitidos = ["png", "jpg", "pdf", "pptx", "gif", "mp4"];
    if (!permitidos.includes(formato)) {
      return `Formato "${formato}" não é aceito. Use um destes: ${permitidos.join(", ")}.`;
    }

    const inicio = await chamar(token, "/exports", {
      method: "POST",
      body: { design_id: designId, format: { type: formato } },
    });
    if (!inicio.ok) return recado(inicio.status, inicio.erro);

    const job = (inicio.dados.job || {}) as Record<string, unknown>;
    const jobId = String(job.id || "");
    if (!jobId) return "O Canva aceitou a exportação mas não devolveu o trabalho. Tente de novo.";

    // Job assíncrono: o Canva gera o arquivo depois. Sondar com teto curto — não
    // travar o chat. Se não terminar a tempo, devolve o id para consultar.
    let atual = job;
    for (let i = 0; i < 8; i += 1) {
      const status = String(atual.status || "");
      if (status === "success" || status === "failed") break;
      await new Promise((r) => setTimeout(r, 1500));
      const s = await chamar(token, `/exports/${encodeURIComponent(jobId)}`);
      if (!s.ok) break;
      atual = (s.dados.job || {}) as Record<string, unknown>;
    }

    const status = String(atual.status || "");
    if (status === "failed") {
      const motivo = atual.error && typeof atual.error === "object"
        ? String((atual.error as Record<string, unknown>).message || "")
        : "";
      return `O Canva não conseguiu exportar${motivo ? `: ${motivo}` : ""}.`;
    }
    if (status !== "success") {
      return (
        `A exportação está sendo gerada pelo Canva (trabalho ${jobId}). ` +
        `Peça para eu conferir em instantes — o arquivo ainda não está pronto.`
      );
    }

    const urls = Array.isArray(atual.urls) ? (atual.urls as unknown[]).map(String) : [];
    if (!urls.length) return "O Canva disse que exportou, mas não devolveu endereço de download.";

    // ── ENTREGA NO CHAT (dono, 20/10/2026): *"save, send a PDF or a image to
    // chat for a person, not to be able to get out of the chat"*.
    // O link do Canva vale 24h e faz a pessoa SAIR do chat. Então o arquivo é
    // baixado AGORA e guardado no cofre de anexos DESTA conta — a pessoa recebe
    // um cartão clicável dentro da conversa, servido por `/api/arquivo/<id>`.
    //
    // Só os formatos que o cofre aceita (png, jpg, pdf, gif) podem ser
    // guardados. pptx/mp4 não estão na lista de tipos do cofre: para eles
    // devolvemos o link do Canva, dizendo que vale 24h — em vez de prometer um
    // anexo que não existiria.
    const guardavel = ["png", "jpg", "pdf", "gif"].includes(formato);
    const marca = await guardarNoCofre(token, urls[0], formato, designId, conta);
    if (marca) {
      return (
        `Exportei o design em ${formato.toUpperCase()} e o arquivo está aqui na conversa:\n` +
        `${marca}\n\n` +
        `É só clicar para baixar. O arquivo fica na sua conta — não precisa abrir o Canva.`
      );
    }
    if (guardavel) {
      // O cofre recusou (tamanho, tipo real, cota). Não escondemos: o link do
      // Canva continua valendo como plano B.
      return (
        `Exportei em ${formato.toUpperCase()}, mas não consegui guardar o arquivo na sua conta ` +
        `(pode ser tamanho ou cota). O download direto do Canva está aqui — vale 24 horas:\n` +
        urls.map((u) => `- ${u}`).join("\n")
      );
    }
    return (
      `Exportação pronta (${formato.toUpperCase()}):\n` +
      urls.map((u) => `- ${u}`).join("\n") +
      `\n\nOs links valem 24 horas. (Formato ${formato.toUpperCase()} não fica guardado na ` +
      `conversa — para receber o arquivo aqui, exporte em PNG, JPG, PDF ou GIF.)`
    );
  }

  return null;
}

/** Marcador que o chat transforma em cartão de download. */
export const MARCA_ARQUIVO = "arquivo:";

/**
 * Baixa o arquivo exportado e guarda no cofre de anexos DESTA conta.
 *
 * Devolve o marcador `[arquivo:<id>]` (que o chat renderiza como cartão), ou
 * `null` quando não deu — quem chama decide o que dizer. Nunca lança: falha de
 * download não pode derrubar a resposta do chat.
 */
async function guardarNoCofre(
  token: string,
  url: string,
  formato: string,
  designId: string,
  conta: Conta,
): Promise<string | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(45000) });
    if (!r.ok) return null;
    const bytes = Buffer.from(await r.arrayBuffer());
    if (!bytes.length) return null;

    const mime =
      formato === "pdf" ? "application/pdf"
      : formato === "gif" ? "image/gif"
      : formato === "jpg" ? "image/jpeg"
      : "image/png";
    const nome = `canva-${designId.slice(0, 12)}.${formato}`;

    const { salvarUpload } = await import("./uploads");
    // `File` global (Node 18+): o cofre espera um arquivo, não um Buffer.
    const arquivo = new File([new Uint8Array(bytes)], nome, { type: mime });
    const salvo = await salvarUpload(conta, arquivo);
    if (!salvo.ok) return null;
    return `[${MARCA_ARQUIVO}${salvo.registro.id}]`;
  } catch {
    return null;
  }
}
