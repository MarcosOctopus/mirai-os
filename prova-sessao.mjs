// Prova o último metro: cunha a MESMA sessão que o callback do login assinou
// (HS256 com o JWT_SECRET do app, 7 dias) para a conta que acabou de nascer e
// bate nas telas protegidas. Não imprime token nenhum — só o que o app responde.
import fs from "node:fs";
import { SignJWT } from "jose";
import Database from "better-sqlite3";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);

const db = new Database("data/auth.db", { readonly: true });
const u = db.prepare("select id, email, tenant_id from users order by id desc limit 1").get();

const token = await new SignJWT({ userId: u.id, email: u.email, tenantId: u.tenant_id })
  .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("7d")
  .sign(new TextEncoder().encode(env.JWT_SECRET));

console.log(`sessão de: ${u.email} (id ${u.id}, tenant ${u.tenant_id})\n`);
for (const alvo of ["/dashboard", "/dashboard/connect", "/", "/canais", "/api/auth/me", "/api/config"]) {
  const r = await fetch("http://127.0.0.1:3333" + alvo, {
    headers: { cookie: "token=" + token }, redirect: "manual",
  });
  let extra = "";
  if (alvo === "/api/auth/me" || alvo === "/api/config") {
    extra = " " + (await r.text()).replace(/\s+/g, " ").slice(0, 110);
  }
  console.log(`  ${alvo.padEnd(20)} -> ${r.status}${extra}`);
}
console.log("\n(307/302 = guarda mandando pro login = sessão NÃO aceita · 200 = dentro)");
