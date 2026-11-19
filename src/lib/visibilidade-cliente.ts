"use client";

// VISIBILIDADE NO NAVEGADOR — uma leitura por carregamento de página.
//
// O menu (Shell) e o menu da conta (MenuDaConta) precisam da MESMA resposta; sem
// cache, cada um faria a sua chamada a /api/visibilidade. O módulo guarda a
// promessa: a primeira pergunta busca, as outras esperam a mesma resposta.
//
// Regra de leitura, igual ao servidor: `oculto` some para quem não é dono,
// `em_breve` aparece com selo mas não abre, e o dono vê tudo como público.

import { useEffect, useState } from "react";

export type Estado = "publico" | "em_breve" | "oculto";
export type Mapa = Record<string, Estado>;

let cache: Mapa | null = null;
let pendente: Promise<Mapa> | null = null;

export function normalizar(href: string): string {
  const limpo = (href || "").split("?")[0].split("#")[0];
  return limpo.length > 1 && limpo.endsWith("/") ? limpo.slice(0, -1) : limpo;
}

export function estadoNoMapa(mapa: Mapa, href?: string): Estado {
  if (!href) return "publico";
  return mapa[normalizar(href)] || "publico";
}

export function usarVisibilidade(): Mapa {
  const [mapa, setMapa] = useState<Mapa>(cache || {});

  useEffect(() => {
    if (cache) return;
    if (!pendente) {
      pendente = fetch("/api/visibilidade", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { mapa: {} }))
        .then((d) => (d?.mapa || {}) as Mapa)
        .catch(() => ({} as Mapa))
        .then((m) => {
          cache = m;
          return m;
        });
    }
    let vivo = true;
    void pendente.then((m) => {
      if (vivo) setMapa(m);
    });
    return () => {
      vivo = false;
    };
  }, []);

  return mapa;
}