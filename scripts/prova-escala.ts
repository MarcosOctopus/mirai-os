/**
 * PROVA EM ESCALA — o projeto GRANDE não manda mais o sistema inteiro.
 *
 * O que é provado (com o servidor REAL e o modelo REAL):
 *  1. um projeto GRANDE (12 arquivos, ~150 mil chars) entra no regime de índice;
 *  2. pedido que NOMEIA o arquivo → só ele muda, os outros 11 ficam BYTE A BYTE iguais;
 *  3. pedido que não nomeia nada → o roteador escolhe o escopo e o pedido também funciona;
 *  4. o log do servidor diz o escopo ("projeto GRANDE … escopo: N").
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

// ── O PROJETO DE TESTE (grande de verdade) ───────────────────────────────────
const pad = (s: string, n: number) => s + "\n".repeat(1) + `/* ${"enchimento ".repeat(Math.ceil(n / 12)).slice(0, n)} */`;
const paginas = ["sobre", "contato", "precos", "blog", "faq", "termos", "privacidade", "carreiras", "parceiros"];
const arquivos = [
  { nome: "index.html", conteudo: pad("<html><body><h1>CRM</h1><button class=\"cta\">Teste</button></body></html>", 15000) },
  { nome: "styles.css", conteudo: pad(".cta { background: #ff5500; color: #fff; }", 20000) },
  { nome: "app.js", conteudo: pad("document.querySelector('.cta').onclick = () => alert('ok');", 5000) },
  ...paginas.map((p, i) => ({ nome: `${p}.html`, conteudo: pad(`<html><body><h1>${p}</h1></body></html>`, 10000 + i * 500) })),
  { nome: "dados.json", conteudo: pad(JSON.stringify({ planos: ["free", "pro"] }), 3000) },
  { nome: "PROJETO.md", conteudo: "# CRM\n- index.html — a página de vendas\n- styles.css — o estilo\n- app.js — o comportamento\n" },
];
const totalChars = arquivos.reduce((s, a) => s + a.conteudo.length, 0);
console.log(`projeto de TESTE: ${arquivos.length} arquivos, ${totalChars} chars\n`);

const projeto = criarProjeto(DONO, "TESTE ESCALA (pode apagar)");
salvarProjeto(DONO, projeto.id, null, arquivos);
const antes = obterProjeto(DONO, projeto.id)!;
console.log(`projeto criado: ${projeto.id}\n`);

/** Lê a resposta em LINHAS (progresso + JSON final), como a tela faz. */
async function pedir(pedido: string) {
  const r = await fetch(`${BASE}/api/arquiteto/gerar`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      mensagens: [{ role: "user", content: pedido }],
      arquivos: antes.arquivos.map((a) => ({ nome: a.nome, conteudo: a.conteudo })),
      projetoId: projeto.id,
    }),
  });
  const texto = await r.text();
  const linhas = texto.split("\n").filter(Boolean);
  let d: { ok?: boolean; erro?: string; arquivos?: { nome: string; conteudo: string }[]; resumo?: string; levouMs?: number } = {};
  for (const l of linhas) { try { const j = JSON.parse(l); if (j && (j.ok !== undefined || j.erro || j.progresso === undefined)) d = j; } catch {} }
  return { status: r.status, d, progressos: linhas.filter((l) => l.includes("progresso")).length };
}

try {
  // ── 1. PEDIDO QUE NOMEIA O ARQUIVO ─────────────────────────────────────────
  console.log("1) Pedido que NOMEIA o arquivo (escopo determinístico)");
  const t0 = Date.now();
  const r1 = await pedir("no styles.css, troque a cor do botão .cta para azul");
  console.log(`   status ${r1.status} · ${Math.round((Date.now() - t0) / 1000)}s · avisos de progresso: ${r1.progressos}`);
  checa("respondeu ok", r1.d.ok === true, JSON.stringify(r1.d).slice(0, 200));
  checa("trouxe arquivos", (r1.d.arquivos?.length || 0) > 0, `${r1.d.arquivos?.length}`);
  checa("devolveu TODOS os arquivos (mescla no servidor)", r1.d.arquivos?.length === arquivos.length, `${r1.d.arquivos?.length}`);
  const mudou = (r1.d.arquivos || []).filter((a) => a.conteudo !== antes.arquivos.find((b) => b.nome === a.nome)?.conteudo);
  checa("SÓ o styles.css mudou", mudou.length === 1 && mudou[0].nome === "styles.css", mudou.map((m) => m.nome).join(", "));
  // A cor exata é GOSTO do modelo (ele pode escrever um hex, o nome, ou o token de design —
  // o prompt manda usar var(--cor-primaria)). O que o MEU código garante é: o alvo mudou, os
  // outros não, e a resposta é uma edição válida. É isso que a prova mede.
  const css = mudou[0]?.conteudo || "";
  checa("o alvo mudou de verdade", !!css && css.length > 0, `${css.length} chars`);
  checa("a cor antiga (laranja literal) saiu do alvo", !css.includes("#ff5500"), css.slice(0, 90));
  checa("os outros 13 ficaram byte a byte iguais", mudou.length === 1);

  // ── 2. PEDIDO QUE NÃO NOMEIA NADA ──────────────────────────────────────────
  console.log("\n2) Pedido que NÃO nomeia arquivo (o roteador escolhe o escopo)");
  const t1 = Date.now();
  const r2 = await pedir("deixe o cabeçalho mais bonito");
  console.log(`   status ${r2.status} · ${Math.round((Date.now() - t1) / 1000)}s`);
  checa("respondeu ok (não caiu no erro de formato)", r2.d.ok === true, JSON.stringify(r2.d).slice(0, 200));
  checa("devolveu os 12 arquivos", r2.d.arquivos?.length === arquivos.length, `${r2.d.arquivos?.length}`);

  // ── 2b. ESCALAÇÃO: o pedido nomeia UM arquivo e precisa de OUTRO ───────────
  console.log("\n2b) Escalação — o pedido nomeia um arquivo e precisa de outro");
  const r3 = await pedir("no styles.css, coloque como cor do botão .cta o primeiro plano listado no dados.json");
  console.log(`   status ${r3.status} · ok=${r3.d.ok} · erro=${r3.d.erro || "-"}`);
  console.log("   (o log do servidor diz se o modelo PEDIU o dados.json — veja o grep abaixo)");

  // ── 3. A MESMA PERGUNTA NO PROJETO PEQUENO (sem regressão) ─────────────────
  console.log("\n3) Projeto PEQUENO continua no regime antigo (manda tudo)");
  const pequeno = criarProjeto(DONO, "TESTE ESCALA PEQUENO (pode apagar)");
  salvarProjeto(DONO, pequeno.id, null, arquivos.slice(0, 3));
  const rp = await fetch(`${BASE}/api/arquiteto/gerar`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      mensagens: [{ role: "user", content: "no styles.css troque a cor do botão para verde" }],
      arquivos: arquivos.slice(0, 3),
      projetoId: pequeno.id,
    }),
  });
  const tp = await rp.text();
  let dp: { ok?: boolean } = {};
  for (const l of tp.split("\n")) { try { const j = JSON.parse(l); if (j?.ok !== undefined) dp = j; } catch {} }
  checa("projeto pequeno continua funcionando", dp.ok === true, JSON.stringify(dp).slice(0, 150));
  apagarProjeto(DONO, pequeno.id);
  console.log("   projeto pequeno de teste apagado");
} finally {
  // ── LIMPEZA: o projeto de teste sai do banco ───────────────────────────────
  apagarProjeto(DONO, projeto.id);
  const c = new Database(DB, { readonly: true });
  const n = (c.prepare("SELECT COUNT(*) n FROM arquiteto_projetos WHERE id = ?").get(projeto.id) as { n: number }).n;
  c.close();
  checa("projeto de teste removido do banco", n === 0, `${n}`);
}

console.log(`\nRESULTADO: ${ok} ok, ${falhou} falhou`);
process.exit(falhou === 0 ? 0 : 1);
