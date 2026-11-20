/**
 * CREDENCIAL POR ESCOPO — a empresa também tem token, e ele não é o da pessoa.
 *
 * PROBLEMA QUE RESOLVE (18/11/2026): a tela do acervo só sabia pedir token "por
 * pessoa" (`/org/token-servico` recebe e-mail). Quando a empresa passou a ter
 * espaço próprio na Arca (`tenants/<slug>/vault`), não existia caminho para a
 * credencial DA ORGANIZAÇÃO — a pessoa acabava lendo o acervo pessoal.
 *
 * COMO: a Arca já tem a rota certa (`POST /org/pessoas` → token para
 * `(pessoa, papel, org)`), que exige a credencial de SERVIÇO do Core. Emitimos
 * uma vez, guardamos CIFRADO no cofre do escopo (`cofre_escopo`), e reusamos.
 *
 * O papel vem do VÍNCULO do produto (memberships), materializado na emissão:
 * dono/admin → owner · membro → member · visitante → viewer. Depois disso a
 * Arca é quem manda no que o token alcança.
 *
 * Nunca imprime token: log só com tipo de erro.
 */
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

import { ARCA_URL } from "./arca-conta";
import type { ContaParaEscopo, Escopo } from "./escopos";

const execFileP = promisify(execFile);
const API_ARCA = (process.env.ARCA_API_URL || ARCA_URL).replace(/\/+$/, "");
const ARQUIVO_CORE = process.env.ARCA_TOKEN_PATH || "/opt/data/arca/api/.arca-token";

let cacheCore: string | null = null;

/** Credencial de SERVIÇO do Core (superuser da Arca). Nunca sai desta função. */
async function tokenDoCore(): Promise<string | null> {
  if (cacheCore) return cacheCore;
  const doEnv = (process.env.ARCA_CORE_TOKEN || "").trim();
  if (doEnv) {
    cacheCore = doEnv;
    return cacheCore;
  }
  try {
    const t = (await readFile(ARQUIVO_CORE, "utf8")).trim();
    if (t) cacheCore = t;
  } catch {
    console.warn("[escopo] sem credencial do Core neste ambiente (ARCA_CORE_TOKEN vazio e arquivo ausente)");
  }
  return cacheCore;
}

const PAPEL: Record<string, "owner" | "member" | "viewer"> = {
  dono: "owner",
  admin: "owner",
  owner: "owner",
  membro: "member",
  member: "member",
  visitante: "viewer",
  viewer: "viewer",
};

/** Papel da pessoa NESTA organização, pela régua do produto. */
async function papelNaOrg(email: string, ehDono: boolean): Promise<"owner" | "member" | "viewer"> {
  if (ehDono) return "owner";
  try {
    const { papelNaOrg: papel } = await import("./orgs");
    const p = (papel(email) || "").toLowerCase();
    return PAPEL[p] || "member";
  } catch {
    return "member";
  }
}

/**
 * Token da ORGANIZAÇÃO para esta pessoa. `null` quando não foi possível —
 * quem chamou decide a resposta honesta (nunca "acervo vazio").
 */
export async function credencialDoEscopo(
  escopo: Escopo,
  conta: { id: number; email: string; ehDono: boolean },
): Promise<string | null> {
  if (escopo.tipo !== "organizacao") return null;

  const { lerCofre, gravarCofre } = await import("./cofre-escopo");
  const { cifrar, decifrar } = await import("./segredo-guardado");

  // 1) já temos a credencial deste escopo? (a chave guarda o e-mail: o mesmo
  //    espaço pode receber credencial de mais de uma pessoa, cada uma com papel)
  const chave = `arca_token:${conta.email.toLowerCase()}`;
  const cofre = lerCofre(escopo);
  const guardado = typeof cofre[chave] === "string" ? (cofre[chave] as string) : "";
  if (guardado) {
    const claro = decifrar(guardado);
    if (claro) return claro;
  }

  // 2) emitir na Arca com a credencial de serviço do Core
  const core = await tokenDoCore();
  if (!core) return null;

  const papel = await papelNaOrg(conta.email, conta.ehDono);
  try {
    const r = await fetch(`${API_ARCA}/org/pessoas`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Arca-Token": core },
      body: JSON.stringify({ pessoa: conta.email, papel, org: escopo.id }),
      cache: "no-store",
    });
    if (!r.ok) {
      /**
       * A ARCA NÃO CONHECE ESTA ORGANIZAÇÃO (20/11/2026 — "não consigo apagar").
       *
       * Organização criada pelo app nasce só na tabela `organizations` (e no
       * vínculo). A tenancy da Arca — banco, vault, credencial — tem de ser
       * criada também; sem isso TODO acesso ao acervo da empresa morria com 503
       * "a credencial da organização não está disponível" (medido: Songmetrix e
       * Pontocom Audio, criadas hoje, nunca provisionadas).
       *
       * Aqui o espaço é garantido na hora e a emissão é repetida UMA vez. É
       * idempotente: org que já existe responde 400 e segue.
       */
      console.warn("[escopo] organização sem espaço na Arca — provisionando:", escopo.id, r.status);
      const ok = await garantirEspacoNaArca(escopo.id, escopo.nome, conta.email).catch(() => false);
      if (!ok) {
        console.warn("[escopo] não consegui provisionar o espaço da organização:", escopo.id);
        return null;
      }
      const r2 = await fetch(`${API_ARCA}/org/pessoas`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Arca-Token": core },
        body: JSON.stringify({ pessoa: conta.email, papel, org: escopo.id }),
        cache: "no-store",
      });
      if (!r2.ok) {
        console.warn("[escopo] a Arca recusou emitir credencial da organização:", r2.status);
        return null;
      }
      const d2 = (await r2.json()) as { token?: string; papel?: string };
      if (!d2.token) return null;
      gravarCofre(escopo, {
        [chave]: cifrar(d2.token),
        [`arca_org:${conta.email.toLowerCase()}`]: escopo.id,
        [`arca_papel:${conta.email.toLowerCase()}`]: d2.papel || papel,
        [`arca_em:${conta.email.toLowerCase()}`]: new Date().toISOString(),
      });
      return d2.token;
    }
    const d = (await r.json()) as { token?: string; papel?: string };
    if (!d.token) return null;
    gravarCofre(escopo, {
      [chave]: cifrar(d.token),
      [`arca_org:${conta.email.toLowerCase()}`]: escopo.id,
      [`arca_papel:${conta.email.toLowerCase()}`]: d.papel || papel,
      [`arca_em:${conta.email.toLowerCase()}`]: new Date().toISOString(),
    });
    return d.token;
  } catch (e) {
    console.warn("[escopo] erro ao emitir credencial da organização:", e instanceof Error ? e.message : "?");
    return null;
  }
}

/**
 * Dá à pessoa o espaço da organização DENTRO da Arca (idempotente): cria a
 * tenancy se faltar. Hoje é usado pelo provisionamento; mantido aqui para a
 * rota e o script falarem a mesma língua.
 */
export async function garantirEspacoNaArca(slug: string, nome: string, donoEmail: string): Promise<boolean> {
  const core = await tokenDoCore();
  if (!core) return false;
  try {
    const r = await fetch(`${API_ARCA}/orgs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Arca-Token": core },
      body: JSON.stringify({ slug, nome, dono: donoEmail }),
      cache: "no-store",
    });
    // 400 quando já existe: é o mesmo resultado desejado.
    return r.ok || r.status === 400;
  } catch {
    return false;
  }
}