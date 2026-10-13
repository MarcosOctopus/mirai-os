/**
 * VERIFICAÇÃO: o caminho de GRAVAR AS CHAVES funciona em PRODUÇÃO?
 *
 * O dono disse "integrei já. deu certo", mas o servidor não tem as chaves. Antes de pedir
 * para ele clicar de novo, esta verificação prova (no endereço REAL, com um bilhete de dono
 * igual ao do navegador) que o POST grava e que o GET enxerga.
 *
 * Usa valores de TESTE e limpa no fim — NUNCA toca em chave real (não há nenhuma aqui).
 */
import "./carrega-env";
import path from "path";
import Database from "better-sqlite3";
import { SignJWT } from "jose";

const BASE = "https://app.miraitohope.com";
const DB = path.join(process.cwd(), "data", "auth.db");

let ok = 0, falhou = 0;
const checa = (n: string, c: boolean, d = "") => {
  if (c) { ok++; console.log(`  ✔ ${n}`); }
  else { falhou++; console.log(`  ✘ ${n}${d ? ` — ${d}` : ""}`); }
};

const db = new Database(DB, { readonly: true });
const u = db.prepare("SELECT id, email, tenant_id FROM users WHERE id = 5").get() as
  { id: number; email: string; tenant_id: string };
db.close();
const segredo = new TextEncoder().encode(process.env.JWT_SECRET || "");
const token = await new SignJWT({ userId: u.id, email: u.email, tenantId: u.tenant_id })
  .setProtectedHeader({ alg: "HS256" }).setExpirationTime("2h").sign(segredo);
const cookie = `token=${token}`;

const lerEstado = async () => {
  const r = await fetch(`${BASE}/api/admin/github-app`, { headers: { cookie } });
  const d = (await r.json().catch(() => ({}))) as { configurado?: boolean; erro?: string };
  return { status: r.status, configurado: d.configurado, erro: d.erro };
};

try {
  console.log(`alvo: ${BASE}\n`);
  const antes = await lerEstado();
  console.log(`1) Antes: status ${antes.status} · configurado=${antes.configurado}`);

  console.log("\n2) Gravar (POST) com valores de TESTE");
  const post = await fetch(`${BASE}/api/admin/github-app`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ client_id: "Ov23liTESTE_VERIFICACAO", client_secret: "segredo_de_teste_nao_real" }),
  });
  const dpost = (await post.json().catch(() => ({}))) as { configurado?: boolean; erro?: string };
  console.log(`   status ${post.status} · ${JSON.stringify(dpost)}`);
  checa("o POST de produção aceitou", post.status === 200 && dpost.configurado === true, JSON.stringify(dpost));

  const depois = await lerEstado();
  checa("o GET enxerga o que foi gravado", depois.configurado === true, JSON.stringify(depois));

  console.log("\n3) E o cartão do GitHub libera?");
  const ri = await fetch(`${BASE}/api/integracoes`, { headers: { cookie } });
  const di = (await ri.json()) as { prontidao?: Record<string, { pronta: boolean }> };
  checa("GitHub fica PRONTO em produção", di.prontidao?.github?.pronta === true, JSON.stringify(di.prontidao?.github));
} finally {
  // Limpeza: as chaves de TESTE saem; o estado volta ao que era.
  const c = new Database(DB);
  const n = c.prepare("DELETE FROM plataforma_config WHERE chave LIKE 'github_app_%'").run().changes;
  c.close();
  const fim = await lerEstado();
  checa(`as chaves de teste saíram (${n}) e o estado voltou`, fim.configurado === false, JSON.stringify(fim));
}

console.log(`\nRESULTADO: ${ok} ok, ${falhou} falhou`);
process.exit(falhou === 0 ? 0 : 1);
