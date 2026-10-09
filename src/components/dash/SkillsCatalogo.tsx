"use client";

/**
 * SkillsCatalogo — a área de SKILLS, reusada em três lugares: a página /skills
 * (item da lateral), a página /explorar e a seção SKILLS da Synapse
 * (/dashboard/connect). É o MESMO componente e a MESMA fonte de dado: lê
 * /api/skills, que lê as bibliotecas reais no disco (ver src/lib/skills-lista.ts)
 * e as skills DA CONTA (ver src/lib/skills-do-cliente.ts). Nada aqui é lista
 * fixa nem número inventado.
 *
 * DUAS CAMADAS DE SKILL:
 *   • ECOSSISTEMA ("nossa") — vêm do disco, são READ-ONLY: não há como editar
 *     nem apagar. Na Synapse (mostrarOrigens) cada uma oferece "usar como base":
 *     cria uma CÓPIA na conta, marcada "do cliente"; o original não é tocado e a
 *     contagem do ecossistema NÃO muda.
 *   • DO CLIENTE — criadas pela conta (o botão "Nova skill" e o "usar como
 *     base"). Aparecem aqui com o selo "do cliente" e podem ser EDITADAS e
 *     APAGADAS — só as suas. Elas vivem presas à conta: outra conta não as vê.
 *
 * O formulário é explícito: uma skill é TEXTO que o assistente segue — nunca
 * senha/token/chave, e não há campo de credencial algum. O servidor também
 * recusa o que parecer segredo. Nada de código: sem execução, sem eval.
 *
 * Honestidade de propósito:
 *   - 401 → "entre na sua conta" (a rota exige sessão).
 *   - item sem descrição → diz que o arquivo não traz descrição; não inventa.
 *   - busca filtra nome, descrição e categoria; o contador é o filtrado.
 *
 * TODA a funcionalidade de criar/editar/apagar/"usar como base" só aparece com
 * `mostrarOrigens` (a Synapse). Em /skills e /explorar o componente se comporta
 * EXATAMENTE como antes — só o catálogo do ecossistema, nenhum botão de escrita.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { VIDRO } from "@/lib/vidro";
import { IconeFechar, IconeSkills } from "@/components/dash/icons";

type Skill = { nome: string; descricao: string | null; categoria: string };

/** Skill DA CONTA (texto que o assistente segue; nunca credencial). */
type SkillCliente = {
  id: string;
  nome: string;
  descricao: string | null;
  instrucoes: string;
  base: string | null;
  criada_em: string;
  atualizada_em: string;
};

export default function SkillsCatalogo({ mostrarOrigens = false }: { mostrarOrigens?: boolean }) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [minhas, setMinhas] = useState<SkillCliente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");

  /* O formulário (só na Synapse). `editandoId` null => criando do zero. */
  const [formAberto, setFormAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [campoNome, setCampoNome] = useState("");
  const [campoDescricao, setCampoDescricao] = useState("");
  const [campoInstrucoes, setCampoInstrucoes] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState("");

  /* Aviso de ação (copiar como base / apagar), em PT-BR. */
  const [avisoAcao, setAvisoAcao] = useState("");
  const [erroAcao, setErroAcao] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const r = await fetch("/api/skills", { cache: "no-store" });
      if (r.status === 401) {
        setErro("Entre na sua conta para ver as skills.");
        setSkills([]);
        setMinhas([]);
        return;
      }
      const d = (await r.json().catch(() => null)) as
        | { skills?: Skill[]; minhas?: SkillCliente[] }
        | null;
      if (!r.ok || !Array.isArray(d?.skills)) {
        setErro("Não consegui ler as skills agora.");
        return;
      }
      setSkills(d.skills);
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

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return skills;
    return skills.filter(
      (s) =>
        s.nome.toLowerCase().includes(q) ||
        (s.descricao || "").toLowerCase().includes(q) ||
        s.categoria.toLowerCase().includes(q),
    );
  }, [skills, busca]);

  const minhasFiltradas = useMemo(() => {
    if (!mostrarOrigens) return [];
    const q = busca.trim().toLowerCase();
    if (!q) return minhas;
    return minhas.filter(
      (s) =>
        s.nome.toLowerCase().includes(q) ||
        (s.descricao || "").toLowerCase().includes(q) ||
        (s.base || "").toLowerCase().includes(q),
    );
  }, [mostrarOrigens, minhas, busca]);

  const grupos = useMemo(() => {
    const m = new Map<string, Skill[]>();
    for (const s of filtrados) {
      const arr = m.get(s.categoria);
      if (arr) arr.push(s);
      else m.set(s.categoria, [s]);
    }
    return [...m.entries()];
  }, [filtrados]);

  /* ── Ações de escrita (só na Synapse) ─────────────────────────────── */

  const abrirNova = () => {
    setEditandoId(null);
    setCampoNome("");
    setCampoDescricao("");
    setCampoInstrucoes("");
    setErroForm("");
    setFormAberto(true);
  };

  const abrirEdicao = (s: SkillCliente) => {
    setEditandoId(s.id);
    setCampoNome(s.nome);
    setCampoDescricao(s.descricao ?? "");
    setCampoInstrucoes(s.instrucoes);
    setErroForm("");
    setFormAberto(true);
  };

  const salvar = useCallback(async () => {
    const nome = campoNome.trim();
    const descricao = campoDescricao.trim();
    const instrucoes = campoInstrucoes.trim();
    if (!nome) {
      setErroForm("Dê um nome à skill.");
      return;
    }
    if (!instrucoes) {
      setErroForm("Escreva as instruções — é o que o assistente vai seguir.");
      return;
    }
    setSalvando(true);
    setErroForm("");
    try {
      const url = editandoId ? `/api/skills/${encodeURIComponent(editandoId)}` : "/api/skills";
      const metodo = editandoId ? "PATCH" : "POST";
      const r = await fetch(url, {
        method: metodo,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, descricao, instrucoes }),
      });
      const d = (await r.json().catch(() => ({}))) as { erro?: string };
      if (!r.ok) {
        setErroForm(d.erro || `Não consegui salvar (HTTP ${r.status}).`);
        return;
      }
      setFormAberto(false);
      await carregar();
    } catch {
      setErroForm("Caiu a conexão ao salvar. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }, [campoNome, campoDescricao, campoInstrucoes, editandoId, carregar]);

  const apagar = useCallback(
    async (s: SkillCliente) => {
      const ok = window.confirm(`Apagar a skill “${s.nome}”? Isto não volta.`);
      if (!ok) return;
      setOcupado(true);
      setErroAcao("");
      setAvisoAcao("");
      try {
        const r = await fetch(`/api/skills/${encodeURIComponent(s.id)}`, { method: "DELETE" });
        if (!r.ok) {
          const d = (await r.json().catch(() => ({}))) as { erro?: string };
          setErroAcao(d.erro || `Não consegui apagar (HTTP ${r.status}).`);
          return;
        }
        setAvisoAcao(`Skill “${s.nome}” apagada.`);
        await carregar();
      } catch {
        setErroAcao("Caiu a conexão ao apagar.");
      } finally {
        setOcupado(false);
      }
    },
    [carregar],
  );

  const usarComoBase = useCallback(
    async (nome: string) => {
      setOcupado(true);
      setErroAcao("");
      setAvisoAcao("");
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
        setAvisoAcao(`“${nome}” virou uma skill da sua conta — o original segue intacto.`);
        await carregar();
      } catch {
        setErroAcao("Caiu a conexão ao copiar.");
      } finally {
        setOcupado(false);
      }
    },
    [carregar],
  );

  return (
    <section className="mt-8">
      <div className="rounded-[20px] bg-dash-side/50 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-white">Skills do ecossistema</h2>
            {/* Sem caminho interno e sem nome de runtime na tela (08/10/2026): o
                cliente não precisa saber onde nem sobre o que a biblioteca roda. */}
            <p className="mt-1 text-[12px] leading-[1.6] text-dash-muted">
              Lidas do disco, das bibliotecas do ecossistema Mirai. Pasta oculta (ex.:{" "}
              <span className="font-mono">.archive</span>) fica de fora; a mesma skill em duas
              bibliotecas conta uma vez.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {mostrarOrigens && (
              <button
                type="button"
                onClick={abrirNova}
                data-skill-nova
                className="rounded-full bg-dash-brand px-4 py-1.5 text-[12px] font-semibold text-white transition hover:opacity-90"
              >
                Nova skill
              </button>
            )}
            <span
              data-skills-total={skills.length}
              className="rounded-full bg-dash-raise px-3 py-1.5 text-[11px] text-dash-muted"
            >
              {carregando ? "lendo…" : `${skills.length} skills`}
            </span>
          </div>
        </div>

        {/* busca + o atalho da GRADE completa, na MESMA linha — o "Ver todas as
            skills" fica AO LADO DA BUSCA (mesmo padrão das Integrações,
            08/10/2026). O atalho leva a /dashboard/skills, onde o catálogo
            inteiro aparece em grade. */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            data-skills-busca
            placeholder="Buscar por nome, descrição ou categoria…"
            className="min-w-[220px] flex-1 rounded-[12px] border border-white/10 bg-dash-bg px-4 py-2.5 text-[13px] text-white outline-none placeholder:text-dash-dim focus:border-dash-brand/60"
          />
          <Link
            href="/dashboard/skills"
            data-ver-todas-skills
            title="Ver todas as skills em grade"
            className="rounded-[10px] border border-white/12 px-4 py-2.5 text-[12px] text-dash-muted transition hover:text-white"
          >
            Ver todas as skills ({skills.length})
          </Link>
        </div>

        {/* ORIGENS (só na Synapse): cada skill é do ecossistema ("nossa"); as
            "do cliente" são as criadas POR ESTA CONTA e o número é o REAL;
            "comunidade" é mostrada como "em breve". */}
        {mostrarOrigens && !erro && (
          <div data-origens className="mt-4 grid gap-2 sm:grid-cols-3">
            <div data-origem="nossa" className="rounded-[12px] border border-white/10 bg-dash-bg px-3.5 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white">nossa</p>
              <p className="mt-1 text-[11.5px] leading-[1.5] text-dash-muted">
                {carregando ? "contando…" : `${skills.length} skills lidas do ecossistema`}
              </p>
            </div>
            <div
              data-origem="do-cliente"
              data-contagem={minhas.length}
              className="rounded-[12px] border border-white/10 bg-dash-bg px-3.5 py-2.5"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white">do cliente</p>
              <p className="mt-1 text-[11.5px] leading-[1.5] text-dash-muted">
                {carregando
                  ? "contando…"
                  : minhas.length === 0
                    ? "nenhuma ainda"
                    : `${minhas.length} ${minhas.length === 1 ? "criada" : "criadas"} por você`}
              </p>
            </div>
            <div data-origem="comunidade" className="rounded-[12px] border border-white/10 bg-dash-bg px-3.5 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white">comunidade</p>
              <p className="mt-1 text-[11.5px] leading-[1.5] text-dash-dim">em breve</p>
            </div>
          </div>
        )}

        {/* Aviso/erro de ação (copiar base, apagar) — PT-BR, sem tecnicismo. */}
        {avisoAcao && (
          <p data-acao-aviso className="mt-3 text-[12.5px] leading-[1.6] text-[#8effa2]">
            {avisoAcao}
          </p>
        )}
        {erroAcao && (
          <p data-acao-erro className="mt-3 text-[12.5px] leading-[1.6] text-dash-bad">
            {erroAcao}
          </p>
        )}

        {erro && (
          <p data-skills-erro className="mt-4 text-[12.5px] leading-[1.6] text-dash-bad">
            {erro}
          </p>
        )}

        {!erro && carregando && (
          <p className="mt-4 text-[12.5px] text-dash-muted">Lendo as skills no disco…</p>
        )}

        {!erro && !carregando && !skills.length && !minhas.length && (
          <p className="mt-4 text-[12.5px] leading-[1.6] text-dash-muted">
            Nenhuma skill encontrada nas bibliotecas do disco.
          </p>
        )}

        {!erro && !carregando && (!!skills.length || !!minhas.length) && (
          <>
            <p data-skills-filtrados={filtrados.length} className="mt-4 text-[11px] text-dash-dim">
              {busca.trim()
                ? `${filtrados.length} de ${skills.length} skills`
                : `${grupos.length} categorias`}
            </p>

            {!filtrados.length && !minhasFiltradas.length && (
              <p className="mt-3 text-[12.5px] text-dash-muted">Nada bate com essa busca.</p>
            )}

            <div className="mt-2 space-y-6">
              {/* ── DO CLIENTE (só na Synapse): as skills DESTA conta, no topo.
                    Selo "do cliente" e as ações de editar/apagar — só nas suas. */}
              {mostrarOrigens && minhasFiltradas.length > 0 && (
                <div data-skills-categoria="Do cliente">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-dash-dim">
                    Do cliente <span className="text-white/40">· {minhasFiltradas.length}</span>
                  </p>
                  <ul className="mt-2 space-y-1">
                    {minhasFiltradas.map((s) => (
                      <li
                        key={s.id}
                        data-skill={s.nome}
                        data-skill-origem="do-cliente"
                        data-skill-cliente-id={s.id}
                        className="rounded-[10px] px-3 py-2.5 transition hover:bg-white/[0.04]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-mono text-[12.5px] text-white">{s.nome}</p>
                          <div className="flex shrink-0 items-center gap-2">
                            <span
                              data-skill-origem-badge="do-cliente"
                              title="Skill criada por esta conta"
                              className="rounded-full bg-dash-brand/80 px-2 py-[2px] text-[10px] text-white"
                            >
                              do cliente
                            </span>
                            <button
                              type="button"
                              data-skill-editar={s.id}
                              onClick={() => abrirEdicao(s)}
                              className="rounded-full border border-white/12 px-2.5 py-[3px] text-[10px] text-dash-muted transition hover:text-white"
                            >
                              editar
                            </button>
                            <button
                              type="button"
                              data-skill-apagar={s.id}
                              disabled={ocupado}
                              onClick={() => void apagar(s)}
                              className="rounded-full border border-dash-bad/40 px-2.5 py-[3px] text-[10px] text-dash-bad transition hover:bg-dash-bad/10 disabled:opacity-40"
                            >
                              apagar
                            </button>
                          </div>
                        </div>
                        <p className="mt-0.5 text-[12px] leading-[1.55] text-dash-muted">
                          {s.descricao ?? (
                            <span className="italic text-dash-dim">sem descrição</span>
                          )}
                        </p>
                        {s.base && (
                          <p className="mt-1 text-[10.5px] text-dash-dim">
                            a partir de{" "}
                            <span className="font-mono text-white/60">{s.base}</span> — o original
                            segue intacto e não muda.
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* ── DO ECOSSISTEMA: read-only. Na Synapse cada uma oferece
                    "usar como base" (cria uma cópia na conta). */}
              {grupos.map(([categoria, itens]) => (
                <div key={categoria} data-skills-categoria={categoria}>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-dash-dim">
                    {categoria} <span className="text-white/40">· {itens.length}</span>
                  </p>
                  <ul className="mt-2 space-y-0.5">
                    {itens.map((s) => (
                      <li
                        key={`${categoria}/${s.nome}`}
                        data-skill={s.nome}
                        className="rounded-[10px] px-3 py-2 transition hover:bg-white/[0.04]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-mono text-[12.5px] text-white">{s.nome}</p>
                          <div className="flex shrink-0 items-center gap-2">
                            {mostrarOrigens && (
                              <button
                                type="button"
                                data-skill-base={s.nome}
                                disabled={ocupado}
                                onClick={() => void usarComoBase(s.nome)}
                                title="Cria uma cópia desta skill na sua conta — o original não muda."
                                className="rounded-full border border-white/12 px-2.5 py-[3px] text-[10px] text-dash-muted transition hover:text-white disabled:opacity-40"
                              >
                                usar como base
                              </button>
                            )}
                            {mostrarOrigens && (
                              <span
                                data-skill-origem="nossa"
                                title="Skill do ecossistema (lida do disco, só-leitura)"
                                className="shrink-0 rounded-full bg-dash-raise px-2 py-[2px] text-[10px] text-dash-muted"
                              >
                                nossa
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="mt-0.5 text-[12px] leading-[1.55] text-dash-muted">
                          {s.descricao ?? (
                            <span className="italic text-dash-dim">
                              sem descrição no arquivo (frontmatter sem <code>description</code>)
                            </span>
                          )}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── O FORMULÁRIO (só na Synapse) ─────────────────────────────── */}
      {formAberto && (
        <FormularioSkill
          editando={Boolean(editandoId)}
          nome={campoNome}
          descricao={campoDescricao}
          instrucoes={campoInstrucoes}
          erro={erroForm}
          salvando={salvando}
          onNome={setCampoNome}
          onDescricao={setCampoDescricao}
          onInstrucoes={setCampoInstrucoes}
          onFechar={() => setFormAberto(false)}
          onSalvar={() => void salvar()}
        />
      )}
    </section>
  );
}

/* ── Formulário de skill (NOME / DESCRIÇÃO / INSTRUÇÕES) ─────────────── */

function FormularioSkill({
  editando,
  nome,
  descricao,
  instrucoes,
  erro,
  salvando,
  onNome,
  onDescricao,
  onInstrucoes,
  onFechar,
  onSalvar,
}: {
  editando: boolean;
  nome: string;
  descricao: string;
  instrucoes: string;
  erro: string;
  salvando: boolean;
  onNome: (v: string) => void;
  onDescricao: (v: string) => void;
  onInstrucoes: (v: string) => void;
  onFechar: () => void;
  onSalvar: () => void;
}) {
  const overlay = useRef<HTMLDivElement>(null);
  const campoClasse =
    "w-full rounded-[10px] border border-white/10 bg-[#121416] px-4 py-2.5 text-[13px] text-white outline-none placeholder:text-[#555a5f] focus:border-[#ff751f]/60";

  return (
    <div
      ref={overlay}
      onClick={(e) => {
        if (e.target === overlay.current) onFechar();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onFechar();
      }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 px-4 backdrop-blur-md"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={editando ? "Editar skill" : "Nova skill"}
        data-skill-form
        className="relative max-h-[90vh] w-full max-w-[560px] overflow-y-auto rounded-[30px] border border-white/[0.18] p-7 text-white"
        style={VIDRO}
      >
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar"
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-[10px] text-white/70 transition hover:bg-white/[0.12] hover:text-white"
        >
          <IconeFechar className="h-4 w-4" />
        </button>

        <header className="flex items-center gap-3.5 pr-10">
          <span className="grid h-11 w-11 place-items-center rounded-[14px] bg-dash-brand/80">
            <IconeSkills className="h-5 w-5 text-white" />
          </span>
          <div>
            <p className="text-[17px] font-semibold text-white">
              {editando ? "Editar skill" : "Nova skill"}
            </p>
            <p className="mt-0.5 text-[12px] text-white/60">
              Instruções que a sua Mirai segue. É só texto — nada de código roda a partir daqui.
            </p>
          </div>
        </header>

        <div className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-[11px] uppercase tracking-[0.16em] text-[#8f939a]">
              Nome
            </span>
            <input
              type="text"
              value={nome}
              onChange={(e) => onNome(e.target.value)}
              data-campo-nome
              autoFocus
              autoComplete="off"
              spellCheck={false}
              maxLength={80}
              className={campoClasse}
              placeholder="ex.: Resumo de reunião"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[11px] uppercase tracking-[0.16em] text-[#8f939a]">
              Descrição <span className="normal-case text-[#555a5f]">(o que é, curta)</span>
            </span>
            <input
              type="text"
              value={descricao}
              onChange={(e) => onDescricao(e.target.value)}
              data-campo-descricao
              autoComplete="off"
              maxLength={240}
              className={campoClasse}
              placeholder="em uma linha, para que serve esta skill"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[11px] uppercase tracking-[0.16em] text-[#8f939a]">
              Instruções
            </span>
            <textarea
              value={instrucoes}
              onChange={(e) => onInstrucoes(e.target.value)}
              data-campo-instrucoes
              rows={8}
              className={`${campoClasse} resize-y leading-[1.6]`}
              placeholder="o passo a passo que a Mirai deve seguir quando usar esta skill"
            />
          </label>
        </div>

        {/* A REGRA, dita na tela, em PT-BR (item obrigatório da fase). */}
        <p
          data-aviso-sem-segredo
          className="mt-5 rounded-[12px] border border-[#ff751f]/30 bg-[#ff751f]/[0.07] px-4 py-3 text-[11.5px] leading-[1.6] text-[#ffb27a]"
        >
          Uma skill é instruções que o assistente segue — <b>nunca uma senha, token ou chave de
          API</b>. Não há campo para credencial aqui, e o servidor recusa o que parecer segredo.
          Guarde credenciais no cofre da conta, nas Integrações.
        </p>

        {erro && (
          <p data-skill-form-erro className="mt-3 text-[12px] text-dash-bad">
            {erro}
          </p>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onFechar}
            className="rounded-[10px] border border-white/[0.20] px-5 py-2.5 text-[12px] font-semibold text-white/80 transition hover:text-white"
          >
            cancelar
          </button>
          <button
            type="button"
            onClick={onSalvar}
            disabled={salvando}
            data-skill-salvar
            className="rounded-[10px] bg-[#ff751f] px-6 py-2.5 text-[12px] font-semibold text-white transition hover:bg-[#ff2d55] disabled:opacity-40"
          >
            {salvando ? "salvando…" : editando ? "salvar" : "criar skill"}
          </button>
        </div>
      </div>
    </div>
  );
}
