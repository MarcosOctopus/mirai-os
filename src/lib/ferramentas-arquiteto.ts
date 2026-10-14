/**
 * AS FERRAMENTAS DO ARQUITETO NO CHAT (dono, 14/10/2026).
 *
 * ─── Por que isto existe ────────────────────────────────────────────────────
 *
 * O dono: *"oq foi feito antes n foi resolvido na parte do arquiteto"* — e ele
 * estava certo. O Arquiteto existia como TELA (`/arquiteto`) e como API, mas o
 * CHAT não tinha NENHUMA ferramenta dele: o modo "arquiteto" do chat só trocava
 * o TEXTO do prompt. Efeito medido: pedindo no chat *"quero buscar um projeto em
 * outro servidor pra editar"*, a Mirai respondia que não conseguia — e era
 * verdade, porque nada ali sabia fazer isso.
 *
 * Aqui as capacidades do Arquiteto viram FERRAMENTAS que o modelo chama sozinho.
 * A porteira é a MESMA da tela (`decidirAcessoArquiteto`, capacidade
 * `mirai.arquiteto.construir`): quem não tem a capacidade não recebe nem a lista
 * — a decisão é tomada ANTES, em `conversarComFerramentas`.
 *
 * ─── O que NUNCA muda ───────────────────────────────────────────────────────
 *
 *  - o repositório/servidor entra em workspace ISOLADO por conta e por projeto
 *    (`data/arquiteto-workspaces/<conta>/<projeto>/`) — nada se mistura;
 *  - a escrita no servidor do cliente vai por ENTRADA PADRÃO do ssh, nunca pela
 *    linha de comando, e faz backup remoto antes de sobrescrever;
 *  - a chave SSH é decifrada na hora, usada e some: nunca volta numa resposta.
 */

import type { Conta } from "@/lib/orgs";
import {
  criarProjeto,
  listarProjetos,
  obterProjeto,
} from "@/lib/arquiteto-projetos";
import {
  escreverArquivoDoWorkspace,
  importarDoGit,
  importarDoServidor,
  lerArquivoDoWorkspace,
  listarWorkspace,
} from "@/lib/arquiteto-workspace";
import { integracoesDaPessoa } from "@/lib/integracoes";
import { decifrar } from "@/lib/segredo-guardado";
import {
  TIPO_SERVIDOR,
  gravarArquivo,
  lerAlvo,
  lerArquivo,
  listar,
  listarRecursivo,
} from "@/lib/servidor-cliente";

type Def = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

/** Os nomes que pertencem a este módulo (o roteador usa para delegar). */
export const NOMES_ARQUITETO = new Set([
  "arquiteto_projetos",
  "arquiteto_trazer_git",
  "arquiteto_trazer_servidor",
  "arquiteto_arquivos",
  "arquiteto_ler",
  "arquiteto_gravar",
  "servidor_listar",
  "servidor_ler",
  "servidor_gravar",
]);

/** As definições que o modelo recebe quando a conta PODE usar o Arquiteto. */
export function ferramentasDoArquiteto(): Def[] {
  return [
    {
      type: "function",
      function: {
        name: "arquiteto_projetos",
        description:
          "Lista os projetos do Arquiteto desta conta (id, título, se tem workspace e se está publicado). " +
          "Use ANTES de mexer em qualquer arquivo: é aqui que você descobre o projeto_id.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      function: {
        name: "arquiteto_trazer_git",
        description:
          "TRAZ UM REPOSITÓRIO DO GITHUB para dentro, num projeto NOVO e ISOLADO desta conta. " +
          "Aceita 'dono/repo' ou a URL completa. Clone raso, sem ganchos, sem submódulos — o código " +
          "entra para ser LIDO e EDITADO, nunca executado. Devolve o projeto_id criado.",
        parameters: {
          type: "object",
          properties: {
            repo: { type: "string", description: "ex.: 'octocat/Spoon-Knife' ou 'https://github.com/dono/repo'" },
            titulo: { type: "string", description: "nome do projeto (opcional; sem ele, usa o nome do repositório)" },
          },
          required: ["repo"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "arquiteto_trazer_servidor",
        description:
          "TRAZ UMA PASTA DO SERVIDOR DO CLIENTE (o servidor já conectado nesta conta) para um projeto " +
          "NOVO e ISOLADO. Só arquivos de TEXTO entram; binários e pastas de dependência são pulados. " +
          "Use quando a pessoa disser 'traz o projeto que está no meu servidor'.",
        parameters: {
          type: "object",
          properties: {
            pasta: { type: "string", description: "caminho ABSOLUTO da pasta no servidor, ex.: '/var/www/meusite'" },
            titulo: { type: "string", description: "nome do projeto (opcional)" },
          },
          required: ["pasta"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "arquiteto_arquivos",
        description: "Lista os CAMINHOS dos arquivos que existem no workspace de um projeto. Use antes de ler ou editar.",
        parameters: {
          type: "object",
          properties: { projeto_id: { type: "string", description: "o id do projeto" } },
          required: ["projeto_id"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "arquiteto_ler",
        description: "Lê o conteúdo de UM arquivo do workspace do projeto (caminho RELATIVO à raiz do projeto).",
        parameters: {
          type: "object",
          properties: {
            projeto_id: { type: "string" },
            caminho: { type: "string", description: "caminho relativo, ex.: 'src/index.js'" },
          },
          required: ["projeto_id", "caminho"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "arquiteto_gravar",
        description:
          "Grava (cria ou sobrescreve) UM arquivo no workspace do projeto. [MUDA DADOS: confirme com a pessoa antes] " +
          "O caminho é relativo e não pode sair da pasta do projeto.",
        parameters: {
          type: "object",
          properties: {
            projeto_id: { type: "string" },
            caminho: { type: "string", description: "caminho relativo, ex.: 'src/index.js'" },
            conteudo: { type: "string", description: "o conteúdo COMPLETO do arquivo" },
          },
          required: ["projeto_id", "caminho", "conteudo"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "servidor_listar",
        description:
          "Lista uma pasta do SERVIDOR DO CLIENTE (o servidor conectado nesta conta). Leitura pura. " +
          "Serve para achar onde o projeto mora antes de trazer ou editar.",
        parameters: {
          type: "object",
          properties: { caminho: { type: "string", description: "caminho absoluto, ex.: '/var/www'" } },
          required: ["caminho"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "servidor_ler",
        description: "Lê um arquivo DE TEXTO do servidor do cliente. Recusa binários e arquivos grandes.",
        parameters: {
          type: "object",
          properties: { caminho: { type: "string", description: "caminho absoluto do arquivo" } },
          required: ["caminho"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "servidor_gravar",
        description:
          "Grava um arquivo NO SERVIDOR DO CLIENTE, com BACKUP automático do anterior antes de sobrescrever. " +
          "[MUDA DADOS: confirme com a pessoa antes] O conteúdo vai por entrada padrão do ssh.",
        parameters: {
          type: "object",
          properties: {
            caminho: { type: "string", description: "caminho absoluto do arquivo" },
            conteudo: { type: "string", description: "o conteúdo COMPLETO do arquivo" },
          },
          required: ["caminho", "conteudo"],
        },
      },
    },
  ];
}

/** Junta conta + servidor guardado + chave decifrada. Nunca devolve a chave. */
function prepararServidor(contaId: number) {
  const srv = integracoesDaPessoa(contaId).find((i) => i.tipo === TIPO_SERVIDOR);
  if (!srv) return { erro: "não há servidor conectado nesta conta (Conectar → Servidor)" } as const;
  const alvo = lerAlvo(srv.config);
  if (!alvo) return { erro: "o servidor guardado está incompleto" } as const;
  const chave = decifrar(srv.credencial);
  if (!chave) return { erro: "não consegui ler a credencial do servidor" } as const;
  return { alvo, chave } as const;
}

/** Acha o projeto conferindo que ele é DESTA conta (nunca de outra). */
function projetoDaConta(contaId: number, projetoId: string) {
  const p = obterProjeto(contaId, projetoId);
  return p;
}

/**
 * Executa uma ferramenta do Arquiteto. Devolve `null` quando o nome NÃO é daqui
 * (o roteador segue para os conectores). Erro vira TEXTO — nunca exceção, para
 * não derrubar o turno do chat.
 */
export async function executarFerramentaArquiteto(
  nome: string,
  args: Record<string, unknown>,
  conta: Conta,
): Promise<string | null> {
  if (!NOMES_ARQUITETO.has(nome)) return null;
  const userId = conta.id;

  try {
    // ── 1. os projetos desta conta ──────────────────────────────────────────
    if (nome === "arquiteto_projetos") {
      const lista = listarProjetos(userId);
      if (!lista.length) return "Esta conta ainda não tem nenhum projeto no Arquiteto.";
      return lista
        .map((p) => {
          const arquivos = listarWorkspace(userId, p.id).length;
          const estado = p.publicado_em ? "publicado" : "não publicado";
          return `- ${p.id} · "${p.titulo}" · ${arquivos} arquivo(s) · ${estado}`;
        })
        .join("\n");
    }

    // ── 2. trazer do GitHub ─────────────────────────────────────────────────
    if (nome === "arquiteto_trazer_git") {
      const repo = String(args?.repo || "").trim();
      if (!repo) return "erro: informe o repositório (ex.: 'dono/repo').";
      const titulo = String(args?.titulo || "").trim() || repo.split("/").pop() || "Projeto importado";
      const projeto = criarProjeto(userId, titulo);
      const r = await importarDoGit(userId, projeto.id, repo);
      if (!r.ok) return `Não consegui trazer esse repositório: ${r.erro || "falha no clone"}.`;
      const rel = r.relatorio;
      return (
        `Projeto criado: ${projeto.id} ("${titulo}").\n` +
        `Repositório ${rel.repo}: ${rel.incluidos} arquivo(s) incluído(s), ` +
        `${Math.round(rel.bytes / 1024)} KB.` +
        (rel.pulados.length ? `\nPulados: ${rel.pulados.length} (binários, grandes ou pastas de dependência).` : "")
      );
    }

    // ── 3. trazer do servidor do cliente ────────────────────────────────────
    if (nome === "arquiteto_trazer_servidor") {
      const pasta = String(args?.pasta || "").trim();
      if (!pasta) return "erro: informe a pasta do servidor.";
      const p = prepararServidor(userId);
      if ("erro" in p) return `erro: ${p.erro}`;

      const base = { host: p.alvo.host, porta: p.alvo.porta, usuario: p.alvo.usuario, chave: p.chave };
      const lista = await listarRecursivo({ ...base, caminho: pasta });
      if (!lista.ok) return `Não consegui listar essa pasta no servidor: ${lista.erro}`;
      if (!lista.arquivos.length) return "Essa pasta não tem arquivos de texto para trazer.";

      const arquivos: { nome: string; conteudo: string }[] = [];
      for (const caminho of lista.arquivos) {
        const lido = await lerArquivo({ ...base, caminho });
        if (!lido.ok || typeof lido.conteudo !== "string") continue;
        // O caminho vem ABSOLUTO do servidor; no workspace ele vira relativo à pasta.
        const relativo = caminho.startsWith(pasta) ? caminho.slice(pasta.length).replace(/^\/+/, "") : caminho.replace(/^\/+/, "");
        if (!relativo) continue;
        arquivos.push({ nome: relativo, conteudo: lido.conteudo });
      }
      if (!arquivos.length) return "Não consegui ler nenhum arquivo de texto dessa pasta.";

      const titulo = String(args?.titulo || "").trim() || pasta.split("/").filter(Boolean).pop() || "Do servidor";
      const projeto = criarProjeto(userId, titulo);
      const r = importarDoServidor(userId, projeto.id, arquivos, `${p.alvo.usuario}@${p.alvo.host}:${pasta}`);
      if (!r.ok) return `Não consegui guardar os arquivos: ${r.erro}`;
      return (
        `Projeto criado: ${projeto.id} ("${titulo}").\n` +
        `Vieram ${r.relatorio.incluidos} arquivo(s) de ${p.alvo.host}:${pasta} ` +
        `(${Math.round(r.relatorio.bytes / 1024)} KB). Isolado nesta conta.`
      );
    }

    // ── 4. o workspace ──────────────────────────────────────────────────────
    if (nome === "arquiteto_arquivos") {
      const projetoId = String(args?.projeto_id || "").trim();
      if (!projetoDaConta(userId, projetoId)) return "erro: projeto não encontrado nesta conta.";
      const arquivos = listarWorkspace(userId, projetoId);
      if (!arquivos.length) return "Este projeto não tem workspace (nada foi trazido ainda).";
      return `${arquivos.length} arquivo(s):\n` + arquivos.slice(0, 200).join("\n") +
        (arquivos.length > 200 ? `\n… e mais ${arquivos.length - 200}.` : "");
    }

    if (nome === "arquiteto_ler") {
      const projetoId = String(args?.projeto_id || "").trim();
      if (!projetoDaConta(userId, projetoId)) return "erro: projeto não encontrado nesta conta.";
      const r = lerArquivoDoWorkspace(userId, projetoId, String(args?.caminho || ""));
      if (!r.ok) return `Não consegui ler: ${r.erro}.`;
      return r.conteudo;
    }

    if (nome === "arquiteto_gravar") {
      const projetoId = String(args?.projeto_id || "").trim();
      if (!projetoDaConta(userId, projetoId)) return "erro: projeto não encontrado nesta conta.";
      const r = escreverArquivoDoWorkspace(
        userId,
        projetoId,
        String(args?.caminho || ""),
        String(args?.conteudo ?? ""),
      );
      if (!r.ok) return `Não gravei: ${r.erro}.`;
      return `Gravado: ${args?.caminho} (projeto ${projetoId}).`;
    }

    // ── 5. o servidor do cliente ────────────────────────────────────────────
    if (nome === "servidor_listar") {
      const p = prepararServidor(userId);
      if ("erro" in p) return `erro: ${p.erro}`;
      const r = await listar({
        host: p.alvo.host, porta: p.alvo.porta, usuario: p.alvo.usuario, chave: p.chave,
        caminho: String(args?.caminho || "/"),
      });
      if (!r.ok) return `Não consegui listar: ${r.erro}`;
      return r.itens.length ? r.itens.join("\n") : "A pasta está vazia.";
    }

    if (nome === "servidor_ler") {
      const p = prepararServidor(userId);
      if ("erro" in p) return `erro: ${p.erro}`;
      const r = await lerArquivo({
        host: p.alvo.host, porta: p.alvo.porta, usuario: p.alvo.usuario, chave: p.chave,
        caminho: String(args?.caminho || ""),
      });
      if (!r.ok) return `Não consegui ler: ${r.erro}`;
      return r.conteudo ?? "";
    }

    if (nome === "servidor_gravar") {
      const p = prepararServidor(userId);
      if ("erro" in p) return `erro: ${p.erro}`;
      const r = await gravarArquivo({
        host: p.alvo.host, porta: p.alvo.porta, usuario: p.alvo.usuario, chave: p.chave,
        caminho: String(args?.caminho || ""),
        conteudo: String(args?.conteudo ?? ""),
      });
      if (!r.ok) return `Não gravei: ${r.erro}`;
      return `Gravado no servidor: ${args?.caminho} (backup do anterior feito antes).`;
    }

    return null;
  } catch (e) {
    return `erro ao executar ${nome}: ${e instanceof Error ? e.message : "falha inesperada"}`;
  }
}
