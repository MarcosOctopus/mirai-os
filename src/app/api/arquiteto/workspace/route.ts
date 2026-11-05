import { NextRequest, NextResponse } from "next/server";

import { exigirConta } from "@/lib/orgs";
import { decidirAcessoArquiteto, CAPACIDADE_ARQUITETO } from "@/lib/arquiteto-acesso";
import { decifrar } from "@/lib/segredo-guardado";
import { integracoesDaPessoa } from "@/lib/integracoes";
import { TIPO_SERVIDOR, lerAlvo, listarRecursivo, lerArquivo } from "@/lib/servidor-cliente";
import {
  importarDoGit,
  importarDoGitComToken,
  importarDoServidor,
  listarWorkspace,
  lerArquivoDoWorkspace,
  escreverArquivoDoWorkspace,
  tamanhoDoWorkspace,
  alvoDoEndereco,
  TETO,
} from "@/lib/arquiteto-workspace";
import { salvarProjeto, criarProjeto, obterProjeto, podeTrazerProjetoDeFora, apagarProjeto } from "@/lib/arquiteto-projetos";
import { tokenGithubDaConta, listarReposDoDono } from "@/lib/github-conta";
import { publicarEConstruir } from "@/lib/arquiteto-publicar-rapido";

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
    /**
     * PUBLICAR ASSIM QUE IMPORTAR (dono, 19/10/2026: "acho legal com essa
     * escolha"). Marcado, o projeto vai ao ar sozinho: publica, constrói e o
     * runner encadeia o `subir`. Desmarcado, o projeto só é importado — quem
     * quer editar antes de expor tem esse direito.
     */
    publicar?: boolean;
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
      // Teto de projetos DE FORA do plano (dono, 15/10/2026). Só barra projeto
      // NOVO: trazer para um projeto que já é da conta não consome outra vaga.
      const pode = await podeTrazerProjetoDeFora(g.conta.id, false);
      if (!pode.ok) return NextResponse.json({ erro: pode.erro }, { status: 403 });
      const novo = criarProjeto(g.conta.id, (corpo.titulo || "").trim() || base.split("/").filter(Boolean).pop() || "do servidor", "servidor");
      projetoId = novo.id;
    }
    const imp = await importarDoServidor(g.conta.id, projetoId, trazidos, `servidor:${base}`);
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
    const publicacaoSrv = corpo.publicar === true
      ? await publicarEConstruir(g.conta.id, salvoSrv.id)
      : null;

    return NextResponse.json({
      ok: true,
      origem: "servidor",
      projeto: { id: salvoSrv.id, titulo: salvoSrv.titulo },
      workspace: imp.workspace,
      relatorio: imp.relatorio,
      publicacao: publicacaoSrv,
    });
  }

  // ═══ CAMINHO B: DO GITHUB ════════════════════════════════════════════════
  const endereco = (corpo.endereco || "").trim();
  const alvo = alvoDoEndereco(endereco);

  // CONTA (organização ou usuário), não repositório (dono, 16/10/2026): a resposta
  // certa NÃO é erro — é a LISTA dos repositórios dela, para escolher. Antes, a URL
  // de uma organização virava o slug `orgs/<org>` e a pessoa recebia *"não achei o
  // repositório 'orgs/Mesh2Motion'"* — um erro que não faz sentido para quem colou
  // a URL certa. Aqui a lista vai junto da resposta (mesmo status 200) e o diálogo
  // mostra os repositórios para clicar.
  if (alvo.tipo === "lista") {
    const tokenLista = await tokenGithubDaConta(g.conta.id);
    const l = await listarReposDoDono(alvo.dono, tokenLista);
    return NextResponse.json(
      {
        ok: false,
        escolha: {
          dono: alvo.dono,
          host: alvo.host,
          tem_token: !!tokenLista,
          repos: l.ok ? l.repos : [],
          erro: l.ok ? "" : l.erro,
        },
      },
      { status: 200 },
    );
  }
  if (alvo.tipo === "invalido") {
    return NextResponse.json({ erro: alvo.erro }, { status: 400 });
  }
  const v = { ok: true as const, url: alvo.url, slug: alvo.slug };

  // Sem projeto, nasce um: o repositório vira o projeto, com o nome dele.
  // O teto de projetos DE FORA do plano vale aqui (só para projeto NOVO).
  let criadoAgora = false;
  if (!projetoId) {
    const pode = await podeTrazerProjetoDeFora(g.conta.id, false);
    if (!pode.ok) return NextResponse.json({ erro: pode.erro }, { status: 403 });
    const novo = criarProjeto(g.conta.id, (corpo.titulo || "").trim() || v.slug, "git");
    projetoId = novo.id;
    criadoAgora = true;
  }

  // PELO TOKEN DA CONTA quando há GitHub conectado — a MESMA regra do chat
  // (dono, 16/10/2026). Antes esta rota chamava `importarDoGit` direto, e isso
  // tinha dois efeitos medidos: (1) a tela NÃO alcançava repositório privado nem
  // com o GitHub conectado, porque o clone anônimo não enxerga o que é privado;
  // (2) trazia o repositório CRU — `.git/` inteiro e binários — 2.479 arquivos e
  // 64,4 MB no teste do flowise, contra 2.000 arquivos de TEXTO (13,7 MB) do
  // caminho do chat. Duas implementações da mesma coisa divergem; aqui elas
  // viram uma só: com conexão, o token; sem, o clone anônimo (público).
  const tokenGit = await tokenGithubDaConta(g.conta.id);
  const r = tokenGit
    ? await importarDoGitComToken(g.conta.id, projetoId, endereco, tokenGit)
    : await importarDoGit(g.conta.id, projetoId, endereco);
  if (!r.ok || !r.arquivos) {
    // NÃO DEIXA PROJETO VAZIO (dono, 16/10/2026). O projeto nasce ANTES do import
    // (o workspace precisa do id) — sem isto, uma falha deixava um projeto VAZIO na
    // conta. Medido: `Mesh2Motion/nao-existe` e `gitlab-org/nao-existe-mesmo`
    // ficaram para trás depois de um endereço que não existe. A ferramenta do CHAT
    // já apagava o projeto nesse caso; a tela não. É a MESMA regra — se o projeto
    // foi criado agora e o import falhou, ele não deve existir.
    if (criadoAgora && projetoId) apagarProjeto(g.conta.id, projetoId);
    return NextResponse.json({ erro: r.erro || "não consegui importar", relatorio: r.relatorio }, { status: 422 });
  }

  // Os arquivos do repositório viram o CONTEÚDO do projeto — assim eles entram
  // na tela, no editor e no histórico de versões que já existem.
  const salvo = salvarProjeto(g.conta.id, projetoId, (corpo.titulo || "").trim() || v.slug, r.arquivos);
  if (!salvo) {
    return NextResponse.json({ erro: "importei, mas não consegui registrar o projeto" }, { status: 500 });
  }

  // PUBLICAR JUNTO, QUANDO A PESSOA PEDIU (dono, 19/10/2026: "acho legal com
  // essa escolha"). A escolha é dela e vem no corpo do pedido — importar sem
  // publicar continua valendo para quem quer editar antes de expor.
  const publicacao = corpo.publicar === true
    ? await publicarEConstruir(g.conta.id, salvo.id)
    : null;

  return NextResponse.json({
    ok: true,
    origem: "git",
    projeto: { id: salvo.id, titulo: salvo.titulo },
    workspace: r.workspace,
    relatorio: r.relatorio,
    publicacao,
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

  const w = await escreverArquivoDoWorkspace(g.conta.id, projetoId, arquivo, corpo.conteudo ?? "");
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
