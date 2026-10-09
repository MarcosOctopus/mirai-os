import { NextRequest, NextResponse } from "next/server";

import { exigirConta } from "@/lib/orgs";
import {
  listarAssets,
  obterAssetBytes,
  obterProjeto,
  type AssetResumo,
  type ProjetoCompleto,
} from "@/lib/arquiteto-projetos";
import { NOMES_TOKENS, varDoToken } from "@/lib/arquiteto-tokens";
import { montarZip, type EntradaZip } from "@/lib/arquiteto-zip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/arquiteto/projetos/[id]/exportar — BAIXAR O APP.
 *
 * Pedido do dono (08/10/2026), comparando com o Figma Make: "baixa toda a
 * aplicação". Aqui o projeto do Arquiteto sai INTEIRO num .zip:
 *
 *   • os arquivos do projeto, com o caminho real (pasta é pasta dentro do zip);
 *   • as imagens do projeto, no caminho `assets/…` que o HTML já referencia —
 *     o app baixado abre com as imagens, não quebrado;
 *   • um `LEIA-ME.md` escrito a partir do ESTADO REAL (arquivos, imagens, tokens):
 *     documenta o que existe, não o que se esperava que existisse.
 *
 * Posse pela sessão, como o resto: projeto de outra conta responde 404.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  const { id } = await ctx.params;
  const projeto = obterProjeto(g.conta.id, id);
  if (!projeto) return NextResponse.json({ erro: "Projeto não encontrado." }, { status: 404 });

  const assets = listarAssets(g.conta.id, id) ?? [];

  const entradas: EntradaZip[] = projeto.arquivos.map((a) => ({ caminho: a.nome, conteudo: a.conteudo }));

  for (const a of assets) {
    const blob = obterAssetBytes(g.conta.id, id, a.caminho);
    if (!blob) continue;
    const bytes = Buffer.isBuffer(blob.bytes)
      ? blob.bytes
      : Buffer.from(blob.bytes as unknown as ArrayBuffer);
    entradas.push({ caminho: a.caminho, conteudo: bytes });
  }

  entradas.push({ caminho: "LEIA-ME.md", conteudo: leiaMe(projeto, assets) });

  const zip = montarZip(entradas);

  return new NextResponse(new Uint8Array(zip), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${nomeDoArquivo(projeto.titulo)}"`,
      "Content-Length": String(zip.length),
      "Cache-Control": "no-store",
    },
  });
}

/** Nome do .zip: derivado do título, só ASCII (nome de download não pede acento). */
function nomeDoArquivo(titulo: string): string {
  const base = (titulo || "projeto")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "projeto"}.zip`;
}

/**
 * O `LEIA-ME.md` do projeto — escrito do estado REAL: o que o projeto tem hoje
 * (arquivos com tamanho, imagens com tipo, tokens com valor). Nada de promessa.
 */
function leiaMe(p: ProjetoCompleto, assets: AssetResumo[]): string {
  const agora = new Date().toISOString().slice(0, 16).replace("T", " ");
  const linhas: string[] = [
    `# ${p.titulo}`,
    "",
    `App exportado do **Arquiteto** (MIRAI OS) em ${agora} UTC.`,
    "",
    "## Como abrir",
    "",
    "Descompacte esta pasta e abra o `index.html` no navegador. É HTML, CSS e",
    "JavaScript puros: não precisa instalar nada e não existe passo de build.",
    "",
    "## Arquivos",
    "",
  ];

  for (const a of p.arquivos) {
    linhas.push(`- \`${a.nome}\` — ${a.conteudo.length} caracteres`);
  }

  if (assets.length) {
    linhas.push("", "## Imagens do projeto", "");
    for (const a of assets) {
      linhas.push(`- \`${a.caminho}\` — ${a.mime}, ${Math.max(1, Math.round(a.tamanho / 1024))} KB`);
    }
  }

  const temDocDoProjeto = p.arquivos.some((a) => a.nome.toLowerCase() === "projeto.md");
  if (temDocDoProjeto) {
    linhas.push(
      "",
      "## As decisões do projeto",
      "",
      "O próprio projeto traz o `PROJETO.md` — o que o app é, o papel de cada arquivo e",
      "as decisões tomadas (tokens, padrão visual, regras de interação). É ele que o",
      "Arquiteto segue quando o projeto muda: leia antes de alterar.",
    );
  }

  linhas.push(
    "",
    "## Tokens de design",
    "",
    "Cor, tipografia e medida da marca saem de variável CSS: mudar a identidade é",
    "mudar o token, não caçar estilo espalhado pelo arquivo.",
    "",
  );
  for (const nome of NOMES_TOKENS) {
    linhas.push(`- \`${varDoToken(nome)}: ${p.tokens?.[nome] ?? ""};\``);
  }

  linhas.push(
    "",
    "## O padrão que este projeto segue",
    "",
    "- Texto, cor e medida por token (`var(--…)`), nunca valor solto.",
    "- Contraste AA, foco visível e os quatro estados (normal, hover, foco, desabilitado).",
    "- Sem dependência externa: o app abre offline.",
    "- Alterar o projeto é pedir a mudança no Arquiteto — ele reescreve os arquivos",
    "  inteiros e guarda cada mudança como uma versão.",
    "",
  );

  return linhas.join("\n");
}
