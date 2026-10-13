/**
 * RECUPERAÇÃO das chaves do GitHub que o MEU teste apagou (13/10/2026).
 *
 * O QUE ACONTECEU: os scripts de prova terminavam com
 *   DELETE FROM plataforma_config WHERE chave LIKE 'github_app_%'
 * achando que só apagavam "chave de teste". O padrão pegou as chaves REAIS do dono.
 * O backup tirado ANTES daquele teste (`auth.db.antes-prova-id-real.2026-10-13T15-39-17-950Z`)
 * tem as duas linhas originais, com o ciphertext intacto.
 *
 * COMO RECUPERA: o ciphertext é AES-256-GCM com chave derivada do JWT_SECRET por HKDF — e o
 * JWT_SECRET não mudou. Então as linhas do backup DECIFRAM na instalação de hoje. Aqui elas
 * são copiadas de volta para o banco vivo.
 *
 * SEGURANÇA: nunca imprime o segredo. Confere que decifra antes de gravar e que o estado final
 * responde "configurado" no servidor.
 */
import "./carrega-env";
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { decifrar } from "../src/lib/segredo-guardado";

const VIVO = path.join(process.cwd(), "data", "auth.db");
const BACKUP = "/opt/data/cache/scratch/backup/auth.db.antes-prova-id-real.2026-10-13T15-39-17-950Z";

let ok = 0, falhou = 0;
const checa = (n: string, c: boolean, d = "") => {
  if (c) { ok++; console.log(`  ✔ ${n}`); }
  else { falhou++; console.log(`  ✘ ${n}${d ? ` — ${d}` : ""}`); }
};

if (!fs.existsSync(BACKUP)) {
  console.log(`backup não encontrado: ${BACKUP}`);
  process.exit(1);
}

// ── 1. O que o backup tem ────────────────────────────────────────────────────
const b = new Database(BACKUP, { readonly: true });
const linhas = b.prepare("SELECT chave, valor, atualizado_em FROM plataforma_config WHERE chave LIKE 'github%'").all() as
  { chave: string; valor: string; atualizado_em: string }[];
b.close();
console.log(`1) O backup tem ${linhas.length} linha(s) do GitHub:`);
for (const l of linhas) {
  const claro = decifrar(l.valor);
  const ehId = l.chave.includes("client_id");
  // O Client ID não é segredo (vai na URL do consentimento); o SECRET nunca é impresso.
  const amostra = claro ? (ehId ? claro : `(segredo, ${claro.length} chars)`) : "(NÃO DECIFROU)";
  console.log(`   - ${l.chave} = ${amostra}  [gravado ${l.atualizado_em}]`);
}
checa("o backup tem as duas chaves", linhas.length === 2, `${linhas.length}`);
checa("o segredo do backup NÃO é o de teste", !linhas.some((l) => (decifrar(l.valor) || "") === "secret_de_teste"));
checa("as duas decifram com a chave de hoje", linhas.every((l) => !!decifrar(l.valor)));

// ── 2. O estado vivo (antes) ─────────────────────────────────────────────────
const v0 = new Database(VIVO, { readonly: true });
const antes = (v0.prepare("SELECT COUNT(*) n FROM plataforma_config WHERE chave LIKE 'github%'").get() as { n: number }).n;
v0.close();
console.log(`\n2) O banco vivo tem ${antes} chave(s) do GitHub (é o que o dono viu faltar)`);

// ── 3. Backup do estado atual e restauração ──────────────────────────────────
const marca = new Date().toISOString().replace(/[:.]/g, "-");
const antesDeRestaurar = path.join("/opt/data/cache/scratch/backup", `auth.db.antes-restaurar-github.${marca}`);
fs.copyFileSync(VIVO, antesDeRestaurar);
console.log(`\n3) Backup do estado atual: ${antesDeRestaurar}`);

const v = new Database(VIVO);
for (const l of linhas) {
  v.prepare(
    `INSERT INTO plataforma_config (chave, valor, atualizado_em)
     VALUES (?, ?, ?)
     ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor, atualizado_em = excluded.atualizado_em`,
  ).run(l.chave, l.valor, l.atualizado_em);
}
const depois = (v.prepare("SELECT COUNT(*) n FROM plataforma_config WHERE chave LIKE 'github%'").get() as { n: number }).n;
v.close();
checa("as duas chaves voltaram ao banco vivo", depois === 2, `${depois}`);

// ── 4. O SERVIDOR enxerga? ───────────────────────────────────────────────────
const db = new Database(VIVO, { readonly: true });
const u = db.prepare("SELECT id, email, tenant_id FROM users WHERE id = 5").get() as
  { id: number; email: string; tenant_id: string };
db.close();
const { SignJWT } = await import("jose");
const segredo = new TextEncoder().encode(process.env.JWT_SECRET || "");
const token = await new SignJWT({ userId: u.id, email: u.email, tenantId: u.tenant_id })
  .setProtectedHeader({ alg: "HS256" }).setExpirationTime("2h").sign(segredo);
const cookie = `token=${token}`;

console.log("\n4) O servidor confirma");
const r = await fetch("http://127.0.0.1:3333/api/admin/github-app", { headers: { cookie } });
const d = (await r.json().catch(() => ({}))) as { configurado?: boolean };
checa("GET /api/admin/github-app diz configurado", d.configurado === true, JSON.stringify(d));

const ri = await fetch("http://127.0.0.1:3333/api/integracoes", { headers: { cookie } });
const di = (await ri.json()) as { prontidao?: Record<string, { pronta: boolean }> };
checa("o cartão do GitHub fica PRONTO", di.prontidao?.github?.pronta === true, JSON.stringify(di.prontidao?.github));

// ── 5. O consentimento usa o SEU client_id ───────────────────────────────────
console.log("\n5) A rota de conectar monta o consentimento com o client_id recuperado");
const rc = await fetch("http://127.0.0.1:3333/api/oauth/github/iniciar", { headers: { cookie }, redirect: "manual" });
const loc = rc.headers.get("location") || "";
const idEsperado = decifrar(linhas.find((l) => l.chave === "github_app_client_id")!.valor) || "";
checa("a rota redireciona ao GitHub (302/307)", rc.status === 302 || rc.status === 307, `status ${rc.status}`);
checa("o client_id do consentimento é o SEU", loc.includes(idEsperado) && !!idEsperado, loc.slice(0, 90));
checa("pede PKCE S256", loc.includes("code_challenge_method=S256"), loc.slice(0, 140));

console.log(`\nRESULTADO: ${ok} ok, ${falhou} falhou`);
console.log(`backup do estado anterior: ${antesDeRestaurar}`);
process.exit(falhou === 0 ? 0 : 1);
