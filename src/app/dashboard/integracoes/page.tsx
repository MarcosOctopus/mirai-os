"use client";

/* /dashboard/integracoes — a GRADE COMPLETA do catálogo (pedido do dono,
 * 08/10/2026).
 *
 * Na Synapse (`/dashboard/connect`) o catálogo mostra 10 cartões "de cara" e o
 * atalho "Ver todas as integrações (21)", AO LADO DA BUSCA, traz pra cá: aqui os
 * 21 aparecem em GRADE, com a MESMA busca, os MESMOS chips de categoria e o
 * MESMO card — desenhado por `@/components/dash/integracao-cards`, o mesmo
 * componente que a Synapse usa. Nada foi redesenhado.
 *
 * A REGRA DE ESTADO é a MESMA da Synapse: `estaConectadaNaConta` de
 * `@/lib/integracoes/estado-da-conta` (linhas da conta -> CRM ao vivo -> cofre).
 * As duas telas chamam a MESMA função — é impossível o mesmo card aparecer
 * "conectado" aqui e "não conectado" lá.
 *
 * O clique no card NÃO conecta: leva de volta à Synapse com o produto já
 * aberto (`/dashboard/connect?produto=<id>`), onde vive o popup do produto e
 * todo o fluxo de conexão (MCP abre site, API pede a chave, CRM pede a
 * credencial). Uma única porta para conectar.
 */

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import Shell from "@/components/dash/Shell";
import { Vazio } from "@/components/dash/kit";
import { IconePlug } from "@/components/dash/icons";
import { ARTES_CARD, A, CardIntegracao } from "@/components/dash/integracao-cards";
import { CATALOGO, CATEGORIAS, type Integracao } from "@/lib/integracoes/catalogo";
import {
  estaConectadaNaConta,
  linhaDaContaEm,
  type LinhasDaConta,
} from "@/lib/integracoes/estado-da-conta";

interface Usuario {
  name?: string;
  email?: string;
  ehDono?: boolean;
  platform_config?: Record<string, unknown>;
}

type Prontidao = Record<string, { pronta: boolean; motivo?: string }>;

export default function TodasIntegracoesPage() {
  const router = useRouter();

  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [categoria, setCategoria] = useState<string>("todas");
  const [busca, setBusca] = useState("");
  const [soSemConexao, setSoSemConexao] = useState(false);

  const [linhas, setLinhas] = useState<LinhasDaConta>({ minhas: [], daEmpresa: [] });
  const [prontidao, setProntidao] = useState<Prontidao>({});
  const [saasoAoVivo, setSaasoAoVivo] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [me, inte, saaso] = await Promise.all([
        fetch("/api/auth/me", { cache: "no-store" }),
        fetch("/api/integracoes", { cache: "no-store" }),
        fetch("/api/integracoes/saaso", { cache: "no-store" }).catch(() => null),
      ]);
      if (me.ok) {
        const d = (await me.json()) as { user?: Usuario };
        setUsuario(d.user ?? null);
      }
      if (inte.ok) {
        const d = (await inte.json()) as {
          minhas?: LinhasDaConta["minhas"];
          daEmpresa?: LinhasDaConta["daEmpresa"];
          prontidao?: Prontidao;
        };
        setLinhas({ minhas: d.minhas ?? [], daEmpresa: d.daEmpresa ?? [] });
        setProntidao(d.prontidao ?? {});
      }
      if (saaso && saaso.ok) {
        const d = (await saaso.json()) as { conectado?: boolean };
        setSaasoAoVivo(Boolean(d.conectado));
      }
    } catch {
      // Sem os dados a grade NÃO inventa: nada aparece como conectado.
      setLinhas({ minhas: [], daEmpresa: [] });
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const config = usuario?.platform_config ?? {};
  const estaConectada = useCallback(
    (i: Integracao): boolean => estaConectadaNaConta(i, { saasoAoVivo, linhas, config }),
    [saasoAoVivo, linhas, config],
  );
  const pronta = useCallback((i: Integracao) => prontidao[i.id] ?? { pronta: true }, [prontidao]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return CATALOGO.filter((i) => {
      if (categoria !== "todas" && i.categoria !== categoria) return false;
      if (soSemConexao && estaConectada(i)) return false;
      if (!termo) return true;
      return `${i.nome} ${i.empresa} ${i.subtitulo} ${i.explicacao ?? ""}`.toLowerCase().includes(termo);
    });
  }, [categoria, busca, soSemConexao, estaConectada]);

  const ligadas = useMemo(() => CATALOGO.filter((i) => estaConectada(i)).length, [estaConectada]);

  /* O clique leva à Synapse com o produto aberto — lá vive o popup e o fluxo. */
  const abrir = useCallback(
    (item: Integracao) => {
      router.push(`/dashboard/connect?produto=${encodeURIComponent(item.id)}`);
    },
    [router],
  );

  return (
    <Shell
      titulo="Integrações"
      usuario={usuario}
      cabecalhoDireita={
        <Link
          href="/dashboard/connect"
          className="rounded-[10px] border border-dash-hair/12 px-4 py-2 text-[12px] text-dash-muted transition hover:text-dash-fg"
        >
          ← Voltar para a Synapse
        </Link>
      }
    >
      <section className="mt-[55px]">
        <div className="flex flex-wrap items-center gap-5">
          <h2 className="text-[20px] font-bold text-dash-fg">Todas as integrações</h2>
          <span data-grade-contagem className="text-[13px] text-dash-muted">
            {filtradas.length} de {CATALOGO.length} · {ligadas} conectada(s)
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <label className="hidden h-[30px] w-[209px] items-center rounded-full bg-dash-side px-4 md:flex">
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar"
                className="min-w-0 flex-1 bg-transparent text-[10px] italic text-dash-fg outline-none placeholder:text-dash-muted"
              />
              <img src={`${A}/3c6cf.svg`} alt="" className="h-[13px] w-[13px]" />
            </label>
            <button
              onClick={() => setSoSemConexao((v) => !v)}
              aria-label={soSemConexao ? "Mostrar todas as integrações" : "Mostrar só as que ainda não estão conectadas"}
              aria-pressed={soSemConexao}
              title={soSemConexao ? "Mostrar todas" : "Só as que ainda não estão conectadas"}
              className={`grid h-[26px] w-[26px] place-items-center rounded-full transition ${
                soSemConexao ? "bg-dash-brand" : "hover:bg-dash-hair/[0.06]"
              }`}
            >
              <img src={`${A}/e6223.svg`} alt="" className="h-[13px] w-[13px]" />
            </button>
          </div>
        </div>

        <div className="mt-5 flex gap-5 overflow-x-auto pb-2">
          {CATEGORIAS.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategoria(c.id)}
              className={`shrink-0 rounded-full px-2.5 py-[5px] text-[10px] transition ${
                categoria === c.id ? "bg-dash-brand text-dash-fg" : "bg-dash-raise text-dash-muted hover:text-dash-fg"
              }`}
            >
              {c.id === "todas" && <img src={`${A}/4006b.svg`} alt="" className="mr-1 inline h-[9px] w-[6px]" />}
              {c.rotulo}
            </button>
          ))}
        </div>

        {carregando && !usuario ? (
          <p className="mt-[27px] text-[12px] text-dash-dim">Lendo as integrações desta conta...</p>
        ) : filtradas.length === 0 ? (
          <div className="mt-[27px]">
            <Vazio
              icone={<IconePlug className="h-7 w-7" />}
              titulo={soSemConexao ? "Tudo por aqui já está conectado" : "Nada nesta categoria ainda"}
              texto={
                soSemConexao
                  ? "Desligue o filtro (o botão laranja ao lado da busca) para ver o catálogo inteiro."
                  : "Escolha outra categoria no topo ou limpe a busca."
              }
            />
          </div>
        ) : (
          <div
            data-grade-visiveis={filtradas.length}
            className="mt-[27px] grid justify-items-center gap-[18px] [grid-template-columns:repeat(auto-fill,minmax(153px,1fr))]"
          >
            {filtradas.map((i, idx) => (
              <CardIntegracao
                key={i.id}
                item={i}
                arte={ARTES_CARD[idx % ARTES_CARD.length]}
                conectada={estaConectada(i)}
                pronta={pronta(i).pronta}
                motivo={pronta(i).motivo}
                onAbrir={abrir}
              />
            ))}
          </div>
        )}
      </section>
    </Shell>
  );
}
