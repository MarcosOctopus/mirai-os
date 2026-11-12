"use client";

/**
 * NOTA TEXTO — o renderizador da Arca.
 *
 * POR QUE EXISTE: a bancada de leitura não conseguia ABRIR uma nota; e o app não
 * tem biblioteca de markdown instalada (medido: nenhuma dependência de markdown no
 * package.json). Em vez de trazer uma dependência nova para um punhado de regras
 * que o acervo realmente usa, o subconjunto está aqui — determinístico, sem
 * `dangerouslySetInnerHTML`, sem parser de terceiro para auditar.
 *
 * O que ele entende (o que o acervo de fato escreve): títulos #..####, listas
 * - / 1., citação >, cerca ``` código, régua ---, negrito/italico, `código`,
 * [texto](url), [[wikilink]] e parágrafos.
 *
 * Regra de acessibilidade: nada de cor sozinho para dizer hierarquia; o tamanho e o
 * espaço fazem o trabalho. Wikilink é BOTÃO (navega no grafo), não link decorativo.
 */

import type { ReactNode } from "react";

const CORPO = "text-[14.5px] leading-[1.75] text-dash-fg/90";

/** Marcadores inline: negrito, itálico, código, link e wikilink. */
function inline(texto: string, aoAbrir: (alvo: string) => void, chave: string): ReactNode[] {
  const nos: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\))/g;
  let ultimo = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(texto)) !== null) {
    if (m.index > ultimo) nos.push(texto.slice(ultimo, m.index));
    const bruto = m[0];
    const k = `${chave}-i${i++}`;
    if (bruto.startsWith("**")) {
      nos.push(
        <strong key={k} className="font-semibold text-dash-fg">
          {bruto.slice(2, -2)}
        </strong>,
      );
    } else if (bruto.startsWith("`")) {
      nos.push(
        <code key={k} className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[13px] text-dash-brandHi">
          {bruto.slice(1, -1)}
        </code>,
      );
    } else if (bruto.startsWith("[[")) {
      const alvo = bruto.slice(2, -2).trim();
      nos.push(
        <button
          key={k}
          onClick={() => aoAbrir(alvo)}
          className="text-dash-brandHi underline decoration-dotted underline-offset-4 hover:decoration-solid"
          title={`abrir ${alvo}`}
        >
          {alvo}
        </button>,
      );
    } else if (bruto.startsWith("[")) {
      const corte = bruto.indexOf("](");
      const rotulo = bruto.slice(1, corte);
      const url = bruto.slice(corte + 2, -1);
      nos.push(
        <a
          key={k}
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-dash-brandHi underline decoration-dotted underline-offset-4 hover:decoration-solid"
        >
          {rotulo}
        </a>,
      );
    } else {
      nos.push(
        <em key={k} className="italic text-dash-fg/80">
          {bruto.slice(1, -1)}
        </em>,
      );
    }
    ultimo = m.index + bruto.length;
  }
  if (ultimo < texto.length) nos.push(texto.slice(ultimo));
  return nos;
}

export default function NotaTexto({
  corpo,
  aoAbrir,
}: {
  corpo: string;
  aoAbrir: (alvo: string) => void;
}) {
  const linhas = corpo.split("\n");
  const blocos: ReactNode[] = [];
  let lista: { ordenada: boolean; itens: string[] } | null = null;
  let codigo: string[] | null = null;

  const fecharLista = () => {
    if (!lista) return;
    const Tag = lista.ordenada ? "ol" : "ul";
    blocos.push(
      <Tag
        key={`l${blocos.length}`}
        className={
          (lista.ordenada ? "list-decimal" : "list-disc") +
          " mt-3 space-y-1.5 pl-5 " +
          CORPO
        }
      >
        {lista.itens.map((t, j) => (
          <li key={j} className="pl-1">
            {inline(t, aoAbrir, `l${blocos.length}-${j}`)}
          </li>
        ))}
      </Tag>,
    );
    lista = null;
  };

  for (const linha of linhas) {
    if (codigo) {
      if (linha.startsWith("```")) {
        blocos.push(
          <pre
            key={`c${blocos.length}`}
            className="mt-4 overflow-x-auto rounded-md border border-white/[0.07] bg-black/40 p-3 text-[12.5px] leading-relaxed text-dash-fg/85"
          >
            <code>{codigo.join("\n")}</code>
          </pre>,
        );
        codigo = null;
      } else {
        codigo.push(linha);
      }
      continue;
    }
    if (linha.startsWith("```")) {
      fecharLista();
      codigo = [];
      continue;
    }

    if (/^\s*$/.test(linha)) {
      fecharLista();
      continue;
    }
    if (/^#{1,4}\s/.test(linha)) {
      fecharLista();
      const nivel = linha.match(/^#+/)![0].length;
      const texto = linha.replace(/^#+\s*/, "");
      const classe =
        nivel === 1
          ? "mt-8 text-[20px] font-semibold text-dash-fg first:mt-0"
          : nivel === 2
            ? "mt-7 text-[16px] font-semibold text-dash-fg"
            : "mt-6 text-[14px] font-semibold uppercase tracking-[0.12em] text-dash-muted";
      blocos.push(
        <p key={`h${blocos.length}`} className={classe}>
          {inline(texto, aoAbrir, `h${blocos.length}`)}
        </p>,
      );
      continue;
    }
    if (/^---+\s*$/.test(linha)) {
      fecharLista();
      blocos.push(<hr key={`r${blocos.length}`} className="my-6 border-white/[0.07]" />);
      continue;
    }
    if (linha.startsWith("> ")) {
      fecharLista();
      blocos.push(
        <blockquote
          key={`q${blocos.length}`}
          className="mt-4 border-l-2 border-dash-brandHi/40 pl-4 text-[14px] italic leading-[1.7] text-dash-muted"
        >
          {inline(linha.slice(2), aoAbrir, `q${blocos.length}`)}
        </blockquote>,
      );
      continue;
    }
    const item = linha.match(/^\s*[-*]\s+(.*)$/);
    if (item) {
      if (!lista || lista.ordenada) {
        fecharLista();
        lista = { ordenada: false, itens: [] };
      }
      lista.itens.push(item[1]);
      continue;
    }
    const ord = linha.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ord) {
      if (!lista || !lista.ordenada) {
        fecharLista();
        lista = { ordenada: true, itens: [] };
      }
      lista.itens.push(ord[1]);
      continue;
    }

    fecharLista();
    blocos.push(
      <p key={`p${blocos.length}`} className={"mt-4 " + CORPO}>
        {inline(linha, aoAbrir, `p${blocos.length}`)}
      </p>,
    );
  }
  fecharLista();
  if (codigo && codigo.length) {
    blocos.push(
      <pre
        key="c-final"
        className="mt-4 overflow-x-auto rounded-md border border-white/[0.07] bg-black/40 p-3 text-[12.5px] text-dash-fg/85"
      >
        <code>{codigo.join("\n")}</code>
      </pre>,
    );
  }

  return <div className="max-w-[68ch]">{blocos}</div>;
}
