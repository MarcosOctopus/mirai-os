// CATÁLOGO DE VISIBILIDADE — o que cada item do app mostra para quem não é dono.
//
// Pedido do dono (19/11/2026): "queria que dentro da minha parte de admin eu
// tire o que não quero que todo mundo veja ainda e colocar em breve pra galera
// não ver porque não está pronto".
//
// Três estados, por `href`:
//   publico   → todo mundo vê e usa (padrão)
//   em_breve  → todo mundo VÊ o item no menu com o selo "em breve", mas a página
//               só abre para o dono; os outros recebem o aviso de "em breve"
//   oculto    → ninguém além do dono vê o item (nem no menu)
//
// A leitura é por ARQUIVO (sem migração de banco, sem reiniciar o app) e é
// cacheada por mtime: o dono muda no admin e a mudança vale no pedido seguinte.
// O que NÃO é dono nunca escreve aqui — a escrita é travada em `/api/visibilidade`
// por `exigirDono()` e pelo middleware (`/api/admin`).

import fs from "node:fs";
import path from "node:path";

export type Estado = "publico" | "em_breve" | "oculto";

/** Fora da árvore do app: sobrevive a deploy (que troca o diretório buildado). */
export const ARQUIVO =
  process.env.VISIBILIDADE_PATH || "/opt/data/mirai-app-data/visibilidade.json";

export type ItemDoApp = {
  href: string;
  label: string;
  grupo: "principal" | "conta" | "admin";
  /** já nasce travado para quem não é dono por outro motivo (admin/system) */
  soDono?: boolean;
};

/** A lista canônica = o que existe no menu (Shell.tsx). Item novo entra aqui. */
export const ITENS: ItemDoApp[] = [
  { href: "/dashboard", label: "Chat / Orb", grupo: "principal" },
  { href: "/projetos", label: "Projetos", grupo: "principal" },
  { href: "/dashboard/connect", label: "Synapse", grupo: "principal" },
  { href: "/dashboard/arca", label: "A Arca", grupo: "principal" },
  { href: "/dashboard/acervo", label: "Acervo", grupo: "principal" },
  { href: "/dashboard/painel", label: "Painel", grupo: "principal" },
  { href: "/dashboard/cosmic-agent", label: "Cosmic Agent", grupo: "principal" },
  { href: "/dashboard/skills", label: "Skills", grupo: "conta" },
  { href: "/arquiteto", label: "Arquiteto", grupo: "conta" },
  { href: "/dashboard/agendamentos", label: "Agendamentos", grupo: "conta" },
  { href: "/dashboard/reuniao", label: "Reunião", grupo: "conta" },
  { href: "/dashboard/chaves", label: "Chaves de API", grupo: "conta" },
  { href: "/dashboard/integracoes", label: "Integrações", grupo: "conta" },
  { href: "/explorar", label: "Explorar", grupo: "conta" },
  { href: "/admin/intelligence", label: "Intelligence Control", grupo: "admin", soDono: true },
  { href: "/admin/clientes", label: "Clientes", grupo: "admin", soDono: true },
  { href: "/admin/organizacoes", label: "Organizações", grupo: "admin", soDono: true },
  { href: "/admin/visibilidade", label: "Visibilidade", grupo: "admin", soDono: true },
  { href: "/system", label: "Sistema", grupo: "admin", soDono: true },
];

export function normalizar(href: string): string {
  if (!href) return href;
  const limpo = href.split("?")[0].split("#")[0];
  return limpo.length > 1 && limpo.endsWith("/") ? limpo.slice(0, -1) : limpo;
}

let cache: { mtime: number; mapa: Record<string, Estado> } | null = null;

export function estados(): Record<string, Estado> {
  try {
    const st = fs.statSync(ARQUIVO);
    if (cache && cache.mtime === st.mtimeMs) return cache.mapa;
    const cru = JSON.parse(fs.readFileSync(ARQUIVO, "utf-8")) as Record<string, Estado>;
    const mapa: Record<string, Estado> = {};
    for (const [href, valor] of Object.entries(cru)) {
      if (valor === "publico" || valor === "em_breve" || valor === "oculto") {
        mapa[normalizar(href)] = valor;
      }
    }
    cache = { mtime: st.mtimeMs, mapa };
    return mapa;
  } catch {
    // Sem arquivo = tudo público. Um app que esconde tudo por falta de arquivo
    // seria pior que o problema que esta tela resolve.
    return {};
  }
}

export function estadoDe(href: string): Estado {
  return estados()[normalizar(href)] || "publico";
}

export function gravar(href: string, estado: Estado): Record<string, Estado> {
  if (!ITENS.some((i) => normalizar(i.href) === normalizar(href))) {
    throw new Error("item desconhecido: " + href);
  }
  const atual = { ...estados() };
  if (estado === "publico") {
    delete atual[normalizar(href)]; // padrão não ocupa espaço no arquivo
  } else {
    atual[normalizar(href)] = estado;
  }
  fs.mkdirSync(path.dirname(ARQUIVO), { recursive: true });
  const tmp = ARQUIVO + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(atual, null, 2), "utf-8");
  fs.renameSync(tmp, ARQUIVO); // troca atômica: leitor nunca vê arquivo pela metade
  cache = null;
  return atual;
}