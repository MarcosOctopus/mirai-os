// Prova das EDIÇÕES (dono, 11/10/2026) — o caminho rápido do construtor.
// O que ele NUNCA pode fazer: aplicar a troca no lugar errado ou corromper arquivo.
import { aplicarEdicoes, extrairEdicoes } from "../src/lib/arquiteto-edicoes";

let falhas = 0;
const ok = (nome: string, cond: boolean, detalhe = "") => {
  console.log(`  ${cond ? "OK ✅" : "FALHOU ❌"}  ${nome}${detalhe ? "  — " + detalhe : ""}`);
  if (!cond) falhas++;
};

const html = `<!doctype html>
<html lang="pt-BR">
<head><title>CRM</title></head>
<body>
  <h1 class="hero__titulo">Feche mais negócios com menos esforço.</h1>
  <p class="hero__texto">O CRM que organiza o seu funil.</p>
</body>
</html>`;
const css = `.hero__titulo { font-size: 48px; }\n.hero__texto { color: #666; }\n`;
const atuais = [
  { nome: "index.html", conteudo: html },
  { nome: "styles.css", conteudo: css },
  { nome: "app.js", conteudo: "console.log('oi');" },
];

console.log("\n1) parser: lê um bloco de edição do jeito que o modelo escreve");
{
  const resposta = `Troquei o texto.

=== EDIT: index.html ===
@@BUSCAR
<h1 class="hero__titulo">Feche mais negócios com menos esforço.</h1>
@@TROCAR
<h1 class="hero__titulo">Feche mais negócios hoje.</h1>
@@FIM`;
  const e = extrairEdicoes(resposta);
  ok("achou 1 edição", e.length === 1);
  ok("arquivo certo", e[0]?.nome === "index.html");
  ok("buscar exato", e[0]?.buscar === '<h1 class="hero__titulo">Feche mais negócios com menos esforço.</h1>');
  ok("trocar certo", e[0]?.trocar === '<h1 class="hero__titulo">Feche mais negócios hoje.</h1>');
}

console.log("\n2) aplica: muda o alvo e NADA mais");
{
  const e = extrairEdicoes(`=== EDIT: index.html ===\n@@BUSCAR\nFeche mais negócios com menos esforço.\n@@TROCAR\nFeche mais negócios hoje.\n@@FIM`);
  const r = aplicarEdicoes(atuais, e);
  ok("1 aplicada", r.aplicadas === 1);
  ok("h1 trocado", r.arquivos[0].conteudo.includes("Feche mais negócios hoje."));
  ok("resto do html intacto", r.arquivos[0].conteudo.replace("Feche mais negócios hoje.", "Feche mais negócios com menos esforço.") === html);
  ok("styles.css intacto", r.arquivos[1].conteudo === css);
}

console.log("\n3) VÁRIAS edições, em arquivos diferentes");
{
  const e = extrairEdicoes(`=== EDIT: index.html ===
@@BUSCAR
O CRM que organiza o seu funil.
@@TROCAR
O CRM que fecha mais negócios.
@@FIM
=== EDIT: styles.css ===
@@BUSCAR
font-size: 48px;
@@TROCAR
font-size: 56px;
@@FIM`);
  const r = aplicarEdicoes(atuais, e);
  ok("2 aplicadas", r.aplicadas === 2);
  ok("html mudou", r.arquivos[0].conteudo.includes("fecha mais negócios"));
  ok("css mudou", r.arquivos[1].conteudo.includes("56px"));
}

console.log("\n4) BUSCAR que não existe: recusa e não toca em nada");
{
  const e = extrairEdicoes(`=== EDIT: index.html ===\n@@BUSCAR\ntrecho que nao existe no arquivo\n@@TROCAR\noutra coisa\n@@FIM`);
  const r = aplicarEdicoes(atuais, e);
  ok("nada aplicado", r.aplicadas === 0);
  ok("index.html INTACTO", r.arquivos[0].conteudo === html);
  ok("recusado com motivo", r.recusadas[0]?.motivo.includes("não foi encontrado"));
}

console.log("\n5) BUSCAR ambíguo (aparece 2x): recusa em vez de adivinhar");
{
  const amb = [{ nome: "a.html", conteudo: "<p>oi</p>\n<p>oi</p>" }];
  const e = extrairEdicoes(`=== EDIT: a.html ===\n@@BUSCAR\n<p>oi</p>\n@@TROCAR\n<p>ola</p>\n@@FIM`);
  const r = aplicarEdicoes(amb, e);
  ok("nada aplicado", r.aplicadas === 0);
  ok("arquivo intacto", r.arquivos[0].conteudo === amb[0].conteudo);
  ok("motivo diz ambíguo", r.recusadas[0]?.motivo.includes("2 vezes"));
}

console.log("\n6) arquivo que não existe neste projeto: recusa");
{
  const e = extrairEdicoes(`=== EDIT: inexistente.html ===\n@@BUSCAR\nx\n@@TROCAR\ny\n@@FIM`);
  const r = aplicarEdicoes(atuais, e);
  ok("nada aplicado", r.aplicadas === 0);
  ok("motivo diz que não existe", r.recusadas[0]?.motivo.includes("não existe"));
}

console.log("\n7) cercas ``` em volta não atrapalham");
{
  const e = extrairEdicoes(`\`\`\`
=== EDIT: index.html ===
@@BUSCAR
Feche mais negócios com menos esforço.
@@TROCAR
Feche mais negócios hoje.
@@FIM
\`\`\``);
  ok("achou a edição mesmo com cerca", e.length === 1);
}

console.log("\n8) o modelo REINDENTOU o trecho: ainda assim aplica (tolerância a espaço)");
{
  // o arquivo tem 2 espaços de indentação; o modelo mandou com tabulação
  const e = extrairEdicoes(
    `=== EDIT: index.html ===\n@@BUSCAR\n\t<h1 class="hero__titulo">Feche mais negócios com menos esforço.</h1>\n@@TROCAR\n\t<h1 class="hero__titulo">Feche mais negócios hoje.</h1>\n@@FIM`,
  );
  const r = aplicarEdicoes(atuais, e);
  ok("aplicou mesmo com indentação diferente", r.aplicadas === 1);
  ok("o h1 mudou", r.arquivos[0].conteudo.includes("Feche mais negócios hoje."));
  ok("nada além do h1 mudou", r.arquivos[0].conteudo.replace("Feche mais negócios hoje.", "Feche mais negócios com menos esforço.") === html);
  ok("styles.css intacto", r.arquivos[1].conteudo === css);
}

console.log("\n9) quebras de linha diferentes: também aplica");
{
  const e = extrairEdicoes(
    `=== EDIT: index.html ===\n@@BUSCAR\n<h1 class="hero__titulo">Feche mais negócios com\nmenos esforço.</h1>\n@@TROCAR\n<h1 class="hero__titulo">Feche mais negócios hoje.</h1>\n@@FIM`,
  );
  // no arquivo original o texto está numa linha só; o modelo quebrou em duas
  const r = aplicarEdicoes([{ nome: "index.html", conteudo: html }], e);
  ok("aplicou com quebra diferente", r.aplicadas === 1);
  ok("o h1 mudou", r.arquivos[0].conteudo.includes("Feche mais negócios hoje."));
}

console.log("\n10) trecho ambíguo NORMALIZADO: continua recusando (não adivinha)");
{
  const amb = [{ nome: "a.html", conteudo: "<p>oi</p>\n\n<p>oi</p>" }];
  const e = extrairEdicoes(`=== EDIT: a.html ===\n@@BUSCAR\n<p>oi</p>\n@@TROCAR\n<p>ola</p>\n@@FIM`);
  const r = aplicarEdicoes(amb, e);
  ok("nada aplicado", r.aplicadas === 0);
  ok("arquivo intacto", r.arquivos[0].conteudo === amb[0].conteudo);
}

console.log(falhas === 0 ? "\nTODAS AS PROVAS PASSARAM ✅" : `\n${falhas} PROVA(S) FALHARAM ❌`);
process.exit(falhas === 0 ? 0 : 1);
