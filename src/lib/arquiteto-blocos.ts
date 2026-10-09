// BIBLIOTECA DE BLOCOS do Arquiteto — o item 9 do dono: "blocos/componentes
// reutilizáveis". Antes disto, TODO projeto nascia de uma página em branco.
//
// O QUE É: um punhado CURADO de blocos reais (cabeçalho, hero, três benefícios,
// preços, contato e rodapé). Cada bloco é HTML + CSS de verdade — sem dependência
// externa, sem imagem hospedada fora, sem JS. Nada de "componente" que só existe
// no papel.
//
// TOKENS DE DESIGN: todo bloco usa as variáveis do painel de tokens do projeto
// (`var(--cor-primaria, #ff751f)` e companhia) com o valor PADRÃO do Arquiteto
// como reserva honesta. É o que faz o bloco OBEDECER ao painel: mudar
// `--cor-primaria` repinta o botão do bloco sem escrever CSS novo. Nenhuma cor
// que o token cobre é fixada à mão.
//
// SEM COLISÃO: as classes levam o prefixo do bloco (`bloco-hero__titulo`,
// `bloco-precos__cta`, …), então o CSS do bloco nunca briga com o do projeto.
//
// REGRA DE INSERÇÃO (uma só, previsível):
//   1. a MARCAÇÃO entra no HTML de ENTRADA (index.html), imediatamente ANTES do
//      ÚLTIMO `</body>` — depois do conteúdo e dos scripts do projeto;
//   2. o CSS entra no STYLESHEET do projeto: a folha local citada pelo HTML de
//      entrada em `<link rel="stylesheet">`; sem essa citação, um `styles.css`
//      do projeto; sem nenhum dos dois, o CSS vai para um `styles.css` NOVO e o
//      `<link>` é acrescentado no `<head>`;
//   3. projeto SEM HTML (bancada vazia): o primeiro bloco CRIA o projeto base
//      (`index.html` + `styles.css` com a base de tokens) — é o fim da página em
//      branco de verdade.
// Sem asset nenhum: os blocos não referenciam imagem, então nunca há referência
// quebrada. Quem quiser usar uma imagem já enviada pede na conversa — o caminho
// de geração já recebe a LISTA de imagens do projeto.
//
// PURO e seguro: aqui não há `fs`, `window` nem estado — só texto e funções
// puras. Serve ao cliente e, se precisar, ao servidor.

export type ArquivoBloco = { nome: string; conteudo: string };

export type Bloco = {
  id: string;
  nome: string;
  descricao: string;
  html: string;
  css: string;
};

export type ResultadoBloco = {
  arquivos: ArquivoBloco[];
  /** Onde o CSS foi parar — o nome REAL do arquivo, nada inventado. */
  alvoCss: string;
  /** true quando não havia projeto e o bloco criou o index.html + styles.css. */
  criouProjeto: boolean;
};

/* ── Os valores de reserva dos tokens (os mesmos PADRÃO do Arquiteto) ────────
   Honestidade: se o painel não injetar a variável, o bloco continua legível —
   nunca um `var()` vazio que deixa o texto preto no preto. */
const F_PRIMARIA = "#ff751f";
const F_FUNDO = "#ffffff";
const F_TEXTO = "#1a1c1f";
const F_FONTE = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const F_RAIO = "12px";
const F_ESPACO = "16px";

/** Atalho de leitura: `v("cor-primaria", F_PRIMARIA)` → `var(--cor-primaria, …)`. */
function v(nome: string, reserva: string): string {
  return `var(--${nome}, ${reserva})`;
}

const T_PRIMARIA = v("cor-primaria", F_PRIMARIA);
const T_FUNDO = v("cor-fundo", F_FUNDO);
const T_TEXTO = v("cor-texto", F_TEXTO);
const T_FONTE = v("fonte", F_FONTE);
const T_RAIO = v("raio", F_RAIO);
const T_ESPACO = v("espaco", F_ESPACO);

/** Espaço base multiplicado (ex.: 1.5 × --espaco). Mantém a escala do painel. */
const e = (mult: number): string => `calc(${T_ESPACO} * ${mult})`;

/* ── BASE de um projeto criado por bloco: os tokens mandam no fundo e na fonte. */
const BASE_CSS = `*{box-sizing:border-box}
body{margin:0;background:${T_FUNDO};color:${T_TEXTO};font-family:${T_FONTE}}`;

/* ── OS SEIS BLOCOS ────────────────────────────────────────────────────────── */

const BLOCO_CABECALHO: Bloco = {
  id: "cabecalho",
  nome: "Cabeçalho / navegação",
  descricao: "Topo com marca, menu de links e botão de ação.",
  html: `<header class="bloco-cabecalho" data-bloco="cabecalho">
  <div class="bloco-cabecalho__interno">
    <a class="bloco-cabecalho__marca" href="#inicio">Minha Marca</a>
    <nav class="bloco-cabecalho__nav" aria-label="Navegação principal">
      <a class="bloco-cabecalho__link" href="#beneficios">Benefícios</a>
      <a class="bloco-cabecalho__link" href="#precos">Preços</a>
      <a class="bloco-cabecalho__link" href="#contato">Contato</a>
    </nav>
    <a class="bloco-cabecalho__cta" href="#contato">Começar</a>
  </div>
</header>`,
  css: `.bloco-cabecalho { background: ${T_FUNDO}; color: ${T_TEXTO}; font-family: ${T_FONTE}; border-bottom: 1px solid rgba(0, 0, 0, 0.08); }
.bloco-cabecalho__interno { max-width: 1080px; margin: 0 auto; padding: ${e(0.75)} ${e(1.25)}; display: flex; align-items: center; gap: ${e(1)}; flex-wrap: wrap; }
.bloco-cabecalho__marca { font-size: 1.15rem; font-weight: 700; color: ${T_TEXTO}; text-decoration: none; letter-spacing: -0.01em; }
.bloco-cabecalho__nav { display: flex; align-items: center; gap: ${e(1.25)}; margin-left: auto; flex-wrap: wrap; }
.bloco-cabecalho__link { color: ${T_TEXTO}; opacity: 0.75; text-decoration: none; font-size: 0.95rem; }
.bloco-cabecalho__link:hover { opacity: 1; color: ${T_PRIMARIA}; }
.bloco-cabecalho__cta { background: ${T_PRIMARIA}; color: ${T_FUNDO}; border-radius: ${T_RAIO}; padding: ${e(0.5)} ${e(1)}; text-decoration: none; font-size: 0.95rem; font-weight: 600; }
@media (max-width: 640px) { .bloco-cabecalho__nav { display: none; } }`,
};

const BLOCO_HERO: Bloco = {
  id: "hero",
  nome: "Hero",
  descricao: "Abertura com título, subtítulo e dois botões.",
  html: `<section class="bloco-hero" id="inicio" data-bloco="hero">
  <div class="bloco-hero__interno">
    <p class="bloco-hero__selo">Novo</p>
    <h1 class="bloco-hero__titulo">Diga em uma frase o que você faz</h1>
    <p class="bloco-hero__texto">Explique, em duas linhas, o valor da sua oferta e para quem ela é. Troque este texto pelo seu.</p>
    <div class="bloco-hero__acoes">
      <a class="bloco-hero__botao bloco-hero__botao--principal" href="#contato">Quero começar</a>
      <a class="bloco-hero__botao" href="#precos">Ver preços</a>
    </div>
  </div>
</section>`,
  css: `.bloco-hero { background: ${T_FUNDO}; color: ${T_TEXTO}; font-family: ${T_FONTE}; padding: ${e(3.5)} ${e(1.25)}; }
.bloco-hero__interno { max-width: 760px; margin: 0 auto; text-align: center; }
.bloco-hero__selo { display: inline-block; margin: 0 0 ${e(0.75)}; padding: ${e(0.25)} ${e(0.75)}; border-radius: 999px; border: 1px solid ${T_PRIMARIA}; color: ${T_PRIMARIA}; font-size: 0.8rem; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
.bloco-hero__titulo { font-size: clamp(1.8rem, 5vw, 3rem); line-height: 1.1; margin: 0 0 ${e(1)}; letter-spacing: -0.02em; }
.bloco-hero__texto { font-size: 1.05rem; line-height: 1.7; opacity: 0.8; margin: 0 0 ${e(1.5)}; }
.bloco-hero__acoes { display: flex; gap: ${e(0.75)}; justify-content: center; flex-wrap: wrap; }
.bloco-hero__botao { display: inline-block; padding: ${e(0.75)} ${e(1.5)}; border-radius: ${T_RAIO}; text-decoration: none; font-weight: 600; color: ${T_TEXTO}; border: 1px solid rgba(0, 0, 0, 0.12); }
.bloco-hero__botao--principal { background: ${T_PRIMARIA}; color: ${T_FUNDO}; border-color: transparent; }`,
};

const BLOCO_BENEFICIOS: Bloco = {
  id: "beneficios",
  nome: "Três benefícios (cards)",
  descricao: "Seção com três cartões de vantagem, numerados.",
  html: `<section class="bloco-beneficios" id="beneficios" data-bloco="beneficios">
  <div class="bloco-beneficios__interno">
    <h2 class="bloco-beneficios__titulo">Três motivos para escolher</h2>
    <p class="bloco-beneficios__sub">Troque estes títulos e textos pelos seus diferenciais reais.</p>
    <div class="bloco-beneficios__grade">
      <article class="bloco-beneficios__card">
        <span class="bloco-beneficios__marca" aria-hidden="true">01</span>
        <h3 class="bloco-beneficios__card-titulo">Benefício um</h3>
        <p class="bloco-beneficios__card-texto">Descreva o primeiro motivo, em uma ou duas linhas.</p>
      </article>
      <article class="bloco-beneficios__card">
        <span class="bloco-beneficios__marca" aria-hidden="true">02</span>
        <h3 class="bloco-beneficios__card-titulo">Benefício dois</h3>
        <p class="bloco-beneficios__card-texto">Descreva o segundo motivo, com um número se tiver.</p>
      </article>
      <article class="bloco-beneficios__card">
        <span class="bloco-beneficios__marca" aria-hidden="true">03</span>
        <h3 class="bloco-beneficios__card-titulo">Benefício três</h3>
        <p class="bloco-beneficios__card-texto">Descreva o terceiro motivo, fechando a proposta.</p>
      </article>
    </div>
  </div>
</section>`,
  css: `.bloco-beneficios { background: ${T_FUNDO}; color: ${T_TEXTO}; font-family: ${T_FONTE}; padding: ${e(2.5)} ${e(1.25)}; }
.bloco-beneficios__interno { max-width: 1080px; margin: 0 auto; }
.bloco-beneficios__titulo { font-size: clamp(1.4rem, 3vw, 2rem); margin: 0 0 ${e(0.5)}; text-align: center; letter-spacing: -0.01em; }
.bloco-beneficios__sub { margin: 0 0 ${e(1.75)}; text-align: center; opacity: 0.75; }
.bloco-beneficios__grade { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: ${e(1)}; }
.bloco-beneficios__card { border: 1px solid rgba(0, 0, 0, 0.1); border-radius: ${T_RAIO}; padding: ${e(1.25)}; background: ${T_FUNDO}; }
.bloco-beneficios__marca { display: inline-block; font-weight: 700; font-size: 0.85rem; letter-spacing: 0.08em; color: ${T_PRIMARIA}; }
.bloco-beneficios__card-titulo { margin: ${e(0.5)} 0 ${e(0.5)}; font-size: 1.05rem; }
.bloco-beneficios__card-texto { margin: 0; line-height: 1.65; opacity: 0.8; font-size: 0.95rem; }`,
};

const BLOCO_PRECOS: Bloco = {
  id: "precos",
  nome: "Preços",
  descricao: "Três planos lado a lado, com o do meio em destaque.",
  html: `<section class="bloco-precos" id="precos" data-bloco="precos">
  <div class="bloco-precos__interno">
    <h2 class="bloco-precos__titulo">Planos</h2>
    <p class="bloco-precos__sub">Escolha o plano que cabe no seu momento.</p>
    <div class="bloco-precos__grade">
      <article class="bloco-precos__plano">
        <h3 class="bloco-precos__nome">Essencial</h3>
        <p class="bloco-precos__preco"><span class="bloco-precos__simbolo">R$</span>97<span class="bloco-precos__periodo">/mês</span></p>
        <ul class="bloco-precos__lista">
          <li class="bloco-precos__item">O que está incluso</li>
          <li class="bloco-precos__item">Outro item incluso</li>
          <li class="bloco-precos__item">Suporte por e-mail</li>
        </ul>
        <a class="bloco-precos__cta" href="#contato">Assinar Essencial</a>
      </article>
      <article class="bloco-precos__plano bloco-precos__plano--destaque">
        <h3 class="bloco-precos__nome">Pro</h3>
        <p class="bloco-precos__preco"><span class="bloco-precos__simbolo">R$</span>197<span class="bloco-precos__periodo">/mês</span></p>
        <ul class="bloco-precos__lista">
          <li class="bloco-precos__item">Tudo do Essencial</li>
          <li class="bloco-precos__item">Recurso principal</li>
          <li class="bloco-precos__item">Suporte prioritário</li>
        </ul>
        <a class="bloco-precos__cta" href="#contato">Assinar Pro</a>
      </article>
      <article class="bloco-precos__plano">
        <h3 class="bloco-precos__nome">Escala</h3>
        <p class="bloco-precos__preco"><span class="bloco-precos__simbolo">R$</span>497<span class="bloco-precos__periodo">/mês</span></p>
        <ul class="bloco-precos__lista">
          <li class="bloco-precos__item">Tudo do Pro</li>
          <li class="bloco-precos__item">Vários usuários</li>
          <li class="bloco-precos__item">Acompanhamento dedicado</li>
        </ul>
        <a class="bloco-precos__cta" href="#contato">Assinar Escala</a>
      </article>
    </div>
  </div>
</section>`,
  css: `.bloco-precos { background: ${T_FUNDO}; color: ${T_TEXTO}; font-family: ${T_FONTE}; padding: ${e(2.5)} ${e(1.25)}; }
.bloco-precos__interno { max-width: 1080px; margin: 0 auto; }
.bloco-precos__titulo { font-size: clamp(1.4rem, 3vw, 2rem); margin: 0 0 ${e(0.5)}; text-align: center; letter-spacing: -0.01em; }
.bloco-precos__sub { margin: 0 0 ${e(1.75)}; text-align: center; opacity: 0.75; }
.bloco-precos__grade { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: ${e(1)}; align-items: stretch; }
.bloco-precos__plano { display: flex; flex-direction: column; border: 1px solid rgba(0, 0, 0, 0.1); border-radius: ${T_RAIO}; padding: ${e(1.25)}; background: ${T_FUNDO}; }
.bloco-precos__plano--destaque { border: 2px solid ${T_PRIMARIA}; box-shadow: 0 12px 32px rgba(0, 0, 0, 0.1); }
.bloco-precos__nome { margin: 0 0 ${e(0.5)}; font-size: 1.05rem; }
.bloco-precos__preco { margin: 0 0 ${e(1)}; font-size: 2rem; font-weight: 700; letter-spacing: -0.02em; }
.bloco-precos__simbolo { font-size: 1rem; font-weight: 600; opacity: 0.7; margin-right: 2px; }
.bloco-precos__periodo { font-size: 0.95rem; font-weight: 500; opacity: 0.7; }
.bloco-precos__lista { list-style: none; margin: 0 0 ${e(1.25)}; padding: 0; display: grid; gap: ${e(0.5)}; }
.bloco-precos__item { line-height: 1.5; opacity: 0.85; font-size: 0.95rem; padding-left: 1.15rem; position: relative; }
.bloco-precos__item::before { content: "✓"; position: absolute; left: 0; color: ${T_PRIMARIA}; font-weight: 700; }
.bloco-precos__cta { margin-top: auto; display: block; text-align: center; text-decoration: none; font-weight: 600; background: ${T_PRIMARIA}; color: ${T_FUNDO}; border-radius: ${T_RAIO}; padding: ${e(0.75)} ${e(1)}; }`,
};

const BLOCO_CONTATO: Bloco = {
  id: "contato",
  nome: "Formulário de contato",
  descricao: "Campos de nome, e-mail e mensagem, com botão de envio.",
  html: `<section class="bloco-contato" id="contato" data-bloco="contato">
  <div class="bloco-contato__interno">
    <h2 class="bloco-contato__titulo">Fale com a gente</h2>
    <p class="bloco-contato__sub">Responda em até um dia útil. Troque este texto pelo seu.</p>
    <form class="bloco-contato__form" action="#" method="post">
      <label class="bloco-contato__campo">
        <span class="bloco-contato__rotulo">Nome</span>
        <input class="bloco-contato__entrada" type="text" name="nome" placeholder="Seu nome" autocomplete="name">
      </label>
      <label class="bloco-contato__campo">
        <span class="bloco-contato__rotulo">E-mail</span>
        <input class="bloco-contato__entrada" type="email" name="email" placeholder="voce@exemplo.com" autocomplete="email">
      </label>
      <label class="bloco-contato__campo">
        <span class="bloco-contato__rotulo">Mensagem</span>
        <textarea class="bloco-contato__entrada" name="mensagem" rows="4" placeholder="Como podemos ajudar?"></textarea>
      </label>
      <button class="bloco-contato__enviar" type="submit">Enviar mensagem</button>
    </form>
    <p class="bloco-contato__nota">Ponto de partida: este formulário ainda não envia nada — ligue-o ao seu serviço de envio quando quiser.</p>
  </div>
</section>`,
  css: `.bloco-contato { background: ${T_FUNDO}; color: ${T_TEXTO}; font-family: ${T_FONTE}; padding: ${e(2.5)} ${e(1.25)}; }
.bloco-contato__interno { max-width: 640px; margin: 0 auto; }
.bloco-contato__titulo { font-size: clamp(1.4rem, 3vw, 2rem); margin: 0 0 ${e(0.5)}; text-align: center; letter-spacing: -0.01em; }
.bloco-contato__sub { margin: 0 0 ${e(1.5)}; text-align: center; opacity: 0.75; }
.bloco-contato__form { display: grid; gap: ${e(1)}; }
.bloco-contato__campo { display: grid; gap: ${e(0.35)}; }
.bloco-contato__rotulo { font-size: 0.85rem; font-weight: 600; opacity: 0.85; }
.bloco-contato__entrada { width: 100%; font-family: inherit; font-size: 0.95rem; color: ${T_TEXTO}; background: ${T_FUNDO}; border: 1px solid rgba(0, 0, 0, 0.15); border-radius: ${T_RAIO}; padding: ${e(0.6)} ${e(0.75)}; }
.bloco-contato__entrada:focus { outline: 2px solid ${T_PRIMARIA}; outline-offset: 1px; }
.bloco-contato__enviar { justify-self: start; font-family: inherit; font-size: 0.95rem; font-weight: 600; cursor: pointer; border: 0; background: ${T_PRIMARIA}; color: ${T_FUNDO}; border-radius: ${T_RAIO}; padding: ${e(0.75)} ${e(1.5)}; }
.bloco-contato__nota { margin: ${e(1)} 0 0; font-size: 0.8rem; opacity: 0.6; text-align: center; }`,
};

const BLOCO_RODAPE: Bloco = {
  id: "rodape",
  nome: "Rodapé",
  descricao: "Fecho com marca, links e aviso de direitos.",
  html: `<footer class="bloco-rodape" data-bloco="rodape">
  <div class="bloco-rodape__interno">
    <p class="bloco-rodape__marca">Minha Marca</p>
    <nav class="bloco-rodape__links" aria-label="Links do rodapé">
      <a class="bloco-rodape__link" href="#inicio">Início</a>
      <a class="bloco-rodape__link" href="#precos">Preços</a>
      <a class="bloco-rodape__link" href="#contato">Contato</a>
    </nav>
    <p class="bloco-rodape__fim">© Minha Marca — todos os direitos reservados.</p>
  </div>
</footer>`,
  css: `.bloco-rodape { background: ${T_TEXTO}; color: ${T_FUNDO}; font-family: ${T_FONTE}; padding: ${e(2)} ${e(1.25)}; }
.bloco-rodape__interno { max-width: 1080px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; gap: ${e(1)}; flex-wrap: wrap; }
.bloco-rodape__marca { margin: 0; font-weight: 700; }
.bloco-rodape__links { display: flex; gap: ${e(1.25)}; flex-wrap: wrap; }
.bloco-rodape__link { color: ${T_FUNDO}; opacity: 0.8; text-decoration: none; font-size: 0.95rem; }
.bloco-rodape__link:hover { opacity: 1; color: ${T_PRIMARIA}; }
.bloco-rodape__fim { margin: 0; font-size: 0.85rem; opacity: 0.65; }`,
};

/** A biblioteca CURADA, na ordem em que aparece na bancada. */
export const BLOCOS: Bloco[] = [
  BLOCO_CABECALHO,
  BLOCO_HERO,
  BLOCO_BENEFICIOS,
  BLOCO_PRECOS,
  BLOCO_CONTATO,
  BLOCO_RODAPE,
];

/* ── HELPERS de caminho (mesma ideia dos do bundler: nome-base ou caminho todo) */

function caminhoRel(p: string): string {
  return p.trim().replace(/^\.?\//, "").toLowerCase();
}

function acharArquivoPorRef(arquivos: ArquivoBloco[], ref: string): ArquivoBloco | undefined {
  const alvo = caminhoRel(ref);
  const base = alvo.split("/").pop() || alvo;
  return (
    arquivos.find((a) => caminhoRel(a.nome) === alvo) ??
    arquivos.find((a) => caminhoRel(a.nome) === base) ??
    arquivos.find((a) => (caminhoRel(a.nome).split("/").pop() || "") === base)
  );
}

/** O HTML de ENTRADA do projeto: `index.html` ou o primeiro `.html`. */
function acharEntrada(arquivos: ArquivoBloco[]): ArquivoBloco | null {
  const baixo = (s: string) => s.trim().toLowerCase();
  return (
    arquivos.find((a) => baixo(a.nome) === "index.html") ??
    arquivos.find((a) => baixo(a.nome).endsWith(".html")) ??
    null
  );
}

/** Junta pedaços de CSS sem duplicar linha em branco nem perder texto. */
function juntarCss(...partes: string[]): string {
  return (
    partes
      .map((p) => (p || "").replace(/\s+$/, ""))
      .filter((p) => p.trim().length > 0)
      .join("\n\n") + "\n"
  );
}

/** O HTML do bloco entra antes do ÚLTIMO `</body>`; sem ele, no fim do arquivo. */
function inserirAntesDoFimDoBody(html: string, trecho: string): string {
  const i = html.toLowerCase().lastIndexOf("</body>");
  if (i >= 0) return `${html.slice(0, i).replace(/\s+$/, "")}\n\n${trecho}\n${html.slice(i)}`;
  return `${html.replace(/\s+$/, "")}\n\n${trecho}\n`;
}

/** Liga um `styles.css` no `<head>` (usado só quando o projeto não tinha folha). */
function ligarStylesheet(html: string, href: string): string {
  const tag = `<link rel="stylesheet" href="${href}">`;
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `  ${tag}\n</head>`);
  return `${tag}\n${html}`;
}

/** A folha de estilo do projeto: a que o HTML de entrada cita, ou um styles.css. */
function acharAlvoCss(arquivos: ArquivoBloco[], entrada: ArquivoBloco): ArquivoBloco | null {
  const links = entrada.conteudo.match(/<link\b[^>]*>/gi) || [];
  for (const link of links) {
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(link);
    if (!href) continue;
    const rel = /rel\s*=\s*["']?([^"'>\s]+)/i.exec(link);
    if (rel && !/stylesheet/i.test(rel[1])) continue;
    if (!/\.css(\?|#|$)/i.test(href[1])) continue;
    const arq = acharArquivoPorRef(arquivos, href[1]);
    if (arq) return arq;
  }
  return arquivos.find((a) => caminhoRel(a.nome) === "styles.css") ?? null;
}

/** O comentário que marca cada pedaço inserido (dá para achar e apagar depois). */
function marcaHtml(id: string): string {
  return `<!-- Arquiteto · bloco ${id} · classes .bloco-${id}__* -->`;
}
function marcaCss(id: string): string {
  return `/* Arquiteto · bloco ${id} · classes .bloco-${id}__* */`;
}

/** O projeto base criado quando a bancada está VAZIA e a pessoa pede um bloco. */
function esqueletoHtml(bloco: Bloco): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Meu projeto</title>
<link rel="stylesheet" href="styles.css">
</head>
<body>
${marcaHtml(bloco.id)}
${bloco.html}
</body>
</html>`;
}

/**
 * APLICA um bloco no conjunto de arquivos do projeto e devolve o conjunto NOVO
 * (sem tocar no original). Pura: mesma entrada → mesma saída. É a única inserção
 * — o painel de blocos e a conversa chamam ESTA função.
 */
export function aplicarBloco(arquivos: ArquivoBloco[], bloco: Bloco): ResultadoBloco {
  const lista = (Array.isArray(arquivos) ? arquivos : []).map((a) => ({ ...a }));
  const entrada = acharEntrada(lista);

  // A) Bancada vazia (ou sem HTML): o bloco CRIA o projeto base.
  if (!entrada) {
    const iCss = lista.findIndex((a) => caminhoRel(a.nome) === "styles.css");
    const cssAntigo = iCss >= 0 ? lista[iCss].conteudo : "";
    const cssNovo = juntarCss(cssAntigo || BASE_CSS, marcaCss(bloco.id), bloco.css);
    let resto: ArquivoBloco[];
    if (iCss >= 0) {
      resto = lista.map((a, i) => (i === iCss ? { nome: a.nome, conteudo: cssNovo } : a));
    } else {
      resto = [{ nome: "styles.css", conteudo: cssNovo }, ...lista];
    }
    return {
      arquivos: [{ nome: "index.html", conteudo: esqueletoHtml(bloco) }, ...resto],
      alvoCss: iCss >= 0 ? lista[iCss].nome : "styles.css",
      criouProjeto: true,
    };
  }

  // 1) A marcação entra no HTML de entrada, antes do último </body>.
  entrada.conteudo = inserirAntesDoFimDoBody(
    entrada.conteudo,
    `${marcaHtml(bloco.id)}\n${bloco.html}`,
  );

  // 2) O CSS entra na folha do projeto — ou numa folha nova, ligada no <head>.
  const alvo = acharAlvoCss(lista, entrada);
  if (alvo) {
    alvo.conteudo = juntarCss(alvo.conteudo, marcaCss(bloco.id), bloco.css);
    return { arquivos: lista, alvoCss: alvo.nome, criouProjeto: false };
  }
  entrada.conteudo = ligarStylesheet(entrada.conteudo, "styles.css");
  return {
    arquivos: [...lista, { nome: "styles.css", conteudo: juntarCss("", marcaCss(bloco.id), bloco.css) }],
    alvoCss: "styles.css",
    criouProjeto: false,
  };
}

/* ── O PEDIDO DE BLOCO NA CONVERSA ────────────────────────────────────────────
   A conversa já constrói páginas pelo modelo — então o pedido de bloco tem de
   ser reconhecido com CUIDADO, para não roubar um pedido de página inteira.

   A regra, dita sem enfeite:
     1. a frase traz "bloco"/"blocos" → é pedido de bloco (mesmo citando
        "página"): "insira um bloco de preços";
     2. a frase fala de PÁGINA/SITE/projeto inteiro → NÃO é bloco, quem faz é o
        construtor: "quero uma página de vendas com cabeçalho e preço";
     3. sem "bloco": vale se a mensagem INTEIRA for o nome do bloco ("preços",
        "rodapé") OU se houver uma intenção de inserir até 4 palavras antes do
        termo ("adicione o cabeçalho", "quero um formulário de contato").
   Um pedido por vez: se a frase cita dois blocos, entra o PRIMEIRO citado. */

const PALAVRAS_BLOCO: { id: string; termos: string[] }[] = [
  { id: "cabecalho", termos: ["cabecalho", "header", "navegacao", "menu de navegacao", "barra de navegacao", "nav"] },
  { id: "hero", termos: ["hero", "banner", "destaque principal", "secao principal", "abertura", "jumbotron"] },
  { id: "beneficios", termos: ["beneficios", "vantagens", "diferenciais", "cards", "features"] },
  { id: "precos", termos: ["precos", "preco", "pricing", "tabela de precos", "planos"] },
  { id: "contato", termos: ["contato", "formulario", "fale conosco", "form"] },
  { id: "rodape", termos: ["rodape", "footer"] },
];

const VERBOS_INSERIR = [
  "insira", "insere", "inserir", "adiciona", "adicionar", "adicione", "acrescenta",
  "acrescente", "acrescentar", "inclua", "incluir", "coloque", "coloca", "colocar",
  "ponha", "quero", "queria", "preciso", "monte", "monta", "montar", "crie", "cria",
  "criar", "faca", "faz", "gera", "gerar", "gere", "bota", "poe",
];

const PALAVRA_PAGINA =
  /(^|\s)(pagina|paginas|site|sites|landing|one pager|one-pager|projeto|aplicativo|app|tudo|inteiro|inteira|completo|completa)(\s|$)/;

/** Minúsculas, sem acento, sem pontuação — só o que importa para casar o pedido. */
function normalizarPedido(texto: string): string {
  return (typeof texto === "string" ? texto : "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Índice (char) da primeira ocorrência do termo como PALAVRA na frase. */
function indiceDoTermo(frase: string, termo: string): number {
  const m = new RegExp(`(^|\\s)${escaparRegex(termo)}(\\s|$)`).exec(frase);
  return m ? m.index + m[1].length : -1;
}

/**
 * O bloco pedido numa frase em português — ou `null` quando a frase não é (com
 * segurança) um pedido de bloco. Pura, sem dependência e sem rede: dá para
 * testar isolada.
 */
export function blocoPorPedido(texto: string): Bloco | null {
  const frase = normalizarPedido(texto);
  if (!frase) return null;

  // 1) Onde cada bloco é citado; fica o citado MAIS CEDO na frase.
  let melhor: { bloco: Bloco; indice: number } | null = null;
  for (const grupo of PALAVRAS_BLOCO) {
    const bloco = BLOCOS.find((b) => b.id === grupo.id);
    if (!bloco) continue;
    for (const termo of grupo.termos) {
      const i = indiceDoTermo(frase, termo);
      if (i < 0) continue;
      if (!melhor || i < melhor.indice) melhor = { bloco, indice: i };
    }
  }
  if (!melhor) return null;

  // 2) "bloco" na frase é pedido explícito — vale mesmo citando "página".
  if (/(^|\s)blocos?(\s|$)/.test(frase)) return melhor.bloco;

  // 3) Pedido de página/site inteiro não é bloco: quem monta isso é o construtor.
  if (PALAVRA_PAGINA.test(frase)) return null;

  // 4) A mensagem inteira é o nome do bloco ("preços", "rodapé").
  const todosTermos = PALAVRAS_BLOCO.flatMap((g) => g.termos);
  if (todosTermos.includes(frase)) return melhor.bloco;

  // 5) Ou há uma intenção de inserir logo antes do termo (até 4 palavras).
  const antes = frase.slice(0, melhor.indice).trim().split(" ").filter(Boolean).slice(-4);
  if (antes.some((p) => VERBOS_INSERIR.includes(p))) return melhor.bloco;

  return null;
}
