"use client";

import type { ReactNode } from "react";
import { CardArquivo } from "@/components/dash/CardArquivo";
import { IconeDocumento } from "@/components/dash/icons";

/**
 * TEXTO DA RESPOSTA — como a fala da Mirai aparece no chat.
 *
 * POR QUE EXISTE (dono, 23/11/2026: "deixa a visualização da escrita de respostas
 * melhor no chat"): até aqui a resposta era um `<span>` com `whitespace-pre-wrap`.
 * Tudo tinha o MESMO peso — parágrafo, item de lista, bloco de código, o título
 * que abre a resposta. Numa resposta longa isso vira parede de texto: o olho não
 * acha onde começa cada passo nem onde termina a lista.
 *
 * O que este renderizador faz (determinístico, sem biblioteca nova e sem
 * `dangerouslySetInnerHTML` — mesma decisão da NotaTexto):
 *  - parágrafos de verdade, com respiro entre eles;
 *  - listas com marcador próprio e recuo pendente (`- `, `• `, `1. `, `1) `);
 *  - títulos `#`..`####` e a linha de abertura que termina em ":" (o "lead");
 *  - cerca ``` ``` vira bloco mono com rolagem própria;
 *  - `>` citação, `---` régua;
 *  - no meio da frase: **negrito**, `código`, link http(s) clicável;
 *  - `[arquivo:<id>]` continua virando o cartão de download.
 *
 * Duas regras que não se quebram aqui:
 *  1. a resposta pode estar CHEGANDO (streaming): texto incompleto, cerca aberta
 *     e marcador pela metade têm de renderizar sem quebrar — por isso a cerca
 *     aberta é fechada no fim do texto;
 *  2. a hierarquia é feita por TAMANHO e ESPAÇO, não por cor gritante — a luz da
 *     casa é contida.
 */

type Bloco =
  | { t: "p"; linhas: string[] }
  | { t: "lead"; texto: string }
  | { t: "h"; nivel: number; texto: string }
  | { t: "ul"; itens: string[] }
  | { t: "ol"; itens: string[] }
  | { t: "quote"; linhas: string[] }
  | { t: "code"; linhas: string[] }
  | { t: "hr" };

const RE_ITEM_UL = /^\s*([-*•])\s+/;
const RE_ITEM_OL = /^\s*(\d{1,2})[.)]\s+/;

function parsear(texto: string): Bloco[] {
  const linhas = texto.replace(/\r\n/g, "\n").split("\n");
  const blocos: Bloco[] = [];
  let par: string[] = [];
  const fecharPar = () => {
    if (par.length) {
      blocos.push({ t: "p", linhas: par });
      par = [];
    }
  };

  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];

    /* cerca ``` — inclusive ABERTA (resposta chegando pela metade): o que veio
       até aqui vira bloco mono e a cerca sem par é simplesmente o fim do texto. */
    if (/^\s*```/.test(l)) {
      fecharPar();
      const corpo: string[] = [];
      i++;
      while (i < linhas.length && !/^\s*```/.test(linhas[i])) {
        corpo.push(linhas[i]);
        i++;
      }
      blocos.push({ t: "code", linhas: corpo });
      continue;
    }

    if (!l.trim()) {
      fecharPar();
      continue;
    }

    const h = /^(#{1,4})\s+(.*)$/.exec(l);
    if (h) {
      fecharPar();
      blocos.push({ t: "h", nivel: h[1].length, texto: h[2] });
      continue;
    }

    if (RE_ITEM_UL.test(l)) {
      fecharPar();
      const itens: string[] = [];
      while (i < linhas.length && RE_ITEM_UL.test(linhas[i])) {
        itens.push(linhas[i].replace(RE_ITEM_UL, ""));
        i++;
      }
      i--;
      blocos.push({ t: "ul", itens });
      continue;
    }

    if (RE_ITEM_OL.test(l)) {
      fecharPar();
      const itens: string[] = [];
      while (i < linhas.length && RE_ITEM_OL.test(linhas[i])) {
        itens.push(linhas[i].replace(RE_ITEM_OL, ""));
        i++;
      }
      i--;
      blocos.push({ t: "ol", itens });
      continue;
    }

    if (/^\s*>\s?/.test(l)) {
      fecharPar();
      const corpo: string[] = [];
      while (i < linhas.length && /^\s*>\s?/.test(linhas[i])) {
        corpo.push(linhas[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      i--;
      blocos.push({ t: "quote", linhas: corpo });
      continue;
    }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) {
      fecharPar();
      blocos.push({ t: "hr" });
      continue;
    }

    /* "LEAD": a linha curta que abre a resposta e termina em ":" ("O que eu
       recomendo:", "Passo a passo:"). Não é título de seção — é a chamada do
       parágrafo seguinte — então ganha peso médio, não tamanho de título.
       Só vale no COMEÇO de um bloco: no meio de um parágrafo ela é frase. */
    if (
      !par.length &&
      l.trim().length <= 56 &&
      /:$/.test(l.trim()) &&
      !/[!?]$/.test(l.trim().slice(0, -1)) &&
      !/[,;]/.test(l)
    ) {
      blocos.push({ t: "lead", texto: l.trim().slice(0, -1) });
      continue;
    }

    par.push(l);
  }
  fecharPar();
  return blocos;
}

/* ── inline: negrito, código, link ──────────────────────────────────────────
 * Itálico com `*` ÚNICO fica de fora de propósito: em texto técnico ele aparece
 * como multiplicação (`2*3`) e viraria itálico sem querer. */
const RE_INLINE = /(\*\*[^*]+\*\*|`[^`\n]+`|https?:\/\/[^\s<)]+)/g;

function inline(texto: string, chave: string): ReactNode[] {
  const nos: ReactNode[] = [];
  let ultimo = 0;
  let achado: RegExpExecArray | null;
  let n = 0;
  while ((achado = RE_INLINE.exec(texto)) !== null) {
    if (achado.index > ultimo) nos.push(texto.slice(ultimo, achado.index));
    const bruto = achado[0];
    const k = `${chave}-${n++}`;
    if (bruto.startsWith("**")) {
      nos.push(
        <strong key={k} className="font-semibold text-dash-fg">
          {bruto.slice(2, -2)}
        </strong>,
      );
    } else if (bruto.startsWith("`")) {
      nos.push(
        <code
          key={k}
          className="rounded-[5px] bg-white/[0.08] px-1.5 py-[1.5px] font-mono text-[13.5px] text-dash-fg/95"
        >
          {bruto.slice(1, -1)}
        </code>,
      );
    } else {
      /* link cru: encurta o rótulo — URL inteira estoura a bolha do chat */
      const rotulo = bruto.length > 42 ? bruto.replace(/^https?:\/\//, "").slice(0, 38) + "…" : bruto.replace(/^https?:\/\//, "");
      nos.push(
        <a
          key={k}
          href={bruto}
          target="_blank"
          rel="noopener noreferrer"
          className="text-dash-brandHi underline decoration-dotted underline-offset-[3px] hover:decoration-solid"
          title={bruto}
        >
          {rotulo}
        </a>,
      );
    }
    ultimo = achado.index + bruto.length;
  }
  if (ultimo < texto.length) nos.push(texto.slice(ultimo));
  return nos;
}

/* o cursor de "escrevendo": cola no FIM da última linha de verdade. */
function cursorDeEscrita() {
  return (
    <span
      aria-hidden
      className="ml-0.5 inline-block h-[12px] w-[2px] animate-pulse bg-dash-brand align-[-2px]"
    />
  );
}

export default function TextoDaResposta({
  texto,
  cursor = false,
}: {
  texto: string;
  cursor?: boolean;
}) {
  /* o marcador de arquivo é tratado ANTES do parser: ele é inline e não pode ser
     comido como texto de lista/parágrafo. */
  // Dois marcadores convivem: o antigo `[arquivo:<id>]` (que já está nas
  // conversas gravadas) e o novo, com trilho e nome. Conversa antiga não quebra.
  const partes = texto.split(
    /(\[\[arquivo:(?:midia|acervo):[^\]]+\]\]|\[arquivo:[0-9a-f-]{36}\])/i,
  );

  const corpo = partes.map((parte, ip) => {
    // Marcador novo: trilho explícito, com nome de exibição.
    const marca = parte.match(/^\[\[arquivo:(midia|acervo):(.+?)(?:\|(.+?))?\]\]$/i);
    if (marca) {
      return (
        <CardArquivo
          key={`a${ip}`}
          arquivo={{
            trilho: marca[1].toLowerCase() === "midia" ? "midia" : "acervo",
            ref: marca[2].trim(),
            nome: marca[3]?.trim(),
          }}
        />
      );
    }

    // Marcador antigo (conversas já gravadas): id de upload, sem nome.
    const legado = parte.match(/^\[arquivo:([0-9a-f-]{36})\]$/i);
    if (legado) {
      return <CardArquivo key={`a${ip}`} arquivo={{ trilho: "midia", ref: legado[1] }} />;
    }
    if (!parte.trim()) return null;

    const blocos = parsear(parte);
    const ultimoBloco = ip === partes.length - 1;

    return (
      <div key={`b${ip}`} className="space-y-[14px]">
        {blocos.map((b, i) => {
          const ehUltimo = ultimoBloco && i === blocos.length - 1;
          const comCursor = cursor && ehUltimo;

          if (b.t === "p") {
            return (
              <p key={i} className="text-[15.5px] leading-[1.72] text-dash-fg/[0.92]">
                {inline(b.linhas.join("\n"), `p${ip}-${i}`)}
                {comCursor && cursorDeEscrita()}
              </p>
            );
          }
          if (b.t === "lead") {
            return (
              <p key={i} className="text-[15.5px] font-semibold leading-[1.65] text-dash-fg">
                {inline(b.texto, `l${ip}-${i}`)}
                {comCursor && cursorDeEscrita()}
              </p>
            );
          }
          if (b.t === "h") {
            const tamanho =
              b.nivel <= 2 ? "text-[19px]" : b.nivel === 3 ? "text-[16.5px]" : "text-[15.5px]";
            return (
              <p
                key={i}
                className={`${tamanho} font-semibold leading-[1.35] text-dash-fg ${i === 0 ? "" : "pt-0.5"}`}
              >
                {inline(b.texto, `h${ip}-${i}`)}
              </p>
            );
          }
          if (b.t === "ul" || b.t === "ol") {
            const Lista = b.t === "ul" ? "ul" : "ol";
            return (
              <Lista
                key={i}
                className={`space-y-[5px] pl-[22px] text-[15.5px] leading-[1.7] text-dash-fg/[0.92] ${
                  b.t === "ul" ? "list-disc" : "list-decimal"
                } marker:text-dash-dim`}
              >
                {b.itens.map((item, j) => (
                  <li key={j} className="pl-[3px]">
                    {inline(item, `li${ip}-${i}-${j}`)}
                    {comCursor && j === b.itens.length - 1 && cursorDeEscrita()}
                  </li>
                ))}
              </Lista>
            );
          }
          if (b.t === "quote") {
            return (
              <blockquote
                key={i}
                className="border-l-2 border-dash-hair/20 pl-4 text-[15px] leading-[1.7] text-dash-muted"
              >
                {inline(b.linhas.join("\n"), `q${ip}-${i}`)}
              </blockquote>
            );
          }
          if (b.t === "code") {
            return (
              <pre
                key={i}
                className="overflow-x-auto rounded-[12px] border border-dash-hair/10 bg-white/[0.04] px-4 py-3 font-mono text-[13px] leading-[1.6] text-dash-fg/90"
              >
                <code>
                  {b.linhas.join("\n")}
                  {comCursor && cursorDeEscrita()}
                </code>
              </pre>
            );
          }
          return <hr key={i} className="border-dash-hair/10" />;
        })}
      </div>
    );
  });

  return <>{corpo}</>;
}