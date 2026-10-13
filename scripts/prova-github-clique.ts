/**
 * PROVA DO ÚLTIMO ELO: o clique em "Integrar" leva ao consentimento do GitHub.
 *
 * O app do GitHub ainda não existe nesta instalação (é o clique que falta do
 * dono). Para provar o CAMINHO sem inventar nada, esta prova grava chaves de
 * TESTE na config da plataforma, faz a requisição de verdade contra o servidor
 * no ar e confere a resposta; no fim, remove as chaves de teste e devolve o
 * banco ao estado anterior.
 *
 * O que ela confirma:
 *   1. com o app configurado, a prontidão vira "pronta" (o cartão deixa de
 *      dizer indisponível);
 *   2. a rota responde 302 para o consentimento do GitHub;
 *   3. o endereço leva client_id, redirect_uri, escopo, state e PKCE (S256);
 *   4. o `state` do endereço é O MESMO do bilhete assinado no cookie — a
 *      amarração anti-CSRF está de pé;
 *   5. o bilhete carrega o DONO da conta (é a conexão da conta, não de projeto).
 */
import "./carrega-env";

import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

import { guardarConfig, lerConfig } from "../src/lib/plataforma-config";

const DB = path.join(process.cwd(), "data", "auth.db");
const TOKEN = fs.readFileSync("/opt/data/cache/scratch/arquiteto-prompt/mv.tok", "utf8").trim();
const BASE = "http://127.0.0.1:3333";

let ok = 0;
let falhou = 0;
const checa = (nome: string, cond: boolean, detalhe = "") => {
  if (cond) {
    ok++;
    console.log(`  ✔ ${nome}`);
  } else {
    falhou++;
    console.log(`  ✘ ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  }
};

const carimbo = new Date().toISOString().replace(/[:.]/g, "-");
const backup = `${DB}.antes-prova-chaves.${carimbo}`;
fs.copyFileSync(DB, backup);
console.log(`backup do banco: ${backup}\n`);

// guarda o que existia (para restaurar fielmente)
const c0 = new Database(DB, { readonly: true });
const antes = c0
  .prepare("SELECT chave, valor FROM plataforma_config WHERE chave LIKE 'github_app_%'")
  .all() as { chave: string; valor: string }[];
c0.close();
console.log(`chaves github_app_* antes: ${antes.length ? antes.map((a) => a.chave).join(", ") : "(nenhuma)"}\n`);

try {
  // ── 1. ANTES: sem o app, indisponível ────────────────────────────────────
  console.log("1) SEM o app do GitHub configurado");
  checa("o servidor diz que o GitHub NÃO está configurado", lerConfig("github_app_client_id") === null);
  const r1 = await fetch(`${BASE}/api/integracoes`, { headers: { cookie: `token=${TOKEN}` } });
  const d1 = (await r1.json()) as { prontidao?: Record<string, { pronta: boolean; motivo?: string }> };
  checa("o cartão do GitHub está INDISPONÍVEL", d1.prontidao?.github?.pronta === false, JSON.stringify(d1.prontidao?.github));

  // ── 2. Configura (chaves de TESTE) ───────────────────────────────────────
  console.log("\n2) COM o app configurado (chaves de teste)");
  guardarConfig("github_app_client_id", "Iv1.TESTE_client_id");
  guardarConfig("github_app_client_secret", "teste_secret_nao_usado");
  const r2 = await fetch(`${BASE}/api/integracoes`, { headers: { cookie: `token=${TOKEN}` } });
  const d2 = (await r2.json()) as { prontidao?: Record<string, { pronta: boolean }> };
  checa("a prontidão vira PRONTA (o cartão libera)", d2.prontidao?.github?.pronta === true, JSON.stringify(d2.prontidao?.github));

  // ── 3. O clique leva ao consentimento do GitHub ──────────────────────────
  console.log("\n3) O clique em Integrar (a rota do consentimento)");
  const r3 = await fetch(`${BASE}/api/oauth/github/iniciar`, {
    headers: { cookie: `token=${TOKEN}` },
    redirect: "manual",
  });
  checa("responde com redirecionamento para o GitHub", r3.status === 302 || r3.status === 307, `status ${r3.status}`);
  const loc = r3.headers.get("location") || "";
  checa("vai para o consentimento do GitHub", loc.startsWith("https://github.com/login/oauth/authorize"), loc.slice(0, 70));

  const u = new URL(loc);
  checa("leva o client_id do app", u.searchParams.get("client_id") === "Iv1.TESTE_client_id", String(u.searchParams.get("client_id")));
  checa("leva o escopo pedido", u.searchParams.get("scope") === "repo read:user", String(u.searchParams.get("scope")));
  const voltar = u.searchParams.get("redirect_uri") || "";
  checa("o retorno é a nossa rota /api/oauth/github/volta", voltar.endsWith("/api/oauth/github/volta"), voltar);
  checa("usa PKCE S256", u.searchParams.get("code_challenge_method") === "S256");
  checa("leva o desafio do PKCE", (u.searchParams.get("code_challenge") || "").length > 20);

  // ── 4. O bilhete assinado (anti-CSRF + dono) ─────────────────────────────
  console.log("\n4) O bilhete assinado que amarra a volta");
  const setCookie = r3.headers.get("set-cookie") || "";
  checa("grava o cookie do bilhete", setCookie.includes("gh_bilhete="), setCookie.slice(0, 60));
  checa("o cookie é httpOnly", /httponly/i.test(setCookie));

  const bruto = setCookie.match(/gh_bilhete=([^;]+)/)?.[1] || "";
  const payloadB64 = decodeURIComponent(bruto).split(".")[0] || "";
  let bilhete: { projetoId?: string; state?: string; userId?: number } = {};
  try {
    bilhete = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    /* fica {} */
  }
  checa(
    "o state do endereço é O MESMO do bilhete",
    bilhete.state === u.searchParams.get("state"),
    `endereço=${u.searchParams.get("state")?.slice(0, 12)}… bilhete=${String(bilhete.state).slice(0, 12)}…`,
  );
  checa("o bilhete é da CONTA (sem projeto)", bilhete.projetoId === "", String(bilhete.projetoId));
  checa("o bilhete carrega o dono da conta", typeof bilhete.userId === "number", String(bilhete.userId));
} finally {
  // ── 5. Restaura (nada de chave de teste ficando para trás) ───────────────
  console.log("\n5) Restaurando o estado anterior");
  const c = new Database(DB);
  c.prepare("DELETE FROM plataforma_config WHERE chave LIKE 'github_app_%'").run();
  for (const a of antes) {
    c.prepare("INSERT INTO plataforma_config (chave, valor, atualizado_em) VALUES (?,?,?)").run(
      a.chave,
      a.valor,
      new Date().toISOString(),
    );
  }
  c.close();
  checa("as chaves de teste foram removidas", lerConfig("github_app_client_id") === null);
  const c2 = new Database(DB, { readonly: true });
  const depois = c2
    .prepare("SELECT chave FROM plataforma_config WHERE chave LIKE 'github_app_%'")
    .all() as { chave: string }[];
  c2.close();
  checa("o banco voltou ao que era", depois.length === antes.length, `${depois.length} vs ${antes.length}`);
}

console.log(`\nRESULTADO: ${ok} ok, ${falhou} falhou`);
console.log(`backup guardado em: ${backup}`);
process.exit(falhou === 0 ? 0 : 1);
