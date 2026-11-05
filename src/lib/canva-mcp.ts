/**
 * Cliente MCP do Canva — por PESSOA (multi-tenant).
 *
 * POR QUE ISTO EXISTE (dono, 22/10/2026): o cliente precisa listar, buscar,
 * EDITAR, criar e exportar os designs DA CONTA DELE. A Connect API
 * (`api.canva.com/rest/v1`) faz estado/listar/criar/exportar, mas NÃO edita —
 * edição é só pelo MCP oficial (`mcp.canva.com/mcp`).
 *
 * POR QUE HTTP DIRETO E NÃO `mcp-remote` (o `npx`): o mcp-remote guarda o
 * token em `~/.mcp-auth` do PERFIL — no caso, o do `mapapaper`. Usá-lo faria
 * TODO cliente editar a conta Canva do Mapa Paper, num token que pertence a
 * outra pessoa. Além disso, spawnar `npx` por chamada seria lento e frágil.
 * Aqui o Bearer vem do COFRE DA CONTA (`tokenCanvaDaConta`), que é por pessoa.
 *
 * O TOKEN NUNCA APARECE EM RESPOSTA NEM LOG: entra no cabeçalho e some.
 *
 * Ações do MCP usadas (medidas em 49 ferramentas, 22/10/2026):
 *   start-editing-transaction  → abre transação, devolve element_ids + richtexts/fills
 *   perform-editing-operations → aplica as operações
 *   commit-editing-transaction → grava
 *   cancel-editing-transaction → desfaz (usado SEMPRE no erro, para não deixar
 *                                transação pendurada na conta do cliente)
 */

import { tokenCanvaDaConta } from './canva-conta';

const MCP_CANVA = 'https://mcp.canva.com/mcp';

/**
 * O MCP Streamable HTTP responde em SSE (`data: {...}`) ou em JSON puro.
 * Sem tratar os dois, metade das chamadas volta "vazia" e parece que a API
 * quebrou — quando só mudou o formato.
 */
function extrairJson(raw: string): unknown {
  const texto = raw.trim();
  if (!texto) return null;
  if (texto.startsWith('{') || texto.startsWith('[')) {
    try {
      return JSON.parse(texto);
    } catch {
      /* cai para o parser de SSE */
    }
  }
  const linhas = texto
    .split('\n')
    .filter((l) => l.startsWith('data:'))
    .map((l) => l.slice(5).trim())
    .filter(Boolean);
  for (const l of linhas) {
    try {
      return JSON.parse(l);
    } catch {
      /* linha não-JSON: segue */
    }
  }
  return null;
}

/** Uma chamada de ferramenta. Devolve o texto do resultado, já desenrolado. */
async function chamar(
  contaId: number,
  ferramenta: string,
  args: Record<string, unknown>,
  timeoutMs = 45000,
): Promise<{ ok: boolean; texto: string; erro?: string }> {
  const token = await tokenCanvaDaConta(contaId);
  if (!token) {
    return { ok: false, texto: '', erro: 'SEM_CONEXAO' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(MCP_CANVA, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        // Streamable HTTP exige os DOIS tipos de resposta; sem os dois o
        // servidor recusa com `Not Acceptable`.
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: ferramenta, arguments: args },
      }),
    });
    clearTimeout(timer);

    const bruto = await res.text();

    if (!res.ok) {
      // 401 = token do cliente expirou ou foi revogado; o cofre precisa
      // renovar. Dizer "sem conexão" aqui é mais honesto que repetir 401.
      if (res.status === 401 || res.status === 403) {
        return { ok: false, texto: '', erro: 'TOKEN_REVOGADO' };
      }
      return { ok: false, texto: '', erro: `HTTP ${res.status}: ${bruto.slice(0, 200)}` };
    }

    const json = extrairJson(bruto);
    const resultado = (json as { result?: { content?: { text?: string }[] } })?.result;
    const texto = (resultado?.content ?? [])
      .map((c) => c.text ?? '')
      .join(' ')
      .trim();

    // O MCP responde 200 com `isError:true` quando a ferramenta falha.
    if (resultado && (resultado as { isError?: boolean }).isError) {
      return { ok: false, texto, erro: texto.slice(0, 300) };
    }
    return { ok: true, texto };
  } catch (e) {
    clearTimeout(timer);
    const nome = (e as Error)?.name;
    return {
      ok: false,
      texto: '',
      erro: nome === 'AbortError' ? `tempo esgotado (${timeoutMs / 1000}s)` : (e as Error)?.message,
    };
  }
}

/** Lista/busca designs da conta do cliente. */
export async function canvaBuscarDesigns(
  contaId: number,
  busca?: string,
): Promise<{ ok: boolean; texto: string; erro?: string }> {
  return chamar(contaId, 'search-designs', busca ? { query: busca } : {});
}

/**
 * Abre transação de edição, aplica as operações e grava.
 *
 * `cancel` no `finally` só roda quando houve transação E ela não foi
 * confirmada: deixar transação aberta na conta do cliente é lixo lá dentro,
 * e o cliente não tem como ver nem limpar.
 */
export async function canvaEditarDesign(
  contaId: number,
  designId: string,
  operacoes: Record<string, unknown>[],
  pageIndex = 1,
): Promise<{ ok: boolean; texto: string; erro?: string }> {
  const abriu = await chamar(contaId, 'start-editing-transaction', { design_id: designId });
  if (!abriu.ok) return abriu;

  const dados = extrairJson(abriu.texto) as {
    transaction?: { transaction_id?: string };
  } | null;
  const transactionId = dados?.transaction?.transaction_id ?? '';

  if (!transactionId) {
    return { ok: false, texto: '', erro: 'a transacao de edicao nao devolveu transaction_id' };
  }

  // Se qualquer passo falhar, a transação fica ABERTA na conta do cliente.
  // Isso é lixo que ele não consegue ver nem limpar sozinho — o cancelamento
  // é o que mantém a conta do cliente limpa, e roda em qualquer erro.
  let confirmada = false;
  try {
    const aplicadas = await chamar(contaId, 'perform-editing-operations', {
      transaction_id: transactionId,
      operations: operacoes,
      page_index: pageIndex,
    });
    if (!aplicadas.ok) return aplicadas;

    const commit = await chamar(contaId, 'commit-editing-transaction', {
      transaction_id: transactionId,
    });
    if (!commit.ok) return commit;
    confirmada = true;

    return {
      ok: true,
      texto: `Design ${designId} editado e salvo. ${aplicadas.texto ? resumoOperacoes(aplicadas.texto) : ''}`.trim(),
    };
  } catch (e) {
    return { ok: false, texto: '', erro: (e as Error)?.message };
  } finally {
    if (!confirmada) {
      // Melhor tentativa. Se o cancelamento falhar, a transacao fica
      // aberta — mas e melhor tentar do que nunca tentar.
      await chamar(contaId, 'cancel-editing-transaction', { transaction_id: transactionId }, 15000);
    }
  }
}

/** Campos preenchíveis do design (o modelo precisa saber os nomes). */
export async function canvaCamposDoDesign(
  contaId: number,
  designId: string,
): Promise<{ ok: boolean; texto: string; erro?: string }> {
  return chamar(contaId, 'get-design-dataset', { design_id: designId });
}

function resumoOperacoes(texto: string): string {
  try {
    const d = JSON.parse(texto);
    const n = Array.isArray(d.operations) ? d.operations.length : undefined;
    return n ? `${n} operacao(oes) aplicada(s).` : '';
  } catch {
    return '';
  }
}