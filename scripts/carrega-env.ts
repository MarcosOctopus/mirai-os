/**
 * Carrega o `.env.local` ANTES de qualquer módulo do app.
 *
 * POR QUE: `segredo-guardado.ts` deriva a chave de cifra do `JWT_SECRET` no
 * momento em que é importado. Um script solto (tsx) NÃO carrega o `.env.local`
 * sozinho — sem isto ele cifraria com a chave de reserva e o servidor (que usa
 * a chave real) não conseguiria decifrar. Era exatamente esse descompasso que
 * fazia a prova parecer que o app estava quebrado.
 *
 * Importe ESTE arquivo como o PRIMEIRO import do script.
 */
import fs from "fs";
import path from "path";

const arquivo = path.join(process.cwd(), ".env.local");
if (fs.existsSync(arquivo)) {
  for (const linha of fs.readFileSync(arquivo, "utf8").split("\n")) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, chave, valorBruto] = m;
    if (process.env[chave] !== undefined) continue; // o ambiente manda
    const valor = valorBruto.replace(/^["']|["']$/g, "");
    process.env[chave] = valor;
  }
  console.log(`[carrega-env] .env.local carregado (JWT_SECRET: ${process.env.JWT_SECRET ? "presente" : "AUSENTE"})`);
} else {
  console.log("[carrega-env] sem .env.local");
}
