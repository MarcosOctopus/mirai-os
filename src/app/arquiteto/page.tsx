"use client";

// Arquiteto — a superfície de CONSTRUÇÃO, no desenho que o dono ditou:
// CONVERSA À ESQUERDA (a pessoa pede, em português) e PROJETO À DIREITA,
// atualizando ao vivo. Dois modos no painel: RESPONSIVO (troca a largura entre
// desktop, tablet e celular, dentro de uma moldura) e CÓDIGO (mostra o que foi
// gerado, com a lista de arquivos).
//
// TELA CHEIA (dono, 08/10/2026): "menu original fechado e o resto tudo full
// screen". A ferramenta é uma BANCADA de trabalho, não uma página dentro do
// menu: a casca abre com a lateral RECOLHIDA (`recolhidaInicial`) e o miolo em
// tela cheia (`cheio`), e o conteúdo ainda prende a tela no miolo com
// `.tela-cheia` — sem degrau, sem largura máxima, sem rolagem de página. O
// menu continua vivo: vira um trilho (rail) de 84px com a setinha de expandir.
//
// PORTEIRA (nasce fechado): a página pergunta a /api/arquiteto/capacidade se
// ESTA conta pode usar o Arquiteto (capacidade de risco alto
// `mirai.arquiteto.construir`). Sem a capacidade, a tela NÃO é a ferramenta —
// é um estado honesto dizendo que não está liberado e que a liberação é por
// cliente, feita pelo dono. Nunca uma UI fingindo funcionar. A trava de verdade
// está no servidor (/api/arquiteto/gerar confere de novo e devolve 403).
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent as DragEventReact, type KeyboardEvent as KeyboardEventReact } from "react";
import Link from "next/link";
import Shell from "@/components/dash/Shell";
import { CopiarTexto } from "@/components/arquiteto/CopiarTexto";
import { IconeCadeado, IconeCaret, IconeCheck, IconeDocumento, IconeEnviar, IconeFechar, IconeMais, IconeRelogio, IconeRobo, IconeSeta, IconeSetaCima, IconeImagem, IconeMonitor, IconeTablet, IconeCelular, IconeDispositivos, IconeCodigo, IconeCamadas, IconeTokens, IconeBlocos, IconeMicrofone } from "@/components/dash/icons";
import {
  MAX_ASSET_ROTULO,
  PASTA_ASSETS,
  EXTENSOES_FONTE,
  ehFonte,
  familiaDaFonte,
  mimeDeclaradoAsset,
  rotuloDeMimeAsset,
  tamanhoLegivel,
  validarAssetNoNavegador,
} from "@/lib/arquiteto-asset-tipos";
import {
  TOKENS_PADRAO,
  normalizarTokens,
  type NomeToken,
  type Tokens,
} from "@/lib/arquiteto-tokens";
// BUNDLER da prévia — a MESMA implementação usada pela página pública
// (/p/<token>). Um só caminho de verdade para "como o projeto vira uma página".
import {
  arquivoDeEntrada,
  montarPrevia,
  urlDoAsset,
  type Arquivo,
  type Asset,
  type Previa,
} from "@/lib/arquiteto-preview";
// BIBLIOTECA DE BLOCOS (item 9 do dono): blocos prontos que ENTRAM no projeto de
// verdade — marcação no HTML de entrada, CSS na folha do projeto — pela MESMA
// função, venham do painel ou da conversa. Ver src/lib/arquiteto-blocos.ts.
import {
  BLOCOS,
  aplicarBloco,
  blocoPorPedido,
  type Bloco,
} from "@/lib/arquiteto-blocos";

type Conta = { nome?: string; email?: string; ehDono?: boolean };

type Acesso = { permitido: boolean; motivo: string; capacidade: string };

type Turno = { papel: "voce" | "mirai"; texto: string; erro?: boolean; plano?: boolean };

type Projeto = { resumo: string; arquivos: Arquivo[] };

/* ── RENDERIZAÇÃO DO PLANO ───────────────────────────────────────────────────
   O plano do modo "Plano" é TEXTO estruturado (título, objetivo, passos
   numerados, decisões). Aqui ele vira formatação DE VERDADE na conversa —
   nada de '#' ou '-' crus na tela. Simples e quieto: sem tabela, sem dashboard. */

/** Inline: **negrito** e `código` (nomes de arquivo em monospace). */
function LinhaPlano({ texto }: { texto: string }) {
  const partes = texto.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return (
    <>
      {partes.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**") && p.length > 4) {
          return (
            <strong key={i} className="font-semibold text-dash-fg">
              {p.slice(2, -2)}
            </strong>
          );
        }
        if (p.startsWith("`") && p.endsWith("`") && p.length > 2) {
          return (
            <code
              key={i}
              className="rounded bg-dash-hair/[0.08] px-1 py-0.5 font-mono text-[11.5px] text-dash-brandHi"
            >
              {p.slice(1, -1)}
            </code>
          );
        }
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

type BlocoPlano =
  | { t: "h"; nivel: number; txt: string }
  | { t: "p"; txt: string }
  | { t: "ul"; itens: string[] }
  | { t: "ol"; itens: string[] };

/** Lê o texto do plano e separa em blocos: títulos, parágrafos e listas. */
function analisarPlano(texto: string): BlocoPlano[] {
  const linhas = texto.replace(/\r/g, "").split("\n");
  const blocos: BlocoPlano[] = [];
  let lista: { tipo: "ul" | "ol"; itens: string[] } | null = null;
  const fechar = () => {
    if (lista) {
      blocos.push(lista.tipo === "ul" ? { t: "ul", itens: lista.itens } : { t: "ol", itens: lista.itens });
      lista = null;
    }
  };
  for (const bruta of linhas) {
    const l = bruta.trim();
    if (!l) {
      fechar();
      continue;
    }
    const h = l.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      fechar();
      blocos.push({ t: "h", nivel: h[1].length, txt: h[2].trim() });
      continue;
    }
    // Linha inteira em negrito também é título (o modelo às vezes usa assim).
    const b = l.match(/^\*\*([^*]+)\*\*:?\s*$/);
    if (b) {
      fechar();
      blocos.push({ t: "h", nivel: 3, txt: b[1].trim() });
      continue;
    }
    const n = l.match(/^(\d+)[.)]\s+(.*)$/);
    if (n) {
      if (!lista || lista.tipo !== "ol") {
        fechar();
        lista = { tipo: "ol", itens: [] };
      }
      lista.itens.push(n[2]);
      continue;
    }
    const u = l.match(/^[-*•]\s+(.*)$/);
    if (u) {
      if (!lista || lista.tipo !== "ul") {
        fechar();
        lista = { tipo: "ul", itens: [] };
      }
      lista.itens.push(u[1]);
      continue;
    }
    fechar();
    blocos.push({ t: "p", txt: l });
  }
  fechar();
  return blocos;
}

/** O plano renderizado no chat: título, parágrafos, listas numeradas/marcadas. */
function RespostaPlano({ texto }: { texto: string }) {
  const blocos = analisarPlano(texto);
  return (
    <div className="flex flex-col gap-2.5" data-arquiteto-plano>
      {blocos.map((b, i) => {
        if (b.t === "h") {
          const cls =
            b.nivel <= 1
              ? "text-[14px] font-semibold text-dash-fg"
              : b.nivel === 2
                ? "text-[13px] font-semibold text-dash-fg"
                : "text-[11px] font-semibold uppercase tracking-[0.08em] text-dash-muted";
          return (
            <p key={i} className={cls}>
              <LinhaPlano texto={b.txt} />
            </p>
          );
        }
        if (b.t === "p") {
          return (
            <p key={i} className="text-[13px] leading-[1.65] text-dash-fg/85">
              <LinhaPlano texto={b.txt} />
            </p>
          );
        }
        if (b.t === "ul") {
          return (
            <ul key={i} className="flex flex-col gap-1.5">
              {b.itens.map((it, j) => (
                <li key={j} className="flex gap-2 text-[13px] leading-[1.6] text-dash-fg/85">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-dash-dim" />
                  <span className="min-w-0 flex-1">
                    <LinhaPlano texto={it} />
                  </span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <ol key={i} className="flex flex-col gap-1.5">
            {b.itens.map((it, j) => (
              <li key={j} className="flex gap-2.5 text-[13px] leading-[1.6] text-dash-fg/85">
                <span className="mt-[1px] grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border border-dash-hair/[0.14] text-[10px] text-dash-muted">
                  {j + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <LinhaPlano texto={it} />
                </span>
              </li>
            ))}
          </ol>
        );
      })}
    </div>
  );
}

// Espelho do que o servidor guarda em `arquiteto_projetos` (sem os arquivos).
type ProjetoResumo = {
  id: string;
  titulo: string;
  criado_em: string;
  atualizado_em: string;
  /** a pasta/categoria do projeto (null = "Sem pasta"). */
  pasta_id?: string | null;
};

// Espelho de uma PASTA (a categoria que agrupa projetos — dono, 11/10/2026).
type PastaResumo = { id: string; nome: string; projetos?: number };

// Espelho de uma VERSÃO do projeto (a história). Sem o conteúdo dos arquivos —
// a lista é leve de propósito; só nomes + uma impressão do texto (`assinatura`).
type VersaoResumo = {
  numero: number;
  criado_em: string;
  caminhos: string[];
  assinatura: string;
};

type Modo = "responsivo" | "codigo";

// LARGURA da prévia: os três presets agora são só VALORES de largura — a
// largura exata em px entra no MESMO alvo. "desktop" = 100% do painel.
type PresetLargura = "desktop" | "tablet" | "celular";

/* ── CAMADAS: o nó compacto que a PONTE manda da prévia ──────────────────────
   É um retrato SÓ DE LEITURA do DOM renderizado: índice (`i`), pai (`p`),
   profundidade, tag, id, classes, um texto curto e até 8 atributos. Nada aqui é
   executado — só exibido como TEXTO. */
type NoCamada = {
  i: number;
  p: number;
  prof: number;
  tag: string;
  id: string;
  cls: string[];
  txt: string;
  atr: Record<string, string>;
};

/** O estado honesto da ponte: ocioso (sem prévia), aguardando, respondeu, ou
    NÃO respondeu (o sandbox pode ter travado num script do projeto). */
type EstadoPonte = "ocioso" | "aguardando" | "ok" | "sem-resposta";

const LARGURA_PRESET: Record<PresetLargura, number | null> = {
  desktop: null, // sem moldura de largura: ocupa o painel todo (100%)
  tablet: 820,
  celular: 400,
};

const ROTULO_PRESET: Record<PresetLargura, string> = {
  desktop: "Desktop",
  tablet: "Tablet",
  celular: "Celular",
};

/* Os presets viraram ÍCONES: o texto some do visível, mas o rótulo PT-BR fica
   no title (tooltip) e num aria-label mais descritivo, para não ficar mudo. */
const ARIA_PRESET: Record<PresetLargura, string> = {
  desktop: "Ver no computador (desktop)",
  tablet: "Ver no tablet",
  celular: "Ver no celular",
};

// LARGURA EXATA (px): a mesma régua dos presets, com limites honestos.
const LARGURA_MIN = 200;
const LARGURA_MAX = 4000;
// ZOOM da prévia (%), em passos sensatos. Só a moldura escala — o chrome não.
const ZOOM_PASSOS = [25, 50, 75, 100, 125, 150, 200] as const;
// Recuo da área da prévia (p-4 = 16px de cada lado): o que sobra para a moldura.
const RECUO_PREVIA = 32;

/* ── TOKENS DE DESIGN (item 8 do dono) ────────────────────────────────────────
   O conjunto CURADO: três cores, a fonte, o raio de borda e o espaçamento base.
   O painel edita; o bundler injeta na prévia como variáveis CSS na raiz (ver
   `injetarTokens`, abaixo). Nada de editor de tema inteiro: um punhado de tokens
   que se usa em todo lugar vale mais. */
const ROTULO_TOKEN: Record<NomeToken, string> = {
  "cor-primaria": "Cor primária",
  "cor-fundo": "Cor de fundo",
  "cor-texto": "Cor do texto",
  fonte: "Fonte",
  raio: "Raio de borda",
  espaco: "Espaçamento",
};
// Os tokens que são COR (ganham seletor de cor) — os outros são texto/número.
const TOKENS_COR: NomeToken[] = ["cor-primaria", "cor-fundo", "cor-texto"];
// Tokens de MEDIDA (número em px).
const TOKENS_MEDIDA: NomeToken[] = ["raio", "espaco"];

// Teto do histórico de DESFAZER/REFAZER — pilha LIMITADA (não cresce sem fim).
const LIMITE_UNDO = 30;

/** Data/hora curta, em pt-BR. Sem número inventado: se não der, devolve vazio. */
function formatarData(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

/**
 * Uma frase curta do que MUDOU entre duas versões — sempre DERIVADA dos dois
 * snapshots (nomes + assinatura de conteúdo). Nada é inventado: se os nomes não
 * mudaram e o texto é o mesmo, diz que não houve mudança.
 */
function descreverMudanca(anterior: VersaoResumo | undefined, v: VersaoResumo): string {
  if (!anterior) return "criação do projeto";
  const antes = new Set(anterior.caminhos);
  const agora = new Set(v.caminhos);
  const somados = v.caminhos.filter((c) => !antes.has(c));
  const tirados = anterior.caminhos.filter((c) => !agora.has(c));
  const partes: string[] = [];
  if (somados.length) partes.push(`+ ${somados.join(", ")}`);
  if (tirados.length) partes.push(`− ${tirados.join(", ")}`);
  if (partes.length) return partes.join(" · ");
  if (anterior.assinatura !== v.assinatura) return "conteúdo atualizado";
  return "sem mudança";
}

/* ── CAMADAS: saneamento do que vem da ponte + honestidade do arquivo ─────── */

/** Escapa um trecho para caber dentro de uma RegExp. */
function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * SANEIA um nó vindo do sandbox. A mensagem NUNCA é confiada: só campos com o
 * tipo certo passam (o resto é descartado), o texto é usado como TEXTO (nunca
 * HTML) e os números viram inteiros. Devolve `null` se nem tag nem índice derem.
 */
function sanearNo(bruto: unknown): NoCamada | null {
  if (!bruto || typeof bruto !== "object") return null;
  const o = bruto as Record<string, unknown>;
  const i = typeof o.i === "number" && Number.isFinite(o.i) ? Math.floor(o.i) : -1;
  const tag = typeof o.tag === "string" ? o.tag.toLowerCase().replace(/[^a-z0-9-]/g, "") : "";
  if (i < 0 || !tag) return null;
  const p = typeof o.p === "number" && Number.isFinite(o.p) ? Math.floor(o.p) : -1;
  const prof = typeof o.prof === "number" && Number.isFinite(o.prof) ? Math.max(0, Math.floor(o.prof)) : 0;
  const id = typeof o.id === "string" ? o.id.slice(0, 120) : "";
  const cls = Array.isArray(o.cls)
    ? (o.cls.filter((c) => typeof c === "string").slice(0, 3) as string[]).map((c) => c.slice(0, 80))
    : [];
  const txt = typeof o.txt === "string" ? o.txt.slice(0, 120) : "";
  const atr: Record<string, string> = {};
  if (o.atr && typeof o.atr === "object") {
    for (const [k, v] of Object.entries(o.atr as Record<string, unknown>)) {
      if (typeof v !== "string") continue;
      atr[String(k).slice(0, 60)] = v.slice(0, 64);
      if (Object.keys(atr).length >= 8) break;
    }
  }
  return { i, p, prof, tag, id, cls, txt, atr };
}

/** O rótulo curto de uma camada: #id · .classe · “texto”. Vazio = só a tag. */
function rotuloCamada(n: NoCamada): string {
  if (n.id) return `#${n.id}`;
  if (n.cls.length) return `.${n.cls[0]}`;
  if (n.txt) return `“${n.txt}”`;
  return "";
}

/** Os ARQUIVOS que casam com a marca do nó — nome PURO, sem frase. O pedido no
    chat precisa do nome limpo ("index.html"); a frase é para a tela.
    Marcas fortes no TEXTO dos arquivos: `id="…"` (peso 4), o texto visível
    (peso 3) e uma classe dentro de `class="…"` (peso 2). */
function arquivosDoNo(n: NoCamada, arquivos: Arquivo[]): string[] {
  const pistas: { peso: number; casa: (c: string) => boolean }[] = [];
  if (n.id) {
    const r = new RegExp(`id\\s*=\\s*["']${escaparRegex(n.id)}["']`, "i");
    pistas.push({ peso: 4, casa: (c) => r.test(c) });
  }
  const texto = n.txt.replace(/…$/, "").trim();
  if (texto.length >= 6) {
    const alvo = texto.toLowerCase();
    pistas.push({ peso: 3, casa: (c) => c.toLowerCase().includes(alvo) });
  }
  for (const classe of n.cls.slice(0, 2)) {
    const r = new RegExp(`class\\s*=\\s*["'][^"']*\\b${escaparRegex(classe)}\\b[^"']*["']`, "i");
    pistas.push({ peso: 2, casa: (c) => r.test(c) });
  }
  if (!pistas.length) return [];
  let melhor = 0;
  const pontuado = arquivos.map((a) => {
    let s = 0;
    for (const pt of pistas) if (pt.casa(a.conteudo)) s += pt.peso;
    if (s > melhor) melhor = s;
    return { nome: a.nome, s };
  });
  if (!melhor) return [];
  return pontuado.filter((x) => x.s === melhor).map((x) => x.nome);
}

/**
 * EM QUAL ARQUIVO o elemento vive — dito com HONESTIDADE, porque o sandbox
 * esconde a origem exata de cada nó. Se ninguém casa, devolvemos "" e a tela diz,
 * em português, que não deu para saber — nunca um palpite disfarçado de certeza.
 * Se mais de um arquivo empata, dizemos que pode ser qualquer um.
 */
function localizarArquivoNoProjeto(n: NoCamada, arquivos: Arquivo[]): string {
  const campeoes = arquivosDoNo(n, arquivos);
  if (!campeoes.length) return "";
  return campeoes.length === 1
    ? `Encontrado em ${campeoes[0]}.`
    : `Pode estar em: ${campeoes.join(", ")} — mais de um arquivo tem a mesma marca.`;
}

/** Assinatura crua do conjunto de arquivos — só para saber se MUDOU (no cliente). */
function assinaturaArquivos(arquivos: Arquivo[]): string {
  return JSON.stringify(arquivos.map((a) => [a.nome, a.conteudo]));
}

/**
 * A FALHA, DITA COM VERDADE (dono, 11/10/2026).
 *
 * Dois defeitos somados faziam a tela mentir — e o dono viu o resultado:
 * "A resposta veio sem os arquivos do projeto", quando o problema era SESSÃO.
 *  1. a porteira devolve `{ error: "Unauthorized" }` — com `error`, em inglês,
 *     enquanto o resto da API usa `erro`. Lendo só `d.erro`, a tela não achava
 *     a mensagem e caía no texto padrão;
 *  2. o texto padrão falava de "arquivos do projeto" — então uma sessão expirada
 *     (401) aparecia como falta de arquivos.
 * Aqui a causa é dita pelo que ela É: sessão, conexão ou resposta sem arquivos.
 */
function motivoDaFalha(r: Response, d: unknown, semArquivos: string): string {
  // 401 = quem fala não está identificado (sessão). 403 = identificado, mas SEM
  // ACESSO — são coisas diferentes: dizer "sessão expirou" para um 403 seria a
  // mesma mentira de antes, só trocando de lado. O 403 deixa o servidor explicar
  // (ele manda `erro` com o motivo: capacidade não liberada, por exemplo).
  if (r.status === 401) {
    return "Sua sessão expirou. Entre de novo para continuar de onde parou.";
  }
  const corpo = (d ?? {}) as { erro?: unknown; error?: unknown; ok?: unknown; arquivos?: unknown; texto?: unknown };
  if (typeof corpo.erro === "string" && corpo.erro) return corpo.erro;
  if (typeof corpo.error === "string" && corpo.error) return corpo.error;
  if (r.status === 403) {
    return "Esta conta não tem acesso a esta parte do Arquiteto.";
  }
  // Não é resposta do app (página de erro do proxy, corpo cortado): o pedido não
  // chegou inteiro. Dizer "sem arquivos" aqui seria mentira.
  if (!("ok" in corpo) && !("arquivos" in corpo) && !("texto" in corpo)) {
    return "A conexão caiu no meio do pedido e nada foi alterado. Tente de novo.";
  }
  return semArquivos;
}

/** Sessão expirada não é para o dono resolver na mão: manda para a entrada,
 *  depois de deixar a mensagem na tela por um instante. */
function sessaoExpirou(r: Response): boolean {
  if (r.status !== 401) return false;
  setTimeout(() => {
    window.location.href = "/login";
  }, 1500);
  return true;
}

/**
 * ENVIA E, SE A CONEXÃO CAIR, TENTA DE NOVO (dono, 11/10/2026).
 *
 * "Caiu a conexão no meio" é a queixa que mais volta, e a causa é a CONEXÃO — rede
 * móvel oscilando ou o servidor reiniciando —, não o pedido. Desistir na primeira
 * queda faz a pessoa achar que o app não funciona quando bastava repetir.
 *
 * É SEGURO repetir: o pedido leva os ARQUIVOS ATUAIS do projeto, então reenviar o
 * MESMO pedido produz o MESMO resultado (idempotente). O que NÃO se repete é uma
 * resposta do servidor — se ele respondeu (mesmo com erro), a decisão é dele e
 * repetir seria adivinhação.
 */
async function enviarComRetentativa(url: string, opcoes: RequestInit, tentativas = 2): Promise<Response> {
  let ultimo: unknown = null;
  for (let i = 0; i <= tentativas; i++) {
    try {
      return await fetch(url, opcoes);
    } catch (e) {
      ultimo = e;
      // Espera crescente: uma oscilação curta de rede costuma passar em segundos.
      if (i < tentativas) await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  console.error("Arquiteto: a conexão caiu em todas as tentativas:", ultimo);
  throw ultimo;
}

/**
 * LÊ A RESPOSTA DO CONSTRUTOR ENQUANTO ELA ACONTECE (dono, 11/10/2026).
 *
 * A rota manda LINHAS: avisos de progresso (`{progresso:{segundos,caracteres}}`) e,
 * no fim, a resposta. A leitura aqui é INCREMENTAL — cada aviso atualiza a tela
 * ("já escreveu 12 mil caracteres") em vez de deixar a pessoa olhando um relógio
 * cego por minutos. Se vier uma resposta no formato antigo (sem as linhas), o JSON
 * do fim continua sendo lido: nada quebra.
 */
async function lerRespostaComProgresso(
  r: Response,
  aoProgresso?: (p: { segundos?: number; caracteres?: number }) => void,
): Promise<unknown> {
  const leitor = r.body?.getReader();
  if (!leitor) return {};
  const dec = new TextDecoder();
  let buf = "";
  let resposta: unknown = null;
  const absorver = (linha: string) => {
    const t = linha.trim();
    if (!t) return;
    let j: unknown;
    try {
      j = JSON.parse(t);
    } catch {
      return; // linha parcial, ou página de erro do proxy (não é do app)
    }
    if (j && typeof j === "object" && "progresso" in (j as Record<string, unknown>)) {
      aoProgresso?.((j as { progresso: { segundos?: number; caracteres?: number } }).progresso);
      return;
    }
    resposta = j;
  };
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      absorver(buf.slice(0, i));
      buf = buf.slice(i + 1);
    }
  }
  absorver(buf);
  return resposta ?? {};
}

/** Duração em linguagem de gente: "8s", "1min 20s", "3min". */
function formatarDuracao(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}min ${r}s` : `${m}min`;
}

export default function ArquitetoPage() {
  const [conta, setConta] = useState<Conta | null>(null);
  const [acesso, setAcesso] = useState<Acesso | null>(null);
  const [checando, setChecando] = useState(true);
  // Sessão vencida (401) é um estado PRÓPRIO: não é falta de acesso.
  const [semSessao, setSemSessao] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => {
        // SESSÃO VENCIDA ≠ SEM ACESSO (dono, 11/10/2026). Sem esta distinção, quem
        // estava apenas deslogado via "O Arquiteto não está liberado para esta
        // conta" — uma acusação falsa sobre o acesso dele.
        if (r.status === 401) setSemSessao(true); // 403 = sem acesso, nao sem sessao
        return r.ok ? r.json() : null;
      })
      .then((d) =>
        d?.user && setConta({ nome: d.user.name, email: d.user.email, ehDono: Boolean(d.user.ehDono) }),
      )
      .catch(() => {});

    fetch("/api/arquiteto/capacidade", { cache: "no-store" })
      .then((r) => {
        if (r.status === 401) setSemSessao(true); // 403 = sem acesso, nao sem sessao
        return r.ok ? r.json() : null;
      })
      .then((d) => {
        if (d && typeof d.permitido === "boolean") {
          setAcesso({ permitido: d.permitido, motivo: String(d.motivo || ""), capacidade: String(d.capacidade || "") });
        } else {
          // Sem resposta confiável do servidor: NÃO libera. Falha fechado.
          setAcesso({ permitido: false, motivo: "sem_resposta", capacidade: "mirai.arquiteto.construir" });
        }
      })
      .catch(() =>
        setAcesso({ permitido: false, motivo: "sem_resposta", capacidade: "mirai.arquiteto.construir" }),
      )
      .finally(() => setChecando(false));
  }, []);

  // A BANCADA: lateral recolhida (trilho) e miolo em tela cheia. É o mesmo
  // mecanismo que a tela inicial `/` usa — nada de caminho novo.
  return (
    <Shell titulo="Arquiteto" usuario={conta} recolhidaInicial cheio>
      {checando ? (
        <div className="grid h-full w-full place-items-center">
          <p className="text-[13px] text-dash-dim">Verificando acesso…</p>
        </div>
      ) : semSessao ? (
        <div className="grid h-full w-full place-items-center px-6">
          <SessaoVencida />
        </div>
      ) : acesso?.permitido ? (
        <Arquiteto />
      ) : (
        <div className="grid h-full w-full place-items-center px-6">
          <NaoLiberado />
        </div>
      )}
    </Shell>
  );
}

/* ── Estado honesto: a capacidade não está liberada para esta conta ─────────
   Tela de ESTADO não leva caixa: logo/ícone, frase e botão direto no fundo. */
function NaoLiberado() {
  return (
    <div className="flex flex-col items-center justify-center text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-dash-raise text-dash-muted">
        <IconeCadeado className="h-6 w-6" />
      </span>
      <h2 className="mt-6 max-w-[560px] text-[22px] leading-tight text-dash-fg">
        O Arquiteto não está liberado para esta conta.
      </h2>
      <p className="mt-3 max-w-[540px] text-[14px] leading-[1.7] text-dash-muted">
        É uma capacidade de risco alto: nasce desligada e é liberada por cliente, pelo dono da Mirai —
        junto com o limite de uso do seu plano. Se você precisa dela, peça a liberação a quem cuida da
        sua conta.
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex items-center gap-2 rounded-[10px] bg-dash-brand px-5 py-2.5 text-[12px] font-semibold text-white transition hover:bg-dash-brandHi"
      >
        <IconeSeta className="h-4 w-4 rotate-180" />
        Voltar ao início
      </Link>
    </div>
  );
}

/* ── Sessão vencida: NÃO é falta de acesso — é só entrar de novo ─────────────
   Antes, quem estava apenas deslogado caía na tela "não está liberado para esta
   conta" (e, ao pedir algo, em "a resposta veio sem os arquivos do projeto").
   As duas diziam a coisa errada sobre o dono. Aqui a causa é dita pelo nome. */
function SessaoVencida() {
  return (
    <div className="flex flex-col items-center justify-center text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-dash-raise text-dash-muted">
        <IconeCadeado className="h-6 w-6" />
      </span>
      <h2 className="mt-6 max-w-[560px] text-[22px] leading-tight text-dash-fg">Sua sessão expirou.</h2>
      <p className="mt-3 max-w-[540px] text-[14px] leading-[1.7] text-dash-muted">
        É só entrar de novo para continuar de onde parou — seu projeto está salvo e nada foi perdido.
      </p>
      <Link
        href="/login"
        className="mt-8 inline-flex items-center gap-2 rounded-[10px] bg-dash-brand px-5 py-2.5 text-[12px] font-semibold text-white transition hover:bg-dash-brandHi"
      >
        Entrar de novo
      </Link>
    </div>
  );
}

/* ── Uma linha de DETALHE da camada: rótulo curto + valor (rótulo à esquerda) ─ */
function LinhaCamada({ rotulo, valor, mono }: { rotulo: string; valor: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="w-[58px] shrink-0 pt-[1px] text-[10px] uppercase tracking-[0.12em] text-dash-dim">
        {rotulo}
      </span>
      <span className={`min-w-0 flex-1 break-words text-[11px] leading-[1.5] text-dash-fg/85 ${mono ? "font-mono" : ""}`}>
        {valor}
      </span>
    </div>
  );
}

/* ── A ferramenta — a bancada em tela cheia ───────────────────────────────── */
function Arquiteto() {
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [pedido, setPedido] = useState("");
  const [gerando, setGerando] = useState(false);
  // ── O TEMPO NA CARA (dono, 11/10/2026) ──────────────────────────────────────
  // "Quero saber quanto tempo passou, para saber se realmente aconteceu." Um
  // pedido grande leva MINUTOS: sem relógio, a pessoa não sabe se está andando ou
  // travado. `segundosDecorridos` conta ao vivo; `progresso` traz o que o SERVIDOR
  // informa (quantos caracteres o modelo já escreveu). Os dois juntos respondem
  // "está acontecendo?" sem ninguém precisar adivinhar.
  const [segundosDecorridos, setSegundosDecorridos] = useState(0);
  const [progresso, setProgresso] = useState<{ segundos?: number; caracteres?: number } | null>(null);

  // O CRONÔMETRO: enquanto está construindo, conta de segundo em segundo. O
  // relógio é do CLIENTE de propósito — mede o que a PESSOA esperou, que é o
  // número que interessa a ela (o do servidor pode ser menor se a rede atrasou).
  useEffect(() => {
    if (!gerando) return;
    const t0 = Date.now();
    setSegundosDecorridos(0);
    const id = setInterval(() => setSegundosDecorridos(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [gerando]);
  // ── MODO DO CHAT (dono, Figma Make): "Construir" ou "Plano" ────────────────
  // "Construir" = o pedido vira PROJETO (rota /api/arquiteto/gerar). "Plano" =
  // a resposta é TEXTO e o projeto NÃO é tocado (rota própria
  // /api/arquiteto/planejar, que não grava arquivo nem versão nenhuma).
  const [modoChat, setModoChat] = useState<"construir" | "plano">("construir");
  // A PÍLULA do modo (dono, Figma Make): UM botão pequeno que mostra o modo
  // ATUAL e, ao clicar, abre as DUAS opções num popover quieto. O estado do
  // popover mora aqui; a escolha continua sendo `modoChat`.
  const [menuModo, setMenuModo] = useState(false);
  const modoRef = useRef<HTMLDivElement>(null);
  const modoBtnRef = useRef<HTMLButtonElement>(null);
  const modoMenuRef = useRef<HTMLDivElement>(null);
  // O "+" do chat: menu de ações que funcionam DE VERDADE (nada desabilitado).
  const [menuMais, setMenuMais] = useState(false);
  const [menuMaisBlocos, setMenuMaisBlocos] = useState(false);
  const maisRef = useRef<HTMLDivElement>(null);

  // ── "AUTOMÁTICA" (o modelo) e VOZ (o ditado) — os dois têm de ser REAIS ────
  // "Automática" NÃO é um menu de mentira com opções que não fazem nada: é o
  // ESTADO real. A pessoa NÃO escolhe o modelo — a Mirai escolhe sozinha
  // conforme a conta. O nome vem do SERVIDOR (GET /api/arquiteto/modelo, que lê
  // o MESMO MODELO_DA_CONTA que o construtor usa) — nunca escrito à mão aqui.
  const [modeloReal, setModeloReal] = useState("");
  // DITADO POR VOZ (Web Speech API do navegador, pt-BR): o MESMO caminho de voz
  // que o chat escrito do app já usa. Se o navegador não oferecer, o botão DIZ
  // isso e fica DESABILITADO — nunca finge ouvir nem fica mudo sem explicação.
  const [temDitado, setTemDitado] = useState(false);
  const [ouvindo, setOuvindo] = useState(false);
  const [avisoVoz, setAvisoVoz] = useState<string | null>(null);
  const reconhecimento = useRef<any>(null);
  const falaBase = useRef(""); // o que já estava escrito quando o ditado começou
  const falaFinal = useRef(""); // trechos que o reconhecedor já fechou
  const [projeto, setProjeto] = useState<Projeto | null>(null);
  const [erro, setErro] = useState("");
  const [modo, setModo] = useState<Modo>("responsivo");
  // Um ALVO só para a largura: `null` = 100% do painel; um número = px exato.
  // Presets (Desktop/Tablet/Celular) e o campo de px mexem neste mesmo estado.
  const [larguraBase, setLarguraBase] = useState<number | null>(null);
  // O texto do campo de px (permite digitar "8" e depois "82" sem pular).
  const [campoLargura, setCampoLargura] = useState("");
  // ZOOM da prévia (%). Vira um TRANSFORM na moldura: NÃO reflui o layout do
  // projeto; só o preview escala. O chrome do workspace fica no tamanho real.
  const [zoom, setZoom] = useState(100);
  const [arquivoAtivo, setArquivoAtivo] = useState(0);
  const [abaMobile, setAbaMobile] = useState<"conversa" | "projeto">("conversa");
  // No CELULAR, a prévia aparece como FAIXA junto da conversa (dono, 09/10/2026:
  // "no máximo editar direto com o celular dele, em tempo real"). Antes só dava
  // para ver alternando de aba; agora ele fala e vê acontecendo. Ele pode esconder.
  const [verPreviaCelular, setVerPreviaCelular] = useState(true);
  const [copiado, setCopiado] = useState(false);

  // ── CAMADAS da prévia (a ÁRVORE do DOM renderizado, vinda da ponte) ────────
  // `arvore` é só o retrato que o sandbox mandou; `ponte` diz, com honestidade,
  // se ela já respondeu; `selecionado` marca a camada clicada; `expandidos` são
  // os nós abertos (por padrão só os rasos, para a lista continuar legível);
  // `destaque` é a CONFIRMAÇÃO que a ponte devolveu ao contornar o elemento.
  const [mostrarCamadas, setMostrarCamadas] = useState(false);
  const [arvore, setArvore] = useState<NoCamada[]>([]);
  const [ponte, setPonte] = useState<EstadoPonte>("ocioso");
  const [arvoreParcial, setArvoreParcial] = useState(false);
  const [selecionado, setSelecionado] = useState<number | null>(null);
  // MODO ESCOLHER ELEMENTO (dono, 09/10/2026): LIGADO, o clique DENTRO da prévia
  // escolhe o elemento em vez de acionar a página. É o pedido dele ("clicar no item
  // e tentar mudar"). Desligado, a prévia volta a ser a página de verdade — o botão
  // fica na barra da prévia.
  const [escolhendo, setEscolhendo] = useState(true);
  // RISCO NA PRÉVIA (dono, 09/10/2026): uma camada de desenho POR CIMA da moldura
  // para marcar na tela o pedaço que se quer mudar ANTES de pedir no chat. O risco
  // não entra no projeto (é anotação da bancada): ele vira referência de TEXTO do
  // elemento que está sob a marca — porque o construtor não vê imagem nenhuma.
  const [riscando, setRiscando] = useState(false);
  const [temRisco, setTemRisco] = useState(false);
  // Pedido disparado por um RISCO: {nó, com marca}. Vira texto no chat num efeito
  // próprio — ali a ÁRVORE e o PROJETO estão frescos (o ouvinte da ponte não os vê).
  const [elementoPedido, setElementoPedido] = useState<{ indice: number; marca: boolean } | null>(null);
  // EDITAR ALI MESMO (dono, 09/10/2026): mexer no elemento PELA PRÉVIA — o texto e
  // os atributos práticos — gravando direto no arquivo do projeto. Mesmo caminho do
  // editor de código: fila do autosave, e só grava quando o conteúdo muda de verdade.
  // `textoCheio`/`atributosOriginais` vêm da PONTE (o retrato da árvore corta).
  const [textoCheio, setTextoCheio] = useState("");
  const [textoEdicao, setTextoEdicao] = useState("");
  const [atributosOriginais, setAtributosOriginais] = useState<Record<string, string>>({});
  const [atributosEdicao, setAtributosEdicao] = useState<Record<string, string>>({});
  const [edicaoAviso, setEdicaoAviso] = useState("");
  // A FOTO DO PEDAÇO MARCADO (dono, 09/10/2026) — é a VISÃO do construtor. O modelo
  // que constrói não enxerga imagem; um modelo que ENXERGA lê esta foto e descreve o
  // pedaço; a descrição entra na instrução de quem constrói.
  const [foto, setFoto] = useState<{ imagem: string; largura: number; altura: number } | null>(null);
  // A REFERÊNCIA que está escrita agora no campo do chat: serve para SUBSTITUIR (não
  // empilhar) quando a pessoa clica em outro elemento ou risca outro pedaço.
  const referenciaEscritaRef = useRef("");
  // Os pontos do último risco: a foto precisa deles para desenhar a marca por cima.
  const riscoFeitoRef = useRef<{ x: number; y: number }[]>([]);
  const [expandidos, setExpandidos] = useState<Set<number>>(new Set());
  const [destaque, setDestaque] = useState<{ indice: number; ok: boolean; contorno: string; offset: string } | null>(null);

  // ── EDITOR de código (digitar muda o arquivo) ──────────────────────────────
  // `estadoSalvo` é o aviso honesto e quieto (salvando… / salvo / erro);
  // `ultimaAssinaturaRef` guarda o que já está no servidor para não regravar
  // conteúdo igual; `salvarTimer` é o debounce curto do autosave. O editor é um
  // <textarea> controlado: o Ctrl+Z DENTRO dele é o undo NATIVO do navegador — o
  // atalho da bancada (desfazer/refazer) só dispara FORA de campo de texto.
  const [estadoSalvo, setEstadoSalvo] = useState<"ocioso" | "salvando" | "salvo" | "erro">("ocioso");
  const ultimaAssinaturaRef = useRef<string>("");
  const salvarTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── PERSISTÊNCIA (a conta guarda o projeto; reload não perde nada) ──
  // O projeto vive no servidor, escopado à conta. Aqui só o espelho: o id do
  // projeto aberto, a lista da conta e o estado do menu de projetos. O `ref`
  // acompanha o `projetoId` para o salvamento assíncrono nunca ler estado velho.
  const [projetoId, setProjetoId] = useState<string | null>(null);
  const [projetos, setProjetos] = useState<ProjetoResumo[]>([]);
  const [carregandoProjeto, setCarregandoProjeto] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);
  const [renomeandoId, setRenomeandoId] = useState<string | null>(null);
  const [nomeTemp, setNomeTemp] = useState("");
  const projetoIdRef = useRef<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // PASTA DO PROJETO (dono, 11/10/2026: "o cliente, quando for criar um projeto
  // novo, ele cria a categoria"). Vale para os DOIS momentos: o projeto ABERTO
  // (mover de pasta na hora) e o projeto que ainda VAI NASCER — a escolha fica
  // guardada aqui e vai junto no primeiro salvamento, então o projeto já nasce
  // dentro da categoria. Nulo = "Sem pasta".
  const [pastas, setPastas] = useState<PastaResumo[]>([]);
  const [pastaDoProjeto, setPastaDoProjeto] = useState<string | null>(null);
  const pastaDoProjetoRef = useRef<string | null>(null);
  const [criandoPasta, setCriandoPasta] = useState(false);
  const [nomePastaNova, setNomePastaNova] = useState("");
  const [erroPasta, setErroPasta] = useState("");

  // HISTÓRIA (servidor): as versões do projeto aberto, da mais antiga à mais
  // nova. HISTÓRICO NA SESSÃO (desfazer/refazer): duas pilhas do estado da
  // bancada — o `passado` (o que desfazer traz de volta) e o `futuro` (o que
  // refazer reaplica), as duas limitadas por LIMITE_UNDO.
  const [versoes, setVersoes] = useState<VersaoResumo[]>([]);
  const [menuHistorico, setMenuHistorico] = useState(false);
  const historicoRef = useRef<HTMLDivElement>(null);
  const [passado, setPassado] = useState<Projeto[]>([]);
  const [futuro, setFuturo] = useState<Projeto[]>([]);

  // ── BIBLIOTECA DE BLOCOS (item 9 do dono) ──────────────────────────────────
  // `menuBlocos` abre a lista curada na barra; `blocosRef` fecha ao clicar fora.
  // Inserir chama `inserirBlocoNoProjeto`, a MESMA inserção que a conversa usa.
  const [menuBlocos, setMenuBlocos] = useState(false);
  const blocosRef = useRef<HTMLDivElement>(null);

  // ── PUBLICAÇÃO (item 10 do dono): o link público read-only do projeto ───────
  // `menuPublicar` abre o painel; `publicarToken`/`publicadoEm` são o estado
  // HONESTO vindo do servidor (null = não publicado); `publicando` desabilita o
  // botão durante a chamada; `erroPublicar` é o recado em PT-BR quando falha;
  // `linkCopiado` é o retorno curto de "copiei o link". O token NUNCA vai a log.
  const [menuPublicar, setMenuPublicar] = useState(false);
  const [publicarToken, setPublicarToken] = useState<string | null>(null);
  const [publicadoEm, setPublicadoEm] = useState<string | null>(null);
  const [publicando, setPublicando] = useState(false);
  const [erroPublicar, setErroPublicar] = useState("");
  const [linkCopiado, setLinkCopiado] = useState(false);
  const publicarRef = useRef<HTMLDivElement>(null);

  // ── CONFIGURAÇÕES DO PROJETO (dono, 09/10/2026) ─────────────────────────────
  // O que ele pediu olhando o Figma Make: a tela de settings do PROJETO, com
  // endereço/domínio ("conexão automática com domínio"). Primeira aba de verdade:
  // DOMÍNIOS. `endSlug` é o endereço REAL do servidor (null = sem endereço);
  // `endTexto` é o que a pessoa está digitando; `endSugerido` é o palpite que vem
  // do título. Nada de inventar estado na tela: quem sabe é o servidor.
  const [menuConfig, setMenuConfig] = useState(false);
  const [abaConfig, setAbaConfig] = useState<"dominios" | "fontes" | "integracoes">("dominios");
  // A LISTA CURTA do que dá para ligar no projeto (dono, 09/10/2026). É de
  // propósito pequena: entram aqui só as que existem de verdade e fazem sentido
  // num projeto — e vai crescendo conforme cada uma ficar pronta.
  const INTEGRACOES_DO_PROJETO: Array<{ id: string; nome: string; para: string }> = [
    { id: "github", nome: "GitHub", para: "editar um projeto que já vive num repositório" },
    { id: "supabase", nome: "Supabase", para: "banco de dados e login" },
    { id: "postgres", nome: "Postgres", para: "banco de dados" },
    { id: "drive", nome: "Google Drive", para: "arquivos e pastas" },
  ];
  // O CATÁLOGO COMPLETO fica atrás de um pop-up com BUSCA (dono, 09/10/2026:
  // "se tiver um monte de coisa, abre um pop-up para ver todas"). A frente
  // continua curta; aqui é onde ele acha tudo — por categoria, sem rolar eterno.
  const CATALOGO_INTEGRACOES: Array<{ grupo: string; itens: Array<{ id: string; nome: string; para: string }> }> = [
    {
      grupo: "Código e dados",
      itens: [
        { id: "github", nome: "GitHub", para: "editar projeto que já vive num repositório" },
        { id: "supabase", nome: "Supabase", para: "banco de dados e login" },
        { id: "postgres", nome: "Postgres", para: "banco de dados" },
      ],
    },
    {
      grupo: "Arquivos e mensagens",
      itens: [
        { id: "drive", nome: "Google Drive", para: "arquivos e pastas" },
        { id: "youtube", nome: "YouTube", para: "vídeos do canal" },
        { id: "telegram", nome: "Telegram", para: "mensagens e bots" },
        { id: "whatsapp", nome: "WhatsApp", para: "mensagens" },
        { id: "instagram", nome: "Instagram", para: "publicações" },
      ],
    },
    {
      grupo: "Inteligência",
      itens: [
        { id: "openai", nome: "OpenAI", para: "modelos de IA" },
        { id: "google", nome: "Gemini", para: "modelos de IA" },
        { id: "openrouter", nome: "OpenRouter", para: "vários modelos numa chave" },
        { id: "groq", nome: "Groq", para: "respostas muito rápidas" },
        { id: "verboo", nome: "Verboo", para: "modelos que já usamos aqui" },
      ],
    },
    {
      grupo: "Voz, imagem e vídeo",
      itens: [
        { id: "elevenlabs", nome: "ElevenLabs", para: "voz" },
        { id: "picovoice", nome: "Picovoice", para: "voz no aparelho" },
        { id: "canva", nome: "Canva", para: "design" },
        { id: "figma", nome: "Figma", para: "design e protótipo" },
        { id: "higgsfield", nome: "Higgsfield", para: "imagem e vídeo" },
        { id: "suno", nome: "Suno", para: "música" },
        { id: "magnific", nome: "Magnific", para: "melhorar imagem" },
        { id: "kling", nome: "Kling", para: "vídeo" },
      ],
    },
    {
      grupo: "Nossa casa",
      itens: [
        { id: "saaso", nome: "CRM Saaso", para: "clientes e conversas" },
        { id: "arca", nome: "Arca", para: "a memória do ecossistema" },
        { id: "media-factory", nome: "Conteúdo", para: "produção de conteúdo" },
      ],
    },
  ];

  // O QUE ESTE PROJETO USA (dono, 09/10/2026: "não precisa mostrar tudo que está
  // integrado, só o que foi usado no projeto"). A lista é CURTA: ele vai colocando
  // a integração que o projeto precisa. Integração é da CONTA; o projeto é quem diz
  // quais usa. Sem inventário: nada de despejar o catálogo inteiro na tela.
  const [usadas, setUsadas] = useState<string[]>([]);
  // Os TOKENS da ponte (um por integração que o projeto usa). São do PAR
  // (projeto, integração), não são a chave do cliente e servem só para a página
  // falar com a nossa ponte — que é quem tem a chave. NUNCA vão para o código.
  const [tokensInteg, setTokensInteg] = useState<Record<string, string>>({});
  const [carregandoInteg, setCarregandoInteg] = useState(false);
  const [erroInteg, setErroInteg] = useState("");
  // O POP-UP do catálogo completo (com busca) — a frente fica curta.
  const [verTodas, setVerTodas] = useState(false);
  const [buscaInteg, setBuscaInteg] = useState("");
  // AS CHAVES DAS INTEGRAÇÕES (dono, 09/10/2026: "cria, uai"). A integração é da
  // CONTA; aqui ele cola a chave dela. O valor NUNCA volta na leitura (só o
  // estado "conectado") e nunca sai daqui para o navegador de novo.
  const [minhasInteg, setMinhasInteg] = useState<Array<{ id: number; tipo: string; status?: string }>>([]);
  const [formInteg, setFormInteg] = useState<{ id: string; cred: string; url: string } | null>(null);
  const [salvandoInteg, setSalvandoInteg] = useState(false);
  const [avisoInteg, setAvisoInteg] = useState("");

  // Carrega quando o projeto muda (mesma hora em que o resto do painel se atualiza).
  // NÃO é mais preso à aba: o construtor precisa desta lista na hora de CONSTRUIR
  // (senão ele não sabe que pode usar `window.miraiPonte`). A lista de ids é
  // barata e não traz segredo nenhum.
  useEffect(() => {
    const id = projetoIdRef.current;
    if (!id) return;
    let vivo = true;
    setCarregandoInteg(true);
    setErroInteg("");
    fetch(`/api/arquiteto/projetos/${encodeURIComponent(id)}/integracoes`)
      .then((r) => (r.ok ? r.json() : { usadas: [] }))
      .then((j) => {
        if (vivo) setUsadas(Array.isArray(j?.usadas) ? j.usadas.map(String) : []);
      })
      .catch(() => {
        if (vivo) setErroInteg("não consegui ler as integrações deste projeto");
      })
      .finally(() => {
        if (vivo) setCarregandoInteg(false);
      });
    return () => {
      vivo = false;
    };
  }, [projetoId]);

  // Os TOKENS da ponte para as integrações que o projeto usa. Sem eles, a página
  // não tem como chamar a ponte (e a chave NÃO pode ir para o código). Os tokens
  // são baratos e não trazem segredo; vêm do servidor, escopados ao par.
  useEffect(() => {
    const id = projetoIdRef.current;
    if (!id || !usadas.length) {
      setTokensInteg({});
      return;
    }
    let vivo = true;
    fetch(`/api/arquiteto/projetos/${encodeURIComponent(id)}/integracoes/tokens`)
      .then((r) => (r.ok ? r.json() : { tokens: {} }))
      .then((j) => {
        if (!vivo) return;
        const t = j && typeof j.tokens === "object" && j.tokens ? j.tokens : {};
        setTokensInteg(t as Record<string, string>);
      })
      .catch(() => {
        if (vivo) setTokensInteg({});
      });
    return () => {
      vivo = false;
    };
  }, [usadas, projetoId]);

  /** Lê quais integrações da CONTA já têm chave (a leitura nunca traz a chave). */
  function lerMinhasIntegracoes() {
    fetch("/api/integracoes")
      .then((r) => (r.ok ? r.json() : { minhas: [] }))
      .then((j) => {
        const lista = Array.isArray(j?.minhas) ? j.minhas : [];
        setMinhasInteg(
          lista
            .map((i: { id?: number; tipo?: string; status?: string }) => ({
              id: Number(i.id ?? 0),
              tipo: String(i.tipo ?? ""),
              status: i.status,
            }))
            .filter((i: { tipo: string }) => i.tipo),
        );
      })
      .catch(() => {
        /* sem drama: a tela mostra "não conectada" */
      });
  }

  useEffect(() => {
    if (abaConfig !== "integracoes") return;
    lerMinhasIntegracoes();
  }, [abaConfig, projetoId]);

  /** Guarda a chave de uma integração da conta. O servidor TESTA antes de gravar. */
  async function salvarChaveInteg() {
    if (!formInteg) return;
    const cred = formInteg.cred.trim();
    if (!cred) {
      setAvisoInteg("cola a chave primeiro");
      return;
    }
    setSalvandoInteg(true);
    setAvisoInteg("");
    try {
      const r = await fetch("/api/integracoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: formInteg.id,
          rotulo: formInteg.id,
          credencial: cred,
          ...(formInteg.url.trim() ? { config: { url: formInteg.url.trim() } } : {}),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.erro || j?.error || "não deu para guardar");
      setAvisoInteg("conectado ✓");
      setFormInteg(null);
      lerMinhasIntegracoes();
    } catch (e) {
      setAvisoInteg(e instanceof Error ? e.message : "não deu para guardar");
    } finally {
      setSalvandoInteg(false);
    }
  }

  /** Põe uma integração no projeto (o servidor é quem decide: ele confere a conta). */
  async function porIntegracao(id: string) {
    const pid = projetoIdRef.current;
    if (!pid || !id) return;
    setErroInteg("");
    try {
      const r = await fetch(`/api/arquiteto/projetos/${encodeURIComponent(pid)}/integracoes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.erro || j?.error || "não deu para adicionar");
      if (Array.isArray(j?.usadas)) setUsadas(j.usadas.map(String));
    } catch (e) {
      setErroInteg(e instanceof Error ? e.message : "não deu para adicionar");
    }
  }

  /** Tira a integração do projeto (não apaga nada da conta de ninguém). */
  async function tirarIntegracao(id: string) {
    const pid = projetoIdRef.current;
    if (!pid || !id) return;
    setErroInteg("");
    try {
      const r = await fetch(
        `/api/arquiteto/projetos/${encodeURIComponent(pid)}/integracoes?id=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.erro || j?.error || "não deu para tirar");
      if (Array.isArray(j?.usadas)) setUsadas(j.usadas.map(String));
    } catch (e) {
      setErroInteg(e instanceof Error ? e.message : "não deu para tirar");
    }
  }
  const [endSlug, setEndSlug] = useState<string | null>(null);
  const [endSugerido, setEndSugerido] = useState("");
  const [endTexto, setEndTexto] = useState("");
  const [endSalvando, setEndSalvando] = useState(false);
  const [endErro, setEndErro] = useState("");
  const [endAviso, setEndAviso] = useState("");
  const [endCopiado, setEndCopiado] = useState(false);
  const configRef = useRef<HTMLDivElement>(null);

  // ── DOMÍNIO PRÓPRIO ("Conectar um domínio") ────────────────────────────────
  // Dois tempos, ditos com todas as letras: GUARDADO (o dono digitou) ≠ NO AR (o
  // DNS do cliente já aponta e o certificado foi emitido). `domEstado` vem da
  // conferência ao vivo por DNS-over-HTTPS — a tela nunca supõe que apontou.
  const [domTexto, setDomTexto] = useState("");
  const [domSalvo, setDomSalvo] = useState<string | null>(null);
  const [domEstado, setDomEstado] = useState<"apontando" | "aguardando" | "sem-resposta" | "">("");
  const [domIpBorda, setDomIpBorda] = useState("");
  const [domSalvando, setDomSalvando] = useState(false);
  const [domErro, setDomErro] = useState("");
  const [domAviso, setDomAviso] = useState("");
  // O LINK que o dono manda para o CLIENTE (dono, 09/10/2026): o cliente abre,
  // vê o registro exato e o andamento ao vivo — sem conta, sem textão. Vem
  // assinado do servidor, amarrado ao par (projeto, domínio).
  const [domLink, setDomLink] = useState("");
  // A ÚLTIMA MILHA (dono, 09/10/2026): o veredito do serviço da BORDA. O painel
  // só diz "no ar" quando o serviço com root diz que emitiu o certificado — e
  // quando falha, mostra o motivo em vez de um "aguardando" eterno.
  const [domProntoEm, setDomProntoEm] = useState<string | null>(null);
  const [domFalha, setDomFalha] = useState("");
  // CLOUDFLARE (dono, 09/10/2026 — o BOTÃO): o estado da conexão OAuth do
  // projeto. A tela NUNCA recebe o token — só se está conectado e qual a zona.
  const [cfConectado, setCfConectado] = useState(false);
  const [cfZona, setCfZona] = useState("");
  const [cfAviso, setCfAviso] = useState("");
  const [cfOcupado, setCfOcupado] = useState(false);

  // O resultado do consentimento do Cloudflare volta na URL (`?cloudflare=...`).
  // Mostra uma vez e limpa — para não repetir a cada F5.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const cf = new URLSearchParams(window.location.search).get("cloudflare");
    if (!cf) return;
    const textos: Record<string, string> = {
      apontado:
        "Cloudflare conectado e o registro A já foi criado (DNS-only) — em minutos o certificado sai e o site entra no ar.",
      conectado:
        "Cloudflare conectado. Não deu para criar o registro agora — confira o domínio do projeto ou use “criar o registro agora”.",
      recusado: "Autorização do Cloudflare cancelada — nada foi alterado.",
      falhou: "A conexão com o Cloudflare não completou. Tente de novo.",
    };
    setCfAviso(textos[cf] || "");
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  // ── FONTES DA WEB (dono, 09/10/2026) ───────────────────────────────────────
  // A fonte que ele sobe é um ARQUIVO do projeto (assets/*.woff2) — o mesmo
  // caminho das imagens, com o serviço certo (CORS) e reescrita na prévia. Aqui
  // só vive o que a aba precisa: o seletor de arquivo e o "copiei" do CSS.
  const [fonteCopiada, setFonteCopiada] = useState("");

  /** O CSS que a pessoa cola no projeto para usar a fonte que subiu. */
  function fontFaceDaFonte(caminho: string): string {
    const familia = familiaDaFonte(caminho);
    const ext = (caminho.split(".").pop() || "woff2").toLowerCase();
    const formato = ext === "woff" ? "woff" : "woff2";
    return `@font-face {\n  font-family: "${familia}";\n  src: url("${caminho}") format("${formato}");\n  font-display: swap;\n}`;
  }

  /** Copia o @font-face da fonte (é isto que faz a fonte entrar no projeto). */
  async function copiarFontFace(caminho: string) {
    try {
      await navigator.clipboard.writeText(fontFaceDaFonte(caminho));
      setFonteCopiada(caminho);
      setTimeout(() => setFonteCopiada((c) => (c === caminho ? "" : c)), 1800);
    } catch {
      setErroAsset("O navegador não deixou copiar. Selecione o CSS à mão na prévia.");
    }
  }

  // Árvore de arquivos: remover é do conjunto do projeto (nunca o último, para
  // não apagar o projeto); adicionar um arquivo vazio é à mão, simples e honesto.
  const [adicionando, setAdicionando] = useState(false);
  const [novoNome, setNovoNome] = useState("");

  // ── IMAGENS do projeto (assets: BLOB no banco, servidos por rota de sessão) ──
  // `assets` é o espelho sem os bytes; `assetAtivo` marca o asset selecionado na
  // lista (o editor mostra o aviso honesto de binário). `erroAsset` é o recado
  // em PT-BR quando algo é recusado (tipo/tamanho) ou falha. `arrastando` só
  // liga o realce da área de soltar.
  const [assets, setAssets] = useState<Asset[]>([]);
  // As FONTES do projeto (dono, 09/10/2026) são os assets de tipo `font/*` — um
  // só caminho de arquivo para imagem e fonte; a aba Fontes só filtra.
  const fontesDoProjeto = useMemo(() => assets.filter((a) => ehFonte(a.mime || "")), [assets]);
  const fonteRef = useRef<HTMLInputElement | null>(null);
  const [assetAtivo, setAssetAtivo] = useState<string | null>(null);
  const [enviandoAsset, setEnviandoAsset] = useState(false);
  const [erroAsset, setErroAsset] = useState("");
  const [arrastando, setArrastando] = useState(false);
  const entradaImagemRef = useRef<HTMLInputElement>(null);

  // ── TOKENS DE DESIGN do projeto (o painel curado que a prévia obedece) ──────
  // `tokens` é o conjunto ATUAL (sempre completo, nunca com buraco); `mostrarTokens`
  // abre o painel; `estadoTokens` é o aviso honesto e quieto do salvamento
  // (salvando… / salvo / erro); `tokenTimer` é o DEBOUNCE — arrastar um seletor de
  // cor não dispara um POST por quadro. `projetoRef` dá ao debounce o projeto do
  // MOMENTO, nunca um fechamento velho.
  const [tokens, setTokens] = useState<Tokens>(() => normalizarTokens({}));
  const [mostrarTokens, setMostrarTokens] = useState(false);
  const [estadoTokens, setEstadoTokens] = useState<"ocioso" | "salvando" | "salvo" | "erro">("ocioso");
  const tokenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const projetoRef = useRef<Projeto | null>(null);
  // Largura/altura REAIS que o painel oferece à prévia, medidas — o rótulo não
  // pode dizer 820px se o painel só tem 484. Número na tela é número medido.
  const [larguraPainel, setLarguraPainel] = useState<number | null>(null);
  const [alturaPainel, setAlturaPainel] = useState<number | null>(null);
  const painelPrevia = useRef<HTMLDivElement>(null);
  const moldura = useRef<HTMLDivElement>(null);

  const fimConversa = useRef<HTMLDivElement>(null);
  const caixa = useRef<HTMLTextAreaElement>(null);
  // O editor de código — <textarea> controlado (undo NATIVO dentro dele).
  const editorRef = useRef<HTMLTextAreaElement>(null);
  // O iframe da prévia (a ponte mora DENTRO dele) e o relógio da espera.
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const ponteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A assinatura da última árvore lida — serve para saber se a leitura MUDOU.
  const ultimaArvoreRef = useRef<string>("");

  // Mede o PAINEL da prévia (não a moldura): é ele que limita largura e altura.
  // O transform do zoom NÃO entra aqui — o número do rótulo é o layout real.
  useEffect(() => {
    const el = painelPrevia.current;
    if (!el) {
      setLarguraPainel(null);
      setAlturaPainel(null);
      return;
    }
    const medir = () => {
      setLarguraPainel(Math.round(el.clientWidth));
      setAlturaPainel(Math.round(el.clientHeight));
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    window.addEventListener("resize", medir);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", medir);
    };
  }, [modo, projeto]);

  useEffect(() => {
    fimConversa.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [turnos]);

  // Espelha o projeto atual num ref: o debounce dos TOKENS salva o projeto do
  // MOMENTO (arquivos atuais), não o de quando a cor começou a ser arrastada.
  useEffect(() => {
    projetoRef.current = projeto;
  }, [projeto]);

  // RESTAURA o ÚLTIMO projeto da conta ao abrir a página: a lista vem do
  // servidor e, havendo projeto, ele volta com arquivos, árvore e prévia. É o
  // que faz o trabalho sobreviver a um reload e à volta de amanhã.
  useEffect(() => {
    let vivo = true;
    // As PASTAS (categorias) da conta vêm junto: o menu do projeto mostra a
    // pasta de cada projeto e deixa escolher/trocar na hora (dono, 11/10/2026).
    void carregarPastas();
    (async () => {
      try {
        const r = await fetch("/api/arquiteto/projetos", { cache: "no-store" });
        const j = r.ok ? await r.json() : null;
        const lista: ProjetoResumo[] = Array.isArray(j?.projetos) ? j.projetos : [];
        if (!vivo) return;
        setProjetos(lista);
        // ABRIR POR LINK MANDA (dono, 11/10/2026: "quando clico em um projeto
        // sempre abre o mesmo"). Se a URL traz `?projeto=<id>`, quem abre é o
        // efeito do link (lá embaixo) — aqui só a LISTA é carregada (o menu
        // precisa dela) e o "último projeto" NÃO é restaurado por cima, senão
        // os dois efeitos corriam juntos e o último vencia.
        if (new URLSearchParams(window.location.search).get("projeto")) return;
        const ultimo = lista[0];
        if (ultimo?.id) {
          const r2 = await fetch(`/api/arquiteto/projetos/${ultimo.id}`, { cache: "no-store" });
          const j2 = r2.ok ? await r2.json() : null;
          const p = j2?.projeto as
            | { id: string; titulo: string; arquivos: Arquivo[]; tokens?: Tokens; publicar_token?: string | null; publicado_em?: string | null }
            | undefined;
          if (vivo && p?.arquivos?.length) {
            projetoIdRef.current = p.id;
            setProjetoId(p.id);
            setProjeto({ resumo: p.titulo, arquivos: p.arquivos });
            // Os TOKENS do projeto voltam junto — a prévia já nasce com a cara dele.
            setTokens(normalizarTokens(p.tokens));
            setEstadoTokens("ocioso");
            refletirPublicacao(p);
            // O que veio do servidor é a base: nada a salvar ainda.
            ultimaAssinaturaRef.current = assinaturaArquivos(p.arquivos);
            setEstadoSalvo("ocioso");
            setArquivoAtivo(0);
            // Ao abrir a bancada: desfazer/refazer zerados e a história relida.
            setPassado([]);
            setFuturo([]);
            void carregarVersoes(p.id);
            void carregarAssets(p.id);
            setTurnos([
              {
                papel: "mirai",
                texto: `Carreguei seu último projeto: “${p.titulo}”. Continue pedindo mudanças, ou comece um novo pelo menu do projeto.`,
              },
            ]);
          }
        }
      } catch {
        /* sem rede: segue no estado honesto "nada gerado ainda" */
      } finally {
        if (vivo) setCarregandoProjeto(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  // Fecha o menu de projetos ao clicar fora ou com Esc (mesmo padrão do menu da conta).
  useEffect(() => {
    if (!menuAberto) return;
    const fora = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuAberto(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuAberto(false);
    };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [menuAberto]);

  // Fecha o HISTÓRICO ao clicar fora ou com Esc (mesmo padrão do menu de projetos).
  useEffect(() => {
    if (!menuHistorico) return;
    const fora = (e: MouseEvent) => {
      if (historicoRef.current && !historicoRef.current.contains(e.target as Node)) setMenuHistorico(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuHistorico(false);
    };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [menuHistorico]);

  // Fecha a BIBLIOTECA DE BLOCOS ao clicar fora ou com Esc (mesmo padrão).
  useEffect(() => {
    if (!menuBlocos) return;
    const fora = (e: MouseEvent) => {
      if (blocosRef.current && !blocosRef.current.contains(e.target as Node)) setMenuBlocos(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuBlocos(false);
    };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [menuBlocos]);

  // Fecha o "+" do chat ao clicar fora ou com Esc (mesmo padrão dos outros menus).
  useEffect(() => {
    if (!menuMais) return;
    const fora = (e: MouseEvent) => {
      if (maisRef.current && !maisRef.current.contains(e.target as Node)) setMenuMais(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuMais(false);
    };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [menuMais]);

  // Fecha a PÍLULA de MODO do chat ao clicar fora ou com Esc (mesmo padrão dos
  // outros menus). Esc devolve o foco à pílula — ninguém perde o teclado.
  useEffect(() => {
    if (!menuModo) return;
    const fora = (e: MouseEvent) => {
      if (modoRef.current && !modoRef.current.contains(e.target as Node)) setMenuModo(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuModo(false);
        modoBtnRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [menuModo]);

  // Ao ABRIR, o foco já vai para a opção escolhida (o modo atual): teclado puro
  // funciona e o dono vê onde o foco está.
  useEffect(() => {
    if (!menuModo) return;
    const escolhida =
      modoMenuRef.current?.querySelector<HTMLButtonElement>(
        '[role="menuitemradio"][aria-checked="true"]',
      ) ?? modoMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitemradio"]');
    escolhida?.focus();
  }, [menuModo]);

  // Escolhe o modo e FECHA. A regra do envio continua a mesma — só muda qual
  // rota o Enter usa (Construir → /gerar; Plano → /planejar).
  function escolherModo(m: "construir" | "plano") {
    setModoChat(m);
    setMenuModo(false);
    modoBtnRef.current?.focus();
  }

  // ↑/↓ andam entre as duas opções do popover — usável sem mouse.
  function navegarModo(e: KeyboardEventReact) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const itens = Array.from(
      modoMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [],
    );
    if (!itens.length) return;
    e.preventDefault();
    const atual = itens.indexOf(document.activeElement as HTMLButtonElement);
    const passo = e.key === "ArrowDown" ? 1 : -1;
    itens[(atual + passo + itens.length) % itens.length]?.focus();
  }

  // Lê o MODELO REAL do servidor — é o que torna o "Automática" honesto. Se a
  // resposta falhar, o controle continua dizendo "Automática" (que é verdade: a
  // escolha é automática) e assume, no title, que o nome não pôde ser lido.
  useEffect(() => {
    fetch("/api/arquiteto/modelo", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.modelo) setModeloReal(String(d.modelo));
      })
      .catch(() => {
        /* sem drama: o controle segue dizendo só "Automática" */
      });
  }, []);

  // Detecta UMA vez se o navegador oferece ditado por voz (Web Speech API).
  useEffect(() => {
    const R = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setTemDitado(typeof R === "function");
  }, []);

  // Para o ditado e solta o microfone.
  function pararDitado() {
    try {
      reconhecimento.current?.stop();
    } catch {
      /* já parado */
    }
    reconhecimento.current = null;
    setOuvindo(false);
  }

  // Liga/desliga o ditado. O texto entra no MESMO campo (`pedido`): o que já
  // estava escrito é preservado e a fala vai sendo acrescentada — igual ao chat.
  function alternarDitado() {
    const R = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (typeof R !== "function") {
      setAvisoVoz("Voz ainda não ligada: este navegador não oferece ditado por voz.");
      return;
    }
    if (ouvindo) {
      pararDitado();
      return;
    }
    const rec = new R();
    rec.lang = "pt-BR";
    rec.continuous = true;
    rec.interimResults = true;
    falaBase.current = pedido.trim();
    falaFinal.current = "";
    rec.onresult = (e: any) => {
      let fechado = "";
      let parcial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const t = r?.[0]?.transcript || "";
        if (r.isFinal) fechado += t;
        else parcial += t;
      }
      if (fechado) falaFinal.current = `${falaFinal.current} ${fechado}`.trim();
      const junto = [falaBase.current, falaFinal.current, parcial]
        .map((s) => s.trim())
        .filter(Boolean)
        .join(" ");
      setPedido(junto);
    };
    rec.onerror = (e: any) => {
      const codigo = e?.error || "";
      if (codigo === "not-allowed" || codigo === "service-not-allowed") {
        setAvisoVoz("Permita o microfone para ditar.");
      } else if (codigo !== "aborted" && codigo !== "no-speech") {
        setAvisoVoz("O ditado parou. Tente de novo.");
      }
      setOuvindo(false);
      reconhecimento.current = null;
    };
    rec.onend = () => {
      setOuvindo(false);
      reconhecimento.current = null;
    };
    reconhecimento.current = rec;
    try {
      rec.start();
      setAvisoVoz(null);
      setOuvindo(true);
    } catch {
      setOuvindo(false);
      reconhecimento.current = null;
      setAvisoVoz("Não consegui ligar o ditado agora.");
    }
  }

  // Ao sair da tela, o microfone NÃO fica aberto.
  useEffect(
    () => () => {
      try {
        reconhecimento.current?.stop();
      } catch {
        /* nada a fazer */
      }
    },
    [],
  );

  // Fecha os painéis do topo (PUBLICAÇÃO e CONFIGURAÇÕES) ao clicar fora ou com
  // Esc — mesmo padrão para os dois.
  useEffect(() => {
    if (!menuPublicar && !menuConfig) return;
    const fora = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (publicarRef.current && !publicarRef.current.contains(alvo)) setMenuPublicar(false);
      if (configRef.current && !configRef.current.contains(alvo)) setMenuConfig(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuPublicar(false);
        setMenuConfig(false);
      }
    };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [menuPublicar, menuConfig]);

  // Ao ABRIR as Configurações, o endereço do projeto é lido do servidor — a tela
  // nunca inventa endereço nem estado de publicação.
  useEffect(() => {
    if (!menuConfig) return;
    const id = projetoIdRef.current;
    if (id) {
      void carregarEndereco(id);
      void carregarDominio(id);
      void carregarAssets(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuConfig, projetoId]);

  // ATALHOS de DESFAZER/REFAZER: Ctrl/Cmd+Z desfaz e Ctrl/Cmd+Shift+Z (ou
  // Ctrl+Y) refaz. Fora dos campos de texto — lá o atalho é do navegador, não
  // da bancada. Roda sem lista de dependências DE PROPÓSITO: precisa sempre dos
  // valores atuais das pilhas, nunca de um fechamento velho.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      const digitando =
        !!alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.isContentEditable);
      if (digitando || !(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        desfazer();
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        refazer();
      }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  });

  /* ── CAMADAS: a conversa com a PONTE (dentro do iframe sandboxed) ───────── */

  // O ouvinte ÚNICO do `message`. A prévia tem origem OPACA (`null`, porque o
  // sandbox é `allow-scripts` sem `allow-same-origin`), então a prova forte é
  // `e.source === contentWindow` do iframe que NÓS montamos: recado de outra
  // janela é ignorado. O formato também é conferido — só `tipo` com o prefixo
  // `arquiteto:` passa, e todo nó é SANEADO antes de virar tela. Nada daqui é
  // executado: é retrato, exibido como texto.
  useEffect(() => {
    function aoReceber(e: MessageEvent) {
      const janela = iframeRef.current?.contentWindow;
      if (!janela || e.source !== janela) return;
      const d = e.data as { tipo?: unknown; nos?: unknown; parcial?: unknown; indice?: unknown; ok?: unknown; contorno?: unknown; texto?: unknown; atributos?: unknown; imagem?: unknown; largura?: unknown; altura?: unknown } | null;
      if (!d || typeof d !== "object" || typeof d.tipo !== "string" || d.tipo.indexOf("arquiteto:") !== 0) return;

      /* CLIQUE DENTRO DA PRÉVIA (modo escolher): vira a camada selecionada — o
         MESMO caminho do clique na lista (contorno rosa + detalhes no painel). */
      if (
        d.tipo === "arquiteto:clique" &&
        typeof d.indice === "number" &&
        Number.isInteger(d.indice) &&
        d.indice >= 0
      ) {
        selecionarCamada(d.indice);
        // O CLIQUE também escreve a referência no chat (dono, 09/10/2026: "o clique
        // não está aparecendo no chat") — o MESMO caminho do risco, e a foto do
        // pedaço vem junto quando houver marca. Sem marca, referencia só o elemento.
        setElementoPedido({ indice: d.indice, marca: false });
        return;
      }

      /* RISCO na prévia: a ponte respondeu QUAL elemento está sob a marca. Vira a
         camada selecionada e a referência vai para o campo do chat. */
      if (
        d.tipo === "arquiteto:elemento-em" &&
        typeof d.indice === "number" &&
        Number.isInteger(d.indice) &&
        d.indice >= 0
      ) {
        selecionarCamada(d.indice);
        setElementoPedido({ indice: d.indice, marca: true });
        // O MESMO pedaço vira FOTO (com a marca desenhada): é o que dá olhos ao
        // construtor — ele não vê a prévia, mas vê esta imagem.
        falarComAPrevia({ tipo: "arquiteto:fotografar", indice: d.indice, pontos: riscoFeitoRef.current });
        return;
      }

      /* A FOTO do pedaço marcado voltou da ponte. Vazia = não deu: a tela DIZ e o
         pedido segue só com a referência de texto (nunca finge que enxergou). */
      if (d.tipo === "arquiteto:foto") {
        if (typeof d.imagem === "string" && d.imagem.length > 64) {
          setFoto({
            imagem: d.imagem,
            largura: typeof d.largura === "number" ? d.largura : 0,
            altura: typeof d.altura === "number" ? d.altura : 0,
          });
        } else {
          setFoto(null);
          setEdicaoAviso("não consegui fotografar o pedaço marcado — o pedido vai só com a referência de texto");
        }
        return;
      }

      /* A PONTE devolveu o TEXTO INTEIRO do nó (e os atributos práticos): é com
         isto que a bancada grava no arquivo — o retrato da árvore corta o texto. */
      if (d.tipo === "arquiteto:texto-do-no") {
        const texto = typeof d.texto === "string" ? d.texto : "";
        setTextoCheio(texto);
        setTextoEdicao(texto);
        const limpos: Record<string, string> = {};
        if (d.atributos && typeof d.atributos === "object") {
          for (const [k, v] of Object.entries(d.atributos as Record<string, unknown>)) {
            if (typeof v === "string") limpos[k] = v;
          }
        }
        setAtributosOriginais(limpos);
        setAtributosEdicao(limpos);
        return;
      }

      if (d.tipo === "arquiteto:arvore" && Array.isArray(d.nos)) {
        const nos = (d.nos as unknown[]).map(sanearNo).filter((n): n is NoCamada => n !== null);
        // Só RECOLOCA a abertura padrão (nós rasos) se a ÁRVORE mudou de fato —
        // assim uma releitura por mudança de DOM não fecha o que a pessoa abriu.
        const assinatura = nos.map((n) => n.i + ":" + n.tag).join("|");
        if (assinatura !== ultimaArvoreRef.current) {
          ultimaArvoreRef.current = assinatura;
          setExpandidos(new Set(nos.filter((n) => n.prof <= 1).map((n) => n.i)));
        }
        setArvore(nos);
        setArvoreParcial(d.parcial === true);
        setPonte("ok");
        if (ponteTimer.current) {
          clearTimeout(ponteTimer.current);
          ponteTimer.current = null;
        }
      } else if (d.tipo === "arquiteto:destaque-aplicado") {
        setDestaque({
          indice: typeof d.indice === "number" ? Math.floor(d.indice) : -1,
          ok: d.ok === true,
          contorno: typeof d.contorno === "string" ? d.contorno : "",
          offset: typeof (d as { offset?: unknown }).offset === "string" ? String((d as { offset?: unknown }).offset) : "",
        });
      } else if (d.tipo === "arquiteto:destaque-limpo") {
        setDestaque(null);
      }
    }
    window.addEventListener("message", aoReceber);
    return () => window.removeEventListener("message", aoReceber);
  }, []);

  // Prévia nova (novo documento no iframe) = árvore velha não vale mais. O
  // efeito que zera a leitura mora logo DEPOIS de `previa` existir (mais abaixo),
  // porque ele depende do documento montado.

  /** Marca "aguardando" e arma o relógio que vira "sem-resposta" se ninguém falar. */
  function aguardarPonte() {
    setPonte("aguardando");
    if (ponteTimer.current) clearTimeout(ponteTimer.current);
    ponteTimer.current = setTimeout(() => {
      ponteTimer.current = null;
      setPonte((estado) => (estado === "aguardando" ? "sem-resposta" : estado));
    }, 3500);
  }

  /** Manda um recado de CONTROLE para o sandbox. Só comandos e um número. */
  function falarComAPrevia(mensagem: Record<string, unknown>) {
    const janela = iframeRef.current?.contentWindow;
    if (!janela) return;
    try {
      janela.postMessage(mensagem, "*");
    } catch {
      /* sandbox fechado: a tela mostra o estado honesto e segue */
    }
  }

  /** Pede a árvore de novo à ponte (botão de reler). */
  function pedirArvore() {
    aguardarPonte();
    falarComAPrevia({ tipo: "arquiteto:pedir-arvore" });
  }

  /** A prévia terminou de carregar: pede a árvore, rearma a espera e reafirma o
   *  modo escolher (a prévia nova nasce no padrão da PONTE; quem manda é a tela). */
  function aoCarregarPrevia() {
    aguardarPonte();
    falarComAPrevia({ tipo: "arquiteto:pedir-arvore" });
    falarComAPrevia({ tipo: "arquiteto:escolher", ligado: escolhendo });
  }

  /** O modo escolher mudou: avisa o sandbox na hora. Sem isto, o clique na prévia
   *  continuaria escolhendo (ou acionando a página) fora de sincronia com a barra. */
  useEffect(() => {
    falarComAPrevia({ tipo: "arquiteto:escolher", ligado: escolhendo });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escolhendo]);

  /** Seleciona uma camada: contorna no preview e revela os detalhes dela. */
  function selecionarCamada(indice: number) {
    setSelecionado(indice);
    setDestaque(null);
    falarComAPrevia({ tipo: "arquiteto:destaque", indice });
  }

  /** Tira a seleção e o contorno do preview. */
  function limparCamada() {
    setSelecionado(null);
    setDestaque(null);
    falarComAPrevia({ tipo: "arquiteto:limpar-destaque" });
  }

  /** Abre/fecha um nó da árvore. */
  function alternarCamada(indice: number) {
    setExpandidos((antes) => {
      const novo = new Set(antes);
      if (novo.has(indice)) novo.delete(indice);
      else novo.add(indice);
      return novo;
    });
  }

  /* ── LARGURA / ZOOM da prévia (um controle só: presets + px + zoom) ─────── */

  /** Um preset (Desktop/Tablet/Celular) — é só um VALOR do alvo da largura. */
  function aplicarPreset(p: PresetLargura) {
    const v = LARGURA_PRESET[p];
    setLarguraBase(v);
    setCampoLargura(v === null ? "" : String(v));
  }

  /** Largura EXATA digitada (px). Vazio = volta ao 100% (Desktop). */
  function aplicarLarguraExata(texto: string) {
    setCampoLargura(texto);
    const limpo = texto.trim();
    if (!limpo) {
      setLarguraBase(null);
      return;
    }
    const n = Math.round(Number(limpo));
    // Digitação no meio ("-", "8"): não muda o alvo até virar número válido.
    if (!Number.isFinite(n) || n <= 0) return;
    setLarguraBase(Math.min(LARGURA_MAX, Math.max(LARGURA_MIN, n)));
  }

  /** Um passo de zoom para cima/baixo, na régua dos passos. O 100% é o padrão. */
  function passoZoom(direcao: 1 | -1) {
    setZoom((z) => {
      const passos = ZOOM_PASSOS as readonly number[];
      let i = passos.indexOf(z);
      if (i < 0) i = passos.indexOf(100);
      const ni = Math.min(passos.length - 1, Math.max(0, i + direcao));
      return passos[ni];
    });
  }

  /** Volta o zoom ao padrão (100%). */
  function redefinirZoom() {
    setZoom(100);
  }

  /* ── BIBLIOTECA DE BLOCOS: a inserção REAL (painel e conversa, a mesma) ─────
     Inserir um bloco é mudança do PROJETO, como qualquer outra: a marcação vai
     para o HTML de entrada (antes do último `</body>`), o CSS para a folha do
     projeto (prefixo `bloco-<id>__…`, sem colisão), a bancada entra no desfazer,
     a prévia re-monta e o servidor salva — virando VERSÃO pelo caminho de
     sempre (`salvarNoServidor`). Nada de mecanismo paralelo.

     Bancada vazia não é desculpa: o primeiro bloco CRIA o projeto base
     (`index.html` + `styles.css`), acabando com a "página em branco". */
  function inserirBlocoNoProjeto(bloco: Bloco, origem: "painel" | "conversa") {
    setMenuBlocos(false);
    setErro("");
    cancelarSalvarPendente();
    const antes = projeto;
    const { arquivos, alvoCss, criouProjeto } = aplicarBloco(antes?.arquivos ?? [], bloco);
    // O estado ANTERIOR entra no desfazer (uma inserção se desfaz com Ctrl+Z do
    // BANCADA — o undo do editor continua sendo o nativo do navegador).
    registrarPasso(antes);
    const resumo = antes?.resumo || `Projeto com bloco ${bloco.nome}`;
    setProjeto({ resumo, arquivos });
    const entradaNova = arquivoDeEntrada(arquivos);
    const i = entradaNova ? arquivos.findIndex((a) => a.nome === entradaNova.nome) : 0;
    setArquivoAtivo(i >= 0 ? i : 0);
    setAbaMobile("projeto");
    setEstadoSalvo("salvando");
    void salvarNoServidor(arquivos, resumo).then((ok) => setEstadoSalvo(ok ? "salvo" : "erro"));

    // O recado é o RELATÓRIO do que aconteceu de verdade — nomes de arquivo
    // reais, nada inventado. Imagem: só a oferta honesta, nunca uma referência
    // quebrada (os blocos não citam asset nenhum).
    const onde = entradaNova?.nome || "index.html";
    const recado =
      `Inseri o bloco “${bloco.nome}” no projeto. Marcação em ${onde} (antes do </body>) e CSS em ${alvoCss}, ` +
      `com as classes prefixadas em .bloco-${bloco.id}__ — então o CSS do bloco não briga com o do projeto. ` +
      `${criouProjeto ? "Não havia projeto: criei o index.html e o styles.css base. " : ""}` +
      `A prévia já reflete e o projeto virou versão nova.` +
      (assets.length
        ? ` Você tem ${assets.length} ${assets.length === 1 ? "imagem" : "imagens"} no projeto — peça na conversa para eu usá-la onde quiser.`
        : "");
    setTurnos((t) => [...t, { papel: "mirai", texto: recado }]);
    void origem; // o recado é o mesmo; o painel não teve turno de "você"
  }

  /**
   * MODO PLANO — pensar junto SEM construir.
   *
   * Diferente de `construir()`: NÃO chama /api/arquiteto/gerar (a rota que
   * escreve arquivos e cria versão). Chama /api/arquiteto/planejar, que só
   * devolve TEXTO. Aqui NÃO existe setProjeto, NÃO existe registrarPasso, NÃO
   * existe salvarNoServidor: o projeto fica exatamente como estava — que é,
   * justamente, o que o modo promete.
   */
  async function planejar() {
    const texto = pedido.trim();
    if (!texto || gerando) return;

    setTurnos((t) => [...t, { papel: "voce", texto }]);
    setPedido("");
    setErro("");
    setGerando(true);
    setProgresso(null);
    // O relógio DESTE pedido (cliente): se a conexão cair sem resposta, é este
    // número que diz quanto tempo se esperou.
    const inicioPedido = Date.now();

    const paraOModelo = [...turnos, { papel: "voce" as const, texto }]
      .filter((t) => !t.erro)
      .map((t) => ({ role: t.papel === "voce" ? "user" : "assistant", content: t.texto }));

    try {
      const r = await enviarComRetentativa("/api/arquiteto/planejar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mensagens: paraOModelo,
          // O servidor já conhece o projeto ATUAL: manda o resumo e os nomes
          // REAIS dos arquivos para o plano falar deste projeto, não de um
          // genérico. Sem projeto, manda null — o plano é o primeiro passo.
          projeto: projeto
            ? { resumo: projeto.resumo, arquivos: projeto.arquivos.map((a) => a.nome) }
            : null,
        }),
      });
      const d = (await lerRespostaComProgresso(r, setProgresso)) as { ok?: boolean; texto?: string; erro?: string; levouMs?: number };
      if (!r.ok || !d.ok || !d.texto) {
        // Mesma regra do construtor: sessão, conexão e "plano vazio" são causas
        // diferentes e o código HTTP não é nenhuma delas.
        const msg = motivoDaFalha(r, d, "O plano não veio agora e nada foi alterado. Tente de novo.");
        setErro(msg);
        setTurnos((t) => [...t, { papel: "mirai", texto: msg, erro: true }]);
        sessaoExpirou(r);
        return;
      }
      const resposta = d.texto;
      // `plano: true` marca o turno: o chat renderiza a estrutura (título,
      // passos numerados, arquivos) e põe o botão "Executar plano" no fim.
      // O tempo no fim do plano, mesma regra do construtor.
      const planoComTempo = d.levouMs ? `${resposta}\n\n_(levou ${formatarDuracao(d.levouMs)})_` : resposta;
      setTurnos((t) => [...t, { papel: "mirai", texto: planoComTempo, plano: true }]);
    } catch {
      // Já tentou de novo sozinho (enviarComRetentativa) antes de chegar aqui — a
      // mensagem diz o que de fato aconteceu, em vez de culpar o "meio".
      const msg = `A conexão caiu e o pedido não chegou ao fim depois de ${formatarDuracao(
        Date.now() - inicioPedido,
      )} — nada foi alterado. Tente de novo.`;
      setErro(msg);
      setTurnos((t) => [...t, { papel: "mirai", texto: msg, erro: true }]);
    } finally {
      setGerando(false);
    }
  }

  /** O envio: despacha conforme o MODO escolhido. Só isso. */
  function enviarPedido() {
    if (modoChat === "plano") void planejar();
    else void construir();
  }

  /**
   * EXECUTAR O PLANO — o ÚNICO jeito de o modo "Plano" mexer no projeto.
   *
   * Manda o TEXTO do plano pelo caminho de CONSTRUIR (POST /api/arquiteto/gerar,
   * a rota que escreve arquivos e cria versão). É SEMPRE por clique explícito:
   * em "Plano" o projeto nunca muda sozinho — só aqui, e o aviso na tela diz
   * exatamente isso. O turno visível é curto (o plano já está logo acima).
   */
  function executarPlano(textoPlano: string) {
    if (gerando) return;
    void construir(textoPlano, "Executar o plano acima — construir o projeto.");
  }

  async function construir(textoForcado?: string, textoVisivel?: string) {
    const texto = (textoForcado ?? pedido).trim();
    if (!texto || gerando) return;
    // O projeto do MOMENTO: o ref é atualizado ao fim de cada render, então ele
    // nunca fica atrás de um valor velho capturado no fechamento (era assim que um
    // envio saía sem os arquivos e a tela dizia "Não deu para construir agora (200)").
    const projetoAtual = projetoRef.current ?? projeto;

    setTurnos((t) => [...t, { papel: "voce", texto: textoVisivel ?? texto }]);
    // Só limpa o campo quando o texto veio DELE. Executar um plano não mexe no
    // que a pessoa está digitando.
    if (textoForcado === undefined) setPedido("");
    setErro("");
    setAbaMobile("projeto");

    // PEDIDO DE BLOCO na conversa: sai da BIBLIOTECA local, não do modelo — e é
    // a MESMA inserção do painel (mesma função, mesmo salvamento, mesma versão).
    // Pedido de PÁGINA inteira continua indo ao construtor (ver `blocoPorPedido`).
    // Executar um plano NUNCA cai aqui: vai sempre ao construtor.
    const bloco = textoForcado === undefined ? blocoPorPedido(texto) : null;
    if (bloco) {
      inserirBlocoNoProjeto(bloco, "conversa");
      return;
    }

    setGerando(true);
    setProgresso(null);
    // O relógio DESTE pedido, do lado do cliente: se a conexão cair antes de o
    // servidor responder, é este número que diz quanto tempo se esperou.
    const inicioPedido = Date.now();

    // Nome do projeto quando ele NASCE: o primeiro pedido da conversa. Só vale
    // na criação — depois disso o título é o que a pessoa escolheu.
    const tituloSugerido = turnos.find((t) => t.papel === "voce" && !t.erro)?.texto || texto;

    // O modelo recebe o DIÁLOGO (pergunta + resumo do que já foi construído),
    // nunca os erros de exibição. É a mesma conversa que a pessoa vê.
    const paraOModelo = [...turnos, { papel: "voce" as const, texto }]
      .filter((t) => !t.erro)
      .map((t) => ({ role: t.papel === "voce" ? "user" : "assistant", content: t.texto }));

    try {
      const r = await enviarComRetentativa("/api/arquiteto/gerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // As IMAGENS e os TOKENS do projeto vão junto: o modelo é avisado, na
        // instrução, de quais assets existem e de quais tokens usar — assim o
        // projeto NASCE obedecendo ao painel de tokens, não com cor fixa.
        body: JSON.stringify({
          mensagens: paraOModelo,
          assets: assets.map((a) => a.caminho),
          tokens,
          // A PONTE DAS INTEGRAÇÕES (dono, 09/10/2026): o construtor precisa saber
          // QUAIS integrações este projeto usa (para chamar `window.miraiPonte` em
          // vez de escrever a chave no código). Vai só a lista de ids — nunca chave.
          projetoId,
          integracoes: usadas,
          // O .md DO PROJETO (dono, 08/10/2026): vai o texto que está na tela para o
          // construtor SEGUIR as decisões já tomadas nas próximas mudanças. Sem
          // isto ele só teria o diálogo (pedidos + resumos) e refaria no escuro.
          docProjeto:
            projetoAtual?.arquivos.find((a) => a.nome.trim().toLowerCase() === "projeto.md")?.conteudo ?? "",
          // OS ARQUIVOS ATUAIS (dono, 10/10/2026): o construtor precisa VER o
          // código COMO ESTÁ para MUDAR o pedaço que foi marcado. Sem isto ele só
          // tinha o diálogo + o .md (resumos) e RECONSTRUÍA tudo no escuro — era o
          // que fazia "marcar e mudar" acabar mudando outra coisa.
          // O REF (dono, 11/10/2026): ler o projeto do ref, não do fechamento —
          // assim o envio leva o projeto do MOMENTO e nunca um valor velho (foi um
          // envio sem arquivos que fez a tela mostrar "Não deu para construir
          // agora (200)"). O servidor também sabe buscar no banco se vier vazio.
          arquivos: (projetoAtual?.arquivos ?? []).map((a) => ({ nome: a.nome, conteudo: a.conteudo })),
          // A FOTO DO PEDAÇO MARCADO (dono, 09/10/2026): a VISÃO do construtor. O
          // modelo de construção não enxerga imagem — quem lê esta foto é um modelo
          // que enxerga, e a descrição dele entra na instrução (na rota).
          foto: foto?.imagem ?? "",
        }),
      });
      const d = (await lerRespostaComProgresso(r, setProgresso)) as {
        ok?: boolean;
        resumo?: string;
        arquivos?: Arquivo[];
        erro?: string;
        visao?: string;
        levouMs?: number;
      };

      if (!r.ok || !d.ok || !d.arquivos?.length) {
        // A MENSAGEM DIZ A VERDADE: sessão expirada, conexão caída ou resposta
        // sem arquivos são causas DIFERENTES — antes todas apareciam como "sem
        // os arquivos do projeto" (foi o que o dono viu com a sessão expirada).
        // E o TEMPO entra junto: quem esperou 3 minutos tem o direito de saber que
        // esperou 3 minutos (e não que "nada aconteceu").
        const espera = d.levouMs ? ` (esperei ${formatarDuracao(d.levouMs)})` : "";
        const msg =
          motivoDaFalha(
            r,
            d,
            "A resposta veio sem os arquivos do projeto e nada foi alterado. Tente de novo; se repetir, abra o projeto outra vez.",
          ) + espera;
        setErro(msg);
        setTurnos((t) => [...t, { papel: "mirai", texto: msg, erro: true }]);
        sessaoExpirou(r);
        return;
      }
      // O pedido foi aceito: a foto cumpriu o papel (o construtor já a viu) e sai da
      // tela — assim ela não viaja de novo, sem querer, no próximo pedido.
      setFoto(null);
      // A foto foi junto mas NINGUÉM conseguiu ler: a tela diz, em vez de deixar
      // parecer que o construtor enxergou.
      if (d.visao === "ilegivel") {
        setTurnos((t) => [
          ...t,
          { papel: "mirai", texto: "não consegui ler a foto do pedaço marcado — este pedido foi só com a referência de texto." },
        ]);
      }

      // O estado ANTERIOR entra no desfazer ANTES de a bancada mudar.
      registrarPasso(projeto);
      setProjeto({ resumo: d.resumo || "Projeto atualizado.", arquivos: d.arquivos });
      setArquivoAtivo(0);
      // O TEMPO no resultado (dono, 11/10/2026): saber quanto levou é saber se o
      // pedido "realmente aconteceu" — e quanto custa, em espera, cada tipo de
      // pedido. Aparece sempre, discreto, no fim do resumo.
      const comTempo = d.levouMs
        ? `${d.resumo || "Projeto atualizado."} · levou ${formatarDuracao(d.levouMs)}`
        : d.resumo || "Projeto atualizado.";
      setTurnos((t) => [...t, { papel: "mirai", texto: comTempo }]);
      // SALVA sozinho: é isto que faz o projeto não se perder no reload nem no
      // fechar da aba. Sem clique extra — cria na primeira vez, atualiza depois.
      void salvarNoServidor(d.arquivos, tituloSugerido);
    } catch {
      // A conexão caiu — mas o SERVIDOR continua trabalhando e GRAVA o resultado por
      // conta própria (dono, 11/10/2026: "quero apps grandes"). Em vez de mandar a
      // pessoa refazer minutos de trabalho, espera o resultado aparecer no projeto.
      setTurnos((t) => [
        ...t,
        {
          papel: "mirai",
          texto: "A conexão caiu no meio, mas o trabalho CONTINUA no servidor. Estou esperando o resultado — pode deixar esta tela aberta.",
        },
      ]);
      const veio = await esperarResultadoNoServidor(assinaturaArquivos(projetoAtual?.arquivos ?? []));
      if (veio) {
        registrarPasso(projeto);
        setProjeto({ resumo: "O trabalho terminou no servidor enquanto a conexão estava caída.", arquivos: veio });
        setArquivoAtivo(0);
        setTurnos((t) => [
          ...t,
          {
            papel: "mirai",
            texto: `A conexão caiu, mas o trabalho continuou no servidor e terminou — o projeto foi atualizado (levou ${formatarDuracao(
              Date.now() - inicioPedido,
            )} no total).`,
          },
        ]);
        setErro("");
        return;
      }
      // Não chegou: aí sim a mensagem diz o que de fato aconteceu — e informa quanto
      // tempo se esperou (o dono quer saber se o pedido realmente rodou).
      const msg = `A conexão caiu e o pedido não chegou ao fim depois de ${formatarDuracao(
        Date.now() - inicioPedido,
      )} — nada foi alterado. Tente de novo.`;
      setErro(msg);
      setTurnos((t) => [...t, { papel: "mirai", texto: msg, erro: true }]);
    } finally {
      setGerando(false);
    }
  }

  async function copiar() {
    const arq = projeto?.arquivos[arquivoAtivo];
    if (!arq) return;
    try {
      await navigator.clipboard.writeText(arq.conteudo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1600);
    } catch {
      /* área de transferência bloqueada: sem drama, sem mentira */
    }
  }

  /* ── PERSISTÊNCIA: o projeto é da CONTA (o servidor guarda, escopado por lá) ── */

  /** Lê a lista de projetos da conta. A fonte da verdade é o servidor. */
  async function carregarProjetos(): Promise<ProjetoResumo[]> {
    try {
      const r = await fetch("/api/arquiteto/projetos", { cache: "no-store" });
      const j = r.ok ? await r.json() : null;
      const lista: ProjetoResumo[] = Array.isArray(j?.projetos) ? j.projetos : [];
      setProjetos(lista);
      return lista;
    } catch {
      return projetos;
    }
  }

  /** Lê as PASTAS (as categorias) da conta. A fonte da verdade é o servidor. */
  async function carregarPastas(): Promise<PastaResumo[]> {
    try {
      const r = await fetch("/api/arquiteto/pastas", { cache: "no-store" });
      const j = r.ok ? await r.json() : null;
      const lista: PastaResumo[] = Array.isArray(j?.pastas) ? j.pastas : [];
      setPastas(lista);
      return lista;
    } catch {
      return pastas;
    }
  }

  /**
   * ESCOLHE a pasta do projeto (dono, 11/10/2026). Dois caminhos:
   *   - projeto ABERTO  → move na hora (PATCH) e a lista é relida;
   *   - projeto A NASCER → guarda a escolha; ela vai no primeiro salvamento,
   *     então o projeto já nasce dentro da categoria.
   * O espelho (`ref`) existe porque o salvamento é assíncrono e não pode ler
   * estado velho.
   */
  async function escolherPasta(pastaId: string | null) {
    const alvo = pastaId || null;
    pastaDoProjetoRef.current = alvo;
    setPastaDoProjeto(alvo);
    setErroPasta("");
    const pid = projetoIdRef.current;
    if (!pid) return; // projeto ainda não nasceu: a escolha vai no primeiro save
    try {
      const r = await fetch(`/api/arquiteto/projetos/${encodeURIComponent(pid)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pastaId: alvo }),
      });
      if (!r.ok) {
        setErroPasta("Não deu para mover agora.");
        return;
      }
      await carregarProjetos();
      await carregarPastas();
    } catch {
      setErroPasta("Sem rede: a pasta não mudou.");
    }
  }

  /** CRIA uma pasta pelo nome e já coloca o projeto (aberto ou por nascer) nela. */
  async function criarPastaInline() {
    const nome = nomePastaNova.trim();
    if (!nome) return;
    setErroPasta("");
    try {
      const r = await fetch("/api/arquiteto/pastas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome }),
      });
      const j = r.ok ? await r.json() : null;
      const nova = j?.pasta as PastaResumo | undefined;
      if (!nova?.id) {
        setErroPasta("Não deu para criar a pasta.");
        return;
      }
      setNomePastaNova("");
      setCriandoPasta(false);
      await carregarPastas();
      await escolherPasta(nova.id);
    } catch {
      setErroPasta("Sem rede: a pasta não foi criada.");
    }
  }

  /**
   * ESPERA O RESULTADO QUE O SERVIDOR ESTÁ GRAVANDO (dono, 11/10/2026).
   *
   * Numa construção longa (app grande = minutos), a conexão pode cair no meio. O
   * servidor NÃO para: ele termina e GRAVA o resultado por conta própria. Em vez de
   * mandar a pessoa refazer tudo, aqui a tela espera o resultado aparecer no projeto
   * e o mostra. Devolve os arquivos quando eles mudarem; null se não chegar.
   */
  async function esperarResultadoNoServidor(
    assinaturaAntes: string,
    limiteMs = 240000,
  ): Promise<Arquivo[] | null> {
    const pid = projetoIdRef.current;
    if (!pid) return null;
    const t0 = Date.now();
    while (Date.now() - t0 < limiteMs) {
      await new Promise((r) => setTimeout(r, 10000));
      try {
        const r = await fetch(`/api/arquiteto/projetos/${pid}`, { cache: "no-store" });
        if (!r.ok) continue;
        const j = (await r.json()) as { projeto?: { arquivos?: Arquivo[] } };
        const arqs = j?.projeto?.arquivos ?? [];
        if (arqs.length && assinaturaArquivos(arqs) !== assinaturaAntes) return arqs;
      } catch {
        /* a rede ainda está fora: tenta de novo na próxima volta */
      }
    }
    return null;
  }

  /**
   * SALVA o projeto no servidor (dono = a conta). Cria na primeira vez,
   * atualiza depois — sem clique extra. Se o id guardado não valer mais (404),
   * cria um novo para não perder o trabalho. Salvar é um efeito, não o foco:
   * falhou, a tela segue com o projeto; nada é mentido aqui.
   *
   * Devolve `true` quando o estado está GRAVADO no servidor (o editor usa isso
   * para dizer "salvo" com honestidade). O servidor é idempotente: reenviar
   * conteúdo igual NÃO cria versão nova.
   */
  async function salvarNoServidor(
    arquivos: Arquivo[],
    tituloSugerido: string,
    tokensNovos?: Tokens,
  ): Promise<boolean> {
    if (!arquivos.length) return false;
    setSalvando(true);
    try {
      const enviar = (pid: string | null) =>
        fetch("/api/arquiteto/projetos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projetoId: pid,
            titulo: pid ? null : tituloSugerido,
            arquivos,
            // Só manda os tokens quando há um conjunto novo (o painel). Sem
            // isso, o servidor MANTÉM os tokens — edição de arquivo não os apaga.
            ...(tokensNovos ? { tokens: tokensNovos } : {}),
            // A PASTA escolhida viaja com o NASCIMENTO do projeto (dono,
            // 11/10/2026): é o que faz o projeto já nascer dentro da categoria.
            // Em projeto que JÁ existe, a pasta é gerida pelo PATCH — não se
            // reenvia aqui, para não sobrescrever uma escolha mais nova.
            ...(pid === null && pastaDoProjetoRef.current
              ? { pastaId: pastaDoProjetoRef.current }
              : {}),
          }),
        });
      let r = await enviar(projetoIdRef.current);
      if (r.status === 404 && projetoIdRef.current) r = await enviar(null);
      const j = r.ok ? await r.json() : null;
      const p = j?.projeto as { id?: string } | undefined;
      if (p?.id) {
        const eraNovo = !projetoIdRef.current;
        projetoIdRef.current = p.id;
        setProjetoId(p.id);
        // Projeto recém-criado não tem link público nenhum: o estado honesto é
        // "não publicado" (nada de mostrar o link de outro projeto).
        if (eraNovo) {
          setPublicarToken(null);
          setPublicadoEm(null);
        }
        // O que acabou de ir para o servidor é a nova base (nada a regravar).
        ultimaAssinaturaRef.current = assinaturaArquivos(arquivos);
        await carregarProjetos();
        // A história do projeto acabou de ganhar uma versão: relê a lista.
        await carregarVersoes(p.id);
        return true;
      }
      return false;
    } catch {
      /* sem rede: o projeto continua na tela; tentamos de novo no próximo */
      return false;
    } finally {
      setSalvando(false);
    }
  }

  /* ── EDITOR de código: digitar muda o arquivo, a prévia re-monta e salva ── */

  /** Cancela um autosave pendente (ao trocar/carregar projeto — não vaza estado). */
  function cancelarSalvarPendente() {
    if (salvarTimer.current) {
      clearTimeout(salvarTimer.current);
      salvarTimer.current = null;
    }
  }

  /**
   * Uma tecla no editor: o arquivo ativo muda NA HORA (a prévia re-monta com um
   * debounce curto) e o autosave entra na fila. O salvamento só dispara quando o
   * conteúdo REALMENTE difere do que já está no servidor — nada de versão vazia.
   */
  function editarArquivo(novoConteudo: string) {
    if (!projeto) return;
    const arquivos = projeto.arquivos.map((a, i) =>
      i === arquivoAtivo ? { ...a, conteudo: novoConteudo } : a,
    );
    setProjeto({ ...projeto, arquivos });
    setErro("");
    setEstadoSalvo("salvando");
    // Marca de qual projeto é esta edição: trocar de projeto no meio não grava
    // a edição no projeto errado.
    const pidAoEditar = projetoIdRef.current;
    cancelarSalvarPendente();
    salvarTimer.current = setTimeout(() => {
      salvarTimer.current = null;
      if (projetoIdRef.current !== pidAoEditar) return;
      void comitarEdicao(arquivos, projeto.resumo);
    }, 700);
  }

  /** Grava a edição — pulando o POST quando o conteúdo não mudou de verdade. */
  async function comitarEdicao(arquivos: Arquivo[], titulo: string) {
    if (assinaturaArquivos(arquivos) === ultimaAssinaturaRef.current) {
      setEstadoSalvo("salvo"); // já está no servidor: nada a fazer
      return;
    }
    setEstadoSalvo("salvando");
    const ok = await salvarNoServidor(arquivos, titulo);
    setEstadoSalvo(ok ? "salvo" : "erro");
  }

  /* ── TOKENS DE DESIGN: editar muda a prévia na hora e salva (vira versão) ── */

  /** Cancela um salvamento de token pendente (ao trocar/zera projeto). */
  function cancelarTokensPendente() {
    if (tokenTimer.current) {
      clearTimeout(tokenTimer.current);
      tokenTimer.current = null;
    }
  }

  /**
   * Uma mudança no painel de tokens: o conjunto novo vale NA HORA (a prévia
   * re-monta) e o salvamento entra na fila com debounce curto — arrastar um
   * seletor de cor não dispara um POST por quadro. O valor passa pelo MESMO
   * `normalizarTokens` do servidor: o que se vê é o que se grava.
   */
  function editarToken(nome: NomeToken, valor: string) {
    const proximos = normalizarTokens({ ...tokens, [nome]: valor });
    setTokens(proximos);
    setEstadoTokens("salvando");
    cancelarTokensPendente();
    tokenTimer.current = setTimeout(() => {
      tokenTimer.current = null;
      void comitarTokens(proximos);
    }, 500);
  }

  /** Volta os tokens aos padrões do Arquiteto (e salva). */
  function restaurarTokens() {
    const padrao = normalizarTokens(TOKENS_PADRAO);
    setTokens(padrao);
    setEstadoTokens("salvando");
    cancelarTokensPendente();
    tokenTimer.current = setTimeout(() => {
      tokenTimer.current = null;
      void comitarTokens(padrao);
    }, 500);
  }

  /**
   * Grava os tokens no projeto aberto. Mudar um token é MUDANÇA DO PROJETO: o
   * servidor grava e cria uma VERSÃO (arquivos + tokens). Sem projeto ainda, o
   * painel diz a verdade e não inventa gravação.
   */
  async function comitarTokens(novos: Tokens) {
    const p = projetoRef.current;
    if (!p?.arquivos?.length) {
      setEstadoTokens("ocioso");
      return;
    }
    const ok = await salvarNoServidor(p.arquivos, p.resumo, novos);
    setEstadoTokens(ok ? "salvo" : "erro");
  }

  /* ── HISTÓRIA do projeto (versões no servidor) ──────────────────────────── */

  /** Lê a história do projeto aberto. A fonte da verdade é o servidor. */
  async function carregarVersoes(id: string | null) {
    if (!id) {
      setVersoes([]);
      return;
    }
    try {
      const r = await fetch(`/api/arquiteto/projetos/${id}/versoes`, { cache: "no-store" });
      const j = r.ok ? await r.json() : null;
      setVersoes(Array.isArray(j?.versoes) ? (j.versoes as VersaoResumo[]) : []);
    } catch {
      /* sem rede: a lista fica como estava — nada é inventado */
    }
  }

  /* ── IMAGENS do projeto: subir, listar, remover (BLOB no servidor) ─────────
     O navegador valida (recusa rápida com PT-BR honesto) e o SERVIDOR valida de
     novo, por magic bytes — nunca confiando no tipo declarado. A lista é escopo
     da conta: o servidor só responde o projeto da sessão. */

  /** Lê a lista de imagens do projeto aberto. A fonte da verdade é o servidor. */
  async function carregarAssets(id: string | null) {
    if (!id) {
      setAssets([]);
      setAssetAtivo(null);
      return;
    }
    try {
      const r = await fetch(`/api/arquiteto/projetos/${id}/assets`, { cache: "no-store" });
      const j = r.ok ? await r.json() : null;
      setAssets(Array.isArray(j?.assets) ? (j.assets as Asset[]) : []);
    } catch {
      /* sem rede: a lista fica como estava — nada é inventado */
    }
  }

  /** Sobe UM arquivo do projeto (imagem OU fonte da web). O tipo REAL é conferido
      no servidor por magic bytes; aqui só barramos o que nem parece. */
  async function enviarAsset(file: File) {
    const id = projetoIdRef.current;
    if (!id) {
      setErroAsset("Construa o projeto primeiro (uma geração) para poder guardar arquivos nele.");
      return;
    }
    const recusa = validarAssetNoNavegador(file);
    if (recusa) {
      setErroAsset(recusa);
      return;
    }
    const eFonte = ehFonte(mimeDeclaradoAsset(file));
    setErroAsset("");
    setEnviandoAsset(true);
    try {
      const fd = new FormData();
      fd.append("file", file, file.name);
      fd.append("nome", file.name);
      const r = await fetch(`/api/arquiteto/projetos/${id}/assets`, { method: "POST", body: fd });
      const j = (await r.json().catch(() => ({}))) as {
        asset?: Asset;
        assets?: Asset[];
        erro?: string;
        convertida?: { de: string; para: string; bytes_origem: number; bytes_final: number };
      };
      const novo = j?.asset;
      if (!r.ok || !novo) {
        setErroAsset(j?.erro || `Não deu para enviar o arquivo (${r.status}). Tente de novo.`);
        return;
      }
      if (Array.isArray(j.assets)) setAssets(j.assets);
      else setAssets((a) => [...a, novo]);
      setAssetAtivo(novo.caminho);
      setTurnos((t) => [
        ...t,
        {
          papel: "mirai",
          texto: eFonte
            ? `Fonte enviada: ${novo.caminho} — a família é "${familiaDaFonte(novo.caminho)}".${
                j.convertida
                  ? ` Foi convertida de ${j.convertida.de.replace("font/", "").toUpperCase()} para WOFF2 (${tamanhoLegivel(j.convertida.bytes_final)}, ${Math.max(
                      0,
                      Math.round((1 - j.convertida.bytes_final / Math.max(1, j.convertida.bytes_origem)) * 100),
                    )}% menor).`
                  : ""
              } Ela já vale na prévia e no site publicado; no CSS, use font-family: "${familiaDaFonte(novo.caminho)}".`
            : `Imagem enviada: ${novo.caminho}. Peça para eu usá-la no projeto (ex.: “use a ${novo.caminho} no topo”).`,
        },
      ]);
    } catch {
      setErroAsset("Caiu a conexão ao enviar o arquivo. Tente de novo.");
    } finally {
      setEnviandoAsset(false);
    }
  }

  /** Apaga a imagem do projeto (os BYTES saem do banco). */
  async function removerAsset(caminho: string) {
    const id = projetoIdRef.current;
    if (!id) return;
    setErroAsset("");
    try {
      const r = await fetch(
        `/api/arquiteto/projetos/${id}/assets?caminho=${encodeURIComponent(caminho)}`,
        { method: "DELETE" },
      );
      const j = (await r.json().catch(() => ({}))) as { assets?: Asset[]; erro?: string };
      if (!r.ok) {
        setErroAsset(j?.erro || `Não deu para remover a imagem (${r.status}).`);
        return;
      }
      if (Array.isArray(j.assets)) setAssets(j.assets);
      else setAssets((a) => a.filter((x) => x.caminho !== caminho));
    } catch {
      setErroAsset("Caiu a conexão ao remover a imagem. Tente de novo.");
    }
    setAssetAtivo((atual) => (atual === caminho ? null : atual));
  }

  /** O arquivo escolhido no <input type=file> (uma imagem por vez). */
  function escolherImagem(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ""; // deixa escolher o MESMO arquivo de novo
    if (f) void enviarAsset(f);
  }

  /** Soltar uma imagem sobre a prévia (drag-and-drop). */
  function aoSoltarImagem(e: DragEventReact) {
    e.preventDefault();
    setArrastando(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) void enviarAsset(f);
  }

  /**
   * RESTAURA uma versão. O servidor LÊ aquela versão, grava os arquivos dela
   * como atuais e CRIA uma versão nova por cima — a história nunca é destruída.
   * A restauração também entra no desfazer (dá para voltar atrás dela).
   */
  async function restaurarVersaoServidor(numero: number) {
    const id = projetoIdRef.current;
    if (!id || !projeto) return;
    cancelarSalvarPendente();
    registrarPasso(projeto);
    setMenuHistorico(false);
    try {
      const r = await fetch(`/api/arquiteto/projetos/${id}/versoes/${numero}`, { method: "POST" });
      const j = r.ok ? await r.json() : null;
      const p = j?.projeto as
        | { id: string; titulo: string; arquivos: Arquivo[]; tokens?: Tokens; publicar_token?: string | null; publicado_em?: string | null }
        | undefined;
      const vs = j?.versoes as VersaoResumo[] | undefined;
      if (!p?.arquivos?.length) {
        setErro("Não consegui restaurar essa versão agora. Tente de novo.");
        return;
      }
      setProjeto({ resumo: p.titulo, arquivos: p.arquivos });
      // A versão restaurada traz os TOKENS dela de volta — é parte do snapshot.
      setTokens(normalizarTokens(p.tokens));
      setEstadoTokens("ocioso");
      refletirPublicacao(p);
      setArquivoAtivo(0);
      setErro("");
      ultimaAssinaturaRef.current = assinaturaArquivos(p.arquivos);
      setEstadoSalvo("ocioso");
      if (Array.isArray(vs)) setVersoes(vs);
      setTurnos((t) => [
        ...t,
        {
          papel: "mirai",
          texto: `Restaurei a versão ${numero}. O histórico foi preservado — a restauração virou uma nova versão.`,
        },
      ]);
    } catch {
      setErro("Caiu a conexão ao restaurar a versão. Tente de novo.");
    }
  }

  /* ── DESFAZER / REFAZER (o estado da bancada, na sessão) ────────────────── */

  /** Guarda o estado ANTERIOR na pilha de desfazer e zera o refazer. */
  function registrarPasso(anterior: Projeto | null) {
    if (!anterior) return;
    setPassado((h) => [...h, anterior].slice(-LIMITE_UNDO));
    setFuturo([]);
  }

  /** Aplica um estado na bancada e persiste (o reload tem de concordar). */
  function aplicarNaBancada(p: Projeto) {
    setProjeto(p);
    setArquivoAtivo((i) => Math.max(0, Math.min(i, p.arquivos.length - 1)));
    setErro("");
    void salvarNoServidor(p.arquivos, p.resumo);
  }

  /** Desfaz: traz o último estado guardado de volta e move o atual ao refazer. */
  function desfazer() {
    if (!passado.length || !projeto) return;
    const anterior = passado[passado.length - 1];
    setPassado((h) => h.slice(0, -1));
    setFuturo((f) => [...f, projeto].slice(-LIMITE_UNDO));
    aplicarNaBancada(anterior);
  }

  /** Refaz: reaplica o último estado desfeito e o devolve ao desfazer. */
  function refazer() {
    if (!futuro.length || !projeto) return;
    const proximo = futuro[futuro.length - 1];
    setFuturo((f) => f.slice(0, -1));
    setPassado((h) => [...h, projeto].slice(-LIMITE_UNDO));
    aplicarNaBancada(proximo);
  }

  /* ── PUBLICAÇÃO (item 10): publicar, despublicar e copiar o link ───────────
     Publicar NÃO congela nada: o link SEMPRE mostra o estado ATUAL do projeto
     (a página pública lê o projeto a cada acesso). Republicar mantém o MESMO
     link e atualiza a data. Despublicar ZERA o token no servidor e o link para
     de funcionar na hora. O token vem do servidor e NUNCA é impresso em lugar
     nenhum — nem aqui, nem em log. */

  /** Reflete no estado o que o servidor devolveu sobre a publicação. */
  function refletirPublicacao(p: {
    publicar_token?: string | null;
    publicado_em?: string | null;
  }) {
    setPublicarToken(typeof p.publicar_token === "string" ? p.publicar_token : null);
    setPublicadoEm(typeof p.publicado_em === "string" ? p.publicado_em : null);
    setErroPublicar("");
  }

  /** O endereço do projeto (o nome que vira site). "" = sem endereço ainda. */
  function urlDoEndereco(): string {
    const s = (endSlug || "").trim();
    return s ? `https://${s}.miraitohope.com` : "";
  }

  /** Lê do SERVIDOR o endereço + estado do projeto. A tela não inventa nada. */
  async function carregarEndereco(id: string) {
    try {
      const r = await fetch(`/api/arquiteto/projetos/${id}/endereco`);
      const j = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        slug?: string | null;
        sugerido?: string;
        publicado_em?: string | null;
      };
      if (!r.ok || !j?.ok) return;
      const slug = typeof j.slug === "string" && j.slug ? j.slug : null;
      setEndSlug(slug);
      setEndTexto(slug ?? j.sugerido ?? "");
      setEndSugerido(j.sugerido ?? "");
      if (typeof j.publicado_em === "string") setPublicadoEm(j.publicado_em);
    } catch {
      /* sem drama: a aba mostra o que tem */
    }
  }

  /** Grava o endereço. Recusa do servidor vem com recado em PT-BR (curto,
   *  reservado, com formato estranho ou já em uso). */
  async function salvarEndereco(valor: string) {
    const id = projetoIdRef.current;
    if (!id || endSalvando) return;
    setEndSalvando(true);
    setEndErro("");
    setEndAviso("");
    try {
      const r = await fetch(`/api/arquiteto/projetos/${id}/endereco`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: valor }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        slug?: string | null;
        erro?: string;
      };
      if (!r.ok || !j?.ok) {
        setEndErro(j?.erro || `Não deu para salvar agora (${r.status}). Tente de novo.`);
        return;
      }
      const slug = typeof j.slug === "string" && j.slug ? j.slug : null;
      setEndSlug(slug);
      setEndTexto(slug ?? "");
      setEndAviso(
        slug
          ? `Endereço salvo: ${slug}.miraitohope.com${publicarToken ? "" : " — ele abre quando você publicar."}`
          : "Endereço removido: o projeto volta a viver só no link.",
      );
    } catch {
      setEndErro("Caiu a conexão ao salvar o endereço. Tente de novo.");
    } finally {
      setEndSalvando(false);
    }
  }

  function abrirEndereco() {
    const u = urlDoEndereco();
    if (u) window.open(u, "_blank", "noopener");
  }

  /** Lê do servidor o DOMÍNIO próprio + se o DNS já aponta (conferência ao vivo). */
  async function carregarDominio(id: string) {
    if (!id) return;
    try {
      const r = await fetch(`/api/arquiteto/projetos/${id}/dominio`);
      const j = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        dominio?: string | null;
        ip_borda?: string;
        apontamento?: { estado?: string };
        link?: string | null;
        pronto_em?: string | null;
        erro_publicacao?: string | null;
      };
      if (!r.ok || !j?.ok) return;
      const d = typeof j.dominio === "string" && j.dominio ? j.dominio : null;
      setDomSalvo(d);
      setDomTexto(d ?? "");
      setDomIpBorda(j.ip_borda ?? "");
      setDomLink(typeof j.link === "string" ? j.link : "");
      setDomProntoEm(typeof j.pronto_em === "string" ? j.pronto_em : null);
      setDomFalha(typeof j.erro_publicacao === "string" ? j.erro_publicacao : "");
      const est = j.apontamento?.estado;
      setDomEstado(est === "apontando" || est === "aguardando" || est === "sem-resposta" ? est : "");
      void carregarCloudflare(id);
    } catch {
      /* sem drama: a aba mostra o que tem */
    }
  }

  /** Lê o estado da conexão com o Cloudflare (nunca traz o token). */
  async function carregarCloudflare(id: string) {
    if (!id) return;
    try {
      const r = await fetch(`/api/arquiteto/projetos/${id}/dominio/cloudflare`);
      const j = (await r.json().catch(() => ({}))) as {
        conectado?: boolean;
        zona?: string | null;
      };
      setCfConectado(!!j.conectado);
      setCfZona(typeof j.zona === "string" ? j.zona : "");
    } catch {
      /* a aba mostra o que tem */
    }
  }

  /** O botão "criar o registro agora" (tentar de novo, ou depois de mudar o domínio). */
  async function criarRegistroCloudflare() {
    const id = projetoIdRef.current;
    if (!id || cfOcupado) return;
    setCfOcupado(true);
    setCfAviso("");
    try {
      const r = await fetch(`/api/arquiteto/projetos/${id}/dominio/cloudflare`, { method: "POST" });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; mensagem?: string; erro?: string };
      setCfAviso(j.mensagem || j.erro || `Não deu agora (${r.status}).`);
      void carregarDominio(id);
    } finally {
      setCfOcupado(false);
    }
  }

  /** Esquece a conexão com o Cloudflare (o dono desconectou). */
  async function esquecerCloudflare() {
    const id = projetoIdRef.current;
    if (!id || cfOcupado) return;
    setCfOcupado(true);
    setCfAviso("");
    try {
      await fetch(`/api/arquiteto/projetos/${id}/dominio/cloudflare`, { method: "DELETE" });
      setCfConectado(false);
      setCfZona("");
      setCfAviso("Cloudflare desconectado. O registro que já foi criado continua lá — apague no painel do domínio se quiser.");
    } finally {
      setCfOcupado(false);
    }
  }

  /**
   * A MENSAGEM PRONTA para o cliente (dono, 09/10/2026: "um processo rápido de
   * explicar o que deve ser feito"). É o que se manda no WhatsApp: o que fazer,
   * o registro exato e o link onde ele acompanha — sem ninguém digitar IP.
   */
  function mensagemDoCliente(): string {
    const d = domSalvo || "seu domínio";
    const ip = domIpBorda || "o IP do servidor";
    return [
      `Oi! Para o site abrir em ${d}, falta só um passo no painel do domínio:`,
      ``,
      `1) Entre no painel onde o domínio está registrado e abra a área de DNS ("Zona DNS" ou "Gerenciar DNS").`,
      `2) Crie um registro:`,
      `   Tipo: A    Nome: @    Valor: ${ip}`,
      `   (e outro igual, com Nome: www)`,
      `3) Salve. Pode levar de alguns minutos a algumas horas para propagar.`,
      ``,
      `Acompanhe por aqui, atualiza na hora: ${domLink}`,
    ].join("\n");
  }

  /** Conecta (ou desconecta, com vazio) o domínio próprio do projeto. */
  async function salvarDominio(valor: string) {
    const id = projetoIdRef.current;
    if (!id || domSalvando) return;
    setDomSalvando(true);
    setDomErro("");
    setDomAviso("");
    try {
      const r = await fetch(`/api/arquiteto/projetos/${id}/dominio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dominio: valor }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        dominio?: string | null;
        ip_borda?: string;
        apontamento?: { estado?: string };
        link?: string | null;
        pronto_em?: string | null;
        erro_publicacao?: string | null;
        erro?: string;
      };
      if (!r.ok || !j?.ok) {
        setDomErro(j?.erro || `Não deu para conectar agora (${r.status}). Tente de novo.`);
        return;
      }
      const d = typeof j.dominio === "string" && j.dominio ? j.dominio : null;
      setDomSalvo(d);
      setDomTexto(d ?? "");
      setDomIpBorda(j.ip_borda ?? "");
      setDomLink(typeof j.link === "string" ? j.link : "");
      setDomProntoEm(typeof j.pronto_em === "string" ? j.pronto_em : null);
      setDomFalha(typeof j.erro_publicacao === "string" ? j.erro_publicacao : "");
      const est = j.apontamento?.estado;
      setDomEstado(est === "apontando" || est === "aguardando" || est === "sem-resposta" ? est : "");
      setDomAviso(
        !d
          ? "Domínio desconectado."
          : est === "apontando"
            ? `${d} conectado — o DNS já aponta para o servidor.`
            : `${d} conectado. Falta o DNS apontar (o passo está logo abaixo).`,
      );
    } catch {
      setDomErro("Caiu a conexão ao conectar o domínio. Tente de novo.");
    } finally {
      setDomSalvando(false);
    }
  }

  async function copiarEndereco() {
    const u = urlDoEndereco();
    if (!u) return;
    try {
      await navigator.clipboard.writeText(u);
      setEndCopiado(true);
      setTimeout(() => setEndCopiado(false), 1600);
    } catch {
      setEndErro("O navegador não deixou copiar. Selecione o endereço à mão.");
    }
  }

  /** A URL pública do projeto, montada com a ORIGEM atual do navegador. */
  function urlPublica(): string {
    if (!publicarToken || typeof window === "undefined") return "";
    return `${window.location.origin}/p/${publicarToken}`;
  }

  /** PUBLICA (ou REPUBLICA) o projeto. O servidor cria o token e devolve a URL. */
  async function publicar() {
    const id = projetoIdRef.current;
    if (!id || publicando) return;
    setPublicando(true);
    setErroPublicar("");
    try {
      const r = await fetch(`/api/arquiteto/projetos/${id}/publicar`, { method: "POST" });
      const j = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        token?: string;
        publicado_em?: string;
        slug?: string | null;
        erro?: string;
      };
      if (!r.ok || !j?.token) {
        setErroPublicar(j?.erro || `Não deu para publicar agora (${r.status}). Tente de novo.`);
        return;
      }
      setPublicarToken(j.token);
      setPublicadoEm(typeof j.publicado_em === "string" ? j.publicado_em : null);
      // PUBLICAR TAMBÉM DÁ O ENDEREÇO (o servidor cria um a partir do título na
      // primeira publicação) — a aba Domínios precisa refletir isso na hora.
      if (typeof j.slug === "string" && j.slug) {
        setEndSlug(j.slug);
        setEndTexto(j.slug);
        setEndSugerido(j.slug);
      }
    } catch {
      setErroPublicar("Caiu a conexão ao publicar. Tente de novo.");
    } finally {
      setPublicando(false);
    }
  }

  /** DESPUBLICA. Só limpa a tela DEPOIS que o servidor confirma — nada mentido. */
  async function despublicar() {
    const id = projetoIdRef.current;
    if (!id || publicando) return;
    setPublicando(true);
    setErroPublicar("");
    try {
      const r = await fetch(`/api/arquiteto/projetos/${id}/publicar`, { method: "DELETE" });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { erro?: string };
        setErroPublicar(j?.erro || `Não deu para despublicar agora (${r.status}).`);
        return;
      }
      setPublicarToken(null);
      setPublicadoEm(null);
    } catch {
      setErroPublicar("Caiu a conexão ao despublicar. Tente de novo.");
    } finally {
      setPublicando(false);
    }
  }

  /** Copia o link público. Se a área de transferência estiver bloqueada, o link
      continua à vista no campo para copiar à mão — nada de mentir "copiado". */
  async function copiarLink() {
    const url = urlPublica();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopiado(true);
      setTimeout(() => setLinkCopiado(false), 1600);
    } catch {
      /* área de transferência bloqueada: sem drama, o campo segue copiável */
    }
  }

  /** Abre um projeto da conta: arquivos, árvore e prévia voltam ao lugar. */
  async function abrirProjeto(id: string) {
    setMenuAberto(false);
    setErro("");
    cancelarSalvarPendente();
    try {
      const r = await fetch(`/api/arquiteto/projetos/${id}`, { cache: "no-store" });
      const j = r.ok ? await r.json() : null;
      const p = j?.projeto as
        | { id: string; titulo: string; arquivos: Arquivo[]; tokens?: Tokens; publicar_token?: string | null; publicado_em?: string | null; pasta_id?: string | null }
        | undefined;
      if (!p?.arquivos?.length) return;
      projetoIdRef.current = p.id;
      setProjetoId(p.id);
      setProjeto({ resumo: p.titulo, arquivos: p.arquivos });
      // A pasta do projeto abre junto com ele (o painel reflete o que é dele).
      const pastaDele = p.pasta_id || null;
      pastaDoProjetoRef.current = pastaDele;
      setPastaDoProjeto(pastaDele);
      // Os TOKENS do projeto abrem junto com ele (o painel reflete o que é dele).
      setTokens(normalizarTokens(p.tokens));
      setEstadoTokens("ocioso");
      refletirPublicacao(p);
      setArquivoAtivo(0);
      ultimaAssinaturaRef.current = assinaturaArquivos(p.arquivos);
      setEstadoSalvo("ocioso");
      // Trocar de projeto zera o desfazer/refazer (é outra bancada) e relê a história.
      setPassado([]);
      setFuturo([]);
      void carregarVersoes(p.id);
      void carregarAssets(p.id);
      setAssetAtivo(null);
      setErroAsset("");
      setTurnos([{ papel: "mirai", texto: `Projeto “${p.titulo}” carregado.` }]);
      // A URL passa a REFLETIR o projeto aberto (dono, 11/10/2026). Sem isto,
      // abrir pelo menu deixava `?projeto=<antigo>` na barra e um reload
      // reabria o antigo — o mesmo sintoma de "abre sempre o mesmo".
      try {
        window.history.replaceState(null, "", `/arquiteto?projeto=${p.id}`);
      } catch {
        /* sem histórico: a tela já está certa, só a barra não acompanha */
      }
    } catch {
      /* sem rede: nada muda, sem mentir */
    }
  }

  /**
   * ABRIR POR LINK (dono, 11/10/2026): a página de Projetos (o portfólio) manda
   * `/arquiteto?projeto=<id>` — o projeto abre já carregado, sem passar pela
   * lista. Roda UMA vez, na entrada.
   */
  useEffect(() => {
    const pid = new URLSearchParams(window.location.search).get("projeto");
    if (pid) void abrirProjeto(pid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Renomeia um projeto (PATCH) e recarrega a lista. */
  async function renomearProjeto(id: string, titulo: string) {
    const novo = titulo.trim();
    if (!novo) {
      setRenomeandoId(null);
      return;
    }
    try {
      const r = await fetch(`/api/arquiteto/projetos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo: novo }),
      });
      if (r.ok) await carregarProjetos();
    } catch {
      /* sem rede: mantém o nome antigo */
    }
    setRenomeandoId(null);
  }

  /** Apaga um projeto. Se era o aberto, a bancada volta ao estado vazio. */
  async function apagarProjeto(id: string) {
    try {
      await fetch(`/api/arquiteto/projetos/${id}`, { method: "DELETE" });
    } catch {
      /* sem rede: não dá para apagar agora */
    }
    await carregarProjetos();
    if (projetoIdRef.current === id) {
      cancelarSalvarPendente();
      projetoIdRef.current = null;
      setProjetoId(null);
      setProjeto(null);
      setTurnos([]);
      setErro("");
      setArquivoAtivo(0);
      ultimaAssinaturaRef.current = "";
      setEstadoSalvo("ocioso");
      setVersoes([]);
      setPassado([]);
      setFuturo([]);
      setAssets([]);
      setAssetAtivo(null);
      setErroAsset("");
      // Bancada vazia: tokens pendentes cancelados e de volta ao padrão.
      cancelarTokensPendente();
      setTokens(normalizarTokens({}));
      setEstadoTokens("ocioso");
      // Bancada vazia: o projeto foi apagado — não há link público para mostrar.
      setMenuPublicar(false);
      setPublicarToken(null);
      setPublicadoEm(null);
      setErroPublicar("");
      setLinkCopiado(false);
    }
  }

  /** Começa um projeto NOVO: limpa a bancada. O anterior continua guardado. */
  function novoProjeto() {
    setMenuAberto(false);
    cancelarSalvarPendente();
    projetoIdRef.current = null;
    setProjetoId(null);
    setProjeto(null);
    // A PASTA ESCOLHIDA FICA (dono, 11/10/2026): quem está criando vários
    // projetos do mesmo cliente/produto não recomeça escolhendo a categoria —
    // o projeto novo NASCE na pasta que já está ali (o `ref` guarda a escolha e
    // o primeiro salvamento a leva). Trocá-la é um clique.
    setCriandoPasta(false);
    setNomePastaNova("");
    setErroPasta("");
    setTurnos([]);
    setErro("");
    setArquivoAtivo(0);
    ultimaAssinaturaRef.current = "";
    setEstadoSalvo("ocioso");
    setModo("responsivo");
    setAbaMobile("conversa");
    setPedido("");
    // Bancada nova: largura e zoom voltam ao padrão (o projeto novo abre cheio).
    setLarguraBase(null);
    setCampoLargura("");
    setZoom(100);
    // Bancada nova: história em branco e desfazer/refazer zerados.
    setVersoes([]);
    setPassado([]);
    setFuturo([]);
    setMenuHistorico(false);
    // Bancada nova: nenhuma imagem ainda (as do projeto anterior ficam lá).
    setAssets([]);
    setAssetAtivo(null);
    setErroAsset("");
    // Bancada nova: tokens de volta ao padrão e salvamento pendente cancelado.
    cancelarTokensPendente();
    setTokens(normalizarTokens({}));
    setEstadoTokens("ocioso");
    // Bancada nova: não há link público nenhum para mostrar.
    setMenuPublicar(false);
    setPublicarToken(null);
    setPublicadoEm(null);
    setErroPublicar("");
    setLinkCopiado(false);
  }

  // Remover um arquivo do projeto. O ÚLTIMO não sai (senão some o projeto);
  // o índice ativo se ajusta para não apontar para o vazio.
  function removerArquivo(i: number) {
    const p = projeto;
    if (!p || p.arquivos.length <= 1) return;
    registrarPasso(p);
    const arquivos = p.arquivos.filter((_, idx) => idx !== i);
    setProjeto({ ...p, arquivos });
    setArquivoAtivo((atual) => {
      if (i < atual) return atual - 1;
      if (i === atual) return Math.min(i, arquivos.length - 1);
      return atual;
    });
    // A árvore é parte do projeto: mudou aqui, guarda no servidor também.
    void salvarNoServidor(arquivos, p.resumo);
  }

  // Adicionar um arquivo VAZIO à mão (nada inventado no conteúdo).
  function adicionarArquivo() {
    const nome = novoNome.trim();
    if (!nome) return;
    const base = projeto ?? { resumo: "", arquivos: [] };
    if (base.arquivos.some((a) => a.nome.toLowerCase() === nome.toLowerCase())) {
      setErro(`Já existe um arquivo chamado "${nome}".`);
      return;
    }
    const arquivos = [...base.arquivos, { nome, conteudo: "" }];
    registrarPasso(projeto);
    setProjeto({ resumo: base.resumo, arquivos });
    setArquivoAtivo(arquivos.length - 1);
    setModo("codigo");
    setNovoNome("");
    setAdicionando(false);
    setErro("");
    // Guarda junto: o arquivo novo entrou no projeto de verdade, não só na tela.
    void salvarNoServidor(arquivos, base.resumo);
  }

  const arquivoAtual = projeto?.arquivos[arquivoAtivo];
  // O ASSET selecionado na lista (imagem): o editor mostra o aviso de binário.
  const assetSelecionado = assetAtivo ? assets.find((a) => a.caminho === assetAtivo) ?? null : null;

  // ── LARGURA / ZOOM da prévia (um controle só) ─────────────────────────────
  // O fator do zoom: só a moldura escala (transform), nunca o chrome.
  const fatorZoom = zoom / 100;
  // O que o painel dá à moldura depois de descontar o recuo (p-4).
  const larguraDisponivel =
    larguraPainel === null ? null : Math.max(0, larguraPainel - RECUO_PREVIA);
  const alturaDisponivel =
    alturaPainel === null ? null : Math.max(0, alturaPainel - RECUO_PREVIA);
  // A largura REAL da moldura: a pedida, limitada pelo painel (e dito no rótulo).
  const medida =
    larguraDisponivel === null
      ? null
      : larguraBase === null
        ? larguraDisponivel
        : Math.min(larguraBase, larguraDisponivel);
  const limitadoPeloPainel =
    larguraBase !== null && larguraDisponivel !== null && larguraBase > larguraDisponivel;
  // O preset ATIVO é DERIVADO do valor — presets e largura exata, um alvo só.
  const presetAtivo: PresetLargura | null =
    larguraBase === null
      ? "desktop"
      : larguraBase === LARGURA_PRESET.tablet
        ? "tablet"
        : larguraBase === LARGURA_PRESET.celular
          ? "celular"
          : null;
  // A prévia embutida (CSS/JS locais já dentro do HTML) é CALCULADA sempre que o
  // projeto muda, mas só ENTRA no iframe com um debounce curto: digitar no
  // editor re-monta a prévia sem remontar o sandbox a cada tecla. As IMAGENS
  // entram aqui: o bundler reescreve as referências locais para a URL de serviço.
  const assetsBase = projetoId ? `/api/arquiteto/projetos/${projetoId}/assets` : "";
  const previaCalculada = useMemo(
    () =>
      projeto
        ? montarPrevia(
            projeto.arquivos,
            assets,
            assetsBase,
            tokens,
            // A PONTE entra na página (dono, 09/10/2026): o atalho `window.miraiPonte`
            // + os tokens do par. Só quando há projeto E tokens; sem isso, NADA muda.
            projetoId && Object.keys(tokensInteg).length
              ? { integracoes: { projetoId, tokens: tokensInteg } }
              : undefined,
          )
        : { html: "", faltando: [] as string[] },
    [projeto, assets, assetsBase, tokens, projetoId, tokensInteg],
  );
  const [previa, setPrevia] = useState<Previa>({ html: "", faltando: [] });
  useEffect(() => {
    const t = setTimeout(() => setPrevia(previaCalculada), 300);
    return () => clearTimeout(t);
  }, [previaCalculada]);

  // Prévia nova (novo documento no iframe) = árvore velha não vale mais. Zera a
  // leitura, marca "aguardando" e, se a ponte não falar a tempo, diz a VERDADE:
  // "não respondeu". Nunca uma árvore fantasma.
  useEffect(() => {
    setArvore([]);
    setSelecionado(null);
    setDestaque(null);
    setArvoreParcial(false);
    setExpandidos(new Set());
    ultimaArvoreRef.current = "";
    if (!previa.html) {
      setPonte("ocioso");
      return;
    }
    aguardarPonte();
    return () => {
      if (ponteTimer.current) {
        clearTimeout(ponteTimer.current);
        ponteTimer.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previa.html]);

  /* ── CAMADAS: o que a ÁRVORE LIDA vira na tela ──────────────────────────── */

  // Só as linhas VISÍVEIS: um nó aparece se todos os pais dele estão abertos.
  // Fechado por padrão abaixo do raso (profundidade ≤ 1 aberta) — a lista
  // continua legível mesmo numa página grande.
  const nosVisiveis = useMemo(() => {
    const aberto: boolean[] = [];
    const saida: NoCamada[] = [];
    for (const n of arvore) {
      const paiAberto = n.p < 0 ? true : aberto[n.p] === true;
      if (!paiAberto) {
        aberto[n.i] = false;
        continue;
      }
      saida.push(n);
      aberto[n.i] = expandidos.has(n.i);
    }
    return saida;
  }, [arvore, expandidos]);

  // Quem tem filhos (para desenhar a setinha) — derivado, nada inventado.
  const comFilhos = useMemo(() => {
    const s = new Set<number>();
    for (const n of arvore) if (n.p >= 0) s.add(n.p);
    return s;
  }, [arvore]);

  const noSelecionado = selecionado === null ? null : arvore.find((n) => n.i === selecionado) ?? null;
  const arquivoDoNo =
    noSelecionado && projeto ? localizarArquivoNoProjeto(noSelecionado, projeto.arquivos) : "";

  /** A REFERÊNCIA de um elemento, em TEXTO — é o que faz o pedido saber EM QUE
   *  PEDAÇO ele mexe (o construtor não vê a tela): tag/id/classes, o texto que
   *  aparece e em qual arquivo ele vive. `marcado` diz que veio de um RISCO. */
  function referenciaDoElemento(n: NoCamada, marcado: boolean): string {
    const seletor = `${n.tag}${n.id ? `#${n.id}` : ""}${n.cls.length ? `.${n.cls.join(".")}` : ""}`;
    const onde = projeto ? arquivosDoNo(n, projeto.arquivos) : [];
    const local = onde.length === 1 ? ` — vive em ${onde[0]}` : "";
    return (
      (marcado ? "no pedaço que marquei no preview: " : "no elemento ") +
      `<${seletor}>` +
      (n.txt ? `, que mostra "${n.txt}"` : "") +
      local +
      `: `
    );
  }

  /** Escreve a REFERÊNCIA do elemento no campo do chat. Uma referência por vez: a
   *  nova SUBSTITUI a anterior — clicar em vários elementos não empilha lixo — e o
   *  que a pessoa já digitou fica depois dela. */
  function escreverNoChat(texto: string) {
    setPedido((antes) => {
      const anterior = referenciaEscritaRef.current;
      const resto = anterior && antes.startsWith(anterior) ? antes.slice(anterior.length) : antes;
      referenciaEscritaRef.current = texto;
      return `${texto}${resto}`;
    });
    caixa.current?.focus();
  }

  /** MUDAR AQUI (dono, 09/10/2026): o elemento escolhido vira referência no chat. */
  function pedirMudancaNoElemento() {
    if (!noSelecionado) return;
    escreverNoChat(referenciaDoElemento(noSelecionado, false));
  }

  /** O RISCO respondeu (ou a ponte devolveu o nó): vira referência no chat — aqui,
   *  com ÁRVORE e PROJETO frescos. Depois de escrever, o pedido é consumido. */
  useEffect(() => {
    if (!elementoPedido) return;
    const n = arvore.find((x) => x.i === elementoPedido.indice) ?? null;
    if (n) escreverNoChat(referenciaDoElemento(n, elementoPedido.marca));
    setElementoPedido(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elementoPedido, arvore, projeto]);

  /** O PAINEL DE CAMADAS — a lista indentada da prévia + os detalhes honestos. */
  // ── RISCO NA PRÉVIA (a camada de desenho) ────────────────────────────────
  /** O que os handlers do risco usam de um evento de ponteiro. */
  type EvPonteiro = {
    clientX: number;
    clientY: number;
    pointerId: number;
    currentTarget: HTMLCanvasElement;
    preventDefault: () => void;
  };
  const telaRiscos = useRef<HTMLCanvasElement | null>(null);
  const riscosRef = useRef<{ x: number; y: number }[][]>([]);
  const riscoAgoraRef = useRef<{ x: number; y: number }[] | null>(null);

  /** Redesenha a tela de riscos no tamanho da moldura, com a nitidez da tela. */
  function ajustarTelaDoRisco() {
    const cv = telaRiscos.current;
    if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const largura = Math.max(1, Math.round(cv.clientWidth * dpr));
    const altura = Math.max(1, Math.round(cv.clientHeight * dpr));
    if (cv.width !== largura || cv.height !== altura) {
      cv.width = largura;
      cv.height = altura;
    }
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cv.clientWidth, cv.clientHeight);
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(255,45,149,.92)";
    const todos = riscoAgoraRef.current ? [...riscosRef.current, riscoAgoraRef.current] : riscosRef.current;
    for (const risco of todos) {
      if (risco.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(risco[0].x, risco[0].y);
      for (let i = 1; i < risco.length; i++) ctx.lineTo(risco[i].x, risco[i].y);
      ctx.stroke();
    }
  }

  /** O ponteiro em pixel DA PÁGINA da prévia (a moldura pode estar ampliada). */
  function pontoDoRisco(ev: EvPonteiro) {
    const cv = ev.currentTarget;
    const r = cv.getBoundingClientRect();
    const escala = r.width > 0 && cv.clientWidth > 0 ? r.width / cv.clientWidth : 1;
    return { x: (ev.clientX - r.left) / escala, y: (ev.clientY - r.top) / escala };
  }

  function comecarRisco(ev: EvPonteiro) {
    if (!riscando) return;
    ev.preventDefault();
    try {
      ev.currentTarget.setPointerCapture(ev.pointerId);
    } catch {
      /* sem captura de ponteiro o risco continua, só solta fora da moldura */
    }
    riscoAgoraRef.current = [pontoDoRisco(ev)];
    ajustarTelaDoRisco();
  }

  function seguirRisco(ev: EvPonteiro) {
    const risco = riscoAgoraRef.current;
    if (!riscando || !risco) return;
    const p = pontoDoRisco(ev);
    const ultimo = risco[risco.length - 1];
    if (Math.abs(p.x - ultimo.x) < 1.5 && Math.abs(p.y - ultimo.y) < 1.5) return;
    risco.push(p);
    ajustarTelaDoRisco();
  }

  /** Fim do risco: a marca FICA desenhada (é a anotação da pessoa) e o CENTRO dela
   *  pergunta à ponte que pedaço está ali — a resposta contorna o elemento e escreve
   *  a referência no chat. */
  function terminarRisco() {
    const risco = riscoAgoraRef.current;
    if (!risco) return;
    riscoAgoraRef.current = null;
    if (risco.length < 3) {
      ajustarTelaDoRisco();
      return;
    }
    riscosRef.current = [...riscosRef.current, risco];
    riscoFeitoRef.current = risco;
    setTemRisco(true);
    ajustarTelaDoRisco();
    const xs = risco.map((p) => p.x);
    const ys = risco.map((p) => p.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    falarComAPrevia({ tipo: "arquiteto:elemento-em", x: Math.round(cx), y: Math.round(cy) });
  }

  /** Tira as marcas da tela (elas não fazem parte do projeto — são da bancada). */
  function limparRiscos() {
    riscosRef.current = [];
    riscoAgoraRef.current = null;
    setTemRisco(false);
    falarComAPrevia({ tipo: "arquiteto:limpar-destaque" });
    ajustarTelaDoRisco();
  }

  /* A tela de riscos acompanha a moldura: a cada render conferimos o tamanho e
     redesenhamos o que está marcado (barato: poucos traços). */
  useEffect(() => {
    ajustarTelaDoRisco();
  });

  /** Trocar de elemento: pede o TEXTO INTEIRO à ponte (o retrato da árvore corta) e
   *  rearma os campos de edição. Sem seleção, os campos ficam vazios. */
  useEffect(() => {
    if (selecionado === null) {
      // Sem seleção os campos esvaziam — mas o AVISO FICA: é a confirmação do que
      // acabou de ser gravado no arquivo (a prévia recarrega e desfaz a seleção, e
      // apagar o aviso na mesma hora esconde justamente o recado que importa).
      setTextoCheio("");
      setTextoEdicao("");
      setAtributosOriginais({});
      setAtributosEdicao({});
      return;
    }
    setEdicaoAviso("");
    falarComAPrevia({ tipo: "arquiteto:pedir-texto", indice: selecionado });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selecionado]);

  /** Em que ORDEM procurar o elemento nos arquivos: primeiro onde as marcas dele
   *  aparecem (id/classe/texto), depois nos outros — sempre com casamento ÚNICO. */
  function ordemDeBusca(n: NoCamada): string[] {
    if (!projeto) return [];
    const preferidos = arquivosDoNo(n, projeto.arquivos);
    const todos = projeto.arquivos.map((a) => a.nome);
    return [...preferidos, ...todos.filter((x) => !preferidos.includes(x))];
  }

  /** Edita um ARQUIVO PELO NOME (não o que está aberto no editor): mesma fila do
   *  editor de código — debounce + autosave que só grava quando muda de verdade. */
  function editarArquivoPorNome(nome: string, novoConteudo: string) {
    if (!projeto) return;
    const arquivos = projeto.arquivos.map((a) => (a.nome === nome ? { ...a, conteudo: novoConteudo } : a));
    setProjeto({ ...projeto, arquivos });
    setErro("");
    setEstadoSalvo("salvando");
    const pidAoEditar = projetoIdRef.current;
    cancelarSalvarPendente();
    salvarTimer.current = setTimeout(() => {
      salvarTimer.current = null;
      if (projetoIdRef.current !== pidAoEditar) return;
      void comitarEdicao(arquivos, projeto.resumo);
    }, 700);
  }

  /** Acha o TRECHO DE TEXTO do elemento dentro do arquivo, usando o que o nó sabe:
   *  o id (ancora exata), depois a tag+texto, depois o texto solto. Só devolve
   *  "achou" quando é ÚNICO — se for ambíguo, diz QUANTOS e a tela pede o chat. */
  type AchadoTexto = { tipo: "achou"; ini: number; fim: number } | { tipo: "ambiguo"; quantos: number } | { tipo: "nada" };

  function acharTextoNoArquivo(conteudo: string, n: NoCamada): AchadoTexto {
    const pedacos = n.txt.split(/\s+/).map(escaparRegex).join("\\s+");
    // 1) COM ID: o texto vive entre o `>` da abertura e a tag de fechamento dela.
    if (n.id) {
      const marca = conteudo.indexOf(`id="${n.id}"`);
      if (marca >= 0) {
        const abre = conteudo.indexOf(">", marca);
        const fecha = abre >= 0 ? conteudo.indexOf(`</${n.tag}`, abre + 1) : -1;
        if (abre >= 0 && fecha > abre) {
          const dentro = conteudo.slice(abre + 1, fecha);
          const achados = Array.from(dentro.matchAll(new RegExp(pedacos, "g")));
          if (achados.length === 1) {
            const corte = achados[0].index ?? 0;
            return { tipo: "achou", ini: abre + 1 + corte, fim: abre + 1 + corte + achados[0][0].length };
          }
          if (achados.length > 1) return { tipo: "ambiguo", quantos: achados.length };
        }
      }
    }
    // 2) A TAG e o texto juntos (o caso comum quando o elemento não tem id).
    const comTag = new RegExp(`<${n.tag}\\b[^>]*>\\s*(${pedacos})\\s*</${n.tag}>`, "g");
    const achadosTag = Array.from(conteudo.matchAll(comTag));
    if (achadosTag.length === 1) {
      const corte = achadosTag[0].index ?? 0;
      const ini = corte + achadosTag[0][0].indexOf(achadosTag[0][1]);
      return { tipo: "achou", ini, fim: ini + achadosTag[0][1].length };
    }
    // 3) O TEXTO sozinho, uma vez só no arquivo.
    const soltos = Array.from(conteudo.matchAll(new RegExp(pedacos, "g")));
    if (soltos.length === 1) {
      const corte = soltos[0].index ?? 0;
      return { tipo: "achou", ini: corte, fim: corte + soltos[0][0].length };
    }
    if (soltos.length > 1) return { tipo: "ambiguo", quantos: soltos.length };
    return { tipo: "nada" };
  }

  /** EDIÇÃO ALI MESMO — o texto do elemento, direto no arquivo. Só aplica quando o
   *  casamento é ÚNICO (tolerante a quebra de linha dentro do texto). Se não achar,
   *  ou achar mais de um, a tela DIZ: nunca troca no escuro. */
  function aplicarTextoNoElemento() {
    if (!projeto || !noSelecionado || !textoCheio) return;
    const novo = textoEdicao;
    if (!novo.trim()) {
      setEdicaoAviso("escreva o texto novo antes de aplicar");
      return;
    }
    if (novo === textoCheio) {
      setEdicaoAviso("é o mesmo texto — não há o que mudar");
      return;
    }
    for (const nome of ordemDeBusca(noSelecionado)) {
      const arq = projeto.arquivos.find((a) => a.nome === nome);
      if (!arq) continue;
      const achado = acharTextoNoArquivo(arq.conteudo, noSelecionado);
      if (achado.tipo === "achou") {
        editarArquivoPorNome(nome, arq.conteudo.slice(0, achado.ini) + novo + arq.conteudo.slice(achado.fim));
        setTextoCheio(novo);
        setEdicaoAviso(`aplicado em ${nome}`);
        return;
      }
      if (achado.tipo === "ambiguo") {
        setEdicaoAviso(`esse texto aparece ${achado.quantos}× em ${nome} (ex.: título da aba e título da página) — peça no chat dizendo qual`);
        return;
      }
    }
    setEdicaoAviso("não achei esse texto inteiro em nenhum arquivo (pode ser montado por pedaços) — peça no chat");
  }

  /** EDIÇÃO ALI MESMO — um ATRIBUTO do elemento (href, src, alt…), direto no
   *  arquivo. Mesma regra do texto: casamento ÚNICO, ou a tela diz que não deu. */
  function aplicarAtributo(nome: string, valorAntigo: string, valorNovo: string) {
    if (!projeto || !noSelecionado) return;
    if (valorNovo === valorAntigo) {
      setEdicaoAviso("é o mesmo valor — não há o que mudar");
      return;
    }
    const alvo = `${nome}="${valorAntigo}"`;
    for (const nomeArquivo of ordemDeBusca(noSelecionado)) {
      const arq = projeto.arquivos.find((a) => a.nome === nomeArquivo);
      if (!arq) continue;
      const pedacos = arq.conteudo.split(alvo);
      if (pedacos.length === 2) {
        editarArquivoPorNome(nomeArquivo, `${pedacos[0]}${nome}="${valorNovo}"${pedacos[1]}`);
        setAtributosOriginais((a) => ({ ...a, [nome]: valorNovo }));
        setAtributosEdicao((a) => ({ ...a, [nome]: valorNovo }));
        setEdicaoAviso(`aplicado em ${nomeArquivo}`);
        return;
      }
      if (pedacos.length > 2) {
        setEdicaoAviso(`esse atributo aparece ${pedacos.length - 1}× em ${nomeArquivo} — não troco no escuro; peça no chat dizendo qual`);
        return;
      }
    }
    setEdicaoAviso("não achei esse atributo no arquivo — peça no chat");
  }

  function painelCamadas(temPrevia: boolean) {
    return (
      <aside
        data-arquiteto-camadas
        className="flex w-[222px] shrink-0 flex-col border-l border-dash-hair/[0.07] bg-dash-side/30 sm:w-[276px]"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-dash-hair/[0.07] px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-[0.16em] text-dash-dim">Camadas</p>
          {ponte === "ok" && (
            <span className="shrink-0 text-[10px] text-dash-dim">
              {arvore.length} {arvore.length === 1 ? "nó" : "nós"}
            </span>
          )}
          <button
            onClick={pedirArvore}
            title="Reler a prévia"
            aria-label="Reler a prévia"
            className="ml-auto grid h-6 w-6 shrink-0 place-items-center rounded-[7px] bg-dash-raise text-dash-muted transition hover:text-dash-fg"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M20 11a8 8 0 10-2.3 5.7" />
              <path d="M20 4v7h-7" />
            </svg>
          </button>
        </div>

        {!temPrevia ? (
          <div className="flex min-h-0 flex-1 items-start px-4 py-5">
            <p className="text-[11.5px] leading-[1.65] text-dash-dim">
              Nada gerado ainda. As camadas aparecem quando houver uma prévia para ler.
            </p>
          </div>
        ) : ponte === "aguardando" ? (
          <div className="flex min-h-0 flex-1 items-start px-4 py-5">
            <p className="text-[11.5px] leading-[1.65] text-dash-dim">Lendo a prévia…</p>
          </div>
        ) : ponte === "sem-resposta" ? (
          <div className="flex min-h-0 flex-1 items-start px-4 py-5">
            <p className="text-[11.5px] leading-[1.65] text-dash-dim">
              A prévia não respondeu. Ela pode não ter montado, ou um script do projeto pode ter
              travado antes de a leitura terminar. Tente reler pelo botão acima.
            </p>
          </div>
        ) : !arvore.length ? (
          <div className="flex min-h-0 flex-1 items-start px-4 py-5">
            <p className="text-[11.5px] leading-[1.65] text-dash-dim">
              A prévia respondeu, mas não há elementos no corpo do documento.
            </p>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-2" data-arquiteto-camadas-lista>
              {nosVisiveis.map((n) => {
                const ativo = selecionado === n.i;
                const filhos = comFilhos.has(n.i);
                const aberto = expandidos.has(n.i);
                const rot = rotuloCamada(n);
                return (
                  <div
                    key={n.i}
                    data-camada-indice={n.i}
                    className={`flex items-center rounded-[8px] ${ativo ? "bg-dash-brand/15" : "hover:bg-dash-hair/[0.04]"}`}
                    style={{ paddingLeft: 4 + Math.min(n.prof, 12) * 10 }}
                  >
                    <button
                      onClick={() => alternarCamada(n.i)}
                      disabled={!filhos}
                      title={filhos ? (aberto ? "Fechar" : "Abrir") : undefined}
                      aria-label={filhos ? (aberto ? `Fechar ${n.tag}` : `Abrir ${n.tag}`) : undefined}
                      className={`grid h-5 w-5 shrink-0 place-items-center rounded-[6px] text-dash-dim transition ${
                        filhos ? "hover:text-dash-fg" : "invisible"
                      }`}
                    >
                      <svg viewBox="0 0 24 24" className={`h-3 w-3 transition-transform ${aberto ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M9 6l6 6-6 6" />
                      </svg>
                    </button>
                    <button
                      onClick={() => selecionarCamada(n.i)}
                      title={`${n.tag}${rot ? " " + rot : ""}`}
                      className="flex min-w-0 flex-1 items-center gap-1.5 py-1 pr-1 text-left"
                    >
                      <span className={`shrink-0 font-mono text-[11px] ${ativo ? "text-dash-brand" : "text-dash-fg/85"}`}>
                        {n.tag}
                      </span>
                      {rot && (
                        <span className={`truncate font-mono text-[10.5px] ${ativo ? "text-dash-brand/80" : "text-dash-dim"}`}>
                          {rot}
                        </span>
                      )}
                    </button>
                  </div>
                );
              })}
              {arvoreParcial && (
                <p className="px-3 py-2 text-[10.5px] leading-[1.5] text-dash-dim">
                  Mostrando os primeiros {arvore.length} nós — o documento é maior.
                </p>
              )}
            </div>

            {/* Os DETALHES da camada clicada — honestos, campo a campo. */}
            <div data-arquiteto-camada-detalhe className="shrink-0 border-t border-dash-hair/[0.07] px-3 py-3">
              {!noSelecionado ? (
                <p className="text-[11px] leading-[1.6] text-dash-dim">
                  Clique numa camada para contorná-la no preview e ver os detalhes dela.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-dash-fg">
                      {noSelecionado.tag}
                      {noSelecionado.id ? `#${noSelecionado.id}` : ""}
                      {noSelecionado.cls.length ? `.${noSelecionado.cls.join(".")}` : ""}
                    </p>
                    <button
                      onClick={limparCamada}
                      className="shrink-0 rounded-[7px] border border-dash-hair/12 px-2 py-1 text-[10.5px] text-dash-muted transition hover:text-dash-fg"
                    >
                      limpar
                    </button>
                  </div>
                  <LinhaCamada rotulo="id" valor={noSelecionado.id || "—"} mono />
                  <LinhaCamada rotulo="classes" valor={noSelecionado.cls.length ? noSelecionado.cls.join(" ") : "—"} mono />
                  {Object.keys(noSelecionado.atr).length > 0 && (
                    <LinhaCamada
                      rotulo="atributos"
                      mono
                      valor={Object.entries(noSelecionado.atr)
                        .map(([k, v]) => `${k}="${v}"`)
                        .join(" · ")}
                    />
                  )}
                  <LinhaCamada rotulo="texto" valor={noSelecionado.txt || "—"} />
                  <LinhaCamada
                    rotulo="arquivo"
                    valor={
                      arquivoDoNo ||
                      "Não deu para saber em qual arquivo — pode ter vindo de um script ou de CSS."
                    }
                  />
                  {/* MUDAR AQUI (dono, 09/10/2026): o elemento escolhido vira uma
                      referência escrita no campo do chat. É o pedido dizendo em que
                      pedaço ele mexe — o construtor não vê a tela. */}
                  <button
                    onClick={pedirMudancaNoElemento}
                    data-arquiteto-pedir-no-elemento
                    title="Escreve no chat a referência deste elemento, para você completar o pedido"
                    className="mt-1.5 w-full rounded-[9px] bg-dash-brand/20 px-3 py-2 text-left text-[11.5px] font-semibold text-dash-brand ring-1 ring-dash-brand/40 transition hover:bg-dash-brand/30"
                  >
                    pedir mudança neste elemento →
                  </button>
                  {/* EDITAR ALI MESMO (dono, 09/10/2026): o pedido dele — "clicar no
                      item e tentar mudar tb". O texto e os atributos práticos do
                      elemento gravam DIRETO no arquivo do projeto, pelo mesmo
                      caminho do editor de código (autosave + versão nova). Só
                      aplica quando o casamento no arquivo é ÚNICO: no resto, a tela
                      diz que não deu em vez de chutar. */}
                  {textoCheio.length > 0 && (
                    <div className="mt-2 rounded-[10px] border border-dash-hair/[0.08] bg-dash-raise/60 p-2.5">
                      <p className="text-[10px] uppercase tracking-wide text-dash-dim">editar o texto</p>
                      <textarea
                        data-arquiteto-editar-texto
                        value={textoEdicao}
                        onChange={(e) => setTextoEdicao(e.target.value)}
                        rows={2}
                        className="mt-1.5 w-full resize-y rounded-[8px] border border-dash-hair/10 bg-dash-scrim/30 px-2 py-1.5 text-[11.5px] text-dash-fg/90 outline-none focus:border-dash-brand/50"
                      />
                      <button
                        onClick={aplicarTextoNoElemento}
                        data-arquiteto-aplicar-texto
                        className="mt-1.5 w-full rounded-[8px] bg-dash-brand px-3 py-1.5 text-[11.5px] font-semibold text-black transition hover:brightness-110"
                      >
                        aplicar no arquivo
                      </button>
                    </div>
                  )}
                  {Object.keys(atributosEdicao).length > 0 && (
                    <div className="mt-2 rounded-[10px] border border-dash-hair/[0.08] bg-dash-raise/60 p-2.5">
                      <p className="text-[10px] uppercase tracking-wide text-dash-dim">editar atributos</p>
                      {Object.entries(atributosEdicao).map(([nome, valor]) => (
                        <div key={nome} className="mt-1.5 flex items-center gap-1.5">
                          <span className="w-[52px] shrink-0 text-[10.5px] text-dash-dim">{nome}</span>
                          <input
                            data-arquiteto-editar-atributo={nome}
                            value={valor}
                            onChange={(e) => setAtributosEdicao((a) => ({ ...a, [nome]: e.target.value }))}
                            className="min-w-0 flex-1 rounded-[8px] border border-dash-hair/10 bg-dash-scrim/30 px-2 py-1.5 text-[11px] text-dash-fg/90 outline-none focus:border-dash-brand/50"
                          />
                          <button
                            onClick={() => aplicarAtributo(nome, atributosOriginais[nome] ?? "", valor)}
                            data-arquiteto-aplicar-atributo={nome}
                            className="shrink-0 rounded-[8px] bg-dash-brand/20 px-2 py-1.5 text-[10.5px] font-semibold text-dash-brand ring-1 ring-dash-brand/40 transition hover:bg-dash-brand/30"
                          >
                            aplicar
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {destaque && destaque.ok && (
                    <p className="text-[10.5px] leading-[1.5] text-dash-ok">
                      contornado no preview — contorno {destaque.contorno}
                      {destaque.offset ? ` · offset ${destaque.offset}` : ""}
                    </p>
                  )}
                  {destaque && !destaque.ok && (
                    <p className="text-[10.5px] leading-[1.5] text-dash-bad">
                      a prévia não achou mais esse elemento (o DOM mudou desde a leitura).
                    </p>
                  )}
                </div>
              )}
            </div>
          </>
        )}
        {/* O RECADO DA EDIÇÃO fica no rodapé do painel: a prévia recarrega depois de
            gravar e desfaz a seleção — dentro do bloco do elemento, o "aplicado em
            index.html" sumia na mesma hora em que aparecia. */}
        {edicaoAviso && (
          <div data-arquiteto-edicao-aviso className="shrink-0 border-t border-dash-hair/[0.07] px-3 py-2.5">
            <p className="text-[10.5px] leading-snug text-dash-brand">{edicaoAviso}</p>
          </div>
        )}
      </aside>
    );
  }

  /** O PAINEL DE TOKENS — o conjunto curado, editado com controles normais
      (seletor de cor, texto e número). Quieto: mesma linguagem do resto. */
  function painelTokens() {
    return (
      <aside
        data-arquiteto-tokens-painel
        className="flex w-[222px] shrink-0 flex-col border-l border-dash-hair/[0.07] bg-dash-side/30 sm:w-[268px]"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-dash-hair/[0.07] px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-[0.16em] text-dash-dim">Tokens</p>
          <span className="hidden shrink-0 font-mono text-[10px] text-dash-dim sm:inline">
            var(--cor-primaria)
          </span>
          <button
            onClick={restaurarTokens}
            disabled={!projeto}
            title="Restaurar os tokens padrão"
            aria-label="Restaurar os tokens padrão"
            className="ml-auto grid h-6 w-6 shrink-0 place-items-center rounded-[7px] bg-dash-raise text-dash-muted transition hover:text-dash-fg disabled:opacity-35"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 12a9 9 0 1 0 3-6.7" />
              <path d="M3 4v5h5" />
            </svg>
          </button>
        </div>

        {!projeto ? (
          <div className="flex min-h-0 flex-1 items-start px-4 py-5">
            <p className="text-[11.5px] leading-[1.65] text-dash-dim">
              Nada gerado ainda. Os tokens aparecem quando houver um projeto — eles são DADOS
              dele, não da bancada.
            </p>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              <div className="flex flex-col gap-3">
                {TOKENS_COR.map((nome) => (
                  <label key={nome} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[11px] text-dash-muted">
                      {ROTULO_TOKEN[nome]}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] uppercase text-dash-dim">
                      {tokens[nome]}
                    </span>
                    <input
                      type="color"
                      value={tokens[nome]}
                      onChange={(e) => editarToken(nome, e.target.value)}
                      data-arquiteto-token={nome}
                      aria-label={ROTULO_TOKEN[nome]}
                      className="h-7 w-9 shrink-0 cursor-pointer rounded-[7px] border border-dash-hair/10 bg-dash-bg p-0.5"
                    />
                  </label>
                ))}

                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-dash-muted">{ROTULO_TOKEN.fonte}</span>
                  <input
                    type="text"
                    value={tokens.fonte}
                    onChange={(e) => editarToken("fonte", e.target.value)}
                    data-arquiteto-token="fonte"
                    aria-label={ROTULO_TOKEN.fonte}
                    spellCheck={false}
                    className="w-full rounded-[7px] border border-dash-hair/10 bg-dash-bg px-2 py-1.5 font-mono text-[11px] text-dash-fg outline-none focus:border-dash-brand/60"
                  />
                </label>

                {TOKENS_MEDIDA.map((nome) => (
                  <label key={nome} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[11px] text-dash-muted">
                      {ROTULO_TOKEN[nome]}
                    </span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={999}
                      value={Number.parseInt(tokens[nome], 10) || 0}
                      onChange={(e) => editarToken(nome, e.target.value)}
                      data-arquiteto-token={nome}
                      aria-label={ROTULO_TOKEN[nome]}
                      className="w-[64px] rounded-[7px] border border-dash-hair/10 bg-dash-bg px-2 py-1 font-mono text-[11px] text-dash-fg outline-none focus:border-dash-brand/60"
                    />
                    <span className="text-[10.5px] text-dash-dim">px</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="shrink-0 border-t border-dash-hair/[0.07] px-3 py-2.5">
              <p className="text-[10.5px] leading-[1.55] text-dash-dim">
                Os tokens entram na prévia como variáveis na raiz. No CSS do projeto, use{" "}
                <span className="font-mono text-dash-fg/80">var(--cor-primaria)</span>.
              </p>
              <p
                data-arquiteto-tokens-estado
                role="status"
                className={`mt-1.5 text-[10.5px] ${
                  estadoTokens === "erro" ? "text-dash-bad" : estadoTokens === "salvo" ? "text-dash-ok" : "text-dash-dim"
                }`}
              >
                {estadoTokens === "salvando"
                  ? "salvando tokens…"
                  : estadoTokens === "salvo"
                    ? "tokens salvos — virou versão nova"
                    : estadoTokens === "erro"
                      ? "não deu para salvar os tokens — tente de novo"
                      : ""}
              </p>
            </div>
          </>
        )}
      </aside>
    );
  }

  // A ENTRADA é o que dá nome ao projeto na barra (é o arquivo que roda).
  const entrada = projeto ? arquivoDeEntrada(projeto.arquivos) : null;
  // O nome exibido é o TÍTULO guardado (o que aparece no menu de projetos);
  // sem título do servidor, cai no nome do arquivo de entrada — nada inventado.
  const tituloExibido =
    projetos.find((p) => p.id === projetoId)?.titulo ||
    entrada?.nome ||
    (projeto ? "Projeto sem título" : "Sem projeto");

  return (
    /* `.tela-cheia` prende a bancada no miolo do menu, como a tela inicial:
       sem dégradé de margem em cima, sem largura máxima, sem rolagem de página. */
    <div className="tela-cheia flex flex-col overflow-hidden bg-dash-bg">
      {/* ═══ CHROME DO WORKSPACE: barra fina do projeto (nome + modos + aparelhos) ═══ */}
      {/* No CELULAR a barra QUEBRA em duas linhas em vez de cortar o último
          ícone (achado 09/10/2026, medido em 390 px: o último botão ficava fora
          da tela, inalcançável). No computador nada muda: `sm:flex-nowrap`. */}
      {/* O RECUO DA ESQUERDA NO CELULAR (dono, 12/10/2026: "menu fechado ... um ícone
          em cima do outro"). O botão de menu da casca flutua FIXO no canto (left-3,
          36px → ocupa até x=48) e a barra começava em x=12: a primeira coluna inteira
          (projeto, desfazer/refazer/histórico, Configurações) ficava POR BAIXO dele.
          O recuo vale até `lg` porque o botão só some no desktop — no tablet ele
          continua lá. Sem recuo no topo (empurrar a barra para baixo deixaria um
          degrau feio): o conteúdo começa AO LADO do botão, como no ChatGPT.
          O MESMO recuo à DIREITA (`pr-[52px]`) reserva o lugar do avatar, que
          agora também aparece fixo no topo direito das telas cheias.

          O ALINHAMENTO COM A FOTO (dono, 12/10/2026: "coloca também alinhado a
          foto do perfil... ela tá meio deslocada"). MEDIDO: a linha da barra
          ficava no centro y=22 e a foto no centro y=29 — a foto 7 px mais baixa,
          porque ela é 34 px e a linha 28 px. O recuo de cima passou de 8 px para
          15 px: a linha desce para o centro y=29 e casa com a foto, nos dois
          tamanhos. O recuo de baixo continua 8 px — o espaço extra em cima é o
          que a faixa flutuante (menu à esquerda, foto à direita) ocupa. */}
      <header className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-dash-hair/[0.07] bg-dash-side/40 pb-2 pt-[15px] pl-[52px] pr-[52px] sm:flex-nowrap sm:gap-3 lg:pl-4">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] bg-dash-brand/15 text-dash-brand">
          <IconeRobo className="h-4 w-4" />
        </span>
        {/* O NOME DO PROJETO NÃO PODE SUMIR (dono, 12/10/2026). Com `flex-1
            min-w-0` e a barra cheia no celular, este bloco encolhia até 8 px — o
            nome do projeto ficava INVISÍVEL e a barra parecia só um amontoado de
            ícones. A largura mínima obriga a barra a QUEBRAR em outra linha em vez
            de esmagar: o nome aparece (truncado, com o title completo) e nada se
            sobrepõe. Vale até `lg` porque o botão de menu só some no desktop — no
            tablet ele continua lá. No desktop nada muda (`lg:min-w-0`). */}
        <div className="relative flex min-w-0 flex-1 items-center gap-2 max-lg:min-w-[120px]" ref={menuRef}>
          {/* O NOME do projeto é o botão do MENU DE PROJETOS: discreto (mesma
              linguagem da barra), abre a lista da conta + "Novo projeto". */}
          <button
            onClick={() => setMenuAberto((v) => !v)}
            title="Seus projetos"
            aria-expanded={menuAberto}
            className="-ml-1 flex min-w-0 items-center gap-1.5 rounded-[9px] px-2 py-1 transition hover:bg-dash-hair/[0.05]"
          >
            <p className="truncate text-[13px] text-dash-fg">{tituloExibido}</p>
            <svg
              viewBox="0 0 24 24"
              className={`h-3.5 w-3.5 shrink-0 text-dash-dim transition-transform ${menuAberto ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          <span className="hidden shrink-0 text-[11px] text-dash-dim md:inline">Arquiteto</span>
          {projeto && (
            <span className="hidden shrink-0 text-[11px] text-dash-dim lg:inline">
              {projeto.arquivos.length} {projeto.arquivos.length === 1 ? "arquivo" : "arquivos"}
            </span>
          )}
          {salvando && (
            <span className="hidden shrink-0 text-[10.5px] text-dash-dim sm:inline">salvando…</span>
          )}

          {menuAberto && (
            <div className="absolute left-0 top-[36px] z-50 w-[292px] rounded-[16px] border border-dash-line bg-dash-card p-1.5 shadow-2xl">
              <p className="px-3 pb-1 pt-2 text-[10px] uppercase tracking-[0.16em] text-dash-dim">
                Seus projetos
              </p>
              <div className="max-h-[248px] overflow-y-auto">
                {projetos.map((p) => {
                  const atual = p.id === projetoId;
                  return (
                    <div
                      key={p.id}
                      className={`group flex items-center gap-1 rounded-[10px] pr-1 ${
                        atual ? "bg-dash-brand/12" : "hover:bg-dash-hair/[0.05]"
                      }`}
                    >
                      {renomeandoId === p.id ? (
                        <input
                          autoFocus
                          value={nomeTemp}
                          onChange={(e) => setNomeTemp(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void renomearProjeto(p.id, nomeTemp);
                            }
                            if (e.key === "Escape") setRenomeandoId(null);
                          }}
                          onBlur={() => void renomearProjeto(p.id, nomeTemp)}
                          className="m-1 min-w-0 flex-1 rounded-[8px] border border-dash-hair/10 bg-dash-bg px-2 py-1.5 text-[12.5px] text-dash-fg outline-none focus:border-dash-brand/60"
                        />
                      ) : (
                        <>
                          <button
                            onClick={() => void abrirProjeto(p.id)}
                            title={p.titulo}
                            className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left"
                          >
                            <IconeDocumento
                              className={`h-4 w-4 shrink-0 ${atual ? "text-dash-brand" : "text-dash-dim"}`}
                            />
                            <span
                              className={`truncate text-[12.5px] ${atual ? "text-dash-brand" : "text-dash-fg/85"}`}
                            >
                              {p.titulo}
                            </span>
                          </button>
                          <button
                            onClick={() => {
                              setRenomeandoId(p.id);
                              setNomeTemp(p.titulo);
                            }}
                            title="Renomear"
                            aria-label={`Renomear ${p.titulo}`}
                            className="grid h-6 w-6 shrink-0 place-items-center rounded-[7px] text-dash-dim opacity-0 transition hover:text-dash-fg group-hover:opacity-100"
                          >
                            <svg
                              viewBox="0 0 24 24"
                              className="h-3.5 w-3.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={1.6}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden
                            >
                              <path d="M4 20h4l10-10-4-4L4 16v4z" />
                              <path d="M13.5 6.5l4 4" />
                            </svg>
                          </button>
                          <button
                            onClick={() => void apagarProjeto(p.id)}
                            title="Apagar"
                            aria-label={`Apagar ${p.titulo}`}
                            className="grid h-6 w-6 shrink-0 place-items-center rounded-[7px] text-dash-dim opacity-0 transition hover:text-dash-bad group-hover:opacity-100"
                          >
                            <IconeFechar className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
                {!projetos.length && (
                  <p className="px-3 py-2 text-[12px] leading-[1.5] text-dash-dim">
                    Nenhum projeto guardado ainda.
                  </p>
                )}
              </div>
              {/* A CATEGORIA DO PROJETO (dono, 11/10/2026): "o cliente, quando
                  for criar um projeto novo, ele cria a categoria". Aqui a
                  pessoa escolhe a pasta do projeto ABERTO (move na hora) ou do
                  que VAI NASCER (nasce já dentro dela). Criar uma categoria
                  nova é um clique, no mesmo lugar. */}
              <div className="px-3 pb-1 pt-2 text-[10px] uppercase tracking-[0.16em] text-dash-dim">
                {projetoId ? "Pasta deste projeto" : "Pasta do novo projeto"}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 px-2 pb-2">
                <button
                  type="button"
                  onClick={() => void escolherPasta(null)}
                  className={`rounded-full border px-2.5 py-1 text-[11.5px] transition ${
                    pastaDoProjeto === null
                      ? "border-dash-brand/60 bg-dash-brand/15 text-dash-fg"
                      : "border-dash-hair/10 bg-dash-hair/[0.04] text-dash-muted hover:text-dash-fg"
                  }`}
                >
                  Sem pasta
                </button>
                {pastas.map((pa) => (
                  <button
                    key={pa.id}
                    type="button"
                    onClick={() => void escolherPasta(pa.id)}
                    title={pa.nome}
                    className={`max-w-[190px] truncate rounded-full border px-2.5 py-1 text-[11.5px] transition ${
                      pastaDoProjeto === pa.id
                        ? "border-dash-brand/60 bg-dash-brand/15 text-dash-fg"
                        : "border-dash-hair/10 bg-dash-hair/[0.04] text-dash-muted hover:text-dash-fg"
                    }`}
                  >
                    {pa.nome}
                  </button>
                ))}
                {criandoPasta ? (
                  <input
                    autoFocus
                    value={nomePastaNova}
                    onChange={(e) => setNomePastaNova(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void criarPastaInline();
                      }
                      if (e.key === "Escape") {
                        setCriandoPasta(false);
                        setNomePastaNova("");
                      }
                    }}
                    onBlur={() => {
                      if (!nomePastaNova.trim()) setCriandoPasta(false);
                    }}
                    placeholder="Nome da categoria"
                    className="min-w-0 flex-1 rounded-full border border-dash-brand/50 bg-dash-bg px-2.5 py-1 text-[11.5px] text-dash-fg outline-none placeholder:text-dash-dim"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setCriandoPasta(true)}
                    className="flex items-center gap-1 rounded-full border border-dashed border-dash-hair/20 px-2.5 py-1 text-[11.5px] text-dash-muted transition hover:border-dash-brand/50 hover:text-dash-fg"
                  >
                    <IconeMais className="h-3 w-3" />
                    Nova categoria
                  </button>
                )}
              </div>
              {erroPasta && (
                <p className="px-3 pb-1 text-[11px] text-dash-bad">{erroPasta}</p>
              )}
              <div className="my-1 h-px bg-dash-hair/[0.08]" />
              <button
                onClick={novoProjeto}
                className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2.5 text-[13px] text-dash-fg/85 transition hover:bg-dash-hair/[0.06] hover:text-dash-fg"
              >
                <IconeMais className="h-4 w-4" />
                Novo projeto
              </button>
            </div>
          )}
        </div>

        {/* DESFAZER / REFAZER + HISTÓRICO — controle fino na barra, mesma
            linguagem visual. Nada de painel: dois botões e um menu. */}
        <div className="relative flex shrink-0 items-center gap-1" ref={historicoRef}>
          <button
            onClick={desfazer}
            disabled={!passado.length}
            title="Desfazer (Ctrl+Z)"
            aria-label="Desfazer"
            className="grid h-7 w-7 place-items-center rounded-[8px] bg-dash-raise text-dash-muted transition hover:text-dash-fg disabled:opacity-35"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9 14L4 9l5-5" />
              <path d="M4 9h10a6 6 0 010 12h-3" />
            </svg>
          </button>
          <button
            onClick={refazer}
            disabled={!futuro.length}
            title="Refazer (Ctrl+Shift+Z)"
            aria-label="Refazer"
            className="grid h-7 w-7 place-items-center rounded-[8px] bg-dash-raise text-dash-muted transition hover:text-dash-fg disabled:opacity-35"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M15 14l5-5-5-5" />
              <path d="M20 9H10a6 6 0 000 12h3" />
            </svg>
          </button>
          <button
            onClick={() => setMenuHistorico((v) => !v)}
            disabled={!projetoId}
            title="Histórico de versões"
            aria-label="Histórico de versões"
            aria-expanded={menuHistorico}
            className="flex h-7 shrink-0 items-center gap-1 rounded-[8px] bg-dash-raise px-2 text-dash-muted transition hover:text-dash-fg disabled:opacity-35"
          >
            <IconeRelogio className="h-4 w-4" />
            <span className="hidden text-[10.5px] sm:inline">{versoes.length || "histórico"}</span>
          </button>

          {menuHistorico && (
            <div className="absolute right-0 top-[36px] z-50 w-[320px] rounded-[16px] border border-dash-line bg-dash-card p-1.5 shadow-2xl">
              <p className="px-3 pb-1 pt-2 text-[10px] uppercase tracking-[0.16em] text-dash-dim">
                Histórico de versões
              </p>
              <div className="max-h-[300px] overflow-y-auto">
                {versoes.length ? (
                  [...versoes].reverse().map((v, i, arr) => {
                    // A lista invertida: a "anterior no tempo" é a PRÓXIMA do array.
                    const notas = descreverMudanca(arr[i + 1], v);
                    const ehAtual = v.numero === versoes[versoes.length - 1]?.numero;
                    return (
                      <div
                        key={v.numero}
                        className="group flex items-center gap-2 rounded-[10px] px-3 py-2 hover:bg-dash-hair/[0.05]"
                      >
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-dash-raise text-[10px] text-dash-muted">
                          {v.numero}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] text-dash-fg/85">
                            {ehAtual ? "Versão atual" : `Versão ${v.numero}`}
                            <span className="ml-2 text-[10.5px] text-dash-dim">{formatarData(v.criado_em)}</span>
                          </p>
                          <p className="truncate text-[10.5px] text-dash-dim">{notas}</p>
                        </div>
                        {!ehAtual && (
                          <button
                            onClick={() => void restaurarVersaoServidor(v.numero)}
                            title={`Restaurar a versão ${v.numero}`}
                            aria-label={`Restaurar a versão ${v.numero}`}
                            className="shrink-0 rounded-[7px] border border-dash-hair/12 px-2 py-1 text-[10.5px] text-dash-muted transition hover:text-dash-fg"
                          >
                            restaurar
                          </button>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <p className="px-3 py-2 text-[12px] leading-[1.5] text-dash-dim">
                    O histórico aparece a partir da primeira construção.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* modos: responsivo | código — SÓ ÍCONES (o rótulo fica no title/aria). */}
        <div className="flex shrink-0 items-center gap-1.5">
          {(["responsivo", "codigo"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setModo(m)}
              title={m === "responsivo" ? "Responsivo" : "Código"}
              aria-label={m === "responsivo" ? "Modo responsivo (prévia ao vivo)" : "Modo código (editar os arquivos)"}
              aria-pressed={modo === m}
              data-arquiteto-modo={m}
              className={`grid h-7 w-7 place-items-center rounded-full transition ${
                modo === m ? "bg-dash-brand text-white" : "bg-dash-raise text-dash-muted hover:text-dash-fg"
              }`}
            >
              {m === "responsivo" ? (
                <IconeDispositivos className="h-3.5 w-3.5" />
              ) : (
                <IconeCodigo className="h-3.5 w-3.5" />
              )}
            </button>
          ))}
        </div>

        {/* CAMADAS da prévia: abre o painel que LÊ o DOM do preview pela ponte. */}
        <button
          onClick={() => setMostrarCamadas((v) => !v)}
          title="Camadas da prévia"
          aria-label="Camadas da prévia"
          aria-expanded={mostrarCamadas}
          data-arquiteto-camadas-toggle
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-full transition ${
            mostrarCamadas
              ? "bg-dash-brand/20 text-dash-brand ring-1 ring-dash-brand/40"
              : "bg-dash-raise text-dash-muted hover:text-dash-fg"
          }`}
        >
          <IconeCamadas className="h-3.5 w-3.5" />
        </button>

        {/* TOKENS DE DESIGN: abre o painel do conjunto curado (cores, fonte,
            raio, espaçamento). Mesma linguagem visual dos outros controles. */}
        <button
          onClick={() => setMostrarTokens((v) => !v)}
          title="Tokens de design do projeto"
          aria-label="Tokens de design"
          aria-expanded={mostrarTokens}
          data-arquiteto-tokens-toggle
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-full transition ${
            mostrarTokens
              ? "bg-dash-brand/20 text-dash-brand ring-1 ring-dash-brand/40"
              : "bg-dash-raise text-dash-muted hover:text-dash-fg"
          }`}
        >
          <IconeTokens className="h-3.5 w-3.5" />
        </button>

        {/* BIBLIOTECA DE BLOCOS (item 9 do dono): blocos prontos que ENTRAM no
            projeto — marcação antes do </body> do HTML de entrada e CSS na folha
            do projeto. Mesma linguagem visual dos outros controles da barra. */}
        <div className="relative flex shrink-0 items-center" ref={blocosRef}>
          <button
            onClick={() => setMenuBlocos((v) => !v)}
            title="Biblioteca de blocos"
            aria-label="Biblioteca de blocos"
            aria-expanded={menuBlocos}
            data-arquiteto-blocos-toggle
            className={`grid h-7 w-7 shrink-0 place-items-center rounded-full transition ${
              menuBlocos
                ? "bg-dash-brand/20 text-dash-brand ring-1 ring-dash-brand/40"
                : "bg-dash-raise text-dash-muted hover:text-dash-fg"
            }`}
          >
            <IconeBlocos className="h-3.5 w-3.5" />
          </button>

          {menuBlocos && (
            <div
              data-arquiteto-blocos
              className="absolute right-0 top-[36px] z-50 w-[326px] rounded-[16px] border border-dash-line bg-dash-card p-1.5 shadow-2xl"
            >
              <p className="px-3 pb-1 pt-2 text-[10px] uppercase tracking-[0.16em] text-dash-dim">
                Biblioteca de blocos
              </p>
              <div className="max-h-[332px] overflow-y-auto">
                {BLOCOS.map((b) => (
                  <div
                    key={b.id}
                    data-arquiteto-bloco={b.id}
                    className="group flex items-start gap-2 rounded-[10px] px-3 py-2 hover:bg-dash-hair/[0.05]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] text-dash-fg/90">{b.nome}</p>
                      <p className="text-[10.5px] leading-[1.45] text-dash-dim">{b.descricao}</p>
                    </div>
                    <button
                      onClick={() => inserirBlocoNoProjeto(b, "painel")}
                      data-arquiteto-bloco-inserir={b.id}
                      title={`Inserir ${b.nome}`}
                      aria-label={`Inserir ${b.nome}`}
                      className="shrink-0 rounded-[7px] border border-dash-hair/12 px-2 py-1 text-[10.5px] text-dash-muted transition hover:text-dash-fg group-hover:border-dash-brand/50"
                    >
                      inserir
                    </button>
                  </div>
                ))}
              </div>
              <p className="border-t border-dash-hair/[0.07] px-3 py-2 text-[10px] leading-[1.5] text-dash-dim">
                {projeto
                  ? "Os blocos usam os tokens do projeto (var(--cor-primaria)…), entram antes do </body> e o CSS vai para a folha do projeto. Cada inserção vira uma versão."
                  : "Ainda não há projeto: inserir um bloco cria o projeto base (index.html + styles.css). Os blocos usam os tokens (var(--cor-primaria)…)."}
              </p>
            </div>
          )}
        </div>

        {/* BAIXAR O APP (dono, 08/10/2026): "baixa toda a aplicação" — o que o
            Figma Make faz e o Arquiteto não fazia. `<a href>` de verdade (não
            fetch): a resposta vem com Content-Disposition, então o navegador
            baixa sozinho. Só existe quando há projeto guardado. */}
        <div className="relative flex shrink-0 items-center">
          <a
            href={projetoId ? `/api/arquiteto/projetos/${projetoId}/exportar` : undefined}
            aria-disabled={projetoId ? undefined : true}
            onClick={(e) => {
              if (!projetoId) e.preventDefault();
            }}
            title={
              projetoId
                ? "Baixar o app (.zip) — arquivos, imagens e LEIA-ME"
                : "Construa ou abra um projeto para baixar"
            }
            aria-label="Baixar o app em .zip"
            data-arquiteto-baixar-zip
            data-arquiteto-baixar-pronto={projetoId ? "sim" : "nao"}
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition ${
              projetoId
                ? "bg-dash-raise text-dash-muted hover:text-dash-fg"
                : "cursor-not-allowed bg-dash-raise/50 text-dash-dim"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M12 3.5v10.5" />
              <path d="M7.8 9.8L12 14l4.2-4.2" />
              <path d="M4.5 19.5h15" />
            </svg>
          </a>
        </div>

        {/* CONFIGURAÇÕES DO PROJETO (dono, 09/10/2026 — o que ele pediu olhando
            o Figma Make): endereço automático do projeto. Abas: DOMÍNIOS é a de
            verdade; FONTES e INTEGRAÇÕES dizem a verdade (ainda não existem) em
            vez de fingir uma tela que não faz nada. */}
        <div className="relative flex shrink-0 items-center" ref={configRef}>
          <button
            onClick={() => setMenuConfig((v) => !v)}
            title="Configurações do projeto — endereço e domínio"
            aria-label="Configurações do projeto"
            aria-expanded={menuConfig}
            data-arquiteto-config-toggle
            data-arquiteto-config-tem-endereco={endSlug ? "sim" : "nao"}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-dash-raise text-dash-muted transition hover:text-dash-fg"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {/* ENGRENAGEM (dono, 12/10/2026). Sem o texto "Configurações" ao
                  lado, é o ícone que tem de dizer o que o botão faz. O desenho
                  anterior (círculo com 8 raios) lê como SOL — e agora existe um
                  botão de TEMA com sol no menu da conta: dois sóis, sentidos
                  opostos. A engrenagem é o símbolo universal de "ajustes". */}
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>

          {menuConfig && (
            <div
              data-arquiteto-config-painel
              className="absolute right-0 top-[36px] z-50 w-[382px] rounded-[16px] border border-dash-line bg-dash-card p-3 shadow-2xl"
            >
              <p className="px-1 pb-2 text-[10px] uppercase tracking-[0.16em] text-dash-dim">
                Configurações do projeto
              </p>
              <div className="mb-2.5 flex items-center gap-1 px-0.5">
                {(["dominios", "fontes", "integracoes"] as const).map((aba) => (
                  <button
                    key={aba}
                    onClick={() => setAbaConfig(aba)}
                    data-arquiteto-config-aba={aba}
                    className={`rounded-full px-2.5 py-1 text-[11px] transition ${
                      abaConfig === aba ? "bg-dash-raise text-dash-fg" : "text-dash-dim hover:text-dash-fg"
                    }`}
                  >
                    {aba === "dominios" ? "Domínios" : aba === "fontes" ? "Fontes" : "Integrações"}
                  </button>
                ))}
              </div>

              {abaConfig === "dominios" && (
                <div data-arquiteto-config-dominios className="flex flex-col gap-2.5">
                  {!projetoId ? (
                    <p className="px-1 text-[12px] leading-[1.6] text-dash-dim">
                      Um projeto guardado é que tem endereço. Construa ou abra um projeto primeiro.
                    </p>
                  ) : (
                    <>
                      <p className="px-1 text-[11px] text-dash-muted">Endereço do projeto</p>
                      <div className="flex items-center gap-1.5">
                        <input
                          value={endTexto}
                          onChange={(e) => {
                            setEndTexto(e.target.value);
                            setEndErro("");
                            setEndAviso("");
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void salvarEndereco(endTexto);
                          }}
                          placeholder={endSugerido || "meu-projeto"}
                          data-arquiteto-config-endereco
                          className="min-w-0 flex-1 rounded-[8px] border border-dash-hair/10 bg-dash-bg px-2 py-1.5 font-mono text-[11px] text-dash-fg/90 outline-none"
                        />
                        <span className="shrink-0 font-mono text-[10.5px] text-dash-dim">.miraitohope.com</span>
                        <button
                          onClick={() => void salvarEndereco(endTexto)}
                          disabled={endSalvando}
                          data-arquiteto-config-salvar
                          className="shrink-0 rounded-[8px] border border-dash-hair/12 px-2.5 py-1.5 text-[11px] text-dash-muted transition hover:text-dash-fg disabled:opacity-50"
                        >
                          {endSalvando ? "salvando…" : "salvar"}
                        </button>
                      </div>
                      <p className="px-1 text-[10.5px] leading-[1.5] text-dash-dim">
                        Letras sem acento, números e hífen. O endereço é único no mundo — se já estiver
                        em uso, eu aviso.
                      </p>

                      {endErro && (
                        <p data-arquiteto-config-erro className="px-1 text-[11px] leading-[1.5] text-dash-bad">
                          {endErro}
                        </p>
                      )}
                      {endAviso && (
                        <p data-arquiteto-config-aviso className="px-1 text-[11px] leading-[1.5] text-dash-ok">
                          {endAviso}
                        </p>
                      )}

                      <div className="flex items-center justify-between gap-2 rounded-[10px] border border-dash-line px-2.5 py-2">
                        <div className="min-w-0">
                          <p className="text-[11px] text-dash-muted">Estado</p>
                          <p
                            data-arquiteto-config-estado
                            data-arquiteto-config-publicado={publicarToken ? "sim" : "nao"}
                            className={`text-[12px] ${publicarToken ? "text-dash-ok" : "text-dash-dim"}`}
                          >
                            {publicarToken
                              ? `Publicado${publicadoEm ? ` em ${formatarData(publicadoEm)}` : ""}`
                              : "Não publicado"}
                          </p>
                        </div>
                        <button
                          onClick={() => void (publicarToken ? despublicar() : publicar())}
                          disabled={publicando}
                          data-arquiteto-config-publicar
                          className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] transition disabled:opacity-50 ${
                            publicarToken
                              ? "bg-dash-raise text-dash-muted hover:text-dash-fg"
                              : "bg-dash-ok/15 text-dash-ok ring-1 ring-dash-ok/40"
                          }`}
                        >
                          {publicando ? "…" : publicarToken ? "despublicar" : "publicar"}
                        </button>
                      </div>

                      {publicarToken && endSlug && (
                        <div className="flex items-center gap-1.5">
                          <input
                            readOnly
                            value={urlDoEndereco()}
                            onFocus={(e) => e.currentTarget.select()}
                            data-arquiteto-config-url
                            className="min-w-0 flex-1 rounded-[8px] border border-dash-hair/10 bg-dash-bg px-2 py-1.5 font-mono text-[11px] text-dash-fg/90 outline-none"
                          />
                          <button
                            onClick={() => void copiarEndereco()}
                            data-arquiteto-config-copiar
                            className="shrink-0 rounded-[8px] border border-dash-hair/12 px-2.5 py-1.5 text-[11px] text-dash-muted transition hover:text-dash-fg"
                          >
                            {endCopiado ? "copiado" : "copiar"}
                          </button>
                          <button
                            onClick={() => abrirEndereco()}
                            data-arquiteto-config-abrir
                            className="shrink-0 rounded-[8px] border border-dash-hair/12 px-2.5 py-1.5 text-[11px] text-dash-muted transition hover:text-dash-fg"
                          >
                            abrir
                          </button>
                        </div>
                      )}

                      {endSlug && !publicarToken && (
                        <p className="px-1 text-[10.5px] leading-[1.5] text-dash-dim">
                          O endereço já está reservado para este projeto — ele abre quando você publicar.
                        </p>
                      )}

                      {/* CONECTAR UM DOMÍNIO PRÓPRIO (dono, 09/10/2026): o domínio
                          do CLIENTE. Dois tempos ditos com todas as letras —
                          guardado ≠ no ar — e a conferência do DNS é ao vivo. */}
                      <div
                        data-arquiteto-config-conectar
                        className="rounded-[10px] border border-dashed border-dash-hair/12 px-2.5 py-2"
                      >
                        <p className="text-[11px] text-dash-muted">Conectar um domínio</p>

                        {!domSalvo ? (
                          <>
                            <div className="mt-1.5 flex items-center gap-1.5">
                              <input
                                value={domTexto}
                                onChange={(e) => {
                                  setDomTexto(e.target.value);
                                  setDomErro("");
                                  setDomAviso("");
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") void salvarDominio(domTexto);
                                }}
                                placeholder="minhaloja.com.br"
                                data-arquiteto-config-dominio
                                className="min-w-0 flex-1 rounded-[8px] border border-dash-hair/10 bg-dash-bg px-2 py-1.5 font-mono text-[11px] text-dash-fg/90 outline-none"
                              />
                              <button
                                onClick={() => void salvarDominio(domTexto)}
                                disabled={domSalvando}
                                data-arquiteto-config-dominio-salvar
                                className="shrink-0 rounded-[8px] border border-dash-hair/12 px-2.5 py-1.5 text-[11px] text-dash-muted transition hover:text-dash-fg disabled:opacity-50"
                              >
                                {domSalvando ? "…" : "conectar"}
                              </button>
                            </div>
                            <p className="pt-1 text-[10.5px] leading-[1.5] text-dash-dim">
                              Domínio que o cliente já tem. Depois de conectar, é só apontar o DNS — eu
                              mostro o registro exato.
                            </p>
                          </>
                        ) : (
                          <div className="pt-1">
                            <div className="flex items-center justify-between gap-2">
                              <span
                                data-arquiteto-config-dominio-atual
                                className="min-w-0 truncate font-mono text-[11px] text-dash-fg/90"
                              >
                                {domSalvo}
                              </span>
                              <span
                                data-arquiteto-config-dominio-estado
                                data-arquiteto-config-dominio-estado-valor={domEstado || "conferindo"}
                                className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] ${
                                  domEstado === "apontando"
                                    ? "bg-dash-ok/15 text-dash-ok"
                                    : "bg-dash-raise text-dash-dim"
                                }`}
                              >
                                {domEstado === "apontando"
                                  ? "DNS apontando"
                                  : domEstado === "aguardando"
                                    ? "aguardando o DNS"
                                    : domEstado === "sem-resposta"
                                      ? "sem resposta do DNS"
                                      : "conferindo…"}
                              </span>
                            </div>

                            {domEstado === "apontando" ? (
                              domProntoEm ? (
                                <p className="pt-1 text-[10.5px] leading-[1.5] text-dash-ok">
                                  No ar:{" "}
                                  <a
                                    href={`https://${domSalvo}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="underline"
                                  >
                                    {domSalvo}
                                  </a>{" "}
                                  — certificado emitido e o site do projeto abre nesse endereço.
                                </p>
                              ) : domFalha ? (
                                <p className="pt-1 text-[10.5px] leading-[1.5] text-dash-bad">
                                  O DNS aponta, mas a publicação falhou: {domFalha} Eu tento de novo
                                  sozinho — não precisa mexer em nada.
                                </p>
                              ) : (
                                <p className="pt-1 text-[10.5px] leading-[1.5] text-dash-muted">
                                  O DNS já aponta. Agora é comigo: emitindo o certificado e ligando o
                                  domínio no projeto — leva alguns minutos, e o estado aqui muda sozinho.
                                </p>
                              )
                            ) : (
                              <div className="flex flex-col gap-1.5 pt-1">
                                <p className="text-[10.5px] leading-[1.5] text-dash-dim">
                                  No painel do domínio, crie um registro <b>A</b> com nome <b>@</b> apontando
                                  para <span className="font-mono">{domIpBorda || "o IP do servidor"}</span> (e
                                  outro igual para <b>www</b>). Quando apontar, o certificado é emitido e o
                                  site abre nele.
                                </p>
                                {/* O REGISTRO PRONTO — ninguém digita IP à mão. */}
                                <div className="flex items-center justify-between gap-2 rounded-[8px] border border-dash-hair/10 bg-dash-scrim/20 px-2 py-1.5">
                                  <span className="min-w-0 truncate font-mono text-[10.5px] text-dash-fg/85">
                                    A · @ · {domIpBorda || "…"}
                                  </span>
                                  <CopiarTexto
                                    dataAttr="data-arquiteto-config-dominio-copiar"
                                    texto={`A · @ · ${domIpBorda}`}
                                  />
                                </div>
                              </div>
                            )}

                            {/* LINK DO CLIENTE + MENSAGEM PRONTA (dono, 09/10/2026): o fluxo
                                entrega TUDO — o registro, o link e o texto para mandar. */}
                            {domLink && (
                              <div className="mt-1.5 flex flex-col gap-1.5 rounded-[8px] border border-dash-hair/10 bg-dash-scrim/20 px-2 py-2">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[10.5px] font-medium text-dash-muted">
                                    Link para o cliente
                                  </span>
                                  <CopiarTexto
                                    dataAttr="data-arquiteto-config-dominio-copiar-link"
                                    rotulo="copiar link"
                                    texto={domLink}
                                  />
                                </div>
                                <span className="min-w-0 truncate font-mono text-[10px] text-dash-dim">
                                  {domLink}
                                </span>
                                <div className="flex items-center gap-2 pt-0.5">
                                  <CopiarTexto
                                    dataAttr="data-arquiteto-config-dominio-copiar-mensagem"
                                    rotulo="copiar mensagem pronta"
                                    texto={mensagemDoCliente()}
                                  />
                                  <span className="text-[10px] text-dash-dim">
                                    ele abre, vê o registro e o andamento
                                  </span>
                                </div>
                              </div>
                            )}

                            {/* CLOUDFLARE — o BOTÃO (dono, 09/10/2026): conecta por
                                OAuth e cria o registro A sozinho, em DNS-only. */}
                            {domSalvo && (
                              <div className="mt-1.5 flex flex-col gap-1.5 rounded-[8px] border border-dash-hair/10 bg-dash-scrim/20 px-2 py-2">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[10.5px] font-medium text-dash-muted">
                                    Cloudflare
                                  </span>
                                  {cfConectado && (
                                    <span className="rounded-full bg-dash-ok/15 px-2 py-0.5 text-[10px] text-dash-ok">
                                      conectado{cfZona ? ` · ${cfZona}` : ""}
                                    </span>
                                  )}
                                </div>
                                {cfConectado ? (
                                  <>
                                    <p className="text-[10px] leading-[1.5] text-dash-dim">
                                      Pelo botão: o registro A é criado sozinho (DNS-only), sem ninguém
                                      mexer no painel do domínio.
                                    </p>
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => void criarRegistroCloudflare()}
                                        disabled={cfOcupado}
                                        data-arquiteto-config-cf-criar
                                        className="rounded-[8px] bg-[#f6821f] px-2.5 py-1 text-[10.5px] font-semibold text-black transition hover:brightness-110 disabled:opacity-50"
                                      >
                                        {cfOcupado ? "criando…" : "criar o registro agora"}
                                      </button>
                                      <button
                                        onClick={() => void esquecerCloudflare()}
                                        disabled={cfOcupado}
                                        data-arquiteto-config-cf-esquecer
                                        className="rounded-[8px] border border-dash-hair/12 px-2.5 py-1 text-[10.5px] text-dash-dim transition hover:text-dash-fg disabled:opacity-50"
                                      >
                                        desconectar
                                      </button>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <p className="text-[10px] leading-[1.5] text-dash-dim">
                                      O domínio está no Cloudflare? Conecte pelo botão e eu crio o
                                      registro A sozinho — o cliente não mexe em nada.
                                    </p>
                                    <a
                                      data-arquiteto-config-cf-conectar
                                      href={`/api/oauth/cloudflare/iniciar?projeto=${encodeURIComponent(projetoIdRef.current || "")}`}
                                      className="w-fit rounded-full bg-[#f6821f] px-3 py-1 text-[10.5px] font-semibold text-black transition hover:brightness-110"
                                    >
                                      Conectar com Cloudflare
                                    </a>
                                  </>
                                )}
                                {cfAviso && (
                                  <p
                                    data-arquiteto-config-cf-aviso
                                    className="text-[10px] leading-[1.5] text-dash-muted"
                                  >
                                    {cfAviso}
                                  </p>
                                )}
                              </div>
                            )}

                            <div className="mt-1.5 flex items-center gap-2">
                              <button
                                onClick={() => void carregarDominio(projetoIdRef.current || "")}
                                data-arquiteto-config-dominio-verificar
                                className="rounded-[8px] border border-dash-hair/12 px-2.5 py-1 text-[10.5px] text-dash-muted transition hover:text-dash-fg"
                              >
                                verificar de novo
                              </button>
                              <button
                                onClick={() => void salvarDominio("")}
                                data-arquiteto-config-dominio-tirar
                                className="rounded-[8px] border border-dash-hair/12 px-2.5 py-1 text-[10.5px] text-dash-dim transition hover:text-dash-fg"
                              >
                                desconectar
                              </button>
                            </div>
                          </div>
                        )}

                        {domErro && (
                          <p
                            data-arquiteto-config-dominio-erro
                            className="pt-1 text-[11px] leading-[1.5] text-dash-bad"
                          >
                            {domErro}
                          </p>
                        )}
                        {domAviso && (
                          <p
                            data-arquiteto-config-dominio-aviso
                            className="pt-1 text-[11px] leading-[1.5] text-dash-ok"
                          >
                            {domAviso}
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {abaConfig === "fontes" && (
                <div data-arquiteto-config-fontes className="flex flex-col gap-2">
                  <p className="px-1 text-[11.5px] leading-[1.55] text-dash-muted">
                    Fonte da marca do projeto: suba <b>WOFF2</b> ou <b>WOFF</b> — ou <b>TTF/OTF</b>, que
                    eu converto para WOFF2 ao guardar (é o formato que o navegador usa, e fica bem menor).
                  </p>

                  <input
                    ref={fonteRef}
                    type="file"
                    accept={EXTENSOES_FONTE.map((e) => `.${e}`).join(",")}
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void enviarAsset(f);
                      e.target.value = "";
                    }}
                  />

                  <button
                    onClick={() => fonteRef.current?.click()}
                    disabled={enviandoAsset || !projetoId}
                    data-arquiteto-config-fonte-subir
                    className="rounded-[9px] border border-dash-hair/12 px-3 py-1.5 text-[11.5px] text-dash-muted transition hover:text-dash-fg disabled:opacity-50"
                  >
                    {enviandoAsset ? "subindo…" : "subir uma fonte"}
                  </button>

                  {fontesDoProjeto.length === 0 ? (
                    <p
                      data-arquiteto-config-sem-fontes
                      className="px-1 text-[10.5px] leading-[1.5] text-dash-dim"
                    >
                      Nenhuma fonte no projeto ainda. Se a marca tem fonte própria, é aqui que ela entra
                      (WOFF2, WOFF, TTF ou OTF) — e passa a valer na prévia e no site publicado.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {fontesDoProjeto.map((f) => (
                        <div
                          key={f.caminho}
                          data-arquiteto-config-fonte={f.caminho}
                          className="flex items-center justify-between gap-2 rounded-[9px] border border-dash-line px-2.5 py-1.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-[11.5px] text-dash-fg/90">
                              {familiaDaFonte(f.caminho)}
                            </p>
                            <p className="truncate font-mono text-[10px] text-dash-dim">
                              {f.caminho} · {tamanhoLegivel(f.tamanho)}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <button
                              onClick={() => void copiarFontFace(f.caminho)}
                              data-arquiteto-config-fonte-css={f.caminho}
                              title="Copiar o @font-face para colar no CSS do projeto"
                              className="rounded-[8px] border border-dash-hair/12 px-2 py-1 text-[10.5px] text-dash-muted transition hover:text-dash-fg"
                            >
                              {fonteCopiada === f.caminho ? "copiado" : "@font-face"}
                            </button>
                            <button
                              onClick={() => void removerAsset(f.caminho)}
                              data-arquiteto-config-fonte-tirar={f.caminho}
                              title="Tirar a fonte do projeto"
                              className="rounded-[8px] border border-dash-hair/12 px-2 py-1 text-[10.5px] text-dash-dim transition hover:text-dash-fg"
                            >
                              tirar
                            </button>
                          </div>
                        </div>
                      ))}
                      <p className="px-1 text-[10.5px] leading-[1.5] text-dash-dim">
                        O botão <b>@font-face</b> copia o CSS pronto — cole no projeto e use{" "}
                        <span className="font-mono">font-family: "…"</span>. Ou peça no chat: “usa a
                        fonte … no título”.
                      </p>
                    </div>
                  )}

                  {erroAsset && (
                    <p
                      data-arquiteto-config-fonte-erro
                      className="px-1 text-[11px] leading-[1.5] text-dash-bad"
                    >
                      {erroAsset}
                    </p>
                  )}
                </div>
              )}

              {abaConfig === "integracoes" && (
                <div data-arquiteto-config-integracoes className="flex flex-col gap-2.5">
                  {/* O QUE ESTE PROJETO USA (dono, 09/10/2026: "não precisa mostrar
                      tudo que está integrado, só o que foi usado no projeto").
                      Curto e direto: o que ele escolheu, e a lista de onde escolher. */}
                  <div className="rounded-[8px] border border-dash-hair/[0.09] bg-dash-scrim/20 px-2.5 py-2">
                    <p className="text-[11px] text-dash-fg/85">Este projeto usa</p>
                    {carregandoInteg ? (
                      <p className="mt-1 text-[10px] text-dash-dim">lendo…</p>
                    ) : usadas.length ? (
                      <ul className="mt-1.5 flex flex-col gap-1">
                        {usadas.map((id) => {
                          const o = INTEGRACOES_DO_PROJETO.find((x) => x.id === id);
                          const conectada = minhasInteg.some((m) => m.tipo === id);
                          return (
                            <li
                              key={id}
                              className="flex flex-col gap-1.5 rounded-[8px] px-1.5 py-1.5 transition hover:bg-dash-hair/[0.03]"
                            >
                              <div className="flex items-center justify-between gap-2 text-[10.5px]">
                                <span className="flex min-w-0 flex-col">
                                  <span className="truncate text-dash-muted">{o ? o.nome : id}</span>
                                  {o && <span className="truncate text-[9.5px] text-dash-dim">{o.para}</span>}
                                </span>
                                <span className="flex shrink-0 items-center gap-1.5">
                                  {conectada ? (
                                    <span className="text-[10px] text-dash-ok">conectada</span>
                                  ) : (
                                    <button
                                      onClick={() => {
                                        setAvisoInteg("");
                                        setFormInteg({ id, cred: "", url: "" });
                                      }}
                                      data-arquiteto-config-integracoes-conectar={id}
                                      className="rounded-full bg-dash-raise px-2 py-0.5 text-[10px] text-dash-muted transition hover:text-dash-fg"
                                    >
                                      conectar
                                    </button>
                                  )}
                                  <button
                                    onClick={() => void tirarIntegracao(id)}
                                    aria-label={`Tirar ${o ? o.nome : id} deste projeto`}
                                    className="rounded-full px-1.5 py-0.5 text-[10px] text-dash-dim transition hover:text-dash-bad"
                                  >
                                    tirar
                                  </button>
                                </span>
                              </div>

                              {/* A CHAVE desta integração. Campo de senha (nunca fica à vista),
                                  some da tela ao salvar e NÃO volta nunca na leitura. */}
                              {formInteg?.id === id && (
                                <div className="flex flex-col gap-1.5 rounded-[8px] border border-dash-hair/10 bg-dash-scrim/25 px-2 py-1.5">
                                  {id === "supabase" && (
                                    <input
                                      value={formInteg.url}
                                      onChange={(e) => setFormInteg({ ...formInteg, url: e.target.value })}
                                      placeholder="endereço do projeto (https://xxxx.supabase.co)"
                                      data-arquiteto-integracao-url={id}
                                      className="w-full rounded-[7px] border border-dash-hair/10 bg-dash-scrim/30 px-2 py-1 text-[10.5px] text-dash-fg outline-none placeholder:text-dash-dim focus:border-dash-brand/50"
                                    />
                                  )}
                                  <input
                                    type="password"
                                    autoComplete="off"
                                    value={formInteg.cred}
                                    onChange={(e) => setFormInteg({ ...formInteg, cred: e.target.value })}
                                    placeholder="cola a chave aqui"
                                    data-arquiteto-integracao-chave={id}
                                    className="w-full rounded-[7px] border border-dash-hair/10 bg-dash-scrim/30 px-2 py-1 text-[10.5px] text-dash-fg outline-none placeholder:text-dash-dim focus:border-dash-brand/50"
                                  />
                                  <div className="flex flex-wrap items-center gap-2">
                                    <button
                                      onClick={() => void salvarChaveInteg()}
                                      disabled={salvandoInteg}
                                      data-arquiteto-integracao-salvar={id}
                                      className="rounded-full bg-dash-brand px-2.5 py-1 text-[10px] text-white transition disabled:opacity-50"
                                    >
                                      {salvandoInteg ? "testando…" : "salvar e testar"}
                                    </button>
                                    <button
                                      onClick={() => {
                                        setFormInteg(null);
                                        setAvisoInteg("");
                                      }}
                                      className="rounded-full px-1.5 py-0.5 text-[10px] text-dash-dim transition hover:text-dash-fg"
                                    >
                                      cancelar
                                    </button>
                                    {avisoInteg && (
                                      <span
                                        data-arquiteto-integracao-aviso
                                        className={`text-[10px] ${
                                          avisoInteg.includes("✓") ? "text-dash-ok" : "text-dash-bad"
                                        }`}
                                      >
                                        {avisoInteg}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="mt-1 text-[10px] leading-[1.5] text-dash-dim">
                        Nenhuma ainda. Escolhe abaixo o que este projeto vai usar.
                      </p>
                    )}
                  </div>

                  {/* ADICIONAR — lista curta, e vai crescendo conforme existirem. */}
                  <div className="rounded-[8px] border border-dash-hair/[0.09] bg-dash-scrim/20 px-2.5 py-2">
                    <p className="text-[11px] text-dash-fg/85">Adicionar ao projeto</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {INTEGRACOES_DO_PROJETO.filter((o) => !usadas.includes(o.id)).map((o) => (
                        <button
                          key={o.id}
                          onClick={() => void porIntegracao(o.id)}
                          title={o.para}
                          data-arquiteto-config-integracao-add={o.id}
                          className="rounded-full bg-dash-raise px-2.5 py-1 text-[10.5px] text-dash-muted transition hover:text-dash-fg"
                        >
                          {o.nome}
                        </button>
                      ))}
                      {!INTEGRACOES_DO_PROJETO.some((o) => !usadas.includes(o.id)) && (
                        <span className="text-[10px] text-dash-dim">todas já estão neste projeto</span>
                      )}
                    </div>
                    {/* A porta para o catálogo inteiro: pop-up com busca, por categoria. */}
                    <button
                      onClick={() => {
                        setBuscaInteg("");
                        setVerTodas(true);
                      }}
                      data-arquiteto-config-integracoes-ver-todas
                      className="mt-2 text-[10.5px] text-dash-dim underline transition hover:text-dash-fg"
                    >
                      ver todas as integrações
                    </button>
                  </div>

                  {/* GITHUB já no projeto: o botão de UM clique (manifesto do GitHub App).
                      Ele clica uma vez no GitHub, marca os repositórios e a chave privada
                      chega direto no nosso servidor, cifrada. */}
                  {usadas.includes("github") && (
                    <div className="rounded-[8px] border border-dash-hair/[0.09] bg-dash-scrim/20 px-2.5 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-dash-fg/85">GitHub</span>
                        <span className="hidden text-[10px] text-dash-dim sm:inline">editar projeto que já existe</span>
                      </div>
                      <a
                        href="/api/oauth/github/manifesto"
                        data-arquiteto-config-github
                        className="mt-1.5 inline-flex w-fit items-center gap-1.5 rounded-full bg-dash-raise px-2.5 py-1 text-[10.5px] text-dash-muted transition hover:text-dash-fg"
                      >
                        criar o app e escolher os repositórios
                      </a>
                      <p className="mt-1.5 text-[10px] leading-[1.5] text-dash-dim">
                        Abre o GitHub, você clica uma vez e marca quais repositórios liberar. Sem copiar chave: ela
                        chega direto aqui, cifrada.
                      </p>
                    </div>
                  )}

                  {erroInteg && <p className="px-1 text-[10px] leading-[1.5] text-dash-bad">{erroInteg}</p>}

                  {/* FREIO DE HONESTIDADE: o que ainda NÃO existe, dito com todas as letras. */}
                  <p className="px-1 text-[10px] leading-[1.5] text-dash-dim">
                    Ainda não existe: as chaves da integração chegarem na app gerada. Isso depende de uma decisão
                    sua — variável de ambiente no deploy, ou um endereço nosso no meio.
                  </p>

                  {/* ═══ POP-UP: TODAS as integrações, com busca, por categoria ═══
                      (dono, 09/10/2026: "se tiver um monte de coisa, abre um pop-up
                      para ver todas"). A frente continua curta; aqui ele acha tudo.
                      O que ainda não dá para usar diz "ainda não" — sem promessa falsa. */}
                  {verTodas && (
                    <div
                      className="fixed inset-0 z-50 flex items-end justify-center bg-dash-scrim/70 sm:items-center sm:p-6"
                      onClick={() => setVerTodas(false)}
                    >
                      <div
                        onClick={(e) => e.stopPropagation()}
                        data-arquiteto-integracoes-popup
                        className="flex max-h-[85vh] w-full max-w-[520px] flex-col overflow-hidden rounded-t-[16px] border border-dash-hair/10 bg-dash-side shadow-2xl sm:rounded-[16px]"
                      >
                        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-dash-hair/[0.07] px-4 py-3">
                          <p className="text-[12.5px] text-dash-fg">Integrações</p>
                          <button
                            onClick={() => setVerTodas(false)}
                            aria-label="Fechar"
                            className="rounded-full px-2 py-0.5 text-[11px] text-dash-dim transition hover:text-dash-fg"
                          >
                            fechar
                          </button>
                        </div>
                        <div className="shrink-0 px-4 py-2.5">
                          <input
                            autoFocus
                            value={buscaInteg}
                            onChange={(e) => setBuscaInteg(e.target.value)}
                            placeholder="buscar (ex.: banco, voz, vídeo)"
                            data-arquiteto-integracoes-busca
                            className="w-full rounded-[10px] border border-dash-hair/10 bg-dash-scrim/25 px-3 py-2 text-[12px] text-dash-fg outline-none placeholder:text-dash-dim focus:border-dash-brand/50"
                          />
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
                          {CATALOGO_INTEGRACOES.map((g) => {
                            const t = buscaInteg.trim().toLowerCase();
                            const itens = g.itens.filter(
                              (i) => !t || i.nome.toLowerCase().includes(t) || i.para.toLowerCase().includes(t),
                            );
                            if (!itens.length) return null;
                            return (
                              <div key={g.grupo} className="mt-3 first:mt-1">
                                <p className="text-[9.5px] uppercase tracking-[0.14em] text-dash-dim">{g.grupo}</p>
                                <ul className="mt-1.5 flex flex-col gap-1">
                                  {itens.map((i) => {
                                    const dentro = usadas.includes(i.id);
                                    const fazSentido = INTEGRACOES_DO_PROJETO.some((o) => o.id === i.id);
                                    return (
                                      <li
                                        key={i.id}
                                        className="flex items-center justify-between gap-3 rounded-[9px] px-2 py-1.5 hover:bg-dash-hair/[0.04]"
                                      >
                                        <span className="flex min-w-0 flex-col">
                                          <span className="truncate text-[11.5px] text-dash-fg/90">{i.nome}</span>
                                          <span className="truncate text-[10px] text-dash-dim">{i.para}</span>
                                        </span>
                                        {dentro ? (
                                          <span className="shrink-0 text-[10px] text-dash-ok">neste projeto</span>
                                        ) : fazSentido ? (
                                          <button
                                            onClick={() => void porIntegracao(i.id)}
                                            className="shrink-0 rounded-full bg-dash-raise px-2.5 py-1 text-[10px] text-dash-muted transition hover:text-dash-fg"
                                          >
                                            usar
                                          </button>
                                        ) : (
                                          <span className="shrink-0 text-[10px] text-dash-dim">ainda não</span>
                                        )}
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            );
                          })}
                        </div>
                        <p className="shrink-0 border-t border-dash-hair/[0.07] px-4 py-2.5 text-[10px] leading-[1.5] text-dash-dim">
                          &quot;ainda não&quot; = existe na sua conta, mas o projeto ainda não sabe usar as chaves
                          dela. Nada aqui é apagado da sua conta.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* PUBLICAÇÃO (item 10 do dono): link público read-only. Mesma linguagem
            visual dos outros controles. Estado honesto: "Publicar" ou
            "Publicado", com o link, copiar, republicar e despublicar. */}
        <div className="relative flex shrink-0 items-center" ref={publicarRef}>
          <button
            onClick={() => setMenuPublicar((v) => !v)}
            title="Publicar — link público somente leitura"
            aria-label="Publicar projeto"
            aria-expanded={menuPublicar}
            data-arquiteto-publicar-toggle
            data-arquiteto-publicado={publicarToken ? "sim" : "nao"}
            className={`flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[10.5px] transition sm:px-3 ${
              publicarToken
                ? "bg-dash-ok/15 text-dash-ok ring-1 ring-dash-ok/40"
                : "bg-dash-raise text-dash-muted hover:text-dash-fg"
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M10 13a5 5 0 007.07 0l2.12-2.12a5 5 0 00-7.07-7.07L11 4.93" />
              <path d="M14 11a5 5 0 00-7.07 0L4.8 13.12a5 5 0 007.07 7.07L13 19.07" />
            </svg>
            <span className="hidden sm:inline">{publicarToken ? "Publicado" : "Publicar"}</span>
          </button>

          {menuPublicar && (
            <div
              data-arquiteto-publicar-painel
              className="absolute right-0 top-[36px] z-50 w-[340px] rounded-[16px] border border-dash-line bg-dash-card p-3 shadow-2xl"
            >
              <p className="px-1 pb-1 text-[10px] uppercase tracking-[0.16em] text-dash-dim">
                Publicar projeto
              </p>

              {!projetoId ? (
                <p className="px-1 pt-1 text-[12px] leading-[1.6] text-dash-dim">
                  Só um projeto guardado pode ser publicado. Construa ou abra um projeto primeiro.
                </p>
              ) : publicarToken ? (
                <div className="flex flex-col gap-2.5">
                  <p data-arquiteto-publicar-estado className="px-1 text-[12px] leading-[1.6] text-dash-ok">
                    Publicado{publicadoEm ? ` em ${formatarData(publicadoEm)}` : ""} — link somente leitura.
                  </p>
                  <div className="flex items-center gap-1.5">
                    <input
                      readOnly
                      value={urlPublica()}
                      data-arquiteto-publicar-link
                      onFocus={(e) => e.currentTarget.select()}
                      className="min-w-0 flex-1 rounded-[8px] border border-dash-hair/10 bg-dash-bg px-2 py-1.5 font-mono text-[11px] text-dash-fg/90 outline-none"
                    />
                    <button
                      onClick={() => void copiarLink()}
                      data-arquiteto-publicar-copiar
                      className="shrink-0 rounded-[8px] border border-dash-hair/12 px-2.5 py-1.5 text-[11px] text-dash-muted transition hover:text-dash-fg"
                    >
                      {linkCopiado ? "copiado" : "copiar"}
                    </button>
                  </div>
                  <p className="px-1 text-[10.5px] leading-[1.5] text-dash-dim">
                    O link sempre mostra o estado ATUAL do projeto. Republicar mantém o mesmo
                    endereço. As imagens carregam por URL assinada.
                  </p>
                  <div className="flex items-center gap-2 px-1 pt-0.5">
                    <button
                      onClick={() => void publicar()}
                      disabled={publicando}
                      data-arquiteto-publicar-republicar
                      className="rounded-[8px] bg-dash-raise px-2.5 py-1.5 text-[11px] text-dash-muted transition hover:text-dash-fg disabled:opacity-40"
                    >
                      {publicando ? "publicando…" : "republicar"}
                    </button>
                    <button
                      onClick={() => void despublicar()}
                      disabled={publicando}
                      data-arquiteto-despublicar
                      className="rounded-[8px] border border-dash-bad/40 px-2.5 py-1.5 text-[11px] text-dash-bad transition hover:bg-dash-bad/10 disabled:opacity-40"
                    >
                      despublicar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  <p className="px-1 text-[12px] leading-[1.65] text-dash-muted">
                    Cria um link público que abre o projeto em uma página somente leitura — sem
                    sessão, sem menu e sem acesso a mais nada desta conta. O token é aleatório,
                    gerado no servidor.
                  </p>
                  <button
                    onClick={() => void publicar()}
                    disabled={publicando}
                    data-arquiteto-publicar
                    className="rounded-[9px] bg-dash-brand px-3 py-2 text-[12px] font-semibold text-white transition hover:bg-dash-brandHi disabled:opacity-40"
                  >
                    {publicando ? "publicando…" : "Publicar"}
                  </button>
                </div>
              )}

              {erroPublicar && (
                <p data-arquiteto-publicar-erro className="px-1 pt-2 text-[11px] leading-[1.5] text-dash-bad">
                  {erroPublicar}
                </p>
              )}
            </div>
          )}
        </div>
      </header>

      {/* O input REAL do envio de imagem — escondido, um só para a bancada
          (tanto o botão da lista de arquivos quanto o da barra da prévia o abrem). */}
      <input
        ref={entradaImagemRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.png,.jpg,.jpeg,.webp,.gif,.svg"
        onChange={escolherImagem}
        className="hidden"
        data-arquiteto-input-imagem
      />

      {/* ── abas do CELULAR: conversa e projeto, nada sobreposto ── */}
      <div className="flex shrink-0 gap-1.5 border-b border-dash-hair/[0.07] px-3 py-2 lg:hidden">
        {(["conversa", "projeto"] as const).map((a) => (
          <button
            key={a}
            onClick={() => setAbaMobile(a)}
            className={`flex-1 rounded-[10px] px-4 py-2 text-[12px] transition ${
              abaMobile === a ? "bg-dash-brand text-white" : "bg-dash-raise text-dash-muted hover:text-dash-fg"
            }`}
          >
            {a === "conversa" ? "Conversa" : "Projeto"}
          </button>
        ))}
      </div>

      {/* ═══ CORPO: conversa à esquerda, projeto à direita — borda a borda ═══ */}
      <div className="flex min-h-0 flex-1">
        {/* ═══ ESQUERDA: a conversa ═══ */}
        <section
          className={`${
            abaMobile === "conversa" ? "flex" : "hidden"
          } min-w-0 flex-1 flex-col bg-dash-side/30 lg:flex lg:w-[360px] lg:flex-none lg:border-r lg:border-dash-hair/[0.07]`}
        >
          {/* FAIXA DE PRÉVIA no CELULAR: a MESMA prévia em espelho SÓ-LEITURA.
              Sem ponte (os recados dele são ignorados: o handler só aceita do
              iframe oficial) e sem toque (`pointer-events-none`) — não rouba o
              dedo nem interfere na edição. Na largura real do celular, para ele
              ver exatamente como fica no aparelho dele. Some no computador. */}
          {abaMobile === "conversa" && verPreviaCelular && previa.html && (
            <div className="shrink-0 lg:hidden" data-arquiteto-faixa-previa>
              <div className="flex items-center justify-between px-3 pb-1 pt-2">
                <span className="text-[10px] uppercase tracking-[0.12em] text-dash-dim">Prévia</span>
                <button
                  onClick={() => setVerPreviaCelular(false)}
                  aria-label="Esconder a prévia"
                  className="rounded-full px-1.5 text-[11px] text-dash-dim transition hover:text-dash-fg"
                >
                  esconder
                </button>
              </div>
              {/* O PAPEL DA PRÉVIA fica BRANCO nos dois temas: é a página do
                  usuário aparecendo (a página dele é branca). Pintar isto com
                  o token do tema deixaria o "papel" preto no tema claro. */}
              <div className="mx-3 mb-2 h-[130px] overflow-hidden rounded-[12px] border border-dash-hair/10 bg-white">
                <iframe
                  title="Prévia (espelho)"
                  srcDoc={previa.html}
                  sandbox="allow-scripts"
                  className="pointer-events-none border-0"
                  style={{ width: "100%", height: 844 }}
                />
              </div>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            {!turnos.length && (
              <div className="flex h-full flex-col items-center justify-center px-2 text-center">
                <p className="max-w-[320px] text-[14px] leading-[1.7] text-dash-muted">
                  {carregandoProjeto ? (
                    "Carregando seu último projeto…"
                  ) : (
                    <>
                      Descreva o projeto que você quer. Ex.:{" "}
                      <span className="text-dash-fg/85">
                        “uma página de vendas para o meu CRM, com cabeçalho, preço e botão de compra”
                      </span>
                      .
                    </>
                  )}
                </p>
              </div>
            )}

            <div className="flex flex-col gap-4" data-arquiteto-turnos>
              {turnos.map((t, i) => (
                <div
                  key={i}
                  className={
                    t.papel === "voce"
                      ? "ml-auto max-w-[88%] rounded-[18px] rounded-br-sm bg-dash-brand/18 px-4 py-3 text-[13px] text-dash-fg"
                      : t.erro
                        ? "mr-auto max-w-[92%] rounded-[18px] rounded-bl-sm border border-dash-bad/30 bg-dash-bad/[0.08] px-4 py-3 text-[13px] text-dash-bad"
                        : "mr-auto max-w-[92%] rounded-[18px] rounded-bl-sm border border-dash-hair/[0.07] bg-dash-side px-4 py-3 text-[13px] text-dash-fg/85"
                  }
                >
                  <span className="mb-1 block text-[10px] uppercase tracking-[0.18em] text-dash-dim">
                    {t.papel === "voce" ? "você" : t.plano ? "mirai · plano" : "mirai"}
                  </span>
                  {t.plano && !t.erro ? (
                    <>
                      <RespostaPlano texto={t.texto} />
                      {/* A AÇÃO que torna o modo Plano funcional: executar o
                          plano = mandar o texto ao caminho de CONSTRUIR. Só
                          este clique altera o projeto — e o aviso diz isso. */}
                      <div className="mt-3 border-t border-dash-hair/[0.07] pt-2.5">
                        <button
                          type="button"
                          data-arquiteto-executar-plano
                          onClick={() => executarPlano(t.texto)}
                          disabled={gerando}
                          title="Executar plano: constrói o projeto a partir deste plano (cria uma versão nova)"
                          aria-label="Executar plano: constrói o projeto a partir deste plano e cria uma versão nova"
                          className="inline-flex items-center gap-1.5 rounded-[10px] border border-dash-brand/40 bg-dash-brand/15 px-3 py-1.5 text-[12px] text-dash-fg transition hover:bg-dash-brand/25 disabled:opacity-40"
                        >
                          <IconeEnviar className="h-3.5 w-3.5" />
                          Executar plano
                        </button>
                        <p className="mt-1.5 text-[10.5px] leading-[1.5] text-dash-dim">
                          Isto altera o projeto e cria uma versão nova. Enquanto você não clicar, nada muda.
                        </p>
                      </div>
                    </>
                  ) : (
                    <span className="whitespace-pre-wrap break-words">{t.texto}</span>
                  )}
                </div>
              ))}

              {gerando && (
                <div className="mr-auto flex items-center gap-1.5 px-1 py-1" aria-label="construindo">
                  {[0, 150, 300].map((atraso) => (
                    <span
                      key={atraso}
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-dash-muted"
                      style={{ animationDelay: `${atraso}ms`, animationDuration: "1s" }}
                    />
                  ))}
                  <span className="ml-1 text-[11px] text-dash-dim">
                    {modoChat === "plano" ? "planejando…" : "construindo…"}
                    {/* O TEMPO NA CARA (dono, 11/10/2026): pedido grande leva
                        minutos. Aqui o relógio corre e o servidor diz quantos
                        caracteres o modelo já escreveu — assim "está andando?" é
                        uma resposta visível, não uma adivinhação. */}
                    {segundosDecorridos > 0 && ` ${formatarDuracao(segundosDecorridos * 1000)}`}
                    {progresso?.caracteres
                      ? ` · ${(progresso.caracteres / 1000).toFixed(1).replace(".", ",")} mil caracteres`
                      : ""}
                  </span>
                </div>
              )}
              <div ref={fimConversa} />
            </div>
          </div>

          <div className="border-t border-dash-hair/[0.07] px-4 py-3">
            {/* ── A CAIXA do compositor ──────────────────────────────────────
                A ESTRUTURA é a da referência que o dono pediu para imitar
                (caixa arredondada, campo em cima, linha de controles embaixo),
                mas a PALETA é a do MIRAI OS — a caixa NÃO é branca. Superfície
                `bg-dash-side` (o card do próprio chat), borda discreta
                `border-white/10` (a mesma dos controles de hoje) e raio
                `rounded-[20px]` (a família arredondada do chat). */}
            <div
              data-arquiteto-composer
              className="rounded-[20px] border border-dash-hair/10 bg-dash-side px-3.5 pb-3 pt-3.5 shadow-[0_12px_36px_rgba(0,0,0,0.35)]"
            >
              {/* O QUE VAI JUNTO COM O PEDIDO: a foto do pedaço marcado — a VISÃO do
                  construtor. Fica discreta aqui e dá para tirar. */}
              {foto && (
                <div
                  data-arquiteto-foto-anexada
                  className="mb-2 flex items-center gap-2.5 rounded-[12px] border border-dash-hair/10 bg-dash-scrim/20 p-2"
                >
                  <img
                    src={foto.imagem}
                    alt="Pedaço marcado na prévia"
                    data-arquiteto-foto
                    className="h-[46px] w-auto max-w-[160px] shrink-0 rounded-[7px] border border-dash-hair/10 bg-white object-cover"
                  />
                  <p className="min-w-0 flex-1 text-[10.5px] leading-snug text-dash-muted">
                    foto do pedaço marcado vai junto neste pedido — é assim que o construtor enxerga.
                  </p>
                  <button
                    onClick={() => setFoto(null)}
                    data-arquiteto-foto-tirar
                    title="Tirar a foto do pedido"
                    aria-label="Tirar a foto do pedido"
                    className="shrink-0 rounded-[7px] bg-dash-raise px-2 py-1 text-[10px] text-dash-muted transition hover:text-dash-fg"
                  >
                    tirar
                  </button>
                </div>
              )}
              {/* O CAMPO, no topo. Placeholder exato do dono. Enter envia,
                  Shift+Enter quebra a linha (comportamento de sempre). */}
              <textarea
                ref={caixa}
                data-arquiteto-pedido
                value={pedido}
                rows={1}
                onChange={(e) => setPedido(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    enviarPedido();
                  }
                }}
                placeholder={modoChat === "plano" ? "Descreva o que planejar…" : "Descreva sua ideia"}
                className="max-h-32 min-h-[40px] w-full resize-none border-0 bg-transparent px-1 text-[14px] leading-[1.6] text-dash-fg outline-none placeholder:text-dash-dim"
              />

              {/* A LINHA de baixo, esquerda→direita: "+" · PÍLULA do modo ·
                  "Automática" · MICROFONE · ENVIAR (círculo + seta p/ cima). */}
              <div className="mt-2 flex items-center gap-1" data-arquiteto-modos>
                {/* O "+" do chat: ações que FUNCIONAM de verdade. */}
                <div className="relative" ref={maisRef}>
                  <button
                    type="button"
                    data-arquiteto-mais
                    aria-label="Mais ações"
                    aria-expanded={menuMais}
                    title="Mais ações"
                    onClick={() => setMenuMais((v) => !v)}
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition ${
                      menuMais
                        ? "bg-dash-raise text-dash-fg"
                        : "text-dash-muted hover:bg-dash-hair/[0.06] hover:text-dash-fg"
                    }`}
                  >
                    <IconeMais className="h-[18px] w-[18px]" />
                  </button>

                  {menuMais && (
                    <div
                      data-arquiteto-mais-menu
                      className="absolute bottom-[calc(100%+8px)] left-0 z-50 w-[286px] rounded-[16px] border border-dash-line bg-dash-card p-1.5 shadow-2xl"
                    >
                      <p className="px-3 pb-1 pt-2 text-[10px] uppercase tracking-[0.16em] text-dash-dim">
                        Ações
                      </p>

                      {/* Anexar imagem — abre o input de imagem REAL (o mesmo da bancada). */}
                      <button
                        type="button"
                        data-arquiteto-mais-anexar
                        onClick={() => {
                          setMenuMais(false);
                          entradaImagemRef.current?.click();
                        }}
                        className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left transition hover:bg-dash-hair/[0.06]"
                      >
                        <IconeImagem className="h-[17px] w-[17px] shrink-0 text-dash-muted" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12.5px] text-dash-fg/90">Anexar imagem</span>
                          <span className="block text-[10.5px] leading-[1.4] text-dash-dim">
                            {projetoId
                              ? "vai para os assets do projeto (PNG, JPG, WEBP, GIF, SVG)"
                              : "precisa de um projeto antes — construa uma vez para poder anexar"}
                          </span>
                        </span>
                      </button>

                      {/* Usar um bloco — abre a MESMA biblioteca de blocos do painel. */}
                      <button
                        type="button"
                        data-arquiteto-mais-blocos
                        aria-expanded={menuMaisBlocos}
                        onClick={() => setMenuMaisBlocos((v) => !v)}
                        className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left transition hover:bg-dash-hair/[0.06]"
                      >
                        <IconeBlocos className="h-[17px] w-[17px] shrink-0 text-dash-muted" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12.5px] text-dash-fg/90">Usar um bloco</span>
                          <span className="block text-[10.5px] leading-[1.4] text-dash-dim">
                            {BLOCOS.length} blocos prontos entram no projeto
                          </span>
                        </span>
                        <IconeSeta
                          className={`h-3.5 w-3.5 shrink-0 text-dash-dim transition-transform ${
                            menuMaisBlocos ? "rotate-90" : ""
                          }`}
                        />
                      </button>

                      {menuMaisBlocos && (
                        <div className="mt-1 max-h-[240px] overflow-y-auto border-t border-dash-hair/[0.07] pt-1">
                          {BLOCOS.map((b) => (
                            <button
                              key={b.id}
                              type="button"
                              data-arquiteto-mais-bloco={b.id}
                              onClick={() => {
                                setMenuMais(false);
                                setMenuMaisBlocos(false);
                                inserirBlocoNoProjeto(b, "conversa");
                              }}
                              className="flex w-full flex-col items-start rounded-[10px] px-3 py-2 text-left transition hover:bg-dash-hair/[0.06]"
                            >
                              <span className="text-[12px] text-dash-fg/90">{b.nome}</span>
                              <span className="text-[10.5px] leading-[1.4] text-dash-dim">{b.descricao}</span>
                            </button>
                          ))}
                        </div>
                      )}

                      <p className="border-t border-dash-hair/[0.07] px-3 py-2 text-[10px] leading-[1.5] text-dash-dim">
                        Só ações que funcionam de verdade — nada desabilitado nem promessa.
                      </p>
                    </div>
                  )}
                </div>

                {/* PÍLULA de MODO (dono, padrão Figma): UM botão pequeno que
                    mostra o modo ATUAL e abre as DUAS opções. O fechado sempre
                    diz o que o Enter vai fazer — nunca há dúvida. Agora é a
                    pílula-redonda no ACENTO do app (`dash-brand`, o mesmo
                    laranja do resto da bancada) — nada de roxo importado. */}
                <div className="relative shrink-0" ref={modoRef}>
                  <button
                    ref={modoBtnRef}
                    type="button"
                    data-arquiteto-modo-pill={modoChat}
                    aria-haspopup="menu"
                    aria-expanded={menuModo}
                    aria-label={
                      modoChat === "construir"
                        ? "Modo do pedido: Construir. Abre as opções"
                        : "Modo do pedido: Plano. Abre as opções"
                    }
                    title={
                      modoChat === "construir"
                        ? "Construir — o pedido vira projeto. Clique para trocar o modo"
                        : "Plano — só planeja, não altera o projeto. Clique para trocar o modo"
                    }
                    onClick={() => setMenuModo((v) => !v)}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                        e.preventDefault();
                        setMenuModo(true);
                      }
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[12px] transition ${
                      menuModo
                        ? "border-dash-brand/60 bg-dash-brand/25 text-dash-fg"
                        : "border-dash-brand/35 bg-dash-brand/[0.16] text-dash-fg hover:bg-dash-brand/25"
                    }`}
                  >
                    {modoChat === "construir" ? (
                      <IconeRobo className="h-3.5 w-3.5 text-dash-brand" />
                    ) : (
                      <IconeDocumento className="h-3.5 w-3.5 text-dash-brand" />
                    )}
                    <span className="text-dash-fg/90">
                      {modoChat === "construir" ? "Construir" : "Plano"}
                    </span>
                    <IconeCaret
                      className={`h-3 w-3 text-dash-brand/70 transition-transform ${
                        menuModo ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {menuModo && (
                    <div
                      ref={modoMenuRef}
                      role="menu"
                      aria-label="Modo do pedido"
                      data-arquiteto-modo-menu
                      onKeyDown={navegarModo}
                      className="absolute bottom-[calc(100%+8px)] left-0 z-50 w-[238px] rounded-[14px] border border-dash-line bg-dash-card p-1 shadow-2xl"
                    >
                      <p className="px-3 pb-1 pt-2 text-[10px] uppercase tracking-[0.16em] text-dash-dim">
                        O que o envio faz
                      </p>

                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={modoChat === "construir"}
                        data-arquiteto-modo-construir
                        onClick={() => escolherModo("construir")}
                        title="Construir: o pedido vira projeto"
                        aria-label="Construir: o pedido vira projeto (cria uma versão nova)"
                        className={`flex w-full items-start gap-2.5 rounded-[10px] px-3 py-2.5 text-left transition ${
                          modoChat === "construir"
                            ? "bg-dash-brand/15 text-dash-fg"
                            : "text-dash-muted hover:bg-dash-hair/[0.06] hover:text-dash-fg"
                        }`}
                      >
                        <IconeRobo className="mt-0.5 h-[16px] w-[16px] shrink-0 text-dash-brand" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12.5px] text-dash-fg/90">Construir</span>
                          <span className="block text-[10.5px] leading-[1.4] text-dash-dim">
                            o pedido vira projeto (cria uma versão nova)
                          </span>
                        </span>
                        {modoChat === "construir" && (
                          <IconeCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-dash-brand" />
                        )}
                      </button>

                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={modoChat === "plano"}
                        data-arquiteto-modo-plano
                        onClick={() => escolherModo("plano")}
                        title="Plano: só planeja, não altera o projeto"
                        aria-label="Plano: só planeja, não altera o projeto"
                        className={`flex w-full items-start gap-2.5 rounded-[10px] px-3 py-2.5 text-left transition ${
                          modoChat === "plano"
                            ? "bg-dash-brand/15 text-dash-fg"
                            : "text-dash-muted hover:bg-dash-hair/[0.06] hover:text-dash-fg"
                        }`}
                      >
                        <IconeDocumento className="mt-0.5 h-[16px] w-[16px] shrink-0 text-dash-brand" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12.5px] text-dash-fg/90">Plano</span>
                          <span className="block text-[10.5px] leading-[1.4] text-dash-dim">
                            só planeja: não altera o projeto
                          </span>
                        </span>
                        {modoChat === "plano" && (
                          <IconeCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-dash-brand" />
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {/* "AUTOMÁTICA" — é HONESTO, não é menu de mentira: o modelo
                    NÃO é escolha da pessoa, a Mirai escolhe sozinha. O nome no
                    title/aria vem do SERVIDOR (data-arquiteto-automatica-modelo). */}
                <span
                  data-arquiteto-automatica
                  data-arquiteto-automatica-modelo={modeloReal || "nao-lido"}
                  title={
                    modeloReal
                      ? `Automática — a Mirai escolhe o modelo sozinha; agora usando ${modeloReal}.`
                      : "Automática — a Mirai escolhe o modelo sozinha conforme a sua conta."
                  }
                  aria-label={
                    modeloReal
                      ? `Automática: o modelo (${modeloReal}) é escolhido automaticamente pela Mirai`
                      : "Automática: o modelo é escolhido automaticamente pela Mirai"
                  }
                  className="min-w-0 shrink truncate px-1 text-[11.5px] text-dash-muted"
                >
                  Automática
                </span>

                <div className="flex-1" />

                {/* MICROFONE — ditado por voz REAL (Web Speech API pt-BR), o
                    MESMO caminho de voz do chat escrito do app. Sem suporte do
                    navegador: DESABILITADO e DIZ isso — nunca finge ouvir. */}
                <button
                  type="button"
                  data-arquiteto-microfone
                  onClick={alternarDitado}
                  disabled={!temDitado}
                  aria-pressed={ouvindo}
                  aria-label={
                    temDitado
                      ? ouvindo
                        ? "Parar ditado por voz"
                        : "Ditar por voz (pt-BR)"
                      : "Voz ainda não ligada: este navegador não oferece ditado por voz"
                  }
                  title={
                    temDitado
                      ? ouvindo
                        ? "Parar ditado"
                        : "Ditar por voz (pt-BR)"
                      : "Voz ainda não ligada: este navegador não oferece ditado por voz"
                  }
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition ${
                    !temDitado
                      ? "cursor-not-allowed text-dash-dim opacity-50"
                      : ouvindo
                        ? "bg-dash-bad/20 text-dash-bad ring-1 ring-dash-bad/50"
                        : "text-dash-muted hover:bg-dash-hair/[0.06] hover:text-dash-fg"
                  }`}
                >
                  <IconeMicrofone className="h-[18px] w-[18px]" />
                </button>

                {/* ENVIAR — círculo NEUTRO do app (`bg-dash-raise`, o mesmo
                    tom dos círculos do chat) com seta para CIMA. Envia IGUAL ao
                    de antes; o rótulo segue o modo (Planejar/Construir). */}
                <button
                  type="button"
                  onClick={() => enviarPedido()}
                  disabled={gerando || !pedido.trim()}
                  data-arquiteto-enviar={modoChat}
                  aria-label={modoChat === "plano" ? "Planejar" : "Construir"}
                  title={modoChat === "plano" ? "Planejar (Enter)" : "Construir (Enter)"}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-dash-raise text-dash-fg transition hover:brightness-125 disabled:opacity-40"
                >
                  <IconeSetaCima className="h-[17px] w-[17px]" />
                </button>
              </div>
            </div>

            {/* A legenda do MODO — honesta e viva. Fica logo ABAIXO da caixa
                (não briga com o respiro de dentro dela). */}
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 px-1">
              <span
                data-arquiteto-modo-atual={modoChat}
                aria-live="polite"
                className="text-[11px] text-dash-dim"
              >
                {modoChat === "construir"
                  ? "o pedido vira projeto (cria uma versão nova)"
                  : "só planeja: não altera o projeto"}
              </span>
              {ouvindo && (
                <span className="flex items-center gap-1.5 text-[11px] text-dash-brand">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-dash-brand" />
                  ouvindo…
                </span>
              )}
              {!ouvindo && avisoVoz && (
                <span className="text-[11px] text-dash-warn">{avisoVoz}</span>
              )}
            </div>
          </div>
        </section>

        {/* ═══ DIREITA: o projeto, ao vivo — a tela toda que sobra ═══ */}
        <section
          className={`${
            abaMobile === "projeto" ? "flex" : "hidden"
          } min-w-0 flex-1 flex-col overflow-hidden lg:flex`}
        >
          {/* erro do modelo/provedor: dito em português, nunca painel em branco */}
          {erro && (
            <div className="shrink-0 border-b border-dash-bad/20 bg-dash-bad/[0.07] px-4 py-3">
              <p className="text-[12px] leading-[1.6] text-dash-bad">{erro}</p>
            </div>
          )}

          {/* A BANCADA do projeto + os painéis laterais (CAMADAS / TOKENS),
              lado a lado — como a bancada do dono. */}
          <div className="flex min-h-0 flex-1">
            <div className="min-h-0 flex-1 overflow-hidden">
            {!projeto ? (
              <div className="flex h-full min-h-0">
                <div className="grid min-w-0 flex-1 place-items-center px-6">
                  <p className="max-w-[380px] text-center text-[13px] leading-[1.7] text-dash-muted">
                    {carregandoProjeto
                      ? "Carregando seu projeto…"
                      : gerando
                        ? "Construindo o projeto… ele aparece aqui assim que ficar pronto."
                        : "Nada gerado ainda. Descreva o projeto na conversa e a prévia aparece aqui."}
                  </p>
                </div>
                {mostrarCamadas && painelCamadas(false)}
              </div>
            ) : modo === "responsivo" ? (
              /* Prévia à esquerda, CAMADAS à direita — a bancada do dono. */
              <div className="flex h-full min-h-0">
                <div className="flex min-w-0 flex-1 flex-col">
                  {/* BARRA DA PRÉVIA — um controle só: presets de largura, largura
                      exata (px) e zoom. Quieta, na mesma linguagem dos modos. */}
                  <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-dash-hair/[0.07] bg-dash-side/20 px-3 py-1.5 sm:px-4">
                    <div className="flex items-center gap-1.5">
                      {(["desktop", "tablet", "celular"] as const).map((d) => (
                        <button
                          key={d}
                          onClick={() => aplicarPreset(d)}
                          title={ROTULO_PRESET[d]}
                          aria-label={ARIA_PRESET[d]}
                          aria-pressed={presetAtivo === d}
                          data-arquiteto-preset={d}
                          className={`grid h-7 w-7 place-items-center rounded-full transition ${
                            presetAtivo === d
                              ? "bg-dash-brand/20 text-dash-brand ring-1 ring-dash-brand/40"
                              : "bg-dash-raise text-dash-muted hover:text-dash-fg"
                          }`}
                        >
                          {d === "desktop" ? (
                            <IconeMonitor className="h-3.5 w-3.5" />
                          ) : d === "tablet" ? (
                            <IconeTablet className="h-3.5 w-3.5" />
                          ) : (
                            <IconeCelular className="h-3.5 w-3.5" />
                          )}
                        </button>
                      ))}
                    </div>

                    {/* LARGURA EXATA (px) — o MESMO alvo dos presets. */}
                    <label className="flex items-center gap-1.5 text-[10.5px] text-dash-dim">
                      largura
                      <input
                        type="number"
                        inputMode="numeric"
                        min={LARGURA_MIN}
                        max={LARGURA_MAX}
                        value={campoLargura}
                        onChange={(e) => aplicarLarguraExata(e.target.value)}
                        placeholder="auto"
                        aria-label="Largura da prévia em pixels"
                        data-arquiteto-largura
                        className="w-[64px] rounded-[7px] border border-dash-hair/10 bg-dash-bg px-2 py-1 font-mono text-[11px] text-dash-fg outline-none placeholder:text-dash-dim focus:border-dash-brand/60"
                      />
                      px
                    </label>

                    {/* ESCOLHER ELEMENTO (dono, 09/10/2026): ligado, clicar na prévia
                        seleciona o elemento (e a página fica em pausa); desligado, a
                        prévia volta a ser a página de verdade, com os botões dela. */}
                    <button
                      onClick={() => {
                        const ligar = !escolhendo;
                        setEscolhendo(ligar);
                        if (ligar) setRiscando(false);
                      }}
                      aria-pressed={escolhendo}
                      title={
                        escolhendo
                          ? "Escolher elemento: clicar na prévia seleciona (a página fica em pausa)"
                          : "Escolher elemento: a prévia está ativa — ligue para selecionar clicando"
                      }
                      aria-label="Escolher elemento clicando na prévia"
                      data-arquiteto-escolher
                      data-arquiteto-escolhendo={escolhendo ? "sim" : "nao"}
                      className={`flex h-7 w-7 items-center justify-center rounded-full transition ${
                        escolhendo
                          ? "bg-dash-brand/20 text-dash-brand ring-1 ring-dash-brand/40"
                          : "bg-dash-raise text-dash-muted hover:text-dash-fg"
                      }`}
                    >
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M5.5 3.2l13 6.9-5.9 1.6-1.6 5.9z" />
                      </svg>
                    </button>

                    {/* RISCAR (dono, 09/10/2026): desenhar POR CIMA da prévia para
                        marcar o pedaço antes de pedir no chat. A marca vira
                        referência de TEXTO do elemento sob ela — e fica na tela,
                        mas NÃO entra no projeto. Os dois modos não brigam: ligar um
                        desliga o outro. */}
                    <button
                      onClick={() => {
                        const ligar = !riscando;
                        setRiscando(ligar);
                        if (ligar) setEscolhendo(false);
                        ajustarTelaDoRisco();
                      }}
                      aria-pressed={riscando}
                      title={
                        riscando
                          ? "Riscar: desenhe por cima da prévia para marcar o pedaço"
                          : "Riscar: marque na prévia o pedaço que você quer mudar"
                      }
                      aria-label="Riscar sobre a prévia"
                      data-arquiteto-riscar
                      data-arquiteto-riscando={riscando ? "sim" : "nao"}
                      className={`flex h-7 w-7 items-center justify-center rounded-full transition ${
                        riscando
                          ? "bg-dash-brand/20 text-dash-brand ring-1 ring-dash-brand/40"
                          : "bg-dash-raise text-dash-muted hover:text-dash-fg"
                      }`}
                    >
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M4 17.6V20h2.4L17.7 8.7l-2.4-2.4z" />
                        <path d="M15.3 6.3l2.4 2.4" />
                      </svg>
                    </button>
                    {temRisco && (
                      <button
                        onClick={limparRiscos}
                        data-arquiteto-limpar-riscos
                        title="Tirar as marcas da tela (elas não fazem parte do projeto)"
                        className="flex items-center gap-1 rounded-full bg-dash-raise px-2.5 py-1 text-[10.5px] text-dash-muted transition hover:text-dash-fg"
                      >
                        limpar riscos
                      </button>
                    )}

                    {/* ENVIAR IMAGEM (discreto) — a mesma ação do botão da lista;
                        na bancada Responsiva é por aqui que se sobe uma imagem
                        (ou soltando direto sobre a prévia). */}
                    <button
                      onClick={() => entradaImagemRef.current?.click()}
                      disabled={!projetoId || enviandoAsset}
                      title={
                        projetoId
                          ? `Enviar imagem (até ${MAX_ASSET_ROTULO}) — ou arraste sobre a prévia`
                          : "Construa o projeto antes de enviar imagens"
                      }
                      aria-label="Enviar imagem para o projeto"
                      data-arquiteto-enviar-imagem-preview
                      className="flex items-center gap-1 rounded-full bg-dash-raise px-2.5 py-1 text-[10.5px] text-dash-muted transition hover:text-dash-fg disabled:opacity-35"
                    >
                      <IconeImagem className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">imagem</span>
                    </button>

                    {/* ZOOM — só a prévia escala; o chrome fica no tamanho real. */}
                    <div className="ml-auto flex items-center gap-1">
                      <button
                        onClick={() => passoZoom(-1)}
                        disabled={zoom <= ZOOM_PASSOS[0]}
                        title="Diminuir zoom"
                        aria-label="Diminuir zoom"
                        data-arquiteto-zoom-menos
                        className="grid h-6 w-6 place-items-center rounded-[7px] bg-dash-raise text-dash-muted transition hover:text-dash-fg disabled:opacity-35"
                      >
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
                          <path d="M5 12h14" />
                        </svg>
                      </button>
                      <button
                        onClick={redefinirZoom}
                        title="Zoom 100%"
                        aria-label="Redefinir zoom"
                        data-arquiteto-zoom-valor
                        className="h-6 min-w-[44px] rounded-[7px] bg-dash-raise px-1.5 text-[10.5px] tabular-nums text-dash-fg/85 transition hover:text-dash-fg"
                      >
                        {zoom}%
                      </button>
                      <button
                        onClick={() => passoZoom(1)}
                        disabled={zoom >= ZOOM_PASSOS[ZOOM_PASSOS.length - 1]}
                        title="Aumentar zoom"
                        aria-label="Aumentar zoom"
                        data-arquiteto-zoom-mais
                        className="grid h-6 w-6 place-items-center rounded-[7px] bg-dash-raise text-dash-muted transition hover:text-dash-fg disabled:opacity-35"
                      >
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
                          <path d="M12 5v14" />
                          <path d="M5 12h14" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Faltou arquivo referenciado? Dito em português, aqui e dentro
                      da própria prévia — nunca uma prévia quebrada em silêncio. */}
                  {previa.faltando.length > 0 && (
                    <div className="shrink-0 border-b border-dash-bad/20 bg-dash-bad/[0.07] px-4 py-2.5">
                      <p className="text-[11.5px] leading-[1.6] text-dash-bad">
                        Prévia incompleta — {previa.faltando.join("; ")}.
                      </p>
                    </div>
                  )}

                  {/* Recusa honesta de imagem (tipo/tamanho) — dita aqui também,
                      porque no modo Responsivo a lista de arquivos não está à vista. */}
                  {erroAsset && (
                    <div className="shrink-0 border-b border-dash-bad/20 bg-dash-bad/[0.07] px-4 py-2.5">
                      <p className="text-[11.5px] leading-[1.6] text-dash-bad">{erroAsset}</p>
                    </div>
                  )}
                  {enviandoAsset && (
                    <div className="shrink-0 border-b border-dash-hair/[0.07] px-4 py-2">
                      <p className="text-[11px] text-dash-dim">enviando imagem…</p>
                    </div>
                  )}

                  {/* A ÁREA DA PRÉVIA — rolável: quando o zoom passa do painel, a
                      moldura cresce e dá para ROLAR/arrastar; nada fica cortado em
                      silêncio (o conteúdo todo continua alcançável). O zoom é um
                      TRANSFORM na moldura — o projeto NÃO reflui por causa dele.
                      Aqui também se SOLTA uma imagem: ela vira um asset do projeto. */}
                  <div
                    ref={painelPrevia}
                    data-arquiteto-painel
                    onDragOver={(e) => {
                      if (!projetoId) return;
                      e.preventDefault();
                      if (!arrastando) setArrastando(true);
                    }}
                    onDragLeave={(e) => {
                      if (e.currentTarget === e.target) setArrastando(false);
                    }}
                    onDrop={aoSoltarImagem}
                    className={`relative min-h-0 flex-1 overflow-auto ${
                      arrastando ? "ring-2 ring-inset ring-dash-brand/60" : ""
                    }`}
                  >
                    {arrastando && (
                      <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-dash-bg/70">
                        <p className="rounded-[12px] border border-dash-brand/40 bg-dash-card px-4 py-3 text-[12.5px] text-dash-fg">
                          solte a imagem para enviá-la ao projeto (até {MAX_ASSET_ROTULO})
                        </p>
                      </div>
                    )}
                    <div className="flex h-max w-max min-h-full min-w-full">
                      <div className="m-auto p-4">
                        <div
                          data-arquiteto-caixa
                          style={{
                            width: medida !== null ? medida * fatorZoom : undefined,
                            height:
                              alturaDisponivel !== null ? alturaDisponivel * fatorZoom : undefined,
                          }}
                        >
                          <div
                            ref={moldura}
                            data-arquiteto-moldura
                            className="relative flex h-full w-full flex-col overflow-hidden rounded-[16px] border border-dash-hair/10 bg-white shadow-2xl"
                            style={{
                              width: medida !== null ? medida : "100%",
                              height: alturaDisponivel !== null ? alturaDisponivel : "100%",
                              transform: `scale(${fatorZoom})`,
                              transformOrigin: "top left",
                            }}
                          >
                            <iframe
                              ref={iframeRef}
                              title="Prévia do projeto"
                              srcDoc={previa.html}
                              sandbox="allow-scripts"
                              onLoad={aoCarregarPrevia}
                              className="h-full w-full bg-white"
                            />
                            {/* CAMADA DE RISCO (dono, 09/10/2026): desenhar POR CIMA
                                da prévia para marcar onde quer a mudança. Só pega o
                                ponteiro no modo riscar; fora dele é invisível ao
                                toque, e a página rola/clica normal. */}
                            <canvas
                              ref={telaRiscos}
                              data-arquiteto-riscos
                              className="absolute inset-0 h-full w-full"
                              style={{
                                pointerEvents: riscando ? "auto" : "none",
                                cursor: riscando ? "crosshair" : "default",
                                touchAction: "none",
                              }}
                              onPointerDown={comecarRisco}
                              onPointerMove={seguirRisco}
                              onPointerUp={terminarRisco}
                              onPointerCancel={terminarRisco}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Rótulo medido — honesto: se o painel limitou, ele DIZ. */}
                  <p
                    data-arquiteto-medida
                    className="shrink-0 border-t border-dash-hair/[0.07] px-4 py-2 text-[10.5px] text-dash-dim"
                  >
                    {larguraBase === null
                      ? `largura total · ${medida ?? "—"}px`
                      : `${medida ?? larguraBase}px${
                          limitadoPeloPainel ? " (limitado pela largura do painel)" : ""
                        }`}
                    {zoom !== 100 ? ` · zoom ${zoom}%` : ""}
                  </p>
                </div>
                {mostrarCamadas && painelCamadas(true)}
              </div>
            ) : (
              /* ═══ MODO CÓDIGO: árvore de arquivos à esquerda, o arquivo à direita ═══ */
              <div className="flex h-full min-h-0">
                {/* A ÁRVORE do projeto: cada arquivo real, com a ENTRADA marcada. */}
                <aside className="flex w-[168px] shrink-0 flex-col border-r border-dash-hair/[0.07] bg-dash-side/30 sm:w-[204px]">
                  <div className="flex items-center gap-1 border-b border-dash-hair/[0.07] px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-dash-dim">Arquivos</p>
                    <div className="ml-auto flex items-center gap-1">
                      {/* ENVIAR IMAGEM — o controle discreto da lista de arquivos. */}
                      <button
                        onClick={() => entradaImagemRef.current?.click()}
                        disabled={!projetoId || enviandoAsset}
                        title={projetoId ? `Enviar imagem (até ${MAX_ASSET_ROTULO})` : "Construa o projeto antes de enviar imagens"}
                        aria-label="Enviar imagem para o projeto"
                        data-arquiteto-enviar-imagem
                        className="grid h-6 w-6 place-items-center rounded-[7px] bg-dash-raise text-dash-muted transition hover:text-dash-fg disabled:opacity-35"
                      >
                        <IconeImagem className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          setAdicionando((v) => !v);
                          setNovoNome("");
                          setErro("");
                        }}
                        title="Adicionar arquivo"
                        aria-label="Adicionar arquivo"
                        className="grid h-6 w-6 place-items-center rounded-[7px] bg-dash-raise text-dash-muted transition hover:text-dash-fg"
                      >
                        <IconeMais className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Adicionar à mão: um arquivo VAZIO. Nada inventado no conteúdo. */}
                  {adicionando && (
                    <div className="border-b border-dash-hair/[0.07] p-2">
                      <input
                        autoFocus
                        value={novoNome}
                        onChange={(e) => setNovoNome(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            adicionarArquivo();
                          }
                          if (e.key === "Escape") {
                            setAdicionando(false);
                            setNovoNome("");
                          }
                        }}
                        placeholder="nome-do-arquivo.css"
                        className="w-full rounded-[8px] border border-dash-hair/10 bg-dash-bg px-2 py-1.5 font-mono text-[11px] text-dash-fg outline-none placeholder:text-dash-dim focus:border-dash-brand/60"
                      />
                      <p className="mt-1.5 text-[10px] leading-[1.4] text-dash-dim">
                        Enter cria um arquivo vazio · Esc cancela
                      </p>
                    </div>
                  )}

                  <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-2">
                    {projeto.arquivos.map((a, i) => {
                      const ehEntrada = entrada?.nome === a.nome;
                      const ativo = i === arquivoAtivo;
                      return (
                        <div
                          key={a.nome}
                          className={`group flex items-center gap-1 rounded-[9px] pr-1 transition ${
                            ativo ? "bg-dash-brand/12" : "hover:bg-dash-hair/[0.04]"
                          }`}
                        >
                          <button
                            onClick={() => {
                              setArquivoAtivo(i);
                              setEstadoSalvo("ocioso");
                              setAssetAtivo(null);
                            }}
                            title={a.nome}
                            className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left"
                          >
                            <IconeDocumento
                              className={`h-4 w-4 shrink-0 ${ativo ? "text-dash-brand" : "text-dash-dim"}`}
                            />
                            <span
                              className={`truncate font-mono text-[11.5px] ${ativo ? "text-dash-brand" : "text-dash-fg/85"}`}
                            >
                              {a.nome}
                            </span>
                          </button>
                          {ehEntrada && (
                            <span className="shrink-0 rounded-full bg-dash-ok/15 px-1.5 py-[2px] text-[9px] uppercase tracking-wide text-dash-ok">
                              entrada
                            </span>
                          )}
                          <button
                            onClick={() => removerArquivo(i)}
                            disabled={projeto.arquivos.length <= 1}
                            title={
                              projeto.arquivos.length <= 1
                                ? "O projeto precisa de ao menos um arquivo"
                                : `Remover ${a.nome}`
                            }
                            aria-label={`Remover ${a.nome}`}
                            className="grid h-6 w-6 shrink-0 place-items-center rounded-[7px] text-dash-dim opacity-0 transition hover:text-dash-bad group-hover:opacity-100 disabled:hidden"
                          >
                            <IconeFechar className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}

                    {/* IMAGENS do projeto — embaixo da pasta assets/, como no
                        projeto de verdade. Clicar mostra o aviso de binário. */}
                    {(assets.length > 0 || enviandoAsset) && (
                      <div className="mt-2 border-t border-dash-hair/[0.06] pt-1.5" data-arquiteto-assets>
                        <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-dash-dim">
                          <span className="grid h-4 w-4 place-items-center rounded-[4px] bg-dash-raise/70">
                            <IconeImagem className="h-2.5 w-2.5" />
                          </span>
                          {PASTA_ASSETS}/
                          <span className="ml-auto normal-case tracking-normal">
                            {assets.length} {assets.length === 1 ? "imagem" : "imagens"}
                          </span>
                        </div>
                        {assets.map((a) => {
                          const ativoA = assetAtivo === a.caminho;
                          const nome = a.caminho.split("/").pop() || a.caminho;
                          return (
                            <div
                              key={a.caminho}
                              data-arquiteto-asset={a.caminho}
                              className={`group ml-3 flex items-center gap-1 rounded-[9px] pr-1 transition ${
                                ativoA ? "bg-dash-brand/12" : "hover:bg-dash-hair/[0.04]"
                              }`}
                            >
                              <button
                                onClick={() => {
                                  setAssetAtivo(a.caminho);
                                  setEstadoSalvo("ocioso");
                                  setErroAsset("");
                                }}
                                title={`${a.caminho} · ${rotuloDeMimeAsset(a.mime)} · ${tamanhoLegivel(a.tamanho)}`}
                                className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left"
                              >
                                <IconeImagem
                                  className={`h-4 w-4 shrink-0 ${ativoA ? "text-dash-brand" : "text-dash-dim"}`}
                                />
                                <span
                                  className={`truncate font-mono text-[11.5px] ${ativoA ? "text-dash-brand" : "text-dash-fg/85"}`}
                                >
                                  {nome}
                                </span>
                              </button>
                              <span className="shrink-0 text-[9.5px] uppercase tracking-wide text-dash-dim">
                                {rotuloDeMimeAsset(a.mime)}
                              </span>
                              <button
                                onClick={() => void removerAsset(a.caminho)}
                                title={`Remover ${a.caminho}`}
                                aria-label={`Remover ${a.caminho}`}
                                className="grid h-6 w-6 shrink-0 place-items-center rounded-[7px] text-dash-dim opacity-0 transition hover:text-dash-bad group-hover:opacity-100"
                              >
                                <IconeFechar className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          );
                        })}
                        {enviandoAsset && (
                          <p className="px-2 py-1.5 text-[10.5px] text-dash-dim">enviando imagem…</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Recado das IMAGENS (recusa honesta / falha) — embaixo da lista. */}
                  {erroAsset && (
                    <div className="shrink-0 border-t border-dash-bad/25 bg-dash-bad/[0.08] px-3 py-2">
                      <p className="text-[10.5px] leading-[1.5] text-dash-bad">{erroAsset}</p>
                    </div>
                  )}
                </aside>

                {/* O arquivo selecionado — EDITOR de verdade: digitar muda o
                    arquivo, a prévia re-monta (debounce) e salva sozinho, virando
                    uma versão. O Ctrl+Z DENTRO daqui é o undo NATIVO do navegador. */}
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex shrink-0 items-center gap-2 border-b border-dash-hair/[0.07] px-4 py-2.5">
                    {assetSelecionado ? (
                      <IconeImagem className="h-4 w-4 shrink-0 text-dash-muted" />
                    ) : (
                      <IconeDocumento className="h-4 w-4 shrink-0 text-dash-muted" />
                    )}
                    <p
                      className="truncate font-mono text-[11.5px] text-dash-fg"
                      title={assetSelecionado?.caminho || arquivoAtual?.nome}
                    >
                      {assetSelecionado?.caminho || arquivoAtual?.nome || "—"}
                    </p>
                    {!assetSelecionado && arquivoAtual?.nome === entrada?.nome && (
                      <span className="hidden shrink-0 text-[10.5px] text-dash-dim sm:inline">entrada do projeto</span>
                    )}
                    {!assetSelecionado && (
                      <>
                        {/* Estado do salvamento — honesto e quieto, em PT-BR. */}
                        <span
                          data-arquiteto-salvo
                          role="status"
                          className={`ml-auto shrink-0 text-[10.5px] ${
                            estadoSalvo === "erro"
                              ? "text-dash-bad"
                              : estadoSalvo === "salvo"
                                ? "text-dash-ok"
                                : "text-dash-dim"
                          }`}
                        >
                          {estadoSalvo === "salvando"
                            ? "salvando…"
                            : estadoSalvo === "salvo"
                              ? "salvo"
                              : estadoSalvo === "erro"
                                ? "não deu para salvar — tente de novo"
                                : ""}
                        </span>
                        <button
                          onClick={() => void copiar()}
                          className="shrink-0 rounded-[8px] border border-dash-hair/12 px-3 py-1.5 text-[11px] text-dash-muted transition hover:text-dash-fg"
                        >
                          {copiado ? "copiado" : "copiar"}
                        </button>
                      </>
                    )}
                  </div>
                  {assetSelecionado ? (
                    /* ASSET selecionado: nada de despejar bytes no editor. O aviso
                       honesto de binário + a própria imagem servida pelo projeto. */
                    <div
                      data-arquiteto-asset-binario
                      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-auto px-6 py-8 text-center"
                    >
                      <span className="grid h-14 w-14 place-items-center rounded-full bg-dash-raise text-dash-muted">
                        <IconeImagem className="h-6 w-6" />
                      </span>
                      <div>
                        <p className="text-[14px] text-dash-fg">arquivo binário</p>
                        <p className="mt-2 max-w-[440px] text-[12px] leading-[1.7] text-dash-muted">
                          “{assetSelecionado.caminho}” é uma imagem (
                          {rotuloDeMimeAsset(assetSelecionado.mime)} · {tamanhoLegivel(assetSelecionado.tamanho)}) e
                          não é editável como texto aqui. Ela é guardada no projeto e usada no código por{" "}
                          <span className="font-mono text-dash-fg/85">&lt;img src=&quot;{assetSelecionado.caminho}&quot;&gt;</span>{" "}
                          ou no CSS com{" "}
                          <span className="font-mono text-dash-fg/85">url(&quot;{assetSelecionado.caminho}&quot;)</span>.
                        </p>
                      </div>
                      {assetsBase && (
                        <img
                          src={urlDoAsset(assetSelecionado, assetsBase)}
                          alt={assetSelecionado.caminho}
                          data-arquiteto-asset-thumb
                          className="max-h-40 max-w-full rounded-[10px] border border-dash-hair/10 bg-dash-hair/5 object-contain"
                        />
                      )}
                      <button
                        onClick={() => void removerAsset(assetSelecionado.caminho)}
                        className="rounded-[9px] border border-dash-bad/40 px-3 py-1.5 text-[11px] text-dash-bad transition hover:bg-dash-bad/10"
                      >
                        remover imagem
                      </button>
                    </div>
                  ) : (
                    <textarea
                      ref={editorRef}
                      data-arquiteto-editor
                      value={arquivoAtual?.conteudo ?? ""}
                      onChange={(e) => editarArquivo(e.target.value)}
                      spellCheck={false}
                      wrap="off"
                      aria-label={`Editar ${arquivoAtual?.nome || "arquivo"}`}
                      placeholder="Escreva o conteúdo do arquivo aqui…"
                      className="min-h-0 flex-1 resize-none overflow-auto bg-transparent px-4 py-4 font-mono text-[12px] leading-[1.6] text-dash-fg/85 caret-white outline-none placeholder:text-dash-dim"
                    />
                  )}
                </div>
              </div>
            )}
            </div>
            {mostrarTokens && painelTokens()}
          </div>
        </section>
      </div>
    </div>
  );
}
