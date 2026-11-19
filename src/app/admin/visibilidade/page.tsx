"use client";

/* /admin/visibilidade — O QUE A GALERA VÊ ANTES DE ESTAR PRONTO (só o dono).
 *
 * Pedido do dono (19/11/2026): "queria que dentro da minha parte de admin eu
 * tire o que não quero que todo mundo veja ainda e colocar em breve pra galera
 * não ver por não estar pronto".
 *
 * Três estados por item do menu:
 *   Público   — todo mundo vê e entra (padrão)
 *   Em breve  — aparece no menu com o selo "em breve"; só o dono entra, os
 *               outros batem num aviso curto em vez de uma tela inacabada
 *   Oculto    — só o dono vê; para os outros o item nem existe no menu
 *
 * A fonte da verdade é o arquivo de visibilidade (lib/visibilidade.ts), que é
 * lido pelo menu de todo mundo. Esta tela só mostra e pede — a escrita passa por
 * /api/visibilidade, travada em `exigirDono` e no middleware (/api/admin).
 */

import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/dash/Shell";
import { Card, Secao, Vazio } from "@/components/dash/kit";
import type { Estado, ItemDoApp } from "@/lib/visibilidade";

const ESCOLHAS: { valor: Estado; rotulo: string; dica: string }[] = [
  { valor: "publico", rotulo: "Público", dica: "todos veem e entram" },
  { valor: "em_breve", rotulo: "Em breve", dica: "aparece no menu, só o dono entra" },
  { valor: "oculto", rotulo: "Oculto", dica: "só o dono vê" },
];

const GRUPOS: { id: ItemDoApp["grupo"]; titulo: string; nota: string }[] = [
  { id: "principal", titulo: "Menu principal", nota: "a coluna da esquerda, sempre visível" },
  { id: "conta", titulo: "Menu da conta", nota: "o que abre no avatar, no topo direito" },
  { id: "admin", titulo: "Admin", nota: "já nascem travados no dono pelo middleware" },
];

export default function VisibilidadePage() {
  const [mapa, setMapa] = useState<Record<string, Estado>>({});
  const [itens, setItens] = useState<ItemDoApp[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/visibilidade", { cache: "no-store" });
      const d = await r.json();
      setMapa(d.mapa || {});
      setItens(d.itens || []);
    } catch {
      setErro("não consegui ler a visibilidade agora");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function marcar(href: string, estado: Estado) {
    const anterior = mapa[href] || "publico";
    if (anterior === estado) return;
    setSalvando(href);
    setErro(null);
    setMapa((m) => ({ ...m, [href]: estado })); // responde na hora
    try {
      const r = await fetch("/api/visibilidade", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ href, estado }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.erro || "falhou");
      setMapa(d.mapa || {});
    } catch (e) {
      setMapa((m) => ({ ...m, [href]: anterior })); // volta atrás se o servidor recusou
      setErro((e as Error).message);
    } finally {
      setSalvando(null);
    }
  }

  return (
    <Shell titulo="Visibilidade">
      <Card>
        <Secao titulo="Vitrine do app" contagem="o que a galera vê antes de estar pronto">
          <p className="mb-4 text-[12.5px] text-dash-muted">
            Vale no pedido seguinte — não precisa reiniciar nada. O dono sempre vê tudo.
          </p>
          {erro && (
            <p className="mb-4 rounded-[12px] border border-dash-hair/[0.12] bg-dash-raise px-4 py-3 text-[13px] text-dash-fg/85">
              {erro}
            </p>
          )}

          {carregando ? (
            <p className="py-6 text-[13px] text-dash-muted">lendo…</p>
          ) : itens.length === 0 ? (
            <Vazio titulo="Nada para configurar" texto="a lista de itens não chegou do servidor" />
          ) : (
            <div className="space-y-8">
              {GRUPOS.map((g) => {
                const lista = itens.filter((i) => i.grupo === g.id);
                if (!lista.length) return null;
                return (
                  <div key={g.id}>
                    <p className="text-[11px] uppercase tracking-[0.16em] text-dash-dim">{g.titulo}</p>
                    <p className="mt-[2px] text-[12px] text-dash-muted">{g.nota}</p>
                    <div className="mt-3 divide-y divide-dash-hair/[0.08]">
                      {lista.map((item) => {
                        const atual = mapa[item.href] || "publico";
                        return (
                          <div key={item.href} className="flex flex-wrap items-center gap-3 py-3">
                            <div className="min-w-[200px] flex-1">
                              <p className="text-[14px] text-dash-fg">{item.label}</p>
                              <p className="text-[11.5px] text-dash-dim">{item.href}</p>
                            </div>
                            <div className="flex gap-1 rounded-full bg-dash-raise p-1">
                              {ESCOLHAS.map((c) => {
                                const ativo = atual === c.valor;
                                return (
                                  <button
                                    key={c.valor}
                                    title={c.dica}
                                    onClick={() => void marcar(item.href, c.valor)}
                                    disabled={salvando === item.href}
                                    className={`rounded-full px-3 py-[6px] text-[12px] transition ${
                                      ativo
                                        ? "bg-dash-brand text-dash-side"
                                        : "text-dash-muted hover:text-dash-fg"
                                    }`}
                                  >
                                    {c.rotulo}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Secao>
      </Card>
    </Shell>
  );
}