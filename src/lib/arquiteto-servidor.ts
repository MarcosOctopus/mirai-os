/**
 * O APP DE SERVIDOR — um projeto que precisa ficar RODANDO (dono, 16/10/2026).
 *
 * POR QUE EXISTE. Pedido do dono, verbatim: *"rurall ta a mesma coisa. Eu quero
 * eles funcionais. […] e tem area de login e tudo. uma aplicação completa"*.
 *
 * Medido na conta de CLIENTE (17) com o `Time-do-Futuro/dashboard-redis-gazeta`:
 * o `preparar` instalou certo (7 pacotes) e morreu em `npm error Missing script:
 * "build"`. Aquele repositório NÃO é site estático — é um servidor Node
 * (`node server.js`, lê `PORT`/`HOST`, tem API e página). Sem este caminho, todo
 * app com login/banco/API ficava de fora: o endereço do cliente mostrava "isto é
 * código" enquanto o app podia estar de pé.
 *
 * COMO O ISOLAMENTO CONTINUA. O app do cliente roda num contêiner na rede
 * `mirai-run`, com o código montado só de leitura da pasta dele, sem
 * privilégios, com a porta publicada EXCLUSIVAMENTE na ponte do host
 * (`IP_DO_APP`, loopback) — nunca em `0.0.0.0`. O firewall corta a rede de execução
 * para as faixas privadas, então o código de terceiro não alcança a produção.
 * O proxy abaixo é a única porta entre o site do cliente e o container dele.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { pastaDoProjeto } from "./arquiteto-workspace";
import { comecarNoRunner, estadoNoRunner, IP_DO_APP, portaDoApp, runnerConfigurado } from "./runner";

/** O que o projeto é, decidido no DISCO (mesma régua do runner). */
export type TipoDoApp = "estatico" | "servidor" | null;

/**
 * ESTÁTICO ou SERVIDOR — decidido no disco do workspace.
 *
 * `estatico` = existe pasta de build com `index.html` (Vite, Next export): o
 * site é servido arquivo a arquivo. `servidor` = não há build mas há `start`:
 * é um processo que precisa ficar rodando. **A ordem importa: build vence.**
 * É a MESMA régua do `_tipo_do_app` do runner — se divergirem, o app e o runner
 * contariam histórias diferentes sobre o mesmo projeto.
 */
export function tipoLocalDoProjeto(userId: number, projetoId: string): TipoDoApp {
  let base: string;
  try {
    base = pastaDoProjeto(userId, projetoId);
  } catch {
    return null;
  }
  for (const d of ["dist", "build", "out", ".output/public"]) {
    if (existsSync(join(base, d, "index.html"))) return "estatico";
  }
  try {
    const pj = JSON.parse(readFileSync(join(base, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    if (pj?.scripts?.start) return "servidor";
  } catch {
    /* sem package.json legível: não é app */
  }
  return null;
}

/** O estado do app no runner, com cache curto (o proxy não pode esperar por ele). */
const cacheEstado = new Map<string, { em: number; valor: Awaited<ReturnType<typeof estadoNoRunner>> }>();
const TTL_CACHE_MS = 20_000;

async function estadoComCache(userId: number, projetoId: string) {
  const chave = `${userId}/${projetoId}`;
  const agora = Date.now();
  const guardado = cacheEstado.get(chave);
  if (guardado && agora - guardado.em < TTL_CACHE_MS) return guardado.valor;
  const valor = await estadoNoRunner(userId, projetoId);
  cacheEstado.set(chave, { em: agora, valor });
  return valor;
}

/** Esquece o cache de um projeto (usado logo depois de mandar subir/derrubar). */
export function esquecerEstadoDoApp(userId: number, projetoId: string): void {
  cacheEstado.delete(`${userId}/${projetoId}`);
}

/**
 * A PORTA em que este app atende, ou `null` se ainda não está no ar.
 *
 * Quem manda é o runner: quando o estado dele traz `porta`, é ela que vale (ele
 * pode ter usado a porta reserva, para o app que ignora `PORT` e ouve 3000).
 * Sem estado, cai na fórmula determinística — a MESMA que o runner usa.
 */
export async function portaNoAr(userId: number, projetoId: string): Promise<number | null> {
  const e = await estadoComCache(userId, projetoId);
  if (e?.verbo === "subir" && e.estado === "ok" && typeof e.porta === "number") return e.porta;
  return null;
}

/** Última vez que se pediu para subir, por projeto (trava anti-tempestade). */
const ultimaSubida = new Map<string, number>();

/**
 * GARANTE QUE O APP ESTEJA SUBINDO — e não espera por ele.
 *
 * Chamado quando alguém abre o endereço do cliente: se o app de servidor não
 * está no ar, manda subir (uma vez só: se já há `subir` rodando, não repete) e
 * devolve `false` para quem chamou mostrar "está subindo" em vez de erro seco.
 * Regra do dono: nada de mensagem de erro — sempre um caminho.
 */
export async function garantirAppNoAr(userId: number, projetoId: string): Promise<boolean> {
  if (!runnerConfigurado()) return false;
  const e = await estadoComCache(userId, projetoId);
  if (e?.verbo === "subir" && e.estado === "ok" && typeof e.porta === "number") return true;
  // `na_fila` conta como "já está indo": o pedido foi aceito e vai rodar.
  // Tratar como "não está no ar, tenta de novo" faria a tela disparar outra
  // subida em cima de uma que já está esperando vaga.
  if (e?.estado === "rodando" || e?.estado === "na_fila") return false;
  // UM pedido de subida por minuto e meio, no máximo: sem esta trava, cada
  // abertura da página de um app que não sobe viraria uma tentativa nova, e o
  // servidor viraria uma fila de containers subindo e morrendo.
  const agora = Date.now();
  if (agora - (ultimaSubida.get(`${userId}/${projetoId}`) ?? 0) < 90_000) return false;
  ultimaSubida.set(`${userId}/${projetoId}`, agora);
  esquecerEstadoDoApp(userId, projetoId);
  await comecarNoRunner(userId, projetoId, "subir");
  return false;
}

/** Cabeçalhos que NÃO se repassam: são da conexão, não do conteúdo. */
const NAO_REPASSAR = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
  "content-encoding",
  "accept-encoding",
]);

/**
 * O PROXY: entrega o que o container do cliente respondeu, como veio.
 *
 * O `caminho` já vem normalizado (sem `..`, sem `//`), e a porta vem do runner —
 * nunca da URL, nunca do cliente. Um caminho que tente escapar é 404, não uma
 * requisição para outro lugar.
 */
export async function proxyParaApp(
  userId: number,
  projetoId: string,
  porta: number,
  req: Request,
  caminho: string,
): Promise<Response> {
  const busca = new URL(req.url).search;
  const destino = `http://${IP_DO_APP}:${porta}${caminho}${busca}`;

  const cabecalhos = new Headers();
  req.headers.forEach((valor, chave) => {
    if (!NAO_REPASSAR.has(chave.toLowerCase())) cabecalhos.set(chave, valor);
  });

  const temCorpo = !["GET", "HEAD"].includes(req.method.toUpperCase());
  try {
    const r = await fetch(destino, {
      method: req.method,
      headers: cabecalhos,
      body: temCorpo ? await req.arrayBuffer() : undefined,
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });

    const saida = new Headers();
    r.headers.forEach((valor, chave) => {
      if (!NAO_REPASSAR.has(chave.toLowerCase())) saida.set(chave, valor);
    });
    return new Response(r.body, { status: r.status, statusText: r.statusText, headers: saida });
  } catch {
    // O app não respondeu. Nada de "erro": diz o estado e manda seguir.
    return new Response(paginaSubindo(), {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}

/** A página honesta de "está subindo" — nunca uma tela de erro. */
export function paginaSubindo(): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="5">
<title>Aplicação subindo…</title>
<style>
  html,body{margin:0;height:100%;background:#0b0d10;color:#e8eaed;
    font:15px/1.6 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
  .c{height:100%;display:grid;place-items:center;text-align:center;padding:24px}
  .o{width:64px;height:64px;margin:0 auto 22px;border-radius:50%;
    background:radial-gradient(circle at 35% 35%,#7fd4ff,#2b6cff 55%,#0b2a6b);
    box-shadow:0 0 40px rgba(59,130,246,.55);animation:p 2.2s ease-in-out infinite}
  @keyframes p{0%,100%{transform:scale(1);opacity:.9}50%{transform:scale(1.09);opacity:1}}
  h1{font-size:17px;font-weight:600;margin:0 0 8px}
  p{margin:0;color:#9aa4b2;font-size:13.5px;max-width:380px}
</style></head><body><div class="c"><div>
  <div class="o"></div>
  <h1>Aplicação subindo</h1>
  <p>O servidor desta aplicação está iniciando agora. Esta página se atualiza sozinha.</p>
</div></div></body></html>`;
}

/** A porta derivada — exposta para quem precisa dela sem consultar o runner. */
export { portaDoApp };
