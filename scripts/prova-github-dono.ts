/**
 * PROVA: o DONO consegue gravar as chaves do app do GitHub pela tela.
 *
 * O bilhete de teste do dia a dia (`mv.tok`) tem só `{userId}` — por isso ele
 * NÃO passa no middleware, que confere o dono pelo e-mail do token. O bilhete
 * do navegador (emitido pelo login) tem e-mail. Aqui emitimos um bilhete com o
 * MESMO formato do login real e batemos na rota como o navegador bate: mesma
 * porta, mesmos cookies.
 *
 * No fim, remove as chaves de teste e confere que o estado voltou ao que era.
 */
import "./carrega-env";
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { SignJWT } from "jose";

const BASE = "http://127.0.0.1:3333";
const DB = path.join(process.cwd(), "data", "auth.db");

let ok = 0, falhou = 0;
const checa = (nome: string, cond: boolean, detalhe = "") => {
  if (cond) { ok++; console.log(`  ✔ ${nome}`); }
  else { falhou++; console.log(`  ✘ ${nome}${detalhe ? ` — ${detalhe}` : ""}`); }
};

const db = new Database(DB, { readonly: true });
const dono = db.prepare("SELECT id, email, tenant_id, role FROM users WHERE id = 5").get() as
  | { id: number; email: string; tenant_id: string; role: string }
  | undefined;
db.close();
if (!dono) { console.log("dono (user 5) nao encontrado"); process.exit(1); }
console.log(`dono: ${dono.email} (role=${dono.role})\n`);

// Bilhete no MESMO formato do login real: userId + email + tenantId.
const segredo = new TextEncoder().encode(process.env.JWT_SECRET || "");
const token = await new SignJWT({ userId: dono.id, email: dono.email, tenantId: dono.tenant_id })
  .setProtectedHeader({ alg: "HS256" })
  .setExpirationTime("2h")
  .sign(segredo);
const cookie = `token=${token}`;

const backup = `${DB}.antes-prova-dono.${new Date().toISOString().replace(/[:.]/g, "-")}`;
fs.copyFileSync(DB, backup);

try {
  // ── 1. O dono entra na tela ──────────────────────────────────────────────
  console.log("1) O DONO na tela");
  const me = await fetch(`${BASE}/api/auth/me`, { headers: { cookie } });
  const dme = (await me.json()) as { user?: { ehDono?: boolean; email?: string } };
  checa("o /api/auth/me reconhece o dono", dme.user?.ehDono === true, JSON.stringify(dme.user?.ehDono));

  // ── 2. Grava as chaves (o que o botão do bloco faz) ──────────────────────
  console.log("\n2) Gravar as chaves pela rota");
  const post = await fetch(`${BASE}/api/admin/github-app`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ client_id: "Ov1.TESTE123", client_secret: "segredo_de_teste" }),
  });
  const dpost = (await post.json().catch(() => ({}))) as { configurado?: boolean; erro?: string };
  checa("a rota aceitou (200)", post.status === 200, `status ${post.status} ${JSON.stringify(dpost)}`);
  checa("a rota confirma gravado", dpost.configurado === true);

  // ── 3. O cartão libera ───────────────────────────────────────────────────
  console.log("\n3) O cartão do GitHub libera");
  const integ = await fetch(`${BASE}/api/integracoes`, { headers: { cookie } });
  const dinteg = (await integ.json()) as { prontidao?: Record<string, { pronta: boolean }> };
  checa("o GitHub passa a estar PRONTO", dinteg.prontidao?.github?.pronta === true, JSON.stringify(dinteg.prontidao?.github));

  // ── 4. Recusa o Client ID do app errado ──────────────────────────────────
  console.log("\n4) Recusa o app errado (Iv1. = GitHub App, não OAuth App)");
  const errado = await fetch(`${BASE}/api/admin/github-app`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ client_id: "Iv1.ERRADO", client_secret: "x" }),
  });
  const derrado = (await errado.json().catch(() => ({}))) as { erro?: string };
  checa("recusa com 400", errado.status === 400, `status ${errado.status}`);
  checa("explica qual é o certo", (derrado.erro || "").includes("Ov1."), derrado.erro);

  // ── 5. Cliente NÃO entra ─────────────────────────────────────────────────
  console.log("\n5) Um cliente qualquer não passa");
  const semToken = await fetch(`${BASE}/api/admin/github-app`);
  checa("sem sessão: 401", semToken.status === 401, `status ${semToken.status}`);
} finally {
  console.log("\n6) Limpando as chaves de teste");
  const c = new Database(DB);
  c.prepare("DELETE FROM plataforma_config WHERE chave LIKE 'github_app_%'").run();
  c.close();
  const c2 = new Database(DB, { readonly: true });
  const n = (c2.prepare("SELECT COUNT(*) n FROM plataforma_config WHERE chave LIKE 'github_app_%'").get() as { n: number }).n;
  c2.close();
  checa("nenhuma chave de teste sobrou", n === 0, `${n}`);
}

console.log(`\nRESULTADO: ${ok} ok, ${falhou} falhou`);
console.log(`backup: ${backup}`);
process.exit(falhou === 0 ? 0 : 1);
