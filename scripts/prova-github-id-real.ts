/**
 * PROVA DO CONSERTO: o Client ID REAL do dono passa.
 *
 * O dono colou `Ov23li4mJ43YASTP9aHc` (formato NOVO do GitHub, sem ponto) e a
 * rota recusou porque exigia `Ov1.` (formato antigo). Aqui repetimos o que o
 * navegador dele faz, com o ID real dele + um secret de teste, e conferimos:
 *   1. o ID REAL é aceito (antes era recusado);
 *   2. o cartão do GitHub libera;
 *   3. o Client ID do GitHub App (`Iv…`) continua recusado, com recado;
 *   4. o banco volta ao estado anterior.
 */
import "./carrega-env";
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { SignJWT } from "jose";

const BASE = "http://127.0.0.1:3333";
const DB = path.join(process.cwd(), "data", "auth.db");
const ID_REAL_DO_DONO = "Ov23li4mJ43YASTP9aHc";

let ok = 0, falhou = 0;
const checa = (n: string, c: boolean, d = "") => {
  if (c) { ok++; console.log(`  ✔ ${n}`); }
  else { falhou++; console.log(`  ✘ ${n}${d ? ` — ${d}` : ""}`); }
};

const db = new Database(DB, { readonly: true });
const dono = db.prepare("SELECT id, email, tenant_id FROM users WHERE id = 5").get() as
  { id: number; email: string; tenant_id: string };
db.close();

const segredo = new TextEncoder().encode(process.env.JWT_SECRET || "");
const token = await new SignJWT({ userId: dono.id, email: dono.email, tenantId: dono.tenant_id })
  .setProtectedHeader({ alg: "HS256" }).setExpirationTime("2h").sign(segredo);
const cookie = `token=${token}`;

const backup = `${DB}.antes-prova-id-real.${new Date().toISOString().replace(/[:.]/g, "-")}`;
fs.copyFileSync(DB, backup);

const gravar = (client_id: string) =>
  fetch(`${BASE}/api/admin/github-app`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ client_id, client_secret: "secret_de_teste" }),
  });

try {
  console.log(`1) O Client ID REAL do dono: ${ID_REAL_DO_DONO}`);
  const r1 = await gravar(ID_REAL_DO_DONO);
  const d1 = (await r1.json().catch(() => ({}))) as { configurado?: boolean; erro?: string };
  checa("é ACEITO (antes era recusado)", r1.status === 200 && d1.configurado === true,
    `status ${r1.status} ${JSON.stringify(d1)}`);

  console.log("\n2) O cartão do GitHub libera");
  const ri = await fetch(`${BASE}/api/integracoes`, { headers: { cookie } });
  const di = (await ri.json()) as { prontidao?: Record<string, { pronta: boolean }> };
  checa("GitHub fica PRONTO", di.prontidao?.github?.pronta === true, JSON.stringify(di.prontidao?.github));

  console.log("\n3) O app ERRADO continua recusado");
  const r2 = await gravar("Iv23liALGUMACOISA");
  const d2 = (await r2.json().catch(() => ({}))) as { erro?: string };
  checa("GitHub App (Iv…) recusado com 400", r2.status === 400, `status ${r2.status}`);
  checa("o recado diz Ov…", (d2.erro || "").includes("Ov"), d2.erro);

  console.log("\n4) Formato antigo também continua aceito");
  const r3 = await gravar("Ov1.antigoFUNCIONA");
  checa("Ov1.… aceito", r3.status === 200, `status ${r3.status}`);
} finally {
  const c = new Database(DB);
  c.prepare("DELETE FROM plataforma_config WHERE chave LIKE 'github_app_%'").run();
  c.close();
  const c2 = new Database(DB, { readonly: true });
  const n = (c2.prepare("SELECT COUNT(*) n FROM plataforma_config WHERE chave LIKE 'github_app_%'").get() as { n: number }).n;
  c2.close();
  checa("nada de teste sobrou no banco", n === 0, `${n}`);
}

console.log(`\nRESULTADO: ${ok} ok, ${falhou} falhou`);
console.log(`backup: ${backup}`);
process.exit(falhou === 0 ? 0 : 1);
