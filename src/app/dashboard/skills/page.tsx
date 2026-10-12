"use client";

/* /dashboard/skills — a GRADE COMPLETA do catálogo de skills (pedido do dono,
 * 08/10/2026: "as mesmas coisas na página de skill").
 *
 * Espelha o que foi feito nas Integrações: na Synapse (aba Skills) e na página
 * /skills o catálogo aparece em faixa limitada, com o atalho "Ver todas as
 * skills" AO LADO DA BUSCA; o atalho traz pra cá, onde o catálogo inteiro
 * aparece em GRADE — mesma busca, mesmos filtros de pasta e o MESMO card
 * (`@/components/dash/skill-cards`, o mesmo que a Synapse desenha).
 *
 * O dado é o MESMO de /skills: `/api/skills` (as bibliotecas reais lidas do
 * disco pelo servidor). Nada é lista fixa, nada é número inventado. A skill da
 * CONTA continua sendo criada/editada em /skills e na Synapse — aqui o catálogo
 * é de leitura, com a ação "usar como base" (que copia para a conta).
 */

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import Shell from "@/components/dash/Shell";
import { Vazio } from "@/components/dash/kit";
import { IconeSkills } from "@/components/dash/icons";
import { CardSkill, DetalheSkill, criadorDaSkill, type Detalhe, type Skill, type SkillCliente } from "@/components/dash/skill-cards";
import { SEM_TEMA, TEMAS_ORDEM, normalizarBusca, rotuloTema, textoBuscaSkill } from "@/lib/skills-temas";
import { nomeDaSkill } from "@/lib/skills-titulo";

const TODAS = "todas";
const A = "/artdash";

interface Usuario {
  name?: string;
  email?: string;
  ehDono?: boolean;
}

export default function TodasSkillsPage() {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [minhas, setMinhas] = useState<SkillCliente[]>([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState<string>(TODAS);
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState("");
  const [erroAcao, setErroAcao] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const [me, r] = await Promise.all([
        fetch("/api/auth/me", { cache: "no-store" }).catch(() => null),
        fetch("/api/skills", { cache: "no-store" }),
      ]);
      if (me && me.ok) {
        const d = (await me.json()) as { user?: Usuario };
        setUsuario(d.user ?? null);
      }
      if (r.status === 401) {
        setErro("Entre na sua conta para ver as skills.");
        setSkills([]);
        return;
      }
      const d = (await r.json().catch(() => null)) as
        | { skills?: Skill[]; total?: number; minhas?: SkillCliente[] }
        | null;
      if (!r.ok || !Array.isArray(d?.skills)) {
        setErro("Não consegui ler as skills agora.");
        return;
      }
      setSkills(d.skills);
      setTotal(typeof d.total === "number" ? d.total : d.skills.length);
      setMinhas(Array.isArray(d.minhas) ? d.minhas : []);
    } catch {
      setErro("Caiu a conexão ao ler as skills.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /* Os TEMAS reais do catálogo viram os chips — na ORDEM canônica e só os que
     têm skill atrás (mesma regra do painel). O rótulo vai CAPITALIZADO
     (`rotuloTema`); o valor cru continua sendo a chave do filtro. */
  const temas = useMemo(() => {
    const presentes = new Set(skills.map((s) => s.tema || SEM_TEMA));
    const lista = TEMAS_ORDEM.filter((t) => presentes.has(t));
    if (presentes.has(SEM_TEMA)) lista.push(SEM_TEMA);
    return lista;
  }, [skills]);

  /* Quais skills do ecossistema JÁ têm cópia nesta conta — o estado do card. */
  const basesNaConta = useMemo(
    () => new Set(minhas.map((m) => m.base).filter((b): b is string => Boolean(b))),
    [minhas],
  );

  /* Mesma busca de sempre: nome + descrição + tema + apelidos + pasta, sem
     acento e sem caixa (textoBuscaSkill / normalizarBusca). Com busca, o chip de
     tema é ignorado — é assim que "pen test" acha SEGURANÇA. */
  const filtradas = useMemo(() => {
    const termos = normalizarBusca(busca).split(/\s+/).filter(Boolean);
    return skills.filter((s) => {
      if (!termos.length) return categoria === TODAS || (s.tema || SEM_TEMA) === categoria;
      const alvo = normalizarBusca(textoBuscaSkill(s));
      return termos.every((t) => alvo.includes(t));
    });
  }, [skills, busca, categoria]);

  const usarComoBase = useCallback(
    async (nome: string) => {
      setOcupado(true);
      setErroAcao("");
      setAviso("");
      try {
        const r = await fetch("/api/skills/base", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome }),
        });
        const d = (await r.json().catch(() => ({}))) as { erro?: string };
        if (!r.ok) {
          setErroAcao(d.erro || `Não consegui copiar (HTTP ${r.status}).`);
          return;
        }
        setAviso(`“${nomeDaSkill(nome)}” virou uma skill da sua conta — o original segue intacto.`);
        /* RECARREGA: o card desta skill precisa VIRAR para "na sua conta" na
           hora. Sem isto o clique não muda nada na tela — foi a queixa do dono
           (08/10/2026). */
        await carregar();
      } catch {
        setErroAcao("Caiu a conexão ao copiar.");
      } finally {
        setOcupado(false);
      }
    },
    [carregar],
  );

  /* O foco vai para o painel de aviso quando a ação responde (leitor de tela). */
  const avisoRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if ((aviso || erroAcao) && avisoRef.current) avisoRef.current.focus();
  }, [aviso, erroAcao]);

  return (
    <Shell
      titulo="Skills"
      usuario={usuario}
      cabecalhoDireita={
        <Link
          href="/dashboard/connect?aba=skills"
          className="rounded-[10px] border border-dash-hair/12 px-4 py-2 text-[12px] text-dash-muted transition hover:text-dash-fg"
        >
          ← Voltar para Skills
        </Link>
      }
    >
      <section className="mt-[55px]">
        <div className="flex flex-wrap items-center gap-5">
          <h2 className="text-[20px] font-bold text-dash-fg">Todas as skills</h2>
          <span data-grade-skills-contagem className="text-[13px] text-dash-muted">
            {carregando ? "lendo…" : `${filtradas.length} de ${total || skills.length}`}
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
          </div>
        </div>

        <div className="mt-5 flex gap-5 overflow-x-auto pb-2">
          <button
            onClick={() => setCategoria(TODAS)}
            data-tema="todas"
            className={`shrink-0 rounded-full px-2.5 py-[5px] text-[10px] transition ${
              categoria === TODAS ? "bg-dash-brand text-dash-fg" : "bg-dash-raise text-dash-muted hover:text-dash-fg"
            }`}
          >
            <img src={`${A}/4006b.svg`} alt="" className="mr-1 inline h-[9px] w-[6px]" />
            Todas
          </button>
          {temas.map((c) => (
            <button
              key={c}
              onClick={() => setCategoria(c)}
              data-tema={c}
              className={`shrink-0 rounded-full px-2.5 py-[5px] text-[10px] transition ${
                categoria === c ? "bg-dash-brand text-dash-fg" : "bg-dash-raise text-dash-muted hover:text-dash-fg"
              }`}
            >
              {rotuloTema(c)}
            </button>
          ))}
        </div>

        {(aviso || erroAcao) && (
          <div
            ref={avisoRef}
            tabIndex={-1}
            data-acao-aviso
            className={`mt-4 rounded-[12px] border px-4 py-3 text-[12.5px] leading-[1.6] ${
              erroAcao ? "border-[#ff2d55]/30 bg-[#ff2d55]/[0.07] text-dash-bad" : "border-dash-hair/10 bg-dash-side text-dash-ok"
            }`}
          >
            {erroAcao || aviso}
          </div>
        )}

        {erro ? (
          <p data-grade-skills-erro className="mt-[27px] text-[12.5px] text-dash-bad">
            {erro}
          </p>
        ) : carregando && !skills.length ? (
          <p className="mt-[27px] text-[12px] text-dash-dim">Lendo as skills no disco…</p>
        ) : filtradas.length === 0 ? (
          <div className="mt-[27px]">
            <Vazio
              icone={<IconeSkills className="h-7 w-7" />}
              titulo={busca.trim() ? "Nada bate com essa busca" : "Nada neste tema ainda"}
              texto="Escolha outro tema nos chips acima, ou limpe a busca."
            />
          </div>
        ) : (
          <div
            data-grade-skills-visiveis={filtradas.length}
            className="mt-[27px] grid justify-items-center gap-[18px] [grid-template-columns:repeat(auto-fill,minmax(214px,1fr))]"
          >
            {filtradas.map((s) => (
              <CardSkill
                key={`${s.categoria}/${s.nome}`}
                skill={s}
                ocupado={ocupado}
                naConta={basesNaConta.has(s.nome)}
                onUsarComoBase={usarComoBase}
                onAbrir={() => setDetalhe({ tipo: "catalogo", skill: s })}
              />
            ))}
          </div>
        )}
      </section>

      {detalhe && (
        <DetalheSkill
          detalhe={detalhe}
          ocupado={ocupado}
          criador={criadorDaSkill(detalhe, skills)}
          onFechar={() => setDetalhe(null)}
          onUsarComoBase={usarComoBase}
        />
      )}
    </Shell>
  );
}
