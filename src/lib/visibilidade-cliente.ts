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

let cache: Leitura | null = null;
let pendente: Promise<Leitura> | null = null;

export function normalizar(href: string): string {
  const limpo = (href || "").split("?")[0].split("#")[0];
  return limpo.length > 1 && limpo.endsWith("/") ? limpo.slice(0, -1) : limpo;
}

export function estadoNoMapa(mapa: Mapa, href?: string): Estado {
  if (!href) return "publico";
  return mapa[normalizar(href)] || "publico";
}

export type Leitura = { mapa: Mapa; ehDono: boolean };

export function usarVisibilidade(): Leitura {
  const [leitura, setLeitura] = useState<Leitura>(cache || { mapa: {}, ehDono: false });

  useEffect(() => {
    if (cache) {
      setLeitura(cache);
      return;
    }
    if (!pendente) {
      // `ehDono` vem da SESSÃO (servidor) e é a fonte da verdade: a prop que cada
      // página passa para a casca é conveniência, e página que esquece dela
      // fazia o dono ser tratado como visitante dentro do próprio app.
      pendente = fetch("/api/visibilidade", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => ({ mapa: (d?.mapa || {}) as Mapa, ehDono: Boolean(d?.ehDono) }))
        .catch(() => ({ mapa: {} as Mapa, ehDono: false }))
        .then((l) => {
          cache = l;
          return l;
        });
    }
    let vivo = true;
    void pendente.then((l) => {
      if (vivo) setLeitura(l);
    });
    return () => {
      vivo = false;
    };
  }, []);

  return leitura;
}