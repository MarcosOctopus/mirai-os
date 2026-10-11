// Prova da rede de segurança da MESCLA (dono, 11/10/2026).
// O que ela NUNCA pode fazer: perder trabalho.
import { mesclarMudanca } from "../src/lib/arquiteto-mescla";

let falhas = 0;
const ok = (nome: string, cond: boolean, detalhe = "") => {
  console.log(`  ${cond ? "OK ✅" : "FALHOU ❌"}  ${nome}${detalhe ? "  — " + detalhe : ""}`);
  if (!cond) falhas++;
};

const html = "<html>\n" + "  <p>conteudo</p>\n".repeat(80) + "</html>";
const css = "body { margin: 0; }\n".repeat(120);
const js = "console.log('oi');\n".repeat(10);
const atuais = [
  { nome: "index.html", conteudo: html },
  { nome: "styles.css", conteudo: css },
  { nome: "app.js", conteudo: js },
];

console.log("\n1) mudança normal: voltou só o index.html alterado");
{
  const novoHtml = html.replace("conteudo", "conteudo NOVO");
  const r = mesclarMudanca(atuais, [{ nome: "index.html", conteudo: novoHtml }]);
  ok("3 arquivos continuam (nada sumiu)", r.arquivos.length === 3);
  ok("index.html mudou", r.arquivos[0].conteudo === novoHtml);
  ok("styles.css INTACTO byte a byte", r.arquivos[1].conteudo === css);
  ok("app.js INTACTO byte a byte", r.arquivos[2].conteudo === js);
  ok("nada recusado", r.recusados.length === 0);
}

console.log("\n2) resposta CORTADA (15% do original): o arquivo anterior fica");
{
  const cortado = html.slice(0, Math.floor(html.length * 0.15));
  const r = mesclarMudanca(atuais, [{ nome: "index.html", conteudo: cortado }]);
  ok("index.html anterior preservado", r.arquivos[0].conteudo === html);
  ok("recusado foi avisado", r.recusados.includes("index.html"));
}

console.log("\n3) resposta VAZIA: nunca apaga um arquivo");
{
  const r = mesclarMudanca(atuais, [{ nome: "styles.css", conteudo: "   \n  " }]);
  ok("styles.css anterior preservado", r.arquivos[1].conteudo === css);
  ok("recusado foi avisado", r.recusados.includes("styles.css"));
}

console.log("\n4) arquivo NOVO entra no fim");
{
  const r = mesclarMudanca(atuais, [{ nome: "contato.html", conteudo: "<html>contato</html>" }]);
  ok("virou 4 arquivos", r.arquivos.length === 4);
  ok("o novo está no fim", r.arquivos[3].nome === "contato.html");
}

console.log("\n5) nome com outra caixa não cria duplicata");
{
  const r = mesclarMudanca(atuais, [{ nome: "INDEX.HTML", conteudo: html + "<!-- mudou -->" }]);
  ok("continuam 3 arquivos", r.arquivos.length === 3);
  ok("o nome ORIGINAL foi mantido", r.arquivos[0].nome === "index.html");
  ok("o conteúdo novo entrou", r.arquivos[0].conteudo.endsWith("<!-- mudou -->"));
}

console.log("\n6) primeira construção (nada antes): o que veio é o projeto");
{
  const r = mesclarMudanca([], [{ nome: "index.html", conteudo: "<html>novo</html>" }]);
  ok("projeto nasce com o que veio", r.arquivos.length === 1);
  ok("nada recusado", r.recusados.length === 0);
}

console.log("\n7) encolher de verdade (acima do limite) é aceito");
{
  const encurtado = html.slice(0, Math.floor(html.length * 0.5));
  const r = mesclarMudanca(atuais, [{ nome: "index.html", conteudo: encurtado }]);
  ok("mudança grande aplicada", r.arquivos[0].conteudo === encurtado);
  ok("nada recusado", r.recusados.length === 0);
}

console.log(falhas === 0 ? "\nTODAS AS PROVAS PASSARAM ✅" : `\n${falhas} PROVA(S) FALHARAM ❌`);
process.exit(falhas === 0 ? 0 : 1);
