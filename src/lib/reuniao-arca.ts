/**
 * REUNIÕES NA ARCA — leitura, registro e fila de transcrição.
 *
 * POR QUE ESTE MÓDULO EXISTE (18/11/2026): o dono pediu uma área de Reunião com
 * uma coisa que fala com a Arca, não um banco próprio. A reunião é uma NOTA —
 * tem que morar em `05_REUNIOES`, junto das transcrições reais, e ser achável
 * na busca. Um banco paralelo de reuniões seria mais uma verdade divergindo.
 *
 * Duas portas, dois donos:
 *  · LINK (Meet/Zoom/Teams) → a plataforma grava e transcreve; nós só REGISTRAMOS
 *    a reunião (título, plataforma, link, horário). Custo zero.
 *  · GRAVAR AQUI (microfone) → o áudio cai na pasta de entrada da Arca e o cano
 *    único (`arcas-ingere.py`) transcreve com o motor de qualidade. Custo ~R$1/h.
 *
 * Nenhuma das duas transcreve de novo o que a plataforma já transcreveu.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { guardarArcaDaConta, pedirTokenNaArca, tokenArcaDaConta } from "./arca-conta";
import { cifrar } from "./segredo-guardado";

const BASE = (process.env.ARCA_API_URL || "http://hermes-agent:8080").replace(/\/+$/, "");
const INBOX = process.env.ARCA_INBOX || "/opt/data/arca/inbox";
const PY = process.env.ARCA_PY || "/opt/data/arca/venv/bin/python3";
const INGERE = process.env.ARCA_INGERE || "/opt/data/scripts/arcas-inbox.py";
const TOKENS_DIR = process.env.ARCA_TOKENS_DIR || "/opt/data/state/reuniao-tokens";

/**
 * O TOKEN DA ARCA DESTA PESSOA — não o token de serviço do app.
 *
 * Ordem: cofre da conta (`platform_config.arca`, cifrado) → pedir à Arca
 * (`/org/token-servico`, IDEMPOTENTE: pedir de novo devolve a mesma
 * credencial). Devolver `null` é honesto: sem token a pessoa não tem acervo
 * aqui, e a tela diz isso em vez de mostrar o acervo de outra organização.
 *
 * Isto existe porque a primeira versão da tela lia o token de serviço do
 * ambiente — que aponta para UMA org. Para o dono acertava por coincidência;
 * para um cliente mostraria o acervo errado.
 */
export async function tokenDaPessoa(userId: number, email: string): Promise<string | null> {
  const guardado = await tokenArcaDaConta(userId);
  if (guardado) return guardado;

  const r = await pedirTokenNaArca(email);
  if (!r.ok) return null;

  try {
    guardarArcaDaConta(userId, {
      tokenCifrado: cifrar(r.token),
      org: r.org,
      usuario: r.usuario,
      criadoEm: r.criadoEm,
    });
  } catch {
    /* cache do cofre é melhor-esforço: sem ele o token é pedido de novo */
  }
  return r.token;
}

export type Reuniao = {
  caminho: string;
  titulo: string;
  tags: string[];
  modificado: string;
};

type Arvore = {
  path?: string;
  notas?: { path: string; titulo?: string; nome?: string; tags?: string[]; modificado?: string }[];
  subpastas?: Arvore[];
};

function achatar(no: Arvore | null | undefined, saida: Reuniao[] = []): Reuniao[] {
  if (!no) return saida;
  for (const n of no.notas || []) {
    saida.push({
      caminho: n.path,
      titulo: (n.titulo || n.nome || n.path).replace(/\.md$/, ""),
      tags: n.tags || [],
      modificado: n.modificado || "",
    });
  }
  for (const s of no.subpastas || []) achatar(s, saida);
  return saida;
}

/** Acha a pasta 05_REUNIOES na árvore, seja qual for a profundidade que ela aparecer. */
function acharPasta(no: Arvore | undefined, alvo = "05_REUNIOES"): Arvore | null {
  if (!no) return null;
  if ((no.path || "") === alvo) return no;
  for (const s of no.subpastas || []) {
    const achou = acharPasta(s, alvo);
    if (achou) return achou;
  }
  return null;
}

/** Lista as reuniões do acervo, mais recentes primeiro. */
export async function listarReunioes(token: string): Promise<Reuniao[]> {
  const r = await fetch(`${BASE}/acervo/arvore`, {
    headers: { "X-Arca-Token": token },
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`Arca respondeu ${r.status} em /acervo/arvore`);
  const d = (await r.json()) as { arvore?: Arvore };
  const pasta = acharPasta(d.arvore);
  const lista = achatar(pasta);
  return lista.sort((a, b) => (a.modificado < b.modificado ? 1 : -1));
}

/** Registra uma reunião (link de plataforma) como nota no acervo. */
export async function registrarReuniao(
  token: string,
  entrada: {
  titulo: string;
  plataforma?: string;
  link?: string;
  quando?: string;
  participantes?: string[];
  notas?: string;
}): Promise<{ nota?: string; erro?: string }> {
  const quando = entrada.quando || new Date().toISOString().slice(0, 16).replace("T", " ");
  const plataforma = (entrada.plataforma || "").trim();
  const linhas = [
    `# ${entrada.titulo}`,
    "",
    `- **Quando:** ${quando}`,
    plataforma ? `- **Plataforma:** ${plataforma}` : "",
    entrada.link ? `- **Link:** ${entrada.link}` : "",
    entrada.participantes?.length ? `- **Participantes:** ${entrada.participantes.join(", ")}` : "",
    "",
    "## Pauta / notas",
    entrada.notas?.trim() || "_(registrada para transcrição)_",
    "",
    entrada.link
      ? "> A gravação e a transcrição ficam no workspace da plataforma. Este registro é o índice\n> da reunião no acervo — a transcrição pronta entra como nota separada quando importada."
      : "",
  ].filter(Boolean);

  const r = await fetch(`${BASE}/acervo/nota`, {
    method: "POST",
    headers: { "X-Arca-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify({
      titulo: entrada.titulo,
      conteudo: linhas.join("\n"),
      keywords: ["reuniao", plataforma.toLowerCase(), "registro"].filter(Boolean),
      pasta: "05_REUNIOES",
    }),
    signal: AbortSignal.timeout(20000),
  });
  const d = (await r.json().catch(() => ({}))) as { nota?: string; caminho?: string; detail?: string };
  if (!r.ok) return { erro: d.detail || `Arca respondeu ${r.status}` };
  return { nota: d.nota || d.caminho };
}

/**
 * Põe o áudio gravado na fila da Arca.
 *
 * O arquivo entra em `/opt/data/arca/inbox/` (mesmo disco da Arca) e o cano único
 * transcreve no motor de qualidade e grava a nota dividida com tags. Não
 * transcrevemos aqui: a transcrição é do CANO, não da tela — assim a reunião
 * gravada pela tela e a jogada na pasta entram pelo mesmo lugar.
 */
export async function enfileirarGravacao(
  bytes: Buffer,
  nome: string,
  tags: string[],
  token: string,
): Promise<{ arquivo: string }> {
  fs.mkdirSync(INBOX, { recursive: true });
  const seguro = nome.replace(/[^\w.\-]+/g, "-").slice(0, 80) || `reuniao-${Date.now()}`;
  const destino = path.join(INBOX, `${seguro}.webm`);
  fs.writeFileSync(destino, bytes);

  // O CANO É OUTRO PROCESSO (sem sessão): ele precisa do token DESTA pessoa, senão a
  // transcrição cairia no acervo de outra organização. O token vai num arquivo 0600
  // ao lado da gravação — não no nome do arquivo, não em log, não no sidecar em claro.
  fs.mkdirSync(TOKENS_DIR, { recursive: true });
  const tokFile = path.join(TOKENS_DIR, `${seguro}.tok`);
  fs.writeFileSync(tokFile, token, { mode: 0o600 });

  fs.writeFileSync(
    path.join(INBOX, `${seguro}.json`),
    JSON.stringify({
      tags: [...new Set(["reuniao", "gravada-aqui", ...tags])],
      token_path: tokFile,
    }),
    "utf8",
  );
  // Dispara o cano agora, destacado (não morre com o request); se falhar, o vigia
  // de 5 min pega no próximo ciclo.
  try {
    const filho = spawn(PY, [INGERE], { detached: true, stdio: "ignore" });
    filho.unref();
  } catch {
    /* o vigia cobre */
  }
  return { arquivo: destino };
}