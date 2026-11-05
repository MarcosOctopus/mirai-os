/**
 * O RUNNER — instalar de verdade, fora do processo do app.
 *
 * Por que existe (dono, 16/10/2026): *"Ele trás, mas não instala. Tem que ter
 * tudo já pra ele mesmo instalar."* Trazer o repositório já funcionava; EXECUTAR
 * (`npm install`, build, teste) não existia — e não pode ser aqui dentro: rodar
 * código de terceiro no processo do app é entregar a máquina (está escrito no
 * próprio `arquiteto-workspace.ts`).
 *
 * Então a execução mora num serviço SEPARADO, no host onde há Docker, com uma
 * porta ESTREITA: uma lista fechada de verbos, cada um virando um comando fixo
 * dentro de um contêiner descartável. Não é shell remoto — o cliente não manda
 * comando, manda o NOME do verbo.
 *
 * Este arquivo é só o cliente dessa porta. Se o runner não estiver configurado,
 * nada quebra: a camada diz que não executa, como sempre disse.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/**
 * O token do runner: variável de ambiente quando existe; senão, o arquivo
 * `/opt/data/mirai-app/.runner-token` (0600). Ler do arquivo evita ter de mexer
 * no `.env.local` do app só para ligar uma capacidade que é de infraestrutura.
 */
function tokenDoArquivo(): string {
  try {
    return readFileSync("/opt/data/mirai-app/.runner-token", "utf8").trim();
  } catch {
    return "";
  }
}

const URL_RUNNER = (process.env.MIRAI_RUNNER_URL || "http://172.20.0.1:8790")
  .trim()
  .replace(/\/+$/, "");
const TOKEN_RUNNER = (process.env.MIRAI_RUNNER_TOKEN || tokenDoArquivo()).trim();

/** Os verbos que o runner aceita — os mesmos que ele conhece. */
export type VerboRunner =
  | "instalar"
  | "buildar"
  | "testar"
  | "rodar"
  | "parar"
  | "preparar"
  | "subir"
  | "derrubar";

export const VERBOS_RUNNER: VerboRunner[] = [
  "instalar",
  "buildar",
  "testar",
  "rodar",
  "parar",
  "preparar",
  "subir",
  "derrubar",
];

export function runnerConfigurado(): boolean {
  return Boolean(URL_RUNNER && TOKEN_RUNNER);
}

type EstadoTrabalho = {
  /**
   * `na_fila` = aceito, esperando vaga de trabalho pesado no servidor (o runner
   * tem teto de builds simultâneos). Não é erro e não é "subindo": é espera, e a
   * tela pode dizer a posição em vez de fingir que já está construindo.
   */
  estado: "nunca-rodou" | "rodando" | "na_fila" | "ok" | "falhou" | "parado";
  /** Posição na fila do runner (1 = próximo), quando `estado = na_fila`. */
  posicao?: number;
  verbo?: string;
  codigo?: number;
  segundos?: number;
  saida?: string;
  erro?: string;
  /** Depois de `preparar`: o que o projeto é (`estatico` | `servidor`). */
  tipo?: string;
  /** Depois de `subir`: a porta em que o app de servidor atende. */
  porta?: number;
};

/**
 * O IP do HOST do runner, visto de dentro do app (a ponte do Docker).
 *
 * O app de servidor de um cliente é publicado NESTE IP — nunca em `0.0.0.0` — e
 * é por ele que o app do MIRAI OS fala com o container do cliente. Derivar da
 * URL do runner (em vez de fixar) mantém uma verdade só sobre onde o host está.
 */
export const IP_DO_RUNNER = (() => {
  try {
    return new URL(URL_RUNNER).hostname;
  } catch {
    return "172.20.0.1";
  }
})();

/**
 * O IP em que o app de SERVIDOR do cliente é publicado — a ponte do host.
 *
 * NÃO é `127.0.0.1`: o MIRAI OS roda em CONTÊINER (172.20.6.2), então loopback
 * dentro dele é ele mesmo. Ele alcança o host pela ponte — o mesmo caminho que
 * ele já usa para falar com o runner.
 *
 * E o pacote de VOLTA (172.31.240.x → 172.20.0.1) precisa passar: sem a regra
 * `--ctstate ESTABLISHED,RELATED` ACEITA antes dos DROPs no DOCKER-USER, o app
 * sobe, fica `Up` e nunca responde. Conexão NOVA do cliente para faixa privada
 * continua dropada — é o isolamento.
 */
export const IP_DO_APP = "172.20.0.1";

/** A porta DERIVADA do app de servidor — a MESMA conta que o runner faz. */
export function portaDoApp(conta: number, projetoId: string): number {
  // sha1 de "<conta>/<projeto>", primeiros 8 hex, módulo 2000, + 42000.
  // Duplicar a fórmula é deliberado: o proxy precisa da porta SEM ida ao runner
  // (é caminho de request). O runner continua sendo a autoridade — quando o
  // estado dele traz `porta`, é ELA que vale.
  const h = createHash("sha1").update(`${conta}/${projetoId}`).digest("hex");
  return 42000 + (parseInt(h.slice(0, 8), 16) % 2000);
}

async function chama(
  caminho: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<{ ok: boolean; status: number; dados: Record<string, unknown> }> {
  const { timeoutMs = 20000, ...resto } = init;
  try {
    const r = await fetch(`${URL_RUNNER}${caminho}`, {
      ...resto,
      headers: {
        Authorization: `Bearer ${TOKEN_RUNNER}`,
        "Content-Type": "application/json",
        ...(resto.headers || {}),
      },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    const dados = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: r.ok, status: r.status, dados };
  } catch (e) {
    return { ok: false, status: 0, dados: { erro: e instanceof Error ? e.message : "sem resposta" } };
  }
}

/** O runner está vivo? (usado pelo diagnóstico e pela tela) */
export async function runnerVivo(): Promise<{ ok: boolean; detalhe?: string }> {
  if (!runnerConfigurado()) return { ok: false, detalhe: "runner não configurado nesta instalação" };
  const r = await chama("/saude", { timeoutMs: 8000 });
  if (!r.ok) return { ok: false, detalhe: String(r.dados.erro || `HTTP ${r.status}`) };
  return { ok: true, detalhe: String(r.dados.imagem || "") };
}

/** O que o projeto tem no host do runner (tem lockfile? já tem node_modules?). */
export async function inspecionarNoRunner(
  userId: number,
  projetoId: string,
): Promise<Record<string, unknown> | null> {
  if (!runnerConfigurado()) return null;
  const q = new URLSearchParams({ conta: String(userId), projeto: projetoId });
  const r = await chama(`/arquivos?${q}`, { timeoutMs: 15000 });
  return r.ok ? r.dados : null;
}

/** Começa um verbo. Devolve o estado imediato (o trabalho segue no runner). */
export async function comecarNoRunner(
  userId: number,
  projetoId: string,
  verbo: VerboRunner,
): Promise<{ ok: boolean; erro?: string }> {
  if (!runnerConfigurado()) return { ok: false, erro: "o runner não está configurado nesta instalação" };
  const r = await chama("/executar", {
    method: "POST",
    body: JSON.stringify({ conta: userId, projeto: projetoId, verbo }),
    timeoutMs: 20000,
  });
  if (!r.ok) return { ok: false, erro: String(r.dados.erro || `HTTP ${r.status}`) };
  return { ok: true };
}

/** O estado do trabalho (e o rabo da saída real). */
export async function estadoNoRunner(
  userId: number,
  projetoId: string,
): Promise<EstadoTrabalho | null> {
  if (!runnerConfigurado()) return null;
  const q = new URLSearchParams({ conta: String(userId), projeto: projetoId });
  const r = await chama(`/trabalho?${q}`, { timeoutMs: 15000 });
  return r.ok ? (r.dados as EstadoTrabalho) : null;
}

/**
 * Roda o verbo e ESPERA um tempo, devolvendo o que já se sabe.
 *
 * Por que esperar em vez de responder "começou": instalar é o momento em que a
 * pessoa está olhando a tela. Devolver "comecei" e sumir é a mesma coisa que não
 * fazer. Aqui se espera o que couber (o teto é para a resposta não travar), e se
 * o trabalho continuar, a resposta diz exatamente isso — com a saída REAL até
 * aquele ponto, nunca um palpite.
 */
export async function instalarComEspera(
  userId: number,
  projetoId: string,
  verbo: VerboRunner,
  tetoSegundos = 150,
): Promise<string> {
  if (!runnerConfigurado()) {
    return (
      "erro: esta instalação não tem runner configurado, então não consigo executar " +
      "nada aqui — e não vou fingir que instalei."
    );
  }

  const antes = await estadoNoRunner(userId, projetoId);
  if (antes?.estado === "rodando") {
    return (
      `já existe uma execução em andamento neste projeto (${antes.verbo || "?"}) — ` +
      "espero ela terminar antes de começar outra.\n\n" +
      rabo(antes.saida)
    );
  }

  const comecou = await comecarNoRunner(userId, projetoId, verbo);
  if (!comecou.ok) return `erro: ${comecou.erro}`;

  const inicio = Date.now();
  let ultimo: EstadoTrabalho | null = null;
  while ((Date.now() - inicio) / 1000 < tetoSegundos) {
    await new Promise((r) => setTimeout(r, 3000));
    const e = await estadoNoRunner(userId, projetoId);
    if (!e) break;
    ultimo = e;
    if (e.estado !== "rodando" && e.estado !== "nunca-rodou") break;
  }

  if (!ultimo) return `comecei a ${verbo}, mas não consegui ler o andamento.`;

  if (ultimo.estado === "rodando") {
    return (
      `Ainda está ${verbo} (é um projeto grande — segue rodando no servidor). ` +
      `Saída até agora:\n\n${rabo(ultimo.saida)}\n\n` +
      "Me chame de novo daqui a pouco que eu leio o desfecho."
    );
  }

  const cabeca =
    ultimo.estado === "ok"
      ? `✔ ${verbo} terminou bem em ${ultimo.segundos}s.`
      : `✘ ${verbo} FALHOU (código ${ultimo.codigo}) depois de ${ultimo.segundos}s.`;
  return `${cabeca}\n\n${rabo(ultimo.saida)}`;
}

/** O fim de uma saída longa: é o que interessa (o erro está no fim). */
function rabo(s?: string, n = 4500): string {
  const t = (s || "").trim();
  if (!t) return "(sem saída registrada)";
  return t.length > n ? "…(início omitido)…\n" + t.slice(-n) : t;
}
