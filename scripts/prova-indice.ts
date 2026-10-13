/**
 * PROVA DO ÍNDICE (Fase 1 — "não olhar o sistema inteiro").
 *
 * Prova a peça PURA: o mapa do projeto, a escolha dos alvos e a ESCALAÇÃO.
 * É o código que decide QUANTO do projeto vai para o modelo — se ele errar, o
 * construtor volta a se perder (o erro que o dono viu) ou deixa de receber o
 * arquivo que precisava.
 */
import {
  alvosCitados,
  alvosPorPadrao,
  construirIndice,
  ehSoPedidoDeArquivo,
  extrairPedidosDeArquivo,
  projetoPequeno,
  tamanhoLegivel,
  tamanhoTotal,
  textoDoIndice,
  type Arquivo,
} from "../src/lib/arquiteto-indice";

let ok = 0, falhou = 0;
const checa = (nome: string, cond: boolean, detalhe = "") => {
  if (cond) { ok++; console.log(`  ✔ ${nome}`); }
  else { falhou++; console.log(`  ✘ ${nome}${detalhe ? ` — ${detalhe}` : ""}`); }
};

const grande: Arquivo[] = [
  { nome: "index.html", conteudo: "x".repeat(14000) },
  { nome: "styles.css", conteudo: "y".repeat(19000) },
  { nome: "app.js", conteudo: "z".repeat(4000) },
  { nome: "sobre.html", conteudo: "w".repeat(9000) },
  { nome: "contato.html", conteudo: "v".repeat(8000) },
  { nome: "dados.json", conteudo: "{}".repeat(500) },
  { nome: "logo.svg", conteudo: "<svg/>" },
];

// ── 1. O MAPA ────────────────────────────────────────────────────────────────
console.log("1) O mapa do projeto");
const itens = construirIndice(grande);
checa("lista TODOS os arquivos", itens.length === 7, `${itens.length}`);
checa("conta os caracteres", itens[0].chars === 14000, `${itens[0].chars}`);
checa("conta as linhas", itens[0].linhas >= 1);
checa("index.html é 'a página'", itens[0].papel.includes("página"), itens[0].papel);
checa("styles.css é 'o estilo'", itens[1].papel === "o estilo", itens[1].papel);
checa("app.js é 'o comportamento'", itens[2].papel.includes("comportamento"), itens[2].papel);
checa("logo.svg é arte vetorial", itens[6].papel.includes("vetorial"), itens[6].papel);

console.log("\n2) O papel vem do PROJETO.md quando ele cita o arquivo");
const comDoc = construirIndice(grande, "- index.html — a vitrine de vendas\n- app.js — a calculadora de preço");
checa("index.html usa o papel do .md", comDoc[0].papel.includes("vitrine"), comDoc[0].papel);
checa("app.js usa o papel do .md", comDoc[2].papel.includes("calculadora"), comDoc[2].papel);

console.log("\n3) O texto do mapa marca quem VEM INTEIRO");
const texto = textoDoIndice(itens, ["styles.css"]);
checa("o alvo ganha a marca", texto.includes("styles.css") && texto.includes("VEM INTEIRO"), "");
checa("quem não é alvo não ganha marca",
  texto.split("\n").filter((l) => l.includes("VEM INTEIRO")).length === 1);

console.log("\n4) Tamanho legível não mente");
checa("14000 → 14,0 mil", tamanhoLegivel(14000) === "14,0 mil", tamanhoLegivel(14000));
checa("890 → 890", tamanhoLegivel(890) === "890", tamanhoLegivel(890));

// ── 2. PROJETO PEQUENO NÃO MUDA ──────────────────────────────────────────────
console.log("\n5) Projeto pequeno continua mandando tudo (sem regressão)");
checa("3 arquivos = pequeno", projetoPequeno(grande.slice(0, 3)) === true);
checa("7 arquivos = grande", projetoPequeno(grande) === false);
checa("soma os chars", tamanhoTotal(grande.slice(0, 3)) === 37000, `${tamanhoTotal(grande.slice(0, 3))}`);
checa("1 arquivo gigante = grande",
  projetoPequeno([{ nome: "index.html", conteudo: "x".repeat(100000) }]) === false);

// ── 3. ESCOLHER O ALVO ───────────────────────────────────────────────────────
console.log("\n6) O pedido nomeia o arquivo");
checa("acha styles.css pelo nome",
  JSON.stringify(alvosCitados(grande, "muda a cor do botão no styles.css")) === '["styles.css"]',
  JSON.stringify(alvosCitados(grande, "muda a cor do botão no styles.css")));
checa("acha sobre.html", JSON.stringify(alvosCitados(grande, "na página sobre.html troca o título")) === '["sobre.html"]');

console.log("\n7) O pedido fala o TIPO (o que a pessoa realmente escreve)");
checa("'muda o css' → styles.css",
  JSON.stringify(alvosCitados(grande, "muda o css do cabeçalho")) === '["styles.css"]',
  JSON.stringify(alvosCitados(grande, "muda o css do cabeçalho")));
checa("'no javascript' → app.js",
  JSON.stringify(alvosCitados(grande, "conserta o javascript do formulário")) === '["app.js"]',
  JSON.stringify(alvosCitados(grande, "conserta o javascript do formulário")));
checa("'no html' → TODOS os html",
  alvosCitados(grande, "muda o html").length === 3, JSON.stringify(alvosCitados(grande, "muda o html")));

console.log("\n8) Pedido que não aponta nada → vazio (aí o roteador decide)");
checa("'deixa mais bonito' → []",
  alvosCitados(grande, "deixa mais bonito").length === 0,
  JSON.stringify(alvosCitados(grande, "deixa mais bonito")));

console.log("\n9) Fallback: entrada primeiro, dentro do teto");
const padrao = alvosPorPadrao(grande, 20000);
checa("index.html entra primeiro", padrao[0] === "index.html", JSON.stringify(padrao));
checa("não estoura o teto", padrao.reduce((s, n) => s + (grande.find((a) => a.nome === n)?.conteudo.length || 0), 0) <= 24000);

// ── 4. ESCALAÇÃO ─────────────────────────────────────────────────────────────
console.log("\n10) O modelo PEDE o arquivo que faltou");
checa("formato de uma linha",
  JSON.stringify(extrairPedidosDeArquivo("=== PRECISA: styles.css ===")) === '["styles.css"]',
  JSON.stringify(extrairPedidosDeArquivo("=== PRECISA: styles.css ===")));
checa("vários separados por vírgula",
  JSON.stringify(extrairPedidosDeArquivo("=== PRECISA: styles.css, app.js ===")) === '["styles.css","app.js"]',
  JSON.stringify(extrairPedidosDeArquivo("=== PRECISA: styles.css, app.js ===")));
checa("bloco com uma linha por arquivo",
  extrairPedidosDeArquivo("=== PRECISA:\n- styles.css\n- app.js\n===").length === 2,
  JSON.stringify(extrairPedidosDeArquivo("=== PRECISA:\n- styles.css\n- app.js\n===")));
checa("sem pedido → vazio", extrairPedidosDeArquivo("=== RESUMO ===\ntudo certo").length === 0);

console.log("\n11) Resposta que é SÓ pedido (não houve edição)");
checa("só o pedido → true", ehSoPedidoDeArquivo("=== PRECISA: styles.css ===") === true);
checa("pedido + edição → false",
  ehSoPedidoDeArquivo("=== PRECISA: styles.css ===\n=== EDIT: index.html ===\n@@BUSCAR\na\n@@TROCAR\nb\n@@FIM") === false);
checa("edição normal → false", ehSoPedidoDeArquivo("=== EDIT: index.html ===\n@@BUSCAR\na\n@@TROCAR\nb\n@@FIM") === false);

console.log(`\nRESULTADO: ${ok} ok, ${falhou} falhou`);
process.exit(falhou === 0 ? 0 : 1);
