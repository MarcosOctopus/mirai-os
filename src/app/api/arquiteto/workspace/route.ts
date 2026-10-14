import { NextRequest, NextResponse } from "next/server";

import { exigirConta } from "@/lib/orgs";
import { decidirAcessoArquiteto, CAPACIDADE_ARQUITETO } from "@/lib/arquiteto-acesso";
import { decifrar } from "@/lib/segredo-guardado";
import { integracoesDaPessoa } from "@/lib/integracoes";
import { TIPO_SERVIDOR, lerAlvo, listarRecursivo, lerArquivo } from "@/lib/servidor-cliente";
import {
  importarDoGit,
  importarDoServidor,
  listarWorkspace,
  lerArquivoDoWorkspace,
  escreverArquivoDoWorkspace,
  tamanhoDoWorkspace,
  validarRepo,
  TETO,
} from "@/lib/arquiteto-workspace";
import { salvarProjeto, criarProjeto, obterProjeto } from "@/lib/arquiteto-projetos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * O servidor SSH guardado DESTA conta, com a chave já decifrada.
 * A chave vive só dentro desta função e do uso imediato — nunca vai à resposta.
 */
async function servidorDaConta(
  contaId: number,
): Promise<{ dados: { host: string; porta: number; usuario: string; chave: string } } | { erro: string; status: 400 }> {
  const srv = integracoesDaPessoa(contaId).find((i) => i.tipo === TIPO_SERVIDOR);
  if (!srv) return { erro: "nenhum servidor conectado nesta conta", status: 400 };

  const alvo = lerAlvo(srv.config);
  if (!alvo) return { erro: "o servidor guardado está incompleto", status: 400 };

  const chave = decifrar(srv.credencial);
  if (!chave) return { erro: "não consegui ler a credencial guardada", status: 400 };

  return { dados: { host: alvo.host, porta: alvo.porta, usuario: alvo.usuario, chave } };
}

/**
 * /api/arquiteto/workspace — TRAZER um projeto de fora para dentro, isolado.
 *
 * ─── Por que esta rota existe (dono, 14/10/2026, verbatim) ───────────────────
 *
 *   "Eu quero que consiga editar coisas em outros servidores ou instalar de
 *    forma isolada githubs e projetos pelo arquiteto"
 *
 * ─── As duas travas, e por que são duas ──────────────────────────────────────
 *
 * 1. **Sessão** (`exigirConta`) — quem é você. Sem sessão, 401.
 * 2. **Porteira do Arquiteto** (`mirai.arquiteto.construir`) — o que a sua conta
 *    pode. Trazer código de fora e escrever em disco é capacidade de RISCO ALTO,
 *    a mesma do gerar: falha FECHADO, e a decisão é do servidor, nunca do
 *    cliente. Quem não tem a capacidade leva 403 e nada é clonado.
 *
 * O ESCOPO é sempre o `user_id` da sessão. Não existe parâmetro de conta: um
 * workspace de outra pessoa não é alcançável nem por engano.
 *
 * ─── O que esta rota NÃO faz ─────────────────────────────────────────────────
 *
 * Não executa o código importado. Não instala dependência. Não abre SSH para
 * lugar nenhum. Trazer e editar, sim; rodar, não — rodar código de terceiro
 * dentro deste processo seria entregar a máquina (o desenho disso, com o runner
 * no host, está no fim de `lib/arquiteto-workspace.ts`).
 *
 *   GET  ?projetoId=…            → lista os arquivos do workspace
 *   GET  ?projetoId=…&arquivo=…  → devolve o conteúdo de um arquivo
 *   POST { endereco, projetoId? } → importa o repositório e vira projeto
 *   PUT  { projetoId, arquivo, conteudo } → grava um arquivo (cria versão)
 */
export async function GET(req: NextRequest) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  const acesso = await decidirAcessoArquiteto(g.conta);
  if (!acesso.permitido) {
    return NextResponse.json(
      { erro: "O Arquiteto não está liberado para esta conta.", capacidade: CAPACIDADE_ARQUITETO, motivo: acesso.motivo },
      { status: 403 },
    );
  }

  const projetoId = req.nextUrl.searchParams.get("projetoId") || "";
  const arquivo = req.nextUrl.searchParams.get("arquivo");
  if (!projetoId) return NextResponse.json({ erro: "informe o projetoId" }, { status: 400 });

  // O projeto tem de ser DESTA conta — a checagem é aqui, no servidor.
  if (!obterProjeto(g.conta.id, projetoId)) {
    return NextResponse.json({ erro: "projeto não encontrado" }, { status: 404 });
  }

  if (arquivo) {
    const r = lerArquivoDoWorkspace(g.conta.id, projetoId, arquivo);
    if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 404 });
    return NextResponse.json({ arquivo, conteudo: r.conteudo });
  }

  return NextResponse.json({
    arquivos: listarWorkspace(g.conta.id, projetoId),
    bytes: tamanhoDoWorkspace(g.conta.id),
  });
}

export async function POST(req: NextRequest) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  const acesso = await decidirAcessoArquiteto(g.conta);
  if (!acesso.permitido) {
    return NextResponse.json(
      { erro: "O Arquiteto não está liberado para esta conta.", capacidade: CAPACIDADE_ARQUITETO, motivo: acesso.motivo },
      { status: 403 },
    );
  }

  let corpo: {
    endereco?: string;
    servidor?: { caminho?: string };
    projetoId?: string | null;
    titulo?: string | null;
  } = {};
  try {
    corpo = (await req.json()) as typeof corpo;
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }

  // Se veio projetoId, ele tem de ser desta conta (404 fecha a porta de espiar).
  let projetoId = (corpo.projetoId || "").trim();
  if (projetoId && !obterProjeto(g.conta.id, projetoId)) {
    return NextResponse.json({ erro: "projeto não encontrado" }, { status: 404 });
  }

  // ═══ CAMINHO A: DO SERVIDOR DELE (dono, 14/10/2026) ══════════════════════
  // "traga o projeto que ele quiser do git ou do SEU PROPRIO SERVIDOR".
  // A leitura acontece no servidor dele e a cópia entra no workspace isolado.
  if (corpo.servidor?.caminho) {
    const origem = await servidorDaConta(g.conta.id);
    if ("erro" in origem) return NextResponse.json({ erro: origem.erro }, { status: origem.status });

    const base = (corpo.servidor.caminho || "").trim();
    const lista = await listarRecursivo({ ...origem.dados, caminho: base });
    if (!lista.ok) return NextResponse.json({ erro: lista.erro }, { status: 422 });

    // Lê cada arquivo (uma conexão por arquivo — simples e com teto em cada um).
    const trazidos: { nome: string; conteudo: string }[] = [];
    let total = 0;
    for (const absoluto of lista.arquivos) {
      if (trazidos.length >= TETO.arquivos || total >= TETO.bytes) break;
      const r = await lerArquivo({ ...origem.dados, caminho: absoluto });
      if (!r.ok || typeof r.conteudo !== "string") continue;
      const bytes = Buffer.byteLength(r.conteudo, "utf8");
      if (bytes > TETO.porArquivo || total + bytes > TETO.bytes) continue;
      // O nome guardado é RELATIVO à pasta pedida: o workspace não carrega o
      // caminho absoluto do servidor dele (nem o nome do usuário dele).
      const nome = absoluto.startsWith(base.replace(/\/+$/, "") + "/")
        ? absoluto.slice(base.replace(/\/+$/, "").length + 1)
        : absoluto.split("/").pop() || absoluto;
      trazidos.push({ nome, conteudo: r.conteudo });
      total += bytes;
    }
    if (!trazidos.length) {
      return NextResponse.json(
        { erro: "não consegui trazer nenhum arquivo de texto dessa pasta (ou a pasta está vazia)" },
        { status: 422 },
      );
    }

    if (!projetoId) {
      const novo = criarProjeto(g.conta.id, (corpo.titulo || "").trim() || base.split("/").filter(Boolean).pop() || "do servidor");
      projetoId = novo.id;
    }
    const imp = importarDoServidor(g.conta.id, projetoId, trazidos, `servidor:${base}`);
    if (!imp.ok || !imp.arquivos) {
      return NextResponse.json({ erro: imp.erro || "não consegui trazer", relatorio: imp.relatorio }, { status: 422 });
    }
    const salvoSrv = salvarProjeto(
      g.conta.id,
      projetoId,
      (corpo.titulo || "").trim() || base.split("/").filter(Boolean).pop() || "do servidor",
      imp.arquivos,
    );
    if (!salvoSrv) {
      return NextResponse.json({ erro: "trouxe, mas não consegui registrar o projeto" }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      origem: "servidor",
      projeto: { id: salvoSrv.id, titulo: salvoSrv.titulo },
      workspace: imp.workspace,
      relatorio: imp.relatorio,
    });
  }

  // ═══ CAMINHO B: DO GITHUB ════════════════════════════════════════════════
  const endereco = (corpo.endereco || "").trim();
  const v = validarRepo(endereco);
  if (!v.ok) return NextResponse.json({ erro: v.erro }, { status: 400 });

  // Sem projeto, nasce um: o repositório vira o projeto, com o nome dele.
  if (!projetoId) {
    const novo = criarProjeto(g.conta.id, (corpo.titulo || "").trim() || v.slug);
    projetoId = novo.id;
  }

  const r = await importarDoGit(g.conta.id, projetoId, endereco);
  if (!r.ok || !r.arquivos) {
    return NextResponse.json({ erro: r.erro || "não consegui importar", relatorio: r.relatorio }, { status: 422 });
  }

  // Os arquivos do repositório viram o CONTEÚDO do projeto — assim eles entram
  // na tela, no editor e no histórico de versões que já existem.
  const salvo = salvarProjeto(g.conta.id, projetoId, (corpo.titulo || "").trim() || v.slug, r.arquivos);
  if (!salvo) {
    return NextResponse.json({ erro: "importei, mas não consegui registrar o projeto" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    origem: "git",
    projeto: { id: salvo.id, titulo: salvo.titulo },
    workspace: r.workspace,
    relatorio: r.relatorio,
  });
}

export async function PUT(req: NextRequest) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  const acesso = await decidirAcessoArquiteto(g.conta);
  if (!acesso.permitido) {
    return NextResponse.json(
      { erro: "O Arquiteto não está liberado para esta conta.", capacidade: CAPACIDADE_ARQUITETO, motivo: acesso.motivo },
      { status: 403 },
    );
  }

  let corpo: { projetoId?: string; arquivo?: string; conteudo?: string } = {};
  try {
    corpo = (await req.json()) as typeof corpo;
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }
  const projetoId = (corpo.projetoId || "").trim();
  const arquivo = (corpo.arquivo || "").trim();
  if (!projetoId || !arquivo) return NextResponse.json({ erro: "informe projetoId e arquivo" }, { status: 400 });

  const atual = obterProjeto(g.conta.id, projetoId);
  if (!atual) return NextResponse.json({ erro: "projeto não encontrado" }, { status: 404 });

  const w = escreverArquivoDoWorkspace(g.conta.id, projetoId, arquivo, corpo.conteudo ?? "");
  if (!w.ok) return NextResponse.json({ erro: w.erro }, { status: 422 });

  // O disco e a tela andam juntos: grava o arquivo e refaz o projeto com o novo
  // conteúdo — é isso que cria a VERSÃO e mantém o histórico que já existe.
  const arquivos = (atual.arquivos || []).map((a) =>
    a.nome === arquivo ? { nome: a.nome, conteudo: corpo.conteudo ?? "" } : { nome: a.nome, conteudo: a.conteudo },
  );
  if (!arquivos.some((a) => a.nome === arquivo)) {
    arquivos.push({ nome: arquivo, conteudo: corpo.conteudo ?? "" });
  }
  const salvo = salvarProjeto(g.conta.id, projetoId, atual.titulo, arquivos);
  if (!salvo) return NextResponse.json({ erro: "gravei o arquivo, mas não consegui versionar" }, { status: 500 });

  return NextResponse.json({ ok: true, projeto: { id: salvo.id, titulo: salvo.titulo } });
}
