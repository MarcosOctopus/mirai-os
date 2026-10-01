// Prova que o chat do MIRAI OS está falando com o Verboo (V4.1) de verdade:
// abre sessão, manda uma pergunta e conta os pedaços que chegam em streaming.
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

const pergunta = process.argv[2] || "Diga apenas a palavra: funcionando";
const r = await fetch("http://127.0.0.1:3333/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json", cookie: "token=" + token },
  body: JSON.stringify({ messages: [{ role: "user", content: pergunta }], mode: "conversa" }),
});
console.log("HTTP:", r.status, "| content-type:", r.headers.get("content-type"));

const reader = r.body.getReader();
const dec = new TextDecoder();
let texto = "", pedacos = 0, primeiroEm = null;
const t0 = Date.now();
if (r.ok) {
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const line of dec.decode(value, { stream: true }).split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const d = line.slice(6).trim();
      if (d === "[DONE]") continue;
      try {
        const p = JSON.parse(d);
        const c = p.choices?.[0]?.delta?.content || "";
        if (c) { if (primeiroEm === null) primeiroEm = Date.now() - t0; texto += c; pedacos++; }
      } catch {}
    }
  }
}
console.log("1º pedaço em:", primeiroEm === null ? "nunca" : primeiroEm + "ms");
console.log("pedaços:", pedacos, "| caracteres:", texto.length);
console.log("TEXTO:", texto.slice(0, 400));
