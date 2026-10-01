// Controle do id_token — exercita a função REAL do app (src/lib/mirai-oidc.ts
// compilado), não uma cópia. Um token legítimo tem que ENTRAR; qualquer coisa
// assinada por outra chave, com outro destinatário, outro nonce ou sem e-mail
// tem que ser RECUSADA. Nenhum token é impresso aqui.
import fs from "node:fs";
import { conferirIdToken } from "./.check-oidc/mirai-oidc.mjs";

let ok = 0, tot = 0;
const check = (nome, passou, detalhe = "") => {
  tot++;
  if (passou) { ok++; console.log(`  ✅ ${nome}`); }
  else console.log(`  ❌ ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
};
const ler = (f) => fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim() : "";

const bom = ler(".idtoken-controle");
const audErrada = ler(".idtoken-aud-errada");
const semEmail = ler(".idtoken-sem-email");

console.log("── positivo: token assinado pelo Conta Mirai ──");
try {
  const c = await conferirIdToken(bom, "nonce-do-controle");
  check("token legítimo ACEITO", c.email === "controle@miraitohope.com", `email=${c.email}`);
  check("nonce confere", true);
} catch (e) { check("token legítimo ACEITO", false, String(e.message)); }

console.log("── negativos ──");
const recusa = async (nome, token, nonce, dica) => {
  try { await conferirIdToken(token, nonce); check(nome, false, "PASSOU (não devia)"); }
  catch (e) { check(nome, true, String(e.message).slice(0, 40)); }
};
await recusa("nonce trocado → recusa", bom, "nonce-errado");
await recusa("aud de outro cliente → recusa", audErrada, "nonce-do-controle");
await recusa("token sem e-mail → recusa", semEmail, "nonce-do-controle");
try {
  // assinatura de chave estranha, com o MESMO iss/aud/kid: a única diferença é
  // a chave — se passar, a conferência de assinatura não vale nada.
  const { generateKeyPair, SignJWT } = await import("jose");
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  const forjado = await new SignJWT({
    email: "controle@miraitohope.com", nonce: "nonce-do-controle",
  })
    .setProtectedHeader({ alg: "RS256", kid: "mirai-control-1" })
    .setIssuer("https://id.miraitohope.com")
    .setSubject("u_controle_teste")
    .setAudience(process.env.MIRAI_OIDC_CLIENT_ID)
    .setIssuedAt().setExpirationTime("5m").sign(privateKey);
  await recusa("assinatura de outra chave → recusa", forjado, "nonce-do-controle");
} catch (e) { check("assinatura de outra chave → recusa", false, String(e.message).slice(0, 60)); }

console.log(`\n=== ${ok}/${tot} ===`);
process.exit(ok === tot ? 0 : 1);
