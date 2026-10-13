/**
 * PROVA DA FILA EM LOTE (Fase 2 — "quando tiver um milhão de páginas").
 *
 * Um pedido que toca MUITOS arquivos não pode virar uma chamada gigante. Aqui ele vira FILA:
 * o modelo planeja, o servidor processa de poucos em poucos e GRAVA cada lote.
 *
 * O que é provado (servidor REAL, modelo REAL):
 *  1. o pedido que toca 10 páginas entra na FILA (e o log diz quantos lotes);
 *  2. TODAS as páginas pedidas mudaram;
 *  3. os arquivos que o pedido NÃO toca ficaram byte a byte iguais;
 *  4. o progresso informa o LOTE ("lote 3 de 3") — a tela tem o que mostrar;
 *  5. cada lote foi GRAVADO no servidor (o banco tem o resultado).
 *
 * NUNCA aponta para o projeto do dono: cria um projeto de TESTE e o apaga no fim.
 */
import "./carrega-env";
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { SignJWT } from "jose";
import { apagarProjeto, criarProjeto, obterProjeto, salvarProjeto } from "../src/lib/arquiteto-projetos";

const BASE = "http://127.0.0.1:3333";
const DB = path.join(process.cwd(), "data", "auth.db");
const DONO = 5;

let ok = 0, falhou = 0;
const checa = (nome: string, cond: boolean, detalhe = "") => {
  if (cond) { ok++; console.log(`  ✔ ${nome}`); }
  else { falhou++; console.log(`  ✘ ${nome}${detalhe ? ` — ${detalhe}` : ""}`); }
};

const db = new Database(DB, { readonly: true });
const u = db.prepare("SELECT id, email, tenant_id FROM users WHERE id = ?").get(DONO) as
  { id: number; email: string; tenant_id: string };
db.close();
const segredo = new TextEncoder().encode(process.env.JWT_SECRET || "");
const token = await new SignJWT({ userId: u.id, email: u.email, tenantId: u.tenant_id })
  .setProtectedHeader({ alg: "HS256" }).setExpirationTime("2h").sign(segredo);
const cookie = `token=${token}`;

const pad = (s: string, n: number) => s + "\n<!-- " + "enchimento ".repeat(Math.ceil(n / 12)).slice(0, n) + " -->";
const paginas = ["index", "sobre", "contato", "precos", "blog", "faq", "termos", "privacidade", "carreiras", "parceiros"];
const arquivos = [
  ...paginas.map((p) => ({ nome: `${p}.html`, conteudo: pad(`<html><head><title>${p}</title></head><body><h1>${p}</h1></body></html>`, 9000) })),
  { nome: "styles.css", conteudo: ".a { color: #111; }\n/* " + "x".repeat(9000) + " */" },
  { nome: "app.js", conteudo: "console.log('ok');\n// " + "y".repeat(4000) },
  { nome: "PROJETO.md", conteudo: "# Projeto de teste da fila\n" },
];
const totalChars = arquivos.reduce((s, a) => s + a.conteudo.length, 0);
console.log(`projeto de TESTE: ${arquivos.length} arquivos (${paginas.length} html), ${totalChars} chars\n`);

const projeto = criarProjeto(DONO, "TESTE FILA (pode apagar)");
salvarProjeto(DONO, projeto.id, null, arquivos);
const antes = obterProjeto(DONO, projeto.id)!;

try {
  // O pedido toca TODAS as páginas html (10 > LIMITE_LOTE = 8) → tem de virar FILA.
  const r = await fetch(`${BASE}/api/arquiteto/gerar`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      mensagens: [{ role: "user", content: "no html, coloque o atributo lang=\"pt-BR\" na tag html de cada página" }],
      arquivos: antes.arquivos.map((a) => ({ nome: a.nome, conteudo: a.conteudo })),
      projetoId: projeto.id,
    }),
  });
  const texto = await r.text();
  const linhas = texto.split("\n").filter(Boolean);
  let d: { ok?: boolean; erro?: string; resumo?: string; arquivos?: { nome: string; conteudo: string }[]; lotes?: number; lotesFalhos?: number; salvoNoServidor?: boolean } = {};
  for (const l of linhas) { try { const j = JSON.parse(l); if (j && (j.ok !== undefined || j.erro)) d = j; } catch {} }
  const progressos = linhas.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((j) => j?.progresso);
  const comLote = progressos.filter((p) => p.progresso.lotes);

  console.log(`status ${r.status} · resumo: ${(d.resumo || d.erro || "-").slice(0, 200)}`);
  console.log(`avisos de progresso: ${progressos.length} · com "lote": ${comLote.length}`);
  if (comLote.length) console.log(`exemplo: ${JSON.stringify(comLote[comLote.length - 1].progresso)}`);

  console.log("\n1) A fila rodou");
  checa("respondeu ok", d.ok === true, JSON.stringify(d).slice(0, 250));
  checa("o resumo fala em LOTE", /lote/i.test(d.resumo || ""), (d.resumo || "").slice(0, 200));
  checa("o servidor informou quantos lotes", (d.lotes || 0) >= 3, `${d.lotes}`);

  console.log("\n2) O progresso diz em qual lote está (a tela tem o que mostrar)");
  checa("houve aviso com 'lote'", comLote.length > 0, `${comLote.length}`);
  checa("o total de lotes bate", comLote.every((p) => p.progresso.lotes === d.lotes), JSON.stringify(comLote.map((p) => p.progresso.lotes)));

  console.log("\n3) TODAS as páginas pedidas mudaram");
  const depois = d.arquivos || [];
  checa("devolveu os 14 arquivos", depois.length === arquivos.length, `${depois.length}`);
  const mudaram = depois.filter((a) => a.conteudo !== antes.arquivos.find((b) => b.nome === a.nome)?.conteudo).map((a) => a.nome);
  const htmlMudaram = mudaram.filter((n) => n.endsWith(".html")).sort();
  checa("as 10 páginas html mudaram", htmlMudaram.length === 10, `mudaram: ${mudaram.join(", ")}`);
  checa("os outros (css/js/md) NÃO mudaram", !mudaram.some((n) => !n.endsWith(".html")), mudaram.filter((n) => !n.endsWith(".html")).join(", "));
  checa("o lang entrou no html", (depois.find((a) => a.nome === "sobre.html")?.conteudo || "").includes("lang="),
    (depois.find((a) => a.nome === "sobre.html")?.conteudo || "").slice(0, 80));

  console.log("\n4) Cada lote foi GRAVADO no servidor");
  const noBanco = obterProjeto(DONO, projeto.id)!;
  checa("o banco tem a versão com o lang",
    (noBanco.arquivos.find((a) => a.nome === "sobre.html")?.conteudo || "").includes("lang="),
    (noBanco.arquivos.find((a) => a.nome === "sobre.html")?.conteudo || "").slice(0, 80));
  checa("o servidor confirmou o salvamento", d.salvoNoServidor === true, `${d.salvoNoServidor}`);
  checa("nenhum lote falhou", (d.lotesFalhos || 0) === 0, `${d.lotesFalhos}`);
} finally {
  apagarProjeto(DONO, projeto.id);
  const c = new Database(DB, { readonly: true });
  const n = (c.prepare("SELECT COUNT(*) n FROM arquiteto_projetos WHERE id = ?").get(projeto.id) as { n: number }).n;
  c.close();
  checa("projeto de teste removido do banco", n === 0, `${n}`);
}

console.log(`\nRESULTADO: ${ok} ok, ${falhou} falhou`);
process.exit(falhou === 0 ? 0 : 1);
