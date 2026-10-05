// Bilhete de sessão só para PROVA local (porta paralela). Não vai para o chat.
import { SignJWT } from "jose";
import Database from "better-sqlite3";

const email = process.env.MIRAI_DONO_EMAIL || "marcospaulonascimentoguimaraes@gmail.com";
const db = new Database("/opt/data/mirai-app/data/auth.db", { readonly: true });
const u = db
  .prepare("SELECT id, name, email, tenant_id FROM users WHERE email = ?")
  .get(email);
db.close();

if (!u) {
  console.error("conta nao encontrada:", email);
  process.exit(1);
}
if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET ausente no ambiente");
  process.exit(2);
}

const segredo = new TextEncoder().encode(process.env.JWT_SECRET);
const token = await new SignJWT({ userId: u.id, email: u.email, tenantId: u.tenant_id })
  .setProtectedHeader({ alg: "HS256" })
  .setExpirationTime("2h")
  .sign(segredo);

process.stdout.write(token);
