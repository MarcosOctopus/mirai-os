"use client";

/*
 * SkillsEspelho — a área SKILLS da Synapse (/dashboard/connect), feita como
 * ESPELHO ESTRUTURAL da aba INTEGRAÇÕES, seção por seção, na mesma ordem e na
 * mesma linguagem visual. O dono pediu (08/10/2026):
 *
 *   "a parte de skills é uma cópia da de integração. A diferença: no lugar do
 *    destaque, põe os top criadores de skills da comunidade... na parte da
 *    integração, põe as minhas skills. Aqui, no slide principal, eu ponho algo
 *    a ver com skills. a parte onde tem tokens, põe as skills que existem na
 *    comunidade."
 *
 * O QUE É CÓPIA (mesma ordem, mesmas caixas, mesma língua visual):
 *   Integrações            →  Skills
 *   ────────────────────────────────────────────────────────────────────
 *   1. banner (hero)       →  (vazio) — hero fora da tela (11/11/2026)
 *   2. Uso de tokens       →  (vazio) — bloco de comunidade FORA da tela (11/11/2026)
 *   3. Destaques           →  (vazio) — bloco de comunidade FORA da tela (11/11/2026)
 *   4. catálogo Integrações→  catálogo de SKILLS (contagem + chips + cartões)
 *   5. Minhas integrações  →  MINHAS SKILLS (contagem + as skills da conta)
 *
 * HONESTIDADE (não negociável — a comunidade NÃO existe ainda): as seções 2 e 3
 * são ESPAÇOS ESTRUTURADOS com estado honesto. Nenhum criador é
 * inventado, nenhuma skill de comunidade é inventada, nenhum número é fingido.
 * ⚠️ 11/11/2026 — o dono RISCOU em vermelho todos os "em breve" desta tela (print
 * de referência): promessa de futuro não vai ao ar. Saíram o texto grande do
 * painel, o selo do cabeçalho, os selos das linhas e os dois parágrafos que
 * anunciavam a abertura. As seções FICARAM — são o espelho estrutural das
 * Integrações — só sem o anúncio.
 * A faixa de ORIGENS (nossa / do cliente / comunidade — em breve) continua, no
 * rodapé, com os NÚMEROS REAIS.
 *
 * NADA AQUI É LISTA FIXA: o catálogo sai de /api/skills (lê as bibliotecas reais
 * do disco — ver src/lib/skills-lista.ts) e as "minhas" saem do MESMO endpoint
 * (as skills DESTA conta — ver src/lib/skills-do-cliente.ts). O componente NÃO
 * altera /skills nem /explorar: aqueles seguem com o SkillsCatalogo de sempre.
 *
 * COMPORTAMENTO PRESERVADO (o que já existia nesta fase): criar ("Nova skill"),
 * "usar como base" (cópia de uma skill do ecossistema), editar e apagar — só as
 * DA CONTA. E o aviso, em PT-BR, de que skill é TEXTO: nunca senha/token/chave,
 * com o servidor recusando o que parecer segredo.
 *
 * TEMAS + BUSCA + FACHADA LIMITADA (08/10/2026 — o dono pediu):
 *   • o catálogo é organizado por TEMAS (src/lib/skills-temas.ts), derivados do
 *     dado real; os chips de tema filtram a faixa;
 *   • a busca varre NOME + DESCRIÇÃO + TEMA + sinônimos do tema + pasta, sem
 *     acento e sem caixa, sobre o CATÁLOGO INTEIRO (ignora o chip enquanto se
 *     digita) — "pen test" acha segurança, "pathfinder" acha geo/seo;
 *   • a faixa abre LIMITADA a 10 cartões (como o lado Integrações) e o botão
 *     "Ver todas as skills" revela o conjunto completo na própria página;
 *   • o selo "nossa" de cada cartão SAIU (repetia a mesma palavra 157 vezes; o
 *     rodapé "Origens das skills" já diz isso) — "do cliente" continua.
 *
 * AJUSTES DO DONO (08/10/2026 — regra FINAL):
 *   • NOME HUMANO — o cartão/detalhe mostra um nome legível derivado do que a
 *     skill FAZ, não o slug cru (src/lib/skills-titulo.ts). O `name` guardado
 *     NÃO muda; a busca casa o slug E o nome humano.
 *   • O CARD ABRE — clicar num card abre o DETALHE (nome, descrição completa,
 *     tema e a ação); fecha com Esc/clique fora.
 *   • SEM IDENTIDADE DE ORIGEM — sem selo "nossa"/"do cliente" e sem a faixa
 *     "Origens das skills". Skill aparece como skill; a separação do que é da
 *     conta fica na seção "Minhas skills".
 *   • A BASE DA MIRAI SAI DO PAINEL — o catálogo visível lista SÓ as skills
 *     NOVAS curadas (src/lib/skills-novas.ts, hoje vazio → estado honesto). A
 *     base (~157) segue carregada e funcional por baixo (o assistente usa; o
 *     "usar como base" copia), mas fora da lista e da busca deste painel.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { VIDRO } from "@/lib/vidro";
import { IconeFechar, IconeSkills } from "@/components/dash/icons";
import { Vazio } from "@/components/dash/kit";
import {
  CardSkill,
  DetalheSkill,
  criadorDaSkill,
  type Detalhe,
  type Skill,
  type SkillCliente,
} from "@/components/dash/skill-cards";
import Link from "next/link";
import { SEM_TEMA, TEMAS_ORDEM, normalizarBusca, rotuloTema, textoBuscaSkill } from "@/lib/skills-temas";
import { descricaoLimpa, nomeDaSkill } from "@/lib/skills-titulo";
import { ehSkillNova } from "@/lib/skills-novas";

/* A raiz dos assets do template ArtDash (mesma das Integrações). */
const A = "/artdash";

/* Quantos cartões o catálogo mostra DE CARA; o resto fica atrás do botão
   "Ver todas as skills". 10 espelha EXATAMENTE o lado Integrações (mesmo
   número, mesmo botão): uma faixa e meia da fileira horizontal, sem despejar
   as 157 de uma vez. */
const LIMITE_CATALOGO = 10;

/* Os tipos Skill/SkillCliente, o `inicial`, o CardSkill e o DetalheSkill vêm
   de `@/components/dash/skill-cards` (importados no topo) — a mesma peça que a
   página /dashboard/skills desenha. Nada foi redesenhado. */

const TODAS = "todas";

/* (A nota sobre `inicial` saiu junto com a própria função, 08/10/2026.) */

/* ── Banner de SKILLS (o "slide principal"; mesma peça do hero das Integrações) ──
   O Banner das Integrações usa a arte 474f3.svg, o título em negrito/italico e
   dois botões. Aqui é a MESMA estrutura, trocando o assunto para skills. */
function BannerSkills() {
  const titulo = "Suas skills, no comando";
  const palavras = titulo.trim().split(/\s+/);
  const negrito = palavras.slice(0, 2).join(" ");
  const italico = palavras.length > 2 ? palavras[palavras.length - 1] : "";
  const meio = palavras.length > 3 ? palavras.slice(2, -1).join(" ") : "";

  return (
    <section className="relative h-[240px]">
      <img src={`${A}/474f3.svg`} alt="" className="absolute inset-0 h-full w-full" />

      <div className="relative z-10 px-[51px] py-[25px]">
        <h2 className="max-w-[320px] text-[36px] leading-[1.35] text-dash-fg">
          <span className="font-bold">{negrito}</span>
          {meio && <> {meio} </>}
          {italico && <span className="font-italic">{italico}</span>}
        </h2>
        <div className="mt-[18px] flex gap-5">
          <a
            href="#catalogo-skills"
            className="rounded-[10px] bg-dash-brand px-5 py-2.5 text-[12px] font-semibold text-dash-fg transition hover:bg-[#ff2d55]"
          >
            Explorar catálogo
          </a>
          <a
            href="/chat"
            className="rounded-[10px] border border-dash-side px-5 py-2.5 text-[12px] text-dash-fg transition hover:bg-dash-scrim/10"
          >
            Falar com a Mirai
          </a>
        </div>
      </div>

      <img src={`${A}/771d4.svg`} alt="" className="absolute bottom-0 right-0 h-[42px] w-[42px]" />
    </section>
  );
}

/* ── SKILLS DA COMUNIDADE (espelho do "Uso de tokens") ──────────────────────
   Mesma caixa (240px, mesmo vidro, mesmos blobs da marca), mesmo lugar. No
   lugar do número medido vai o estado HONESTO: a comunidade ainda não existe.
   Nada de contagem inventada. */
function SkillsDaComunidade() {
  return (
    <section
      data-comunidade
      className="relative h-[240px] overflow-hidden rounded-[30px] border border-dash-hair/70 bg-dash-card text-dash-fg"
    >
      <div className="absolute -right-8 -top-12 h-44 w-64 rounded-full bg-dash-brand blur-[34px] opacity-70" />
      <div className="absolute right-24 top-10 h-20 w-32 rounded-full bg-[#ff2d55] blur-[25px] opacity-60" />
      <div className="absolute inset-0 bg-gradient-to-br from-white/30 via-transparent to-transparent mix-blend-overlay" />

      <div className="relative z-10 px-[19px] py-[24px]">
        <div className="flex items-center gap-2">
          <span className="grid h-[18px] w-[18px] place-items-center text-dash-fg">
            <IconeSkills className="h-[15px] w-[15px]" />
          </span>
          <span className="text-[14px]">Skills da comunidade</span>
        </div>

        {/* REMOVIDO 11/11/2026: o dono riscou os "em breve" no print — promessa de
            comunidade na tela não fica. O estado honesto segue na barra de baixo. */}
      </div>

      {/* a MESMA barra de baixo do saldo, agora com a informação honesta: sem
          número inventado, só o estado. */}
      <div className="absolute bottom-[18px] left-[18px] right-[18px] flex items-center gap-2.5 text-[12px]">
        <span className="h-1.5 w-1.5 rounded-full bg-dash-muted" />
        <span className="public-sans text-dash-muted">sem skills da comunidade ainda</span>
      </div>
    </section>
  );
}

/* ── TOP CRIADORES DA COMUNIDADE (espelho de "Destaques") ───────────────────
   Mesma grade de 4 linhas e o MESMO avatar do template (4a796.svg). Como a
   comunidade ainda não existe, o corpo é um espaço estruturado com o estado
   honesto em vez de nomes inventados. */
function TopCriadores() {
  return (
    <section data-top-criadores className="min-w-0 pt-2 text-dash-fg">
      <header className="mb-[14px] flex items-center justify-between">
        <h2 className="text-[14px] font-bold">Top criadores da comunidade</h2>
      </header>

      <div className="space-y-[10px]">
        {/* as 3 linhas usam o avatar do template, mas SEM nome — nada de criador
            inventado: são a silhueta do que vai aparecer, não conteúdo falso. */}
        {[0, 1, 2].map((k) => (
          <div key={k} className="grid grid-cols-[43px_1fr_auto] items-center gap-[9px] opacity-40">
            <img src={`${A}/4a796.svg`} alt="" className="h-[43px] w-[43px]" />
            <div className="min-w-0">
              <span className="block h-[9px] w-[58%] rounded-full bg-dash-raise" />
              <span className="mt-[7px] block h-[7px] w-[36%] rounded-full bg-dash-line" />
              {/* 11/11/2026: o selo "em breve" saiu — o dono riscou no print. A
                  linha segue como SILHUETA do que virá, sem crachá de promessa. */}
            </div>
          </div>
        ))}
      </div>

      {/* REMOVIDO 11/11/2026 (riscado no print pelo dono): o parágrafo que prometia
          "A comunidade abre em breve — aqui vão aparecer os criadores das skills
          compartilhadas". As silhuetas acima falam por si. */}
    </section>
  );
}

/* ── Faixa de ORIGENS — REMOVIDA (08/10/2026). O dono pediu que a Synapse não
   diga quem fez nem de onde veio: as skills aparecem como skills, ponto. A
   separação "o que é meu" fica na seção MINHAS SKILLS (que continua com
   criar/editar/apagar). Os blocos "Skills da comunidade" e "Top criadores"
   seguem como estão — SEM os "em breve", riscados pelo dono em 11/11/2026. */

/* ── CARD de skill do catálogo (espelho do card de integração) ──────────────
   Mesma altura/faixa horizontal do catálogo de Integrações. Skills não têm logo
   de marca, então no lugar da arte entra o MONOGRAMA (a inicial) sobre o laranja
   da marca — nada de arte inventada. O nome, a categoria, a DESCRIÇÃO HONESTA e
   a origem ficam no cartão; "usar como base" faz a cópia para a conta. */
/* CardSkill saiu daqui para `@/components/dash/skill-cards` (importado no
   topo): a grade /dashboard/skills desenha O MESMO card. */

/* ── CARD de UMA skill da conta (a linha de "Minhas skills") ─────────────── */
function CardMinhaSkill({
  skill,
  tema,
  ocupado,
  onEditar,
  onApagar,
  onAbrir,
}: {
  skill: SkillCliente;
  /** TEMA do ORIGINAL, casado pelo `base` — a linha da conta não guarda tema. */
  tema?: string | null;
  ocupado: boolean;
  onEditar: (s: SkillCliente) => void;
  onApagar: (s: SkillCliente) => void;
  /** o cartão ABRE o detalhe (08/10/2026). */
  onAbrir: () => void;
}) {
  return (
    <div
      data-skill={skill.nome}
      data-skill-origem="do-cliente"
      data-skill-cliente-id={skill.id}
      role="button"
      tabIndex={0}
      aria-label={`Abrir ${nomeDaSkill(skill.nome)}`}
      onClick={onAbrir}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onAbrir();
        }
      }}
      className="flex cursor-pointer flex-col gap-2.5 rounded-[14px] border border-dash-hair/[0.05] bg-dash-side px-5 py-4 transition hover:border-dash-brand/30 hover:bg-dash-raise focus:outline-none focus-visible:ring-2 focus-visible:ring-dash-brand/60"
    >
      <div className="min-w-0">
        {/* MESMA FAMÍLIA DO CARD DO CATÁLOGO (08/10/2026): o tema em caixa alta
            discreta abre o cartão aqui também. Vem do original (casado pelo
            `base`), porque a linha da conta não guarda tema próprio. */}
        {tema && (
          <span className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-dash-brandHi/90">
            {rotuloTema(tema)}
          </span>
        )}
        <div className={`${tema ? "mt-[3px]" : ""} flex flex-wrap items-center gap-2.5`}>
          {/* TÍTULO HUMANO; o `data-skill` e o `title` guardam o nome REAL
              (é o que casa busca/DB) — display só. O selo "do cliente" saiu
              (08/10/2026): a seção "Minhas skills" já diz que é da conta. */}
          <p className="text-[12.5px] font-semibold text-dash-fg" title={skill.nome}>
            {nomeDaSkill(skill.nome)}
          </p>
        </div>
        <p className="mt-1 text-[12px] leading-[1.55] text-dash-muted">
          {descricaoLimpa(skill.descricao) ?? <span className="italic text-dash-dim">sem descrição</span>}
        </p>
        {skill.base && (
          <p className="mt-1 text-[10.5px] text-dash-dim">
            a partir de{" "}
            <span className="text-dash-fg/60" title={skill.base}>
              {nomeDaSkill(skill.base)}
            </span>{" "}
            — o original segue intacto e não muda.
          </p>
        )}
      </div>

      {/* AÇÕES EM TEXTO, NÃO EM PÍLULA (08/10/2026): a pílula com borda era o
          mesmo marcador de template que o dono reprovou no card do catálogo.
          Rodapé com fio, ações à direita — a mesma família do card do catálogo
          (antes a linha quebrava e as ações caíam soltas embaixo). */}
      <div className="flex shrink-0 items-center justify-end gap-3.5 border-t border-dash-hair/[0.06] pt-2.5">
        <button
          type="button"
          data-skill-editar={skill.id}
          onClick={(e) => {
            e.stopPropagation();
            onEditar(skill);
          }}
          className="text-[10.5px] text-dash-muted transition hover:text-dash-fg hover:underline"
        >
          editar
        </button>
        <button
          type="button"
          data-skill-apagar={skill.id}
          disabled={ocupado}
          onClick={(e) => {
            e.stopPropagation();
            onApagar(skill);
          }}
          className="text-[10.5px] text-dash-bad/85 transition hover:text-dash-bad hover:underline disabled:opacity-40"
        >
          apagar
        </button>
      </div>
    </div>
  );
}

/* ── A TELA ──────────────────────────────────────────────────────────────── */
export default function SkillsEspelho() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [minhas, setMinhas] = useState<SkillCliente[]>([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState<string>(TODAS);
  /* O catálogo abre LIMITADO (10 cartões). O "Ver todas as skills" não infla
     mais a própria página: é um atalho, AO LADO DA BUSCA, para a GRADE
     dedicada /dashboard/skills (espelho das Integrações, 08/10/2026). */

  /* O CARD abre o DETALHE (08/10/2026): visão na própria página, na linguagem do
     app, com o NOME, a DESCRIÇÃO COMPLETA, o tema/origem e a AÇÃO. Fecha com
     Esc ou clique fora. */
  const [detalhe, setDetalhe] = useState<
    { tipo: "catalogo"; skill: Skill } | { tipo: "cliente"; skill: SkillCliente } | null
  >(null);

  const [formAberto, setFormAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [campoNome, setCampoNome] = useState("");
  const [campoDescricao, setCampoDescricao] = useState("");
  const [campoInstrucoes, setCampoInstrucoes] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState("");

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

  /* O CONJUNTO VISÍVEL do catálogo: SÓ as skills NOVAS curadas (SKILLS_NOVAS).
     A BASE da Mirai (as ~157 lidas do disco) continua carregada e funcional por
     baixo (o "usar como base" e o copy-on-demand seguem valendo), mas NÃO é
     exibida nem achada pela busca deste painel — regra FINAL do dono (08/10/2026).
     Hoje a curadoria está VAZIA: o catálogo visível aparece vazio, com texto
     honesto. Ver src/lib/skills-novas.ts. */
  const novas = useMemo(() => skills.filter((s) => ehSkillNova(s.nome)), [skills]);

  /* Os TEMAS reais do CONJUNTO VISÍVEL viram os chips de filtro, na ORDEM
     canônica e só os que têm ao menos uma skill visível atrás. */
  const temas = useMemo(() => {
    const presentes = new Set(novas.map((k) => k.tema || SEM_TEMA));
    const lista: string[] = TEMAS_ORDEM.filter((t) => presentes.has(t));
    if (presentes.has(SEM_TEMA)) lista.push(SEM_TEMA);
    return lista;
  }, [novas]);

  /* Filtro dos cartões:
     - SEM busca: o chip de TEMA manda (ou "Todas").
     - COM busca: procura no CATÁLOGO INTEIRO, ignorando o chip — é assim que
       "pen test" acha SEGURANÇA mesmo com outro tema selecionado. A busca roda
       sobre nome + descrição + tema + apelidos do tema + pasta, sem acento e
       sem caixa (ver textoBuscaSkill / normalizarBusca). */
  const filtrados = useMemo(() => {
    const termos = normalizarBusca(busca).split(/\s+/).filter(Boolean);
    return novas.filter((s) => {
      if (!termos.length) return categoria === TODAS || (s.tema || SEM_TEMA) === categoria;
      const alvo = normalizarBusca(textoBuscaSkill(s));
      return termos.every((t) => alvo.includes(t));
    });
  }, [novas, busca, categoria]);

  /* O que se vê agora: o limite de fachada, ou o conjunto completo. */
  /* O que se vê NESTE painel: o limite de fachada (10). O catálogo inteiro em
     grade vive em /dashboard/skills, aberto pelo atalho ao lado da busca. */
  const visiveis = useMemo(() => filtrados.slice(0, LIMITE_CATALOGO), [filtrados]);

  /* Quais skills do ECOSSISTEMA já viraram cópia nesta conta — é o estado que o
     dono pediu para ver NO CARD ("na sua conta"), sem ter de descer até
     "Minhas skills". Sai de `minhas[].base`, o dado real. */
  const basesNaConta = useMemo(
    () => new Set(minhas.map((m) => m.base).filter((b): b is string => Boolean(b))),
    [minhas],
  );

  /* Tema do ORIGINAL por nome — a linha da conta não guarda tema próprio; o
     cartão de "Minhas skills" mostra o tema do original casando pelo `base`. */
  const temaPorNome = useMemo(
    () => new Map(skills.map((s) => [s.nome, s.tema || SEM_TEMA])),
    [skills],
  );

  const minhasFiltradas = useMemo(() => {
    const termos = normalizarBusca(busca).split(/\s+/).filter(Boolean);
    if (!termos.length) return minhas;
    return minhas.filter((s) => {
      // Busca casa o nome REAL e o TÍTULO legível (dos dois jeitos).
      const alvo = normalizarBusca(
        `${s.nome} ${nomeDaSkill(s.nome)} ${s.descricao || ""} ${s.base || ""}${
          s.base ? " " + nomeDaSkill(s.base) : ""
        }`,
      );
      return termos.every((t) => alvo.includes(t));
    });
  }, [minhas, busca]);

  /* ── Ações de escrita (SEMPRE escritas por esta conta) ─────────────── */

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
      const ok = window.confirm(`Apagar a skill “${nomeDaSkill(s.nome)}”? Isto não volta.`);
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
        setAvisoAcao(`Skill “${nomeDaSkill(s.nome)}” apagada.`);
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
        setAvisoAcao(`“${nomeDaSkill(nome)}” virou uma skill da sua conta — o original segue intacto.`);
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
    <div>
      {erro && (
        <p
          data-skills-erro
          className="mb-5 rounded-[16px] border border-[#ff2d55]/30 bg-[#ff2d55]/[0.07] px-5 py-4 text-[13px] text-[#ff2d55]"
        >
          {erro}
        </p>
      )}

      {/* ── 11/11/2026 (dono, em duas rodadas): a aba Skills fica SEM TOPO — nem
             hero, nem blocos de comunidade. Primeiro saíram os dois blocos;
             depois o próprio hero ("Suas skills, no comando" + os dois botões),
             com print em cima dele: "ainda tem aqui". Aqui ficava a grade de 3
             colunas copiada das Integrações; o que a aba entrega começa agora
             direto no CATÁLOGO, abaixo do fio. As três funções (`BannerSkills`,
             `SkillsDaComunidade`, `TopCriadores`) seguem no arquivo, sem uso,
             para voltarem em uma linha se o dono quiser. ──────────────────── */}

      {/* 11/11/2026 (dono): a LINHA divisória saiu — ela cortava o slide logo acima
          do catálogo ("tira essa linha tbm que dividia o slide"). O que a aba
          entrega agora começa direto no catálogo, sem fio atravessado. */}

      {/* ── O CATÁLOGO (espelho do catálogo de Integrações): título, contagem,
             busca, chips de categoria e a faixa de cartões ─────────────── */}
      <section id="catalogo-skills" className="mt-5 scroll-mt-6">
        <div className="flex flex-wrap items-center gap-5">
          <h2 className="text-[20px] font-bold text-dash-fg">Skills</h2>
          {/* A contagem reflete o CONJUNTO VISÍVEL (as novas curadas) — nunca a
              base oculta, nunca as 157 fantasma. `data-skills-base` guarda o
              total real da base só para inspeção (invisível na tela). */}
          <span
            data-skills-total={novas.length}
            data-skills-base={total}
            className="text-[13px] text-dash-muted"
          >
            {carregando
              ? "lendo…"
              : novas.length === 0
                ? "nenhuma ainda"
                : `${filtrados.length} de ${novas.length}`}
          </span>
          {busca.trim() && (
            <span data-busca-escopo="catalogo-visivel" className="text-[11px] text-dash-dim">
              buscando nas novas skills
            </span>
          )}
          {/* busca + atalho da GRADE completa, juntos no canto direito — o
              "Ver todas as skills" fica AO LADO DA BUSCA (espelho exato do lado
              Integrações, 08/10/2026). O atalho leva a /dashboard/skills, onde
              o catálogo aparece em grade. */}
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <label className="hidden h-[30px] w-[209px] items-center rounded-full bg-dash-side px-4 md:flex">
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                data-skills-busca
                placeholder="Buscar"
                className="min-w-0 flex-1 bg-transparent text-[10px] italic text-dash-fg outline-none placeholder:text-dash-muted"
              />
              <img src={`${A}/3c6cf.svg`} alt="" className="h-[13px] w-[13px]" />
            </label>
            <Link
              href="/dashboard/skills"
              data-ver-todas-skills
              title="Ver o catálogo de skills inteiro em grade"
              className="rounded-[10px] border border-dash-hair/12 px-4 py-2 text-[12px] text-dash-muted transition hover:text-dash-fg"
            >
              Ver todas as skills ({novas.length})
            </Link>
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

        {carregando && !skills.length ? (
          <p className="mt-[27px] text-[12.5px] text-dash-muted">Lendo as skills no disco…</p>
        ) : novas.length === 0 ? (
          /* A BASE DA MIRAI NÃO APARECE (regra FINAL, 08/10/2026): o catálogo
             visível lista só as skills NOVAS curadas — e ainda não há nenhuma.
             Estado honesto: sem skill inventada, sem contagem falsa, sem as 157
             fantasma. As novas chegam como SKILL.md reais com a marca de
             curadoria (ver src/lib/skills-novas.ts). */
          <div data-skills-novas-vazio className="mt-[27px]">
            <Vazio
              icone={<IconeSkills className="h-7 w-7" />}
              titulo="As novas skills da Mirai aparecem aqui"
              texto="Ainda não há nenhuma nova na curadoria. As novas skills — design, front-end e programação — aparecem aqui assim que entrarem. A parte de baixo (o que o assistente já usa) continua funcionando normalmente."
            />
          </div>
        ) : filtrados.length === 0 ? (
          <div className="mt-[27px]">
            <Vazio
              icone={<IconeSkills className="h-7 w-7" />}
              titulo={busca.trim() ? "Nada bate com essa busca" : "Nada neste tema ainda"}
              texto="Escolha outro tema nos chips acima, ou limpe a busca."
            />
          </div>
        ) : (
          <>
            <div
              data-skills-visiveis={visiveis.length}
              className="mt-[27px] flex gap-[18px] overflow-x-auto pb-2"
            >
              {visiveis.map((s) => (
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
            {/* o "Ver todas" saiu daqui: virou atalho ao lado da busca e leva à
                grade /dashboard/skills. */}
            <p className="mt-3 text-[11px] text-dash-dim">
              {filtrados.length > LIMITE_CATALOGO
                ? `mostrando ${visiveis.length} de ${filtrados.length} — o catálogo inteiro está em “Ver todas as skills”`
                : `mostrando ${visiveis.length} de ${filtrados.length}`}
            </p>
          </>
        )}
      </section>

      {/* ── MINHAS SKILLS (espelho de "Minhas integrações"): título + contagem
             REAL + "Nova skill" + "atualizar" + as skills DESTA conta ─────── */}
      <section className="mt-[30px]">
        <div className="mb-[19px] flex flex-wrap items-center gap-5">
          <h2 className="text-[20px] font-bold text-dash-fg">Minhas skills</h2>
          <span className="text-[13px] text-dash-muted">{minhas.length} nesta conta</span>
          <div className="ml-auto flex items-center gap-3">
            <button
              type="button"
              onClick={abrirNova}
              data-skill-nova
              className="rounded-[10px] bg-dash-brand px-4 py-2 text-[12px] font-semibold text-dash-fg transition hover:bg-[#ff2d55]"
            >
              Nova skill
            </button>
            <button
              type="button"
              onClick={() => void carregar()}
              className="rounded-[10px] border border-dash-hair/12 px-4 py-2 text-[12px] text-dash-muted transition hover:text-dash-fg"
            >
              atualizar
            </button>
          </div>
        </div>

        {avisoAcao && (
          <p data-acao-aviso className="mb-3 text-[12.5px] leading-[1.6] text-dash-ok">
            {avisoAcao}
          </p>
        )}
        {erroAcao && (
          <p data-acao-erro className="mb-3 text-[12.5px] leading-[1.6] text-dash-bad">
            {erroAcao}
          </p>
        )}

        {carregando && !minhas.length ? (
          <p className="text-[12px] text-dash-dim">Lendo as skills desta conta...</p>
        ) : minhas.length === 0 ? (
          <Vazio
            icone={<IconeSkills className="h-7 w-7" />}
            titulo="Nenhuma skill sua ainda"
            texto="Crie a sua com “Nova skill” ou use “usar como base” numa skill do ecossistema — a cópia nasce na sua conta e o original não muda."
          />
        ) : minhasFiltradas.length === 0 ? (
          <p className="text-[12.5px] text-dash-muted">Nada bate com essa busca.</p>
        ) : (
          <div className="space-y-2">
            {minhasFiltradas.map((s) => (
              <CardMinhaSkill
                key={s.id}
                skill={s}
                tema={s.base ? temaPorNome.get(s.base) : undefined}
                ocupado={ocupado}
                onEditar={abrirEdicao}
                onApagar={apagar}
                onAbrir={() => setDetalhe({ tipo: "cliente", skill: s })}
              />
            ))}
          </div>
        )}
      </section>

      {/* A faixa "Origens das skills" foi REMOVIDA (08/10/2026): a Synapse não diz
          quem fez nem de onde veio. A separação do que é da conta fica em
          "Minhas skills", acima. A AUTORIA agora aparece só no DETALHE, e só
          quando a skill é nossa: "criada por Mirai" com a marca (dono, 08/10). */}

      {detalhe && (
        <DetalheSkill
          detalhe={detalhe}
          ocupado={ocupado}
          criador={criadorDaSkill(detalhe, skills)}
          onFechar={() => setDetalhe(null)}
          onUsarComoBase={usarComoBase}
          onEditar={(s) => {
            setDetalhe(null);
            abrirEdicao(s);
          }}
          onApagar={(s) => {
            setDetalhe(null);
            void apagar(s);
          }}
        />
      )}

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
    </div>
  );
}

/* DetalheSkill saiu daqui para `@/components/dash/skill-cards` (importado no
   topo). Os callbacks onEditar/onApagar seguem sendo passados abaixo. */

/* ── Formulário de skill (NOME / DESCRIÇÃO / INSTRUÇÕES) ─────────────────────
   Mesmo formulário e mesma regra de sempre: skill é TEXTO; nunca credencial. */
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
    "w-full rounded-[10px] border border-dash-hair/10 bg-dash-bg px-4 py-2.5 text-[13px] text-dash-fg outline-none placeholder:text-dash-dim focus:border-dash-brand/60";

  return (
    <div
      ref={overlay}
      onClick={(e) => {
        if (e.target === overlay.current) onFechar();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onFechar();
      }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-dash-scrim/55 px-4 backdrop-blur-md"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={editando ? "Editar skill" : "Nova skill"}
        data-skill-form
        className="relative max-h-[90vh] w-full max-w-[560px] overflow-y-auto rounded-[30px] border border-dash-hair/[0.18] p-7 text-dash-fg"
        style={VIDRO}
      >
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar"
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-[10px] text-dash-fg/70 transition hover:bg-dash-hair/[0.12] hover:text-dash-fg"
        >
          <IconeFechar className="h-4 w-4" />
        </button>

        <header className="flex items-center gap-3.5 pr-10">
          <span className="grid h-11 w-11 place-items-center rounded-[14px] bg-dash-brand/80">
            <IconeSkills className="h-5 w-5 text-dash-fg" />
          </span>
          <div>
            <p className="text-[17px] font-semibold text-dash-fg">
              {editando ? "Editar skill" : "Nova skill"}
            </p>
            <p className="mt-0.5 text-[12px] text-dash-fg/60">
              Instruções que a sua Mirai segue. É só texto — nada de código roda a partir daqui.
            </p>
          </div>
        </header>

        <div className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-[11px] uppercase tracking-[0.16em] text-dash-muted">
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
            <span className="mb-1.5 block text-[11px] uppercase tracking-[0.16em] text-dash-muted">
              Descrição <span className="normal-case text-dash-dim">(o que é, curta)</span>
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
            <span className="mb-1.5 block text-[11px] uppercase tracking-[0.16em] text-dash-muted">
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

        <p
          data-aviso-sem-segredo
          className="mt-5 rounded-[12px] border border-dash-brand/30 bg-dash-brand/[0.07] px-4 py-3 text-[11.5px] leading-[1.6] text-dash-brandHi"
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
            className="rounded-[10px] border border-dash-hair/[0.20] px-5 py-2.5 text-[12px] font-semibold text-dash-fg/80 transition hover:text-dash-fg"
          >
            cancelar
          </button>
          <button
            type="button"
            onClick={onSalvar}
            disabled={salvando}
            data-skill-salvar
            className="rounded-[10px] bg-dash-brand px-6 py-2.5 text-[12px] font-semibold text-dash-fg transition hover:bg-[#ff2d55] disabled:opacity-40"
          >
            {salvando ? "salvando…" : editando ? "salvar" : "criar skill"}
          </button>
        </div>
      </div>
    </div>
  );
}
