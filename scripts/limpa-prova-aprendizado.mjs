// LIMPEZA DA PROVA — apaga as notas de teste pelo MESMO caminho do app
// (`POST /api/acervo` ação `apagar-nota`, que manda para a LIXEIRA e é
// restaurável). Nada de nota de teste ficando no acervo do dono.
//
// Uso: node scripts/limpa-prova-aprendizado.mjs 3455 <caminho> [caminho...]
import fs from "node:fs";
import { SignJWT } from "jose";
import Database from "better-sqlite3";

const [porta, ...caminhos] = process.argv.slice(2);
const BASE = `http://127.0.0.1:${porta || 3455}`;

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const db = new Database("data/auth.db", { readonly: true });
const u = db.prepare("select id, email, tenant_id from users where id = 5").get();
db.close();
const token = await new SignJWT({ userId: u.id, email: u.email, tenantId: u.tenant_id })
  .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("7d")
  .sign(new TextEncoder().encode(env.JWT_SECRET));

for (const caminho of caminhos) {
  const r = await fetch(BASE + "/api/acervo", {
    method: "POST",
    headers: { cookie: "token=" + token, "content-type": "application/json" },
    body: JSON.stringify({ acao: "apagar-nota", path: caminho, confirmar: caminho }),
  });
  const d = await r.json().catch(() => ({}));
  console.log(`apagar ${caminho} ->`, r.status, JSON.stringify(d).slice(0, 240));
}
