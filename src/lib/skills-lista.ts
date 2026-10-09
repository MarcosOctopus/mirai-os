/**
 * SKILLS — a leitura REAL das bibliotecas de skills no disco.
 *
 * O dono pediu (08/10/2026): "Crie uma aba de skills". A aba (e a área dentro
 * de /explorar) mostra as skills que EXISTEM no ecossistema — lidas do disco,
 * não de uma lista escrita à mão. Nada é inventado: o nome e a descrição saem
 * do próprio frontmatter (--- name: / description: ---) de cada SKILL.md.
 *
 * Fonte: as duas bibliotecas reais
 *   - /opt/data/skills/** /SKILL.md
 *   - /opt/data/.hermes/skills/** /SKILL.md
 *
 * Regras de honestidade:
 *   - Pastas ocultas (ex.: `.archive`) ficam de fora: são skills APOSENTADAS,
 *     não as ativas. Incluí-las pintaria a tela de coisa morta.
 *   - Sem `description` no frontmatter → `descricao: null` (a tela diz que falta,
 *     não inventa um texto). O nome cai para o diretório quando o frontmatter
 *     não traz `name`.
 *   - A mesma skill pode estar copiada nas duas bibliotecas: conta UMA vez (pelo
 *     nome), senão a tela mostraria a mesma coisa duas vezes.
 *   - Categoria = o primeiro nível de pasta abaixo da raiz (ex.:
 *     `productivity/...`, `devops/...`). Skill na raiz → "Geral".
 *
 * Este arquivo é SÓ destes três campos públicos (nome, descricao, categoria).
 * Nenhum caminho absoluto e nenhum conteúdo de skill sai daqui.
 */

import { promises as fs } from "fs";
import path from "path";

export type SkillItem = {
  nome: string;
  /** null = o frontmatter não trazia descrição (a tela diz isso, sem inventar). */
  descricao: string | null;
  categoria: string;
  /** A skill é NOSSA (vem da biblioteca do ecossistema)? A tela usa isto para
   *  mostrar o criador (Mirai) no detalhe — o que é de fora NÃO ganha autoria.
   *  Não expõe caminho nenhum: é um booleano. */
  nossa: boolean;
};

export type SkillsLidas = { skills: SkillItem[]; total: number };

const RAIZES = ["/opt/data/skills", "/opt/data/.hermes/skills"];
const CATEGORIA_RAIZ = "Geral";

function limparValor(v: string): string {
  return v
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();
}

/** Lê `name`/`description` do frontmatter (bloco entre o primeiro par de ---).
 *
 *  `description` pode vir como escalar de BLOCO do YAML (`>-`, `>`, `|`, `|-`),
 *  com o texto nas linhas SEGUINTES — é o caso de `social-platform-oauth`,
 *  `franky` e `Get Shit Done (GSD)`. Sem isso, o valor lido era o próprio
 *  indicador (`>-`) e a tela mostrava ">-" como descrição. Aqui o bloco é
 *  dobrado (linhas juntadas por espaço), como manda o `>-` do YAML. */
function lerFrontmatter(texto: string): { nome?: string; descricao?: string } {
  const m = texto.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const out: { nome?: string; descricao?: string } = {};
  const linhas = m[1].split(/\r?\n/);
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    const nm = linha.match(/^name:\s*(.*)$/);
    if (nm) {
      out.nome = limparValor(nm[1]);
      continue;
    }
    const dm = linha.match(/^description:\s*(.*)$/);
    if (dm) {
      let v = dm[1].trim();
      // escalar de bloco (>, >-, |, |-): o texto está nas linhas mais indentadas
      if (/^[>|][-+]?$/.test(v)) {
        const partes: string[] = [];
        let j = i + 1;
        for (; j < linhas.length; j++) {
          const l = linhas[j];
          if (!l.trim()) continue; // linha em branco não separa no bloco dobrado
          if (/^\s/.test(l)) partes.push(l.trim());
          else break; // volta ao nível da chave: fim do bloco
        }
        i = j - 1;
        v = limparValor(partes.join(" ").replace(/\s+/g, " ").trim());
      }
      if (v) out.descricao = v;
    }
  }
  return out;
}

async function varrer(dir: string, raiz: string, achados: SkillItem[], vistos: Set<string>): Promise<void> {
  let itens: import("fs").Dirent[];
  try {
    itens = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return; // pasta inexistente/ilegível: nada a fazer, sem inventar
  }

  if (itens.some((e) => e.isFile() && e.name === "SKILL.md")) {
    try {
      const texto = await fs.readFile(path.join(dir, "SKILL.md"), "utf8");
      const fm = lerFrontmatter(texto);
      const nome = (fm.nome || path.basename(dir)).trim();
      const chave = nome.toLowerCase();
      if (nome && !vistos.has(chave)) {
        vistos.add(chave);
        const rel = path.relative(raiz, dir);
        const partes = rel ? rel.split(path.sep) : [];
        achados.push({
          nome,
          descricao: fm.descricao ?? null,
          categoria: partes.length > 1 ? partes[0] : CATEGORIA_RAIZ,
          nossa: raiz === RAIZES[0],
        });
      }
    } catch {
      /* SKILL.md ilegível: ignora — nunca fabrica entrada */
    }
  }

  for (const e of itens) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith(".")) continue; // .archive, .git, .next, ...
    await varrer(path.join(dir, e.name), raiz, achados, vistos);
  }
}

/** Lista as skills reais do disco, ordenadas por categoria e nome. */
export async function listarSkills(): Promise<SkillsLidas> {
  const achados: SkillItem[] = [];
  const vistos = new Set<string>();
  for (const raiz of RAIZES) {
    await varrer(raiz, raiz, achados, vistos);
  }
  achados.sort((a, b) =>
    a.categoria.localeCompare(b.categoria, "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR"),
  );
  return { skills: achados, total: achados.length };
}

export type SkillBase = SkillItem & { instrucoes: string };

/** O corpo da skill = o texto depois do bloco de frontmatter (se houver).
 *  Sem frontmatter, o arquivo inteiro é o corpo — nada é inventado. */
function corpoSemFrontmatter(texto: string): string {
  const m = texto.match(/^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n?/);
  return (m ? texto.slice(m[0].length) : texto).trim();
}

/**
 * "USAR COMO BASE" — lê UMA skill do ECOSSISTEMA pelo NOME (o que o cliente
 * escolheu no catálogo) para copiar o texto para a conta dele.
 *
 * Segurança: o nome NÃO vira caminho. A busca é a MESMA varredura do catálogo
 * (as raízes fixas deste arquivo); o nome só é comparado ao `name` do
 * frontmatter (ou ao nome do diretório). Um nome que não existe => null — nada
 * é lido de fora das raízes, nenhum caminho é montado a partir da entrada.
 *
 * Lê SÓ o SKILL.md da skill achada (como `listarSkills` já faz). Não executa
 * nada, não importa nada: devolve texto (nome, descrição e o corpo) para virar
 * uma skill de cliente — que é texto, ponto.
 */
export async function obterSkillBase(nome: string): Promise<SkillBase | null> {
  const alvo = (nome || "").trim().toLowerCase();
  if (!alvo) return null;

  const itens: SkillItem[] = [];
  const vistos = new Set<string>();
  for (const raiz of RAIZES) {
    await varrer(raiz, raiz, itens, vistos);
  }
  const achado = itens.find((s) => s.nome.toLowerCase() === alvo);
  if (!achado) return null;

  // Acha o SKILL.md correspondente varrendo de novo (a mesma raiz fixa),
  // comparando o mesmo critério — o caminho nunca sai da entrada do usuário.
  for (const raiz of RAIZES) {
    const caminho = await acharSkillMd(raiz, achado.nome.toLowerCase());
    if (caminho) {
      try {
        const texto = await fs.readFile(caminho, "utf8");
        return { ...achado, instrucoes: corpoSemFrontmatter(texto) };
      } catch {
        /* ilegível: segue para a outra raiz */
      }
    }
  }
  return { ...achado, instrucoes: "" };
}

/** Caminho do SKILL.md cujo `name:` do frontmatter (ou dir) casa com o alvo.
 *  Percorre só as raízes fixas; devolve null se não achar. */
async function acharSkillMd(dir: string, alvo: string): Promise<string | null> {
  let itens: import("fs").Dirent[];
  try {
    itens = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  if (itens.some((e) => e.isFile() && e.name === "SKILL.md")) {
    try {
      const texto = await fs.readFile(path.join(dir, "SKILL.md"), "utf8");
      const nome = (lerFrontmatter(texto).nome || path.basename(dir)).trim().toLowerCase();
      if (nome === alvo) return path.join(dir, "SKILL.md");
    } catch {
      /* ignora */
    }
  }
  for (const e of itens) {
    if (!e.isDirectory() || e.name.startsWith(".")) continue;
    const achado = await acharSkillMd(path.join(dir, e.name), alvo);
    if (achado) return achado;
  }
  return null;
}
