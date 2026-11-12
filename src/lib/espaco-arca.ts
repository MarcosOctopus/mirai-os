/**
 * ESPAÇO DA PESSOA NA ARCA (itens 1 e 3 do plano de acesso/acervo).
 *
 * Uma pessoa = UM espaço físico: `tenants/<slug>.db` (banco), `tenants/<slug>/vault`
 * (acervo versionado) e `tenants/<slug>/palace` (memória dela). Nada é compartilhado
 * e nada do Core é copiado além do schema e dos templates.
 *
 * Quem cria é a ARCA (`cli.py espaco criar`), não este app: o slug tem de nascer num
 * lugar só, senão duas implementações divergem com o tempo. Aqui só disparamos.
 *
 * Aqui NÃO criamos o palácio (`--sem-palacio`): minerar é trabalho de fundo e não
 * cabe no tempo de um cadastro. Quem minera é o cron de sync dos espaços.
 *
 * Nunca é fatal: se a Arca não responder, o cadastro segue e o espaço nasce no
 * primeiro acesso ao acervo (a rota do acervo garante o espaço dela).
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

const CLI = "/opt/data/arca/integrity/cli.py";
const CLI_CWD = "/opt/data/arca/integrity";

export type EspacoArca = {
  org: string;
  org_criada: boolean;
  ja_existia: boolean;
  banco?: string;
  vault?: { raiz: string; versionado: string; templates_copiados: number };
  palacio?: { status: string; gavetas?: number };
};

export async function garantirEspacoArca(
  email: string,
  nome?: string,
): Promise<EspacoArca | null> {
  if (!email || !email.includes("@")) return null;
  try {
    const args = [CLI, "espaco", "criar", email, "--sem-palacio"];
    if (nome) args.push("--nome", nome);
    const { stdout } = await execFileP("python3", args, {
      cwd: CLI_CWD,
      timeout: 25000,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });
    // ── NUNCA parsear o stdout inteiro (medido 10/11/2026) ──────────────────
    // O CLI imprimia diagnóstico ("[tenancy] schema: pulando ...") em STDOUT antes do
    // JSON. Resultado: `JSON.parse(stdout)` estourava, o catch abaixo é NÃO FATAL, e o
    // espaço da pessoa simplesmente NUNCA nascia no cadastro — falha silenciosa, a pior
    // espécie. (O CLI foi corrigido para mandar diagnóstico em stderr; esta extração é a
    // segunda camada: aceita qualquer texto antes do JSON e não depende de disciplina
    // alheia.) O JSON do CLI é indentado, então procuro o primeiro "{" de linha.
    const texto = String(stdout);
    let obj: EspacoArca | null = null;
    for (const corte of [texto.indexOf("\n{"), texto.indexOf("{")]) {
      if (corte < 0) continue;
      try {
        obj = JSON.parse(texto.slice(corte).trim()) as EspacoArca;
        break;
      } catch {
        /* tenta o próximo corte */
      }
    }
    const r = obj;
    if (!r) throw new Error(`saída do CLI sem JSON reconhecível: ${texto.slice(0, 180)}`);
    if (r?.org) console.log(`[espaco-arca] espaço de ${email} -> org ${r.org}`);
    return r ?? null;
  } catch (e) {
    console.warn("[espaco-arca] não criado (não fatal):", e instanceof Error ? e.message : e);
    return null;
  }
}
