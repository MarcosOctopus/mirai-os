"use client";

/* ── Cards de integração (extraídos de /dashboard/connect, 08/10/2026) ────
 *
 * Viviam DENTRO de `src/app/dashboard/connect/page.tsx`. Saíram para cá,
 * verbatim, quando nasceu a página `/dashboard/integracoes` ("ver todas" em
 * grade): as duas telas passam a desenhar O MESMO card — moldura do template,
 * cor da marca recortada pela silhueta, nome uma única vez, tipo e o selo de
 * estado vindo da fonte única. Nada foi redesenhado nesta extração.
 */

/* eslint-disable @next/next/no-img-element */

import { useState } from "react";

import { COR_PADRAO_CARD, type Integracao } from "@/lib/integracoes/catalogo";

/* A raiz dos assets do template, copiados idênticos do zip. */
export const A = "/artdash";

/* As mesmas artes de card do template (os leilões do zip), uma por posição. */
export const ARTES_CARD = ["27ee4.svg", "4258a.svg", "1e048.svg", "aa244.svg", "72cce.svg"];

/* ── Logo (a "imagem" de cada peça; com fallback honesto) ────────────── */

export function Logo({ item, tamanho = 46 }: { item: Integracao; tamanho?: number }) {
  const [falhou, setFalhou] = useState(false);
  const inicial = (item.nome || item.empresa || "?").trim().charAt(0).toUpperCase();

  return (
    <span
      className="grid shrink-0 place-items-center overflow-hidden rounded-[12px] bg-dash-raise text-dash-muted"
      style={{ height: tamanho, width: tamanho }}
    >
      {falhou ? (
        <span className="font-semibold" style={{ fontSize: Math.round(tamanho * 0.34) }}>
          {inicial}
        </span>
      ) : (
        <img
          src={item.logo}
          alt={`Logo ${item.empresa}`}
          className="h-[58%] w-[58%] object-contain"
          loading="lazy"
          onError={() => setFalhou(true)}
        />
      )}
    </span>
  );
}

/* A logo "crua" (sem caixa), usada em cima da arte do card — com o mesmo
   fallback discreto. */
export function Figura({ item, tamanho }: { item: Integracao; tamanho: number }) {
  const [falhou, setFalhou] = useState(false);
  const inicial = (item.nome || item.empresa || "?").trim().charAt(0).toUpperCase();

  if (falhou) {
    return (
      <span
        className="grid shrink-0 place-items-center rounded-[4px] bg-dash-hair/10 font-semibold text-dash-brand"
        style={{ height: tamanho, width: tamanho, fontSize: Math.round(tamanho * 0.6) }}
      >
        {inicial}
      </span>
    );
  }
  return (
    <img
      src={item.logo}
      alt=""
      /* a marca vai BRANCA dentro da área laranja: o filtro zera a cor
         (brightness(0)) e inverte (invert(1)), então QUALQUER logo — svg ou
         png — vira branca. A transparência do arquivo é preservada. */
      style={{ height: tamanho, width: tamanho, filter: "brightness(0) invert(1)" }}
      className="shrink-0 object-contain"
      loading="lazy"
      onError={() => setFalhou(true)}
    />
  );
}

/* O card do catálogo. `onAbrir` recebe o item; quem decide o que fazer com ele
   (popup do produto na tela de Integrações, navegação na grade) é a página. */
export function CardIntegracao({
  item,
  arte,
  conectada,
  pronta,
  motivo,
  onAbrir,
}: {
  item: Integracao;
  arte: string;
  conectada: boolean;
  /** o caminho de conexão EXISTE neste servidor? Vem da prontidão do servidor —
   *  o card nunca finge que dá para conectar o que ainda não está pronto. */
  pronta: boolean;
  motivo?: string;
  onAbrir: (i: Integracao) => void;
}) {
  return (
    <article className="relative h-[159px] w-[153px] shrink-0">
      {/* a MOLDURA é o card de leilão do zip, no mesmo lugar e tamanho */}
      <img src={`${A}/${arte}`} alt="" className="absolute inset-0 h-[159px] w-[153px]" />

      {/* a ÁREA DE IMAGEM: era o cinza #C4C4C4 do placeholder do zip; agora é a
          COR DA MARCA (a cor dominante do logo original, vinda do catálogo —
          `item.cor`). Quem não tem cor cai no laranja da marca (COR_PADRAO_CARD).
          O fundo é recortado pela MESMA silhueta da moldura (o próprio svg vira
          mask), então o contorno — cantos arredondados e o degrau do canto
          superior — fica idêntico: muda só a cor. A faixa escura de baixo
          (y=98+) NÃO é tocada, então o nome (em #ff751f), o tipo e a bolinha de
          estado continuam no fundo escuro. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 h-[98px] w-[153px]"
        style={{
          backgroundColor: item.cor ?? COR_PADRAO_CARD,
          WebkitMaskImage: `url("${A}/${arte}")`,
          maskImage: `url("${A}/${arte}")`,
          WebkitMaskSize: "153px 159px",
          maskSize: "153px 159px",
          WebkitMaskPosition: "0 0",
          maskPosition: "0 0",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
        }}
      />

      {/* a NOME/TIPO/ESTADO vêm nesta ordem no DOM (todos posicionados de forma
          absoluta, o visual NÃO muda): assim a leitura de cima para baixo — e
          qualquer leitor de tela / extração de texto — casa o estado com O
          PRÓPRIO card, e não com o card seguinte. Antes o selo de estado vinha
          ANTES do nome, e a leitura em texto atribuía "não conectada" ao card
          errado (parecia que o CRM dizia "ligada" embaixo e "não conectada" no
          catálogo). */}

      {/* a IDENTIDADE da integração vem de DENTRO da ÁREA DA IMAGEM do card
          (o lugar da foto/arte no leilão do template) — não de uma marca
          colada na lateral do nome. Some a marca lateral, fica só a marca
          grande no vazio central. */}
      <span className="pointer-events-none absolute inset-x-0 top-[20px] flex h-[76px] items-center justify-center">
        <Figura item={item} tamanho={48} />
      </span>

      {/* o NOME da integração, UMA única vez, na faixa de baixo do card */}
      <span className="absolute left-[10px] right-[10px] top-[103px] block truncate text-[11px] text-dash-brand">
        {item.nome}
      </span>

      {/* UMA linha HONESTA do que a integração É (08/10/2026). Quando não há
          linha, nada é mostrado — nunca se inventa descrição. */}
      {item.explicacao && (
        <span className="absolute left-[10px] right-[10px] top-[121px] line-clamp-2 text-[8.5px] leading-[1.2] text-dash-muted">
          {item.explicacao}
        </span>
      )}

      <div className="public-sans absolute bottom-[10px] left-[10px] right-[10px] flex justify-between text-[10px]">
        <span className="text-dash-muted">Tipo</span>
        <span className="text-dash-fg">{item.tipo === "mcp" ? "MCP" : "API"}</span>
      </div>

      {/* ESTADO do card — o MESMO estado de Destaques e da tabela (uma fonte
          única, `estaConectadaNaConta`). Vem DEPOIS do nome no DOM (a posição
          visual não muda) para a leitura em texto casar o estado com o card.
          Sem caminho de conexão neste servidor (!pronta), o rótulo é
          "indisponível" COM o motivo no title — igual à lista Destaques: nunca
          um card que parece igual aos outros e leva a um beco sem saída. */}
      <div
        className="absolute left-1 top-0.5 flex items-center gap-[7px] text-[10px] text-dash-fg"
        title={!conectada && !pronta ? motivo : undefined}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            conectada ? "bg-dash-ok" : !pronta ? "bg-dash-muted" : "bg-[#ff2d55]"
          }`}
        />
        {conectada ? "conectada" : !pronta ? "indisponível" : "não conectada"}
      </div>

      {/* TODO card abre o popup do produto — inclusive os internos (sem site),
          que mostram as informações com a ação desabilitada. */}
      <button
        onClick={() => onAbrir(item)}
        aria-label={`Ver ${item.nome}`}
        className="absolute inset-0 cursor-pointer"
      />
    </article>
  );
}
