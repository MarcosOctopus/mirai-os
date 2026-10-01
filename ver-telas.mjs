// "Ver o que o Marcos vê": busca as telas COM sessão e imprime o texto visível.
// Serve para eu parar de adivinhar o que a tela mostra no celular dele.
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

const limpar = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<")
    .replace(/\s+/g, " ").trim();

for (const rota of process.argv.slice(2)) {
  const r = await fetch("http://127.0.0.1:3333" + rota, { headers: { cookie: "token=" + token } });
  const html = await r.text();
  const texto = limpar(html);
  // conta o que existe de navegação na página
  const links = [...html.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]);
  const unicos = [...new Set(links)].slice(0, 14);
  console.log(`\n===== ${rota} → HTTP ${r.status} =====`);
  console.log("TEXTO: " + texto.slice(0, 800));
  console.log("LINKS: " + (unicos.join("  ") || "(nenhum)"));
  console.log("tem <nav>? " + /<nav[\s>]/.test(html) + " | tem botão/hamburguer? " + /hamburg|☰|menu/i.test(html));
}
