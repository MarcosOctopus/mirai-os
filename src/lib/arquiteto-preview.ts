// BUNDLER da prévia do Arquiteto — a MESMA fonte para a BANCADA (workspace,
// src/app/arquiteto/page.tsx) e para a PÁGINA PÚBLICA (src/app/p/[token]).
//
// POR QUE aqui: o projeto multiarquivo (index.html + styles.css + app.js) NÃO
// consegue buscar arquivos irmãos de dentro do iframe `sandbox="allow-scripts"`
// (sem `allow-same-origin`, a origem é opaca e o navegador bloqueia). A
// resolução acontece ANTES de montar o documento: lê os arquivos do projeto e
// EMBUTE os que o HTML referencia por caminho local — `<link stylesheet>` vira
// `<style>` e `<script src>` vira `<script>`, deixando UM documento HTML só.
//
// Este módulo é PURO (nenhum API de navegador, nenhum Node): strings e regex.
// Por isso roda igual no cliente (bancada) e no servidor (página pública). Uma
// única implementação = um único caminho de verdade para "como o projeto vira
// uma página".
import { PASTA_ASSETS, sufixoDoAsset } from "./arquiteto-asset-tipos";
import { cssDeTokens, type Tokens } from "./arquiteto-tokens";

/** Um arquivo do projeto (é o que vive no banco, em `arquiteto_arquivos`). */
export type Arquivo = { nome: string; conteudo: string };

/** Espelho de um ASSET do projeto, sem os bytes. `url` é a URL de SERVIÇO
 *  (assinada) quando existe — é ela que a prévia usa para a imagem aparecer. */
export type Asset = { caminho: string; mime: string; tamanho: number; criado_em: string; url?: string };

/** A prévia embutida + a lista (honesta, em PT-BR) do que faltou. */
export type Previa = { html: string; faltando: string[] };

/** A ENTRADA do projeto: `index.html`, senão o primeiro `.html`, senão o 1º. */
export function arquivoDeEntrada(arquivos: Arquivo[]): Arquivo | null {
  const baixo = (s: string) => s.trim().toLowerCase();
  return (
    arquivos.find((a) => baixo(a.nome) === "index.html") ??
    arquivos.find((a) => baixo(a.nome).endsWith(".html")) ??
    arquivos[0] ??
    null
  );
}

/** Caminho relativo dentro do projeto (tira "./" e barra inicial, minúsculas). */
function caminhoRelativo(p: string): string {
  return p.trim().replace(/^\.?\//, "").toLowerCase();
}

/** Acha o arquivo citado por um href/src: casa o caminho inteiro ou o nome-base. */
function acharArquivo(arquivos: Arquivo[], ref: string): Arquivo | undefined {
  const alvo = caminhoRelativo(ref);
  const base = alvo.split("/").pop() || alvo;
  return (
    arquivos.find((a) => caminhoRelativo(a.nome) === alvo) ??
    arquivos.find((a) => caminhoRelativo(a.nome) === base) ??
    arquivos.find((a) => (caminhoRelativo(a.nome).split("/").pop() || "") === base)
  );
}

/** Referência externa (CDN, data:, âncora, e-mail): NÃO é arquivo local — não mexe. */
function referenciaExterna(ref: string): boolean {
  return /^(https?:)?\/\//i.test(ref) || /^(data:|mailto:|tel:|#)/i.test(ref);
}

/** Parece um caminho de imagem dentro do projeto (ex.: `assets/logo.png`)? */
function pareceAssetLocal(ref: string): boolean {
  if (referenciaExterna(ref)) return false;
  const c = caminhoRelativo(ref);
  return c.startsWith(`${PASTA_ASSETS}/`) || /\.(png|jpe?g|webp|gif|svg)$/i.test(c);
}

/** Acha o ASSET citado por um src/href/url: caminho inteiro ou nome-base. */
function acharAsset(assets: Asset[], ref: string): Asset | undefined {
  const alvo = caminhoRelativo(ref);
  const base = alvo.split("/").pop() || alvo;
  return (
    assets.find((a) => caminhoRelativo(a.caminho) === alvo) ??
    assets.find((a) => (caminhoRelativo(a.caminho).split("/").pop() || "") === base)
  );
}

/** A URL de SERVIÇO de um asset: a ASSINADA que o servidor mandou (o iframe
    sandbox tem origem opaca e o cookie SameSite=Lax não viaja até ele) — com
    queda honesta para a rota crua quando não houver token. */
export function urlDoAsset(a: Asset, base: string): string {
  return a.url || `${base}/${sufixoDoAsset(a.caminho)}`;
}

/** Dentro de um <script> embutido, "\/script" evita fechar a tag por engano. */
function protegerFechamento(codigo: string): string {
  return codigo.replace(/<\/script/gi, "<\\/script");
}

/* ── A PONTE DA PRÉVIA — o olho DENTRO do sandbox ─────────────────────────────
   O iframe é `sandbox="allow-scripts"` SEM `allow-same-origin`: o pai NÃO
   consegue ler o DOM dele. Então o PRÓPRIO documento da prévia carrega este
   script, que lê o DOM RENDERIZADO e manda uma ÁRVORE compacta para o pai.
   É usado SÓ na bancada (o workspace). A página PÚBLICA não injeta a ponte:
   ela não tem painel de camadas e não precisa de recado nenhum do sandbox. */
const PONTE_ARQUITETO = `(function(){
  if (window.__arquitetoPonte) return;
  window.__arquitetoPonte = true;
  var LIMITE = 800, seq = 0, nos = [], doms = [], alvo = null, contornoAntes = "";
  /* ESCOLHER ELEMENTO (dono, 09/10/2026): com o modo LIGADO, o clique DENTRO da
     prévia escolhe o elemento em vez de acionar a página — é assim que o pedido
     passa a saber em QUE pedaço ele mexe. Desligado, a prévia é a página de
     sempre, com os botões dela funcionando. */
  var escolhendo = false, sobre = null, sobreAntes = "", estiloCursor = null;
  function curto(el){
    var f = el.childNodes, i, t = "";
    for (i = 0; i < f.length; i++){
      if (f[i].nodeType === 3){ t = String(f[i].nodeValue || "").replace(/\\s+/g, " ").trim(); if (t) break; }
    }
    if (!t && el.children.length === 0) t = String(el.textContent || "").replace(/\\s+/g, " ").trim();
    return t.length > 42 ? t.slice(0, 42) + "\\u2026" : t;
  }
  function atribs(el){
    var saida = {}, a = el.attributes, i, n = 0;
    for (i = 0; i < a.length; i++){
      var nome = a[i].name;
      if (nome === "class" || nome === "style") continue;
      if (n >= 8) break;
      var v = String(a[i].value || "");
      saida[nome] = v.length > 64 ? v.slice(0, 64) + "\\u2026" : v;
      n++;
    }
    try {
      if ((el.tagName || "").toLowerCase() === "img") {
        saida["naturalWidth"] = String(el.naturalWidth || 0);
        saida["naturalHeight"] = String(el.naturalHeight || 0);
        saida["complete"] = String(!!el.complete);
      }
    } catch (e) {}
    return saida;
  }
  function andar(el, pai, prof){
    if (nos.length >= LIMITE) return;
    var tag = (el.tagName || "").toLowerCase();
    if (tag === "script" || tag === "style" || tag === "link" || tag === "meta" || tag === "title" || tag === "template" || tag === "noscript" || tag === "head") return;
    var cls = [];
    try { for (var c = 0; c < el.classList.length && c < 3; c++) cls.push(el.classList[c]); } catch (e) {}
    var i = nos.length;
    nos.push({ i: i, p: pai, prof: prof, tag: tag, id: el.id || "", cls: cls, txt: curto(el), atr: atribs(el) });
    doms[i] = el;
    /* O número do nó vai NO ELEMENTO (propriedade, não atributo: não aparece no
       DOM nem no HTML do projeto). É assim que o clique acha o nó em O(1). */
    try { el.__miraiNo = i; } catch (e) {}
    var f = el.children;
    for (var k = 0; k < f.length; k++){ andar(f[k], i, prof + 1); if (nos.length >= LIMITE) return; }
  }
  function montar(){ nos = []; doms = []; if (document.body) andar(document.body, -1, 0); return nos; }
  function enviar(){
    try {
      montar(); seq++;
      window.parent.postMessage({ tipo: "arquiteto:arvore", seq: seq, total: nos.length, parcial: nos.length >= LIMITE, nos: nos }, "*");
    } catch (e) {}
  }
  function limpar(silencioso){
    if (alvo){
      try { alvo.style.outline = contornoAntes; alvo.style.outlineOffset = ""; } catch (e) {}
      alvo = null; contornoAntes = "";
    }
    if (!silencioso){ try { window.parent.postMessage({ tipo: "arquiteto:destaque-limpo" }, "*"); } catch (e) {} }
  }
  function destacar(indice){
    try {
      var el = doms[indice];
      if (!el){ window.parent.postMessage({ tipo: "arquiteto:destaque-aplicado", indice: indice, ok: false }, "*"); return; }
      limpar(true);
      alvo = el; contornoAntes = el.style.outline || "";
      el.style.outline = "2px solid #ff2d95";
      el.style.outlineOffset = "2px";
      try { el.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (e) {}
      window.parent.postMessage({ tipo: "arquiteto:destaque-aplicado", indice: indice, ok: true, tag: (el.tagName || "").toLowerCase(), id: el.id || "", contorno: el.style.outline, offset: el.style.outlineOffset }, "*");
    } catch (e) {}
  }
  /* ── ESCOLHER ELEMENTO (o clique traz o nó) ───────────────────────────────
     Tudo DENTRO do sandbox: o pai não lê este DOM. O hover pinta local (sem
     recado nenhum); só o CLIQUE vira mensagem, porque é ele que muda a tela. */
  function indiceDe(el){
    var n = el;
    while (n && n.nodeType === 1){
      var i = n.__miraiNo;
      if (typeof i === "number" && isFinite(i)) return i;
      n = n.parentElement;
    }
    return -1;
  }
  function limparSobre(){
    if (sobre){
      try { sobre.style.outline = sobreAntes; sobre.style.outlineOffset = ""; } catch (e) {}
      sobre = null; sobreAntes = "";
    }
  }
  function pintarSobre(el){
    if (!el || el === alvo){ limparSobre(); return; }
    if (el === sobre) return;
    limparSobre();
    sobre = el; sobreAntes = el.style.outline || "";
    try { el.style.outline = "1px dashed rgba(255,45,149,0.75)"; el.style.outlineOffset = "1px"; } catch (e) {}
  }
  function cursorDeEscolha(ligado){
    try {
      if (!estiloCursor){
        estiloCursor = document.createElement("style");
        (document.head || document.documentElement).appendChild(estiloCursor);
      }
      estiloCursor.textContent = ligado
        ? "*, *::before, *::after { cursor: crosshair !important; }"
        : "";
    } catch (e) {}
  }
  function definirEscolher(ligado){
    escolhendo = !!ligado;
    cursorDeEscolha(escolhendo);
    if (!escolhendo) limparSobre();
  }
  document.addEventListener("mousemove", function(ev){
    if (!escolhendo) return;
    try { pintarSobre(ev.target); } catch (e) {}
  }, true);
  document.addEventListener("mouseleave", function(){ limparSobre(); }, true);
  document.addEventListener("mousedown", function(ev){
    if (!escolhendo) return;
    try { ev.preventDefault(); ev.stopPropagation(); } catch (e) {}
  }, true);
  document.addEventListener("click", function(ev){
    if (!escolhendo) return;
    var i = indiceDe(ev.target);
    if (i < 0) return;
    try { ev.preventDefault(); ev.stopPropagation(); } catch (e) {}
    try { window.parent.postMessage({ tipo: "arquiteto:clique", indice: i }, "*"); } catch (e) {}
  }, true);
  /* QUAL ELEMENTO está neste ponto — é o que o RISCO da bancada usa: o pai manda
     o ponto (em pixel do documento) e a ponte responde com o nó que está ali,
     contornando-o na hora. Serve para o círculo desenhado sobre a prévia. */
  function elementoEm(x, y){
    var i = -1, tag = "";
    try {
      var el = document.elementFromPoint(x, y);
      if (el){ tag = (el.tagName || "").toLowerCase(); i = indiceDe(el); }
    } catch (e) {}
    try {
      if (i >= 0) destacar(i);
      window.parent.postMessage({ tipo: "arquiteto:elemento-em", indice: i, tag: tag }, "*");
    } catch (e) {}
  }
  /* O TEXTO INTEIRO do nó: o retrato da árvore corta o texto, e a bancada precisa
     dele exato para trocar NO ARQUIVO sem chute. Vai com espaços colapsados (o
     casamento no arquivo é tolerante a quebra de linha). */
  function mandarTexto(i){
    var t = "", ats = {};
    try {
      if (typeof i === "number" && doms[i]) {
        t = (doms[i].textContent || "").replace(/\s+/g, " ").trim();
        var lista = doms[i].attributes || [];
        for (var k = 0; k < lista.length; k++){
          var nome = (lista[k].name || "").toLowerCase();
          if (nome === "href" || nome === "src" || nome === "alt" || nome === "title" || nome === "placeholder" || nome === "value")
            ats[nome] = lista[k].value || "";
        }
      }
    } catch (e) {}
    try { window.parent.postMessage({ tipo: "arquiteto:texto-do-no", indice: i, texto: t, atributos: ats }, "*"); } catch (e) {}
  }
  /* FOTOGRAFAR O PEDAÇO MARCADO (dono, 09/10/2026): a bancada manda o nó e os pontos
     do risco; a ponte devolve um PNG do ELEMENTO com a marca por cima. É assim que o
     construtor GANHA VISÃO — ele não vê a prévia, mas vê esta foto.
     O desenho sai por SVG + foreignObject (dentro do próprio sandbox, sem biblioteca
     e sem depender de rede). Imagem de fora vira caixa cinza: recurso de outra origem
     "suja" a tela e o PNG nem sairia. */
  function fotografar(indice, pontos){
    var avisar = function(d){ try { window.parent.postMessage(d, "*"); } catch (e) {} };
    try {
      var el = typeof indice === "number" ? doms[indice] : null;
      if (!el){ avisar({ tipo: "arquiteto:foto", indice: indice, imagem: "" }); return; }
      var r = el.getBoundingClientRect();
      var larg = Math.max(1, Math.round(r.width));
      var alt = Math.max(1, Math.round(r.height));
      var escala = 1, teto = 1200;
      if (larg > teto){ escala = teto / larg; larg = teto; alt = Math.max(1, Math.round(r.height * escala)); }

      var estilos = "";
      var folhas = document.querySelectorAll("style");
      for (var s = 0; s < folhas.length; s++) estilos += (folhas[s].textContent || "").split("]]>").join("]] >");

      var copia = el.cloneNode(true);
      var imgs = copia.querySelectorAll ? copia.querySelectorAll("img") : [];
      for (var k = 0; k < imgs.length; k++){
        var f = imgs[k];
        var caixa = document.createElement("div");
        caixa.setAttribute("style", "width:100%;height:100%;background:#d8d8de;");
        if (f.parentNode) f.parentNode.replaceChild(caixa, f);
      }

      var marcas = "";
      if (pontos && pontos.length){
        var pts = [];
        for (var p = 0; p < pontos.length; p++){
          pts.push(Math.round((pontos[p].x - r.left) * escala) + "," + Math.round((pontos[p].y - r.top) * escala));
        }
        marcas = '<polyline points="' + pts.join(" ") + '" fill="none" stroke="rgba(255,45,149,0.95)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
      }

      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + larg + '" height="' + alt + '">' +
        '<foreignObject width="100%" height="100%">' +
        '<div xmlns="http://www.w3.org/1999/xhtml" style="width:' + Math.round(r.width) + 'px;height:' + Math.round(r.height) + 'px;overflow:hidden">' +
        '<style><![CDATA[' + estilos + ']]></style>' + copia.outerHTML +
        '</div></foreignObject>' + marcas + '</svg>';

      var imagem = new Image();
      imagem.onload = function(){
        try {
          var cv = document.createElement("canvas");
          cv.width = larg; cv.height = alt;
          var ctx = cv.getContext("2d");
          ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, larg, alt);
          ctx.drawImage(imagem, 0, 0, larg, alt);
          avisar({ tipo: "arquiteto:foto", indice: indice, imagem: cv.toDataURL("image/png"), largura: larg, altura: alt });
        } catch (e) {
          avisar({ tipo: "arquiteto:foto", indice: indice, imagem: "", erro: "tela" });
        }
      };
      imagem.onerror = function(){ avisar({ tipo: "arquiteto:foto", indice: indice, imagem: "", erro: "desenho" }); };
      imagem.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    } catch (e) {
      avisar({ tipo: "arquiteto:foto", indice: indice, imagem: "", erro: "leitura" });
    }
  }
  window.addEventListener("message", function(ev){
    try {
      var d = ev.data;
      if (!d || typeof d !== "object" || typeof d.tipo !== "string") return;
      if (d.tipo === "arquiteto:pedir-arvore") enviar();
      else if (d.tipo === "arquiteto:destaque" && typeof d.indice === "number" && isFinite(d.indice) && d.indice >= 0 && d.indice % 1 === 0) destacar(d.indice);
      else if (d.tipo === "arquiteto:limpar-destaque") limpar(false);
      else if (d.tipo === "arquiteto:escolher") definirEscolher(!!d.ligado);
      else if (d.tipo === "arquiteto:elemento-em" && typeof d.x === "number" && isFinite(d.x) && typeof d.y === "number" && isFinite(d.y)) elementoEm(d.x, d.y);
      else if (d.tipo === "arquiteto:pedir-texto" && typeof d.indice === "number" && isFinite(d.indice) && d.indice >= 0) mandarTexto(d.indice);
      else if (d.tipo === "arquiteto:fotografar") fotografar(d.indice, d.pontos);
    } catch (e) {}
  }, false);
  var t = null;
  function agendar(){ if (t) clearTimeout(t); t = setTimeout(function(){ t = null; enviar(); }, 350); }
  function arrancar(){
    enviar();
    try { new MutationObserver(agendar).observe(document.body, { childList: true, subtree: true, characterData: true }); } catch (e) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar, false);
  else setTimeout(arrancar, 0);
})();`;

/** A tag da ponte — vai para o FIM do documento montado, depois dos scripts do
    projeto: o DOM já existe quando ela anda pela página. */
export const TAG_PONTE = "<script>" + PONTE_ARQUITETO + "<\/script>";

/**
 * INJETA os tokens de design na prévia como `:root { --… }`, o MAIS CEDO
 * possível: logo depois de `<head>` (ou de `<html>`, ou no começo do
 * documento). DECISÃO DE CASCATA: as variáveis são a CAMADA DE BASE. O CSS do
 * próprio projeto entra DEPOIS — o `<link stylesheet>` vira `<style>` na posição
 * em que estava — então, em empate de especificidade, quem vence é o projeto.
 */
export function injetarTokens(html: string, tokens: Tokens): string {
  const bloco = cssDeTokens(tokens);
  const mHead = html.match(/<head\b[^>]*>/i);
  if (mHead && mHead.index !== undefined) {
    const i = mHead.index + mHead[0].length;
    return html.slice(0, i) + bloco + html.slice(i);
  }
  const mHtml = html.match(/<html\b[^>]*>/i);
  if (mHtml && mHtml.index !== undefined) {
    const i = mHtml.index + mHtml[0].length;
    return html.slice(0, i) + bloco + html.slice(i);
  }
  return bloco + html;
}

/**
 * INJETA o ATALHO DAS INTEGRAÇÕES na prévia: o mapa
 * `window.MIRAI_INTEGRACOES = { <integração>: <token> }` e a função
 * `window.miraiPonte(i, caminho, opcoes)`. Entra o MAIS CEDO possível (mesma
 * técnica de `injetarTokens`: procura `<head…>`, senão `<html…>`, senão põe no
 * começo), porque o script do projeto pode querer chamar a integração já na
 * primeira linha.
 *
 * POR QUE: o site do Arquiteto é ESTÁTICO — ele NÃO pode guardar a chave. O
 * `miraiPonte` fala com a NOSSA ponte (`/api/ponte/...`) levando o TOKEN emitido
 * pelo SERVIDOR (ver a rota `…/integracoes/tokens`), escopado ao par
 * (projeto, integração). A chave de verdade fica no servidor e NUNCA entra
 * nesta página. Sem token para a integração pedida, `miraiPonte` REJEITA com
 * recado claro — JAMAIS segue sem token.
 *
 * `projetoId` vai EMBUTIDO no script: é ele que monta o endereço
 * `/api/ponte/<projeto>/<integração>/<caminho>`.
 */
export function injetarIntegracoes(
  html: string,
  projetoId: string,
  tokens: Record<string, string>,
): string {
  // O JSON vai DENTRO de um <script>: o "<" de "</" tem de virar "<\/" para
  // nunca fechar a tag por engano (mesmo cuidado do `protegerFechamento`).
  const mapaJson = JSON.stringify(tokens || {}).replace(/<\//g, "<\\/");
  const projetoJson = JSON.stringify(projetoId || "").replace(/<\//g, "<\\/");
  const script =
    `<script>window.MIRAI_INTEGRACOES = ${mapaJson};
window.miraiPonte = async function(i, caminho, opcoes){
  var mapa = window.MIRAI_INTEGRACOES || {};
  var token = mapa[i];
  if (!token) { throw new Error('a integração "' + i + '" não está disponível nesta página'); }
  var bruto = caminho == null ? "" : String(caminho);
  while (bruto.charAt(0) === "/") { bruto = bruto.slice(1); }
  var corte = bruto.indexOf("?");
  var soCaminho = corte >= 0 ? bruto.slice(0, corte) : bruto;
  var soConsulta = corte >= 0 ? bruto.slice(corte) : "";
  var url = "/api/ponte/" + ${projetoJson} + "/" + encodeURIComponent(i) + (soCaminho ? "/" + soCaminho.split("/").map(encodeURIComponent).join("/") : "") + soConsulta;
  var dadas = opcoes || {};
  var cabecalhos = {};
  var k;
  if (dadas.headers) { for (k in dadas.headers) { if (Object.prototype.hasOwnProperty.call(dadas.headers, k)) cabecalhos[k] = dadas.headers[k]; } }
  cabecalhos["x-mirai-ponte"] = token;
  var pedido = {};
  for (k in dadas) { if (Object.prototype.hasOwnProperty.call(dadas, k) && k !== "headers") pedido[k] = dadas[k]; }
  pedido.headers = cabecalhos;
  return fetch(url, pedido);
};<\/script>`;

  // Mesma régua de posição de `injetarTokens`: o mais cedo possível no documento.
  const mHead = html.match(/<head\b[^>]*>/i);
  if (mHead && mHead.index !== undefined) {
    const i = mHead.index + mHead[0].length;
    return html.slice(0, i) + script + html.slice(i);
  }
  const mHtml = html.match(/<html\b[^>]*>/i);
  if (mHtml && mHtml.index !== undefined) {
    const i = mHtml.index + mHtml[0].length;
    return html.slice(0, i) + script + html.slice(i);
  }
  return script + html;
}

/**
 * Lê os arquivos do projeto e devolve UM documento HTML com o CSS/JS locais já
 * embutidos. Arquivo citado que não existe no projeto NÃO deixa a prévia
 * quebrada em silêncio: entra uma NOTA honesta, em português, na própria página.
 *
 * ASSETS: as referências locais de IMAGEM (`<img src="assets/logo.png">`, CSS
 * `url("assets/x.png")`) são reescritas para a URL de SERVIÇO do projeto — é o
 * que faz a imagem aparecer DE VERDADE, sem base64 no banco.
 *
 * `opcoes.comPonte` (padrão `true`) injeta a PONTE do painel de camadas antes do
 * `</body>`. A página PÚBLICA passa `false`: ela não tem painel e não precisa de
 * recado do sandbox.
 *
 * `opcoes.integracoes` (opcional) injeta o ATALHO DAS INTEGRAÇÕES
 * (`window.miraiPonte` + o mapa de tokens do par projeto/integração) logo depois
 * dos tokens de design — ver `injetarIntegracoes`. SEM esta opção (ou sem token
 * algum), NADA muda: compatibilidade total.
 */
export function montarPrevia(
  arquivos: Arquivo[],
  assets: Asset[],
  baseAssets: string,
  tokens: Tokens,
  opcoes?: { comPonte?: boolean; integracoes?: { projetoId: string; tokens: Record<string, string> } },
): Previa {
  const entrada = arquivoDeEntrada(arquivos);
  if (!entrada) return { html: "", faltando: [] };

  let html = entrada.conteudo;
  const faltando: string[] = [];

  // 0) TOKENS DE DESIGN: entram na RAIZ, o mais cedo possível (ver `injetarTokens`).
  html = injetarTokens(html, tokens);

  // 0.1) ATALHO DAS INTEGRAÇÕES: quando a bancada manda os tokens do par
  //      (projeto, integração), o `window.miraiPonte` entra junto — DEPOIS dos
  //      tokens de design e SÓ quando há token. Sem esta opção, nada muda.
  const integ = opcoes?.integracoes;
  if (integ && integ.tokens && Object.keys(integ.tokens).length) {
    html = injetarIntegracoes(html, integ.projetoId, integ.tokens);
  }

  // 1) <link rel="stylesheet" href="styles.css">  →  <style>…</style>
  html = html.replace(
    /(<link\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*?>)/gi,
    (_casa: string, tag: string, ref: string) => {
      if (referenciaExterna(ref)) return tag;
      const ehCss = /\.css(\?|#|$)/i.test(ref) || /rel\s*=\s*["']?stylesheet/i.test(tag);
      if (!ehCss) return tag;
      const arq = acharArquivo(arquivos, ref);
      if (!arq) {
        faltando.push(`o HTML pede "${ref}" e esse arquivo não existe no projeto`);
        return `<!-- Arquivo ausente: ${ref} -->`;
      }
      return `<style data-arquiteto="${arq.nome}">\n${arq.conteudo}\n</style>`;
    },
  );

  // 2) <script src="app.js"></script>  →  <script>…</script> (mantém atributos)
  html = html.replace(
    /(<script\b[^>]*?src\s*=\s*["']([^"']+)["'][^>]*?>)\s*<\/script>/gi,
    (_casa: string, tagAbertura: string, ref: string) => {
      if (referenciaExterna(ref)) return tagAbertura + "</script>";
      const arq = acharArquivo(arquivos, ref);
      if (!arq) {
        faltando.push(`o HTML pede "${ref}" e esse arquivo não existe no projeto`);
        return `<!-- Arquivo ausente: ${ref} -->`;
      }
      // mantém os demais atributos (defer, type="module"…), só tira o src.
      const atributos = tagAbertura
        .replace(/^<script/i, "")
        .replace(/>$/, "")
        .replace(/\bsrc\s*=\s*["'][^"']*["']/i, "")
        .replace(/\s+/g, " ")
        .trim();
      return `<script${atributos ? " " + atributos : ""}>\n${protegerFechamento(arq.conteudo)}\n</script>`;
    },
  );

  // 3) ASSETS: reescreve as referências LOCAIS de imagem para a URL de serviço
  //    do projeto. Vale para `src`/`href`/`poster` e para `url(...)` do CSS
  //    (inclusive o CSS que acabou de ser embutido). Referência externa
  //    (http/data) passa intacta; referência que parece imagem local e não foi
  //    enviada vira uma NOTA honesta, não um quadrado quebrado em silêncio.
  if (baseAssets && assets.length) {
    let usados = 0;
    html = html.replace(
      /\b(src|href|poster)\s*=\s*(["'])([^"']+)\2/gi,
      (casa: string, attr: string, quote: string, ref: string) => {
        // <link rel="stylesheet"> já virou <style>; nada de imagem aqui.
        if (referenciaExterna(ref)) return casa;
        if (!pareceAssetLocal(ref)) return casa;
        const a = acharAsset(assets, ref);
        if (!a) {
          faltando.push(`a prévia pede a imagem "${ref}" e ela não foi enviada para o projeto`);
          return casa;
        }
        usados++;
        return `${attr}=${quote}${urlDoAsset(a, baseAssets)}${quote}`;
      },
    );
    // `url(...)` do CSS (folhas embutidas e style inline).
    html = html.replace(
      /url\(\s*(["']?)([^"')]+)\1\s*\)/gi,
      (casa: string, quote: string, ref: string) => {
        if (referenciaExterna(ref)) return casa;
        if (!pareceAssetLocal(ref)) return casa;
        const a = acharAsset(assets, ref);
        if (!a) return casa;
        usados++;
        return `url(${quote}${urlDoAsset(a, baseAssets)}${quote})`;
      },
    );
    void usados;
  }

  // 4) Faltou arquivo? A nota vai DENTRO da prévia — a pessoa vê o porquê.
  if (faltando.length) {
    const aviso =
      `<div id="__arquiteto_aviso" style="position:fixed;left:0;right:0;bottom:0;z-index:2147483647;` +
      `background:#7f1d1d;color:#fff;font:13px/1.5 system-ui,-apple-system,sans-serif;padding:10px 14px">` +
      `Prévia incompleta — ${faltando.join("; ")}.</div>`;
    html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${aviso}\n</body>`) : html + "\n" + aviso;
  }

  // 5) A PONTE entra por ÚLTIMO, logo antes do </body>: depois dos scripts do
  //    projeto, com o DOM já montado. Só na bancada (workspace).
  if (opcoes?.comPonte !== false) {
    html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${TAG_PONTE}\n</body>`) : html + "\n" + TAG_PONTE;
  }

  return { html, faltando };
}
