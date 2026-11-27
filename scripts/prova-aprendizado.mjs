// PROVA DO APRENDIZADO (27/11/2026) — sessão local + acervo real.
//
// Cunha a MESMA sessão que o login assina (HS256 com o JWT_SECRET do app) para a
// conta do dono e exercita os dois modos da rota /api/aprendizado:
//   · modo "agora"  → grava na hora (o "guarda isso")
//   · modo "fim"    → grava o fecho, UMA vez
// e prova a IDEMPOTÊNCIA: a segunda chamada com o mesmo conversaId NÃO cria nota.
//
// Não imprime token. Uso: node scripts/prova-aprendizado.mjs [porta]
import fs from "node:fs";
import path from "node:path";
import { SignJWT } from "jose";
import Database from "better-sqlite3";

const PORTA = Number(process.argv[2] || 3455);
const BASE = `http://127.0.0.1:${PORTA}`;

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

const cab = { cookie: "token=" + token, "content-type": "application/json" };
const carimbo = Date.now().toString(36);
const conversaA = `conv_prova_aprendizado_${carimbo}`;
const conversaB = `conv_prova_aprendizado_fim_${carimbo}`;

const IMAGEM = "0f2e5211-fdda-4622-a2f8-7e15066b31c6"; // upload real da conta (tem descrição de visão)

const mensagensA = [
  { role: "user", content: "Quero revisar o funil do CRM: entrada, qualificação, proposta e fechamento. O gargalo está entre proposta e fechamento.", anexos: [{ id: IMAGEM }] },
  { role: "assistant", content: "Olhando o desenho que você anexou e o funil que você descreveu: o gargalo entre proposta e fechamento costuma ser tempo de resposta e falta de próximo passo combinado. Recomendo duas coisas: (1) prazo de retorno definido na proposta, (2) um dono por proposta em aberto." },
  { role: "user", content: "Decidido: prazo de retorno de 48h em toda proposta e um responsável por proposta. O que fica pendente é a automação do lembrete." },
  { role: "assistant", content: "Fechado. Ficou decidido o prazo de 48h e o dono por proposta; ficou pendente a automação do lembrete de 48h. Quando quiser, eu monto o lembrete no agendador." },
];

const mensagensB = [
  { role: "user", content: "Me ajuda a decidir o nome do novo produto de relatórios: algo curto, que não pareça painel." },
  { role: "assistant", content: "Sugiro três caminhos: 'Farol' (indica direção sem parecer painel), 'Sinal' (curto, sonoro) e 'Norte'. Me diga qual te agrada e eu registro a decisão." },
  { role: "user", content: "Vamos de Farol. Decidido." },
  { role: "assistant", content: "Decidido: Farol. Vou considerar esse nome nas próximas peças." },
];

async function chamar(rota, corpo) {
  const r = await fetch(BASE + rota, { method: "POST", headers: cab, body: JSON.stringify(corpo) });
  const d = await r.json().catch(() => ({}));
  return { status: r.status, dados: d };
}

function acharVault(arquivo) {
  const raiz = "/opt/data/arca/tenants";
  for (const dir of fs.readdirSync(raiz)) {
    const v = path.join(raiz, dir, "vault", arquivo);
    if (fs.existsSync(v)) return v;
  }
  return null;
}

console.log(`sessão de: ${u.email} (id ${u.id}) · conversas ${conversaA} / ${conversaB}\n`);

// 1) a rota responde e diz em que espaço vai gravar
{
  const r = await fetch(BASE + "/api/aprendizado", { headers: cab });
  console.log("1) GET /api/aprendizado ->", r.status, JSON.stringify(await r.json()));
}

// 2) modo AGORA (o "guarda isso")
const agora1 = await chamar("/api/aprendizado", { modo: "agora", conversaId: conversaA, mensagens: mensagensA });
console.log("\n2) POST modo=agora (1ª vez) ->", agora1.status, JSON.stringify(agora1.dados, null, 2));

// 3) idempotência: mesma conversa, de novo
const agora2 = await chamar("/api/aprendizado", { modo: "agora", conversaId: conversaA, mensagens: mensagensA });
console.log("\n3) POST modo=agora (2ª vez, MESMO conversaId) ->", agora2.status, JSON.stringify(agora2.dados));

// 4) idempotência cruzada: o fim não cria uma segunda nota da mesma conversa
const fimA = await chamar("/api/aprendizado", { modo: "fim", conversaId: conversaA, mensagens: mensagensA });
console.log("4) POST modo=fim   (MESMO conversaId) ->", fimA.status, JSON.stringify(fimA.dados));

// 5) uma conversa diferente, fechada pelo fim (sendBeacon usa este modo)
const fimB = await chamar("/api/aprendizado", { modo: "fim", conversaId: conversaB, mensagens: mensagensB });
console.log("\n5) POST modo=fim (conversa NOVA) ->", fimB.status, JSON.stringify(fimB.dados, null, 2));

// 6) o conteúdo REAL das duas notas, lido do vault
for (const [rotulo, caminho] of [["A (agora)", agora1.dados.caminho], ["B (fim)", fimB.dados.caminho]]) {
  console.log(`\n──────── NOTA ${rotulo}: ${caminho} ────────`);
  const noDisco = caminho ? acharVault(caminho) : null;
  console.log(noDisco ? fs.readFileSync(noDisco, "utf8") : "(não achei o arquivo no vault)");
}

fs.writeFileSync(
  "/opt/data/cache/scratch/prova-aprendizado.json",
  JSON.stringify({ conversaA, conversaB, agora1, agora2, fimA, fimB }, null, 2),
);
console.log("\nresultado em /opt/data/cache/scratch/prova-aprendizado.json");
