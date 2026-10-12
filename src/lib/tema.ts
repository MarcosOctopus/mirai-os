"use client";

import { useEffect, useState } from "react";

/* TEMA do MIRAI OS — o escuro é o padrão (é a cara da Mirai).

   COMO FUNCIONA: o tema faz UMA coisa só — põe (ou tira) a classe `light` no
   <html>. Todo o resto é CSS: os tokens do padrão Dash viraram variáveis
   (globals.css) e `html.light` troca os valores. Nenhum componente sabe qual
   é o tema, e é por isso que isto não apodrece: não existe "modo claro"
   espalhado pelo código, existe uma classe na raiz.

   O PISCAR: quem lê a escolha e aplica a classe é um script no <head>
   (layout.tsx), que roda ANTES da primeira pintura. Se esperássemos o React,
   a tela abriria escura e viraria clara na frente do dono.

   POR QUE não seguir o tema do sistema sozinho: o dono abriria o app no
   celular (configurado claro) e veria outra cara sem ter pedido — parece
   defeito. O padrão é o escuro; quem quiser claro, escolhe, e a escolha fica
   guardada. */

export type Tema = "escuro" | "claro";

export const CHAVE_TEMA = "mirai-tema";

/** A escolha guardada. Sem escolha (ou sem localStorage): escuro. */
export function temaSalvo(): Tema {
  if (typeof window === "undefined") return "escuro";
  try {
    return window.localStorage.getItem(CHAVE_TEMA) === "claro" ? "claro" : "escuro";
  } catch {
    return "escuro";
  }
}

/** Aplica o tema: a classe no <html> + a escolha guardada. */
export function aplicarTema(t: Tema) {
  document.documentElement.classList.toggle("light", t === "claro");
  try {
    window.localStorage.setItem(CHAVE_TEMA, t);
  } catch {
    /* sem localStorage: o tema vale só nesta sessão */
  }
}

/**
 * Lê o tema JÁ APLICADO no documento (a verdade é o DOM, não o React: quem
 * escreveu a classe foi o script do <head>) e devolve a função de alternar.
 */
export function usarTema() {
  const [tema, setTema] = useState<Tema>("escuro");

  useEffect(() => {
    setTema(document.documentElement.classList.contains("light") ? "claro" : "escuro");
  }, []);

  function alternar() {
    const novo: Tema = document.documentElement.classList.contains("light") ? "escuro" : "claro";
    aplicarTema(novo);
    setTema(novo);
  }

  return { tema, alternar };
}
