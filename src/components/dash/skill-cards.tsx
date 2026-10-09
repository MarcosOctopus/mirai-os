"use client";

/* ── Cards e detalhe de skill (extraídos de SkillsEspelho, 08/10/2026) ─────
 *
 * Viviam DENTRO de `src/components/dash/SkillsEspelho.tsx`. Saíram para cá,
 * verbatim, quando nasceu a página `/dashboard/skills` ("ver todas" em grade):
 * as duas telas desenham O MESMO card e o MESMO detalhe. Nada foi redesenhado —
 * só o visual da Synapse continua sendo o mesmo (o detalhe ganhou callbacks
 * OPCIONAIS, para a grade poder abrir o detalhe de uma skill do catálogo sem
 * oferecer editar/apagar, que são de skill DA CONTA).
 */

/* eslint-disable @next/next/no-img-element */

import { useRef } from "react";

import { VIDRO } from "@/lib/vidro";
import { IconeCheck, IconeFechar, IconeSemFoto } from "@/components/dash/icons";
import { SEM_TEMA, rotuloTema } from "@/lib/skills-temas";
import { descricaoLimpa, nomeDaSkill } from "@/lib/skills-titulo";

export type Skill = {
  nome: string;
  descricao: string | null;
  categoria: string;
  tema?: string;
  /** origem da skill; ausente/"nossa" = do ecossistema (o selo só aparece quando NÃO é "nossa"). */
  origem?: string;
  /** Veio da biblioteca do ECOSSISTEMA (true) ou de pacote de fora (false)?
   *  Quem é nosso ganha o criador "Mirai" no detalhe; o de fora fica SEM autoria
   *  (a tela não inventa quem fez). Vem do /api/skills (skills-lista.ts). */
  nossa?: boolean;
};

/** Skill DA CONTA (texto que o assistente segue; nunca credencial). */
export type SkillCliente = {
  id: string;
  nome: string;
  descricao: string | null;
  instrucoes: string;
  base: string | null;
  criada_em: string;
  atualizada_em: string;
};

/* A função `inicial()` saiu em 08/10/2026: ela alimentava o quadrado laranja com
   a letra — o último lugar que ainda o usava era o topo do popup de detalhe, e o
   dono mandou tirar ("tira essa caixa laranja com a letra branca"). Ficou sem uso;
   código morto não fica. */

/* ── O CARD de skill (redesenhado, 08/10/2026) ─────────────────────────────
   O dono reprovou o anterior — "mto cara de AI". O que dava esse ar era o
   combo clássico de template: QUADRADO COLORIDO COM A INICIAL no canto e um
   BOTÃO-PÍLULA flutuando. Os dois saíram.

   O desenho agora é editorial/técnico, tudo com token do app:
     • CABEÇALHO — o TEMA em caixa alta discreta à esquerda e a PASTA em mono
       à direita (o "onde vive" da skill; informação real, não enfeite);
     • FIO da marca de 2px na aresta esquerda, que cresce no hover — o MESMO
       motivo do item ativo do menu (não é glow inventado);
     • NOME em Public Sans semibold, entrelinha apertada; descrição em muted;
     • RODAPÉ com fio fino e a ação como TEXTO com seta (não pílula);
     • ESTADO no lugar da ação quando já existe cópia na conta: "na sua conta"
       com o check — o dono pediu isso em cima, sem ter de olhar "Minhas skills".
*/
export function CardSkill({
  skill,
  ocupado,
  naConta = false,
  onUsarComoBase,
  onAbrir,
}: {
  skill: Skill;
  ocupado: boolean;
  /** já existe uma cópia DESTA skill na conta? (vem de `minhas[].base`) */
  naConta?: boolean;
  onUsarComoBase: (nome: string) => void;
  /** o cartão ABRE o detalhe (08/10/2026) — clique/Enter/Espaço. */
  onAbrir: () => void;
}) {
  const titulo = nomeDaSkill(skill.nome);
  return (
    <article
      data-skill={skill.nome}
      data-skill-na-conta={naConta ? "sim" : "nao"}
      role="button"
      tabIndex={0}
      aria-label={`Abrir ${titulo}`}
      onClick={onAbrir}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onAbrir();
        }
      }}
      className="group relative flex h-[176px] w-[214px] shrink-0 cursor-pointer flex-col overflow-hidden rounded-[14px] border border-white/[0.07] bg-dash-card p-4 text-white transition duration-200 hover:-translate-y-[2px] hover:border-dash-brand/40 hover:bg-[#1a1c1f] focus:outline-none focus-visible:ring-2 focus-visible:ring-dash-brand/60"
    >
      {/* o fio da marca na aresta — cresce no hover */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-[2px] origin-top scale-y-0 bg-dash-brand transition-transform duration-200 group-hover:scale-y-100"
      />

      {/* CABEÇALHO: só o TEMA, em caixa alta discreta. A PASTA saiu daqui
          (08/10/2026): o dono matou os selos de origem e "arquiteto-craft" no
          canto lia como CRÉDITO. "Onde a skill vive" fica no `title`, para quem
          passar o mouse, não na cara do cartão. */}
      <span
        className="truncate text-[9.5px] font-semibold uppercase tracking-[0.18em] text-dash-brandHi/90"
        title={`${rotuloTema(skill.tema)} · pasta: ${skill.categoria}`}
      >
        {rotuloTema(skill.tema)}
      </span>

      {/* TÍTULO HUMANO: o cartão mostra "Mirai OS App", não o slug
          "mirai-os-app". O `title` guarda o nome REAL — display só. */}
      <p
        className="mt-[9px] line-clamp-2 text-[13px] font-semibold leading-[1.25] tracking-[-0.01em] text-white"
        title={skill.nome}
      >
        {titulo}
      </p>

      <p className="mt-1.5 line-clamp-3 text-[11px] leading-[1.5] text-dash-muted">
        {descricaoLimpa(skill.descricao) ?? (
          <span className="italic text-dash-dim">sem descrição no arquivo</span>
        )}
      </p>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-white/[0.06] pt-2.5">
        {naConta ? (
          <span
            data-skill-estado="na-conta"
            title="A cópia já está na sua conta — a original segue intacta."
            className="flex items-center gap-1.5 text-[10px] text-dash-ok"
          >
            <IconeCheck className="h-3 w-3" />
            na sua conta
          </span>
        ) : (
          <button
            type="button"
            data-skill-base={skill.nome}
            disabled={ocupado}
            onClick={(e) => {
              e.stopPropagation();
              onUsarComoBase(skill.nome);
            }}
            title="Cria uma cópia desta skill na sua conta — o original não muda."
            className="flex items-center gap-1.5 text-[10px] text-dash-muted transition hover:text-white disabled:opacity-40"
          >
            usar como base
            <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-[2px]">
              →
            </span>
          </button>
        )}
      </div>
    </article>
  );
}

/* ── DETALHE da skill (08/10/2026) ──────────────────────────────────────────
   O clique num card abre ESTA visão, na própria página e na linguagem do app:
   o NOME (humano) em destaque, a DESCRIÇÃO COMPLETA (o que ela é/faz), o tema e
   a pasta, e a AÇÃO. Para skill do ecossistema (catálogo), a ação é
   "usar como base"; para skill da conta, editar/apagar. Fecha com Esc ou clique
   fora; o teclado funciona. Nunca toca em credencial — é texto, ponto. */
export type Detalhe =
  | { tipo: "catalogo"; skill: Skill }
  | { tipo: "cliente"; skill: SkillCliente };

export function DetalheSkill({
  detalhe,
  ocupado,
  criador = null,
  onFechar,
  onUsarComoBase,
  onEditar,
  onApagar,
}: {
  detalhe: Detalhe;
  ocupado: boolean;
  /** Quem FEZ a skill, quando é nossa: `"mirai"` mostra a autoria (com a marca).
   *  `null` = não mostrar autoria — o de fora não ganha crédito inventado.
   *  Quem decide é a TELA (sabe a origem do catálogo e o `base` da cópia). */
  criador?: "mirai" | null;
  onFechar: () => void;
  onUsarComoBase: (nome: string) => void;
  /** só a tela da CONTA oferece editar/apagar; sem eles, os botões não saem. */
  onEditar?: (s: SkillCliente) => void;
  onApagar?: (s: SkillCliente) => void;
}) {
  const overlay = useRef<HTMLDivElement>(null);
  const nome = detalhe.skill.nome;
  const titulo = nomeDaSkill(nome);
  const descricao = descricaoLimpa(detalhe.skill.descricao);
  const catalogo = detalhe.tipo === "catalogo";
  const tema = catalogo ? detalhe.skill.tema || SEM_TEMA : null;
  const categoria = catalogo ? detalhe.skill.categoria : null;
  const base = catalogo ? null : detalhe.skill.base;

  return (
    <div
      ref={overlay}
      data-skill-detalhe={nome}
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
        aria-label={`Detalhe da skill ${titulo}`}
        className="relative max-h-[90vh] w-full max-w-[560px] overflow-y-auto rounded-[30px] border border-white/[0.18] p-7 text-white"
        style={VIDRO}
      >
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar"
          autoFocus
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-[10px] text-white/70 transition hover:bg-white/[0.12] hover:text-white"
        >
          <IconeFechar className="h-4 w-4" />
        </button>

        {/* Cabeçalho SEM o quadrado laranja com a inicial (dono, 08/10/2026): "tira
            essa caixa laranja com a letra branca. e tras o escrito do nome alinhado
            aqui na esquerda". O nome abre a linha, encostado na margem do card. */}
        <header className="pr-10">
          <p data-detalhe-nome className="text-[18px] font-semibold text-white" title={nome}>
            {titulo}
          </p>
          <p className="mt-1 text-[11px] text-white/50">
            <span className="font-mono">{nome}</span>
          </p>
        </header>

        {/* CRIADOR (dono, 08/10/2026) — o detalhe tem SEMPRE a mesma forma:
              · skill NOSSA → frame redondo com a marca da Mirai, "criada por Mirai";
              · sem autor   → a carinha cinza de quem não tem foto, "sem autor".
            Nada de crédito inventado: pacote de fora não vira autoria de ninguém. */}
        <div
          data-detalhe-criador={criador === "mirai" ? "mirai" : "sem-autor"}
          className="mt-4 flex items-center gap-3"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-white/[0.15] bg-white/[0.06]">
            {criador === "mirai" ? (
              <img
                src="/logo-mirai-marca.png"
                alt="Mirai"
                className="h-full w-full object-cover"
              />
            ) : (
              <IconeSemFoto className="h-full w-full" />
            )}
          </span>
          <div className="min-w-0 leading-tight">
            <p className="text-[10px] uppercase tracking-[0.16em] text-[#8f939a]">criada por</p>
            <p
              className={
                criador === "mirai"
                  ? "text-[13.5px] font-semibold text-white"
                  : "text-[13px] text-[#83878f]"
              }
            >
              {criador === "mirai" ? "Mirai" : "sem autor"}
            </p>
          </div>
        </div>

        {/* tema / pasta (internos) — sem IDENTIDADE DE ORIGEM (08/10/2026) */}
        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          {tema && (
            <span
              data-detalhe-tema={tema}
              className="rounded-full bg-white/[0.16] px-3 py-[5px] text-[11px] font-semibold uppercase tracking-[0.14em] text-white"
            >
              {tema}
            </span>
          )}
          {categoria && (
            <span className="rounded-full bg-white/[0.08] px-3 py-[5px] text-[11px] text-white/70">
              pasta: {categoria}
            </span>
          )}
        </div>

        {/* DESCRIÇÃO COMPLETA — o que a skill é/faz (nada inventado) */}
        <div className="mt-5">
          <p className="mb-1.5 text-[11px] uppercase tracking-[0.16em] text-[#8f939a]">
            O que ela faz
          </p>
          <p data-detalhe-descricao className="text-[13.5px] leading-[1.6] text-white/90">
            {descricao ?? <span className="italic text-white/50">sem descrição no arquivo (frontmatter sem description)</span>}
          </p>
        </div>

        {base && (
          <p className="mt-4 text-[11.5px] text-white/60">
            a partir de <span className="font-mono">{nomeDaSkill(base)}</span> — o original segue
            intacto e não muda.
          </p>
        )}

        <div className="mt-7 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={onFechar}
            className="rounded-[10px] border border-white/[0.20] px-5 py-2.5 text-[12px] font-semibold text-white/80 transition hover:text-white"
          >
            fechar
          </button>
          {catalogo ? (
            <button
              type="button"
              data-detalhe-acao="usar-como-base"
              disabled={ocupado}
              onClick={() => {
                onUsarComoBase(nome);
                onFechar();
              }}
              className="rounded-[10px] bg-[#ff751f] px-6 py-2.5 text-[12px] font-semibold text-white transition hover:bg-[#ff2d55] disabled:opacity-40"
            >
              usar como base
            </button>
          ) : (
            <>
              {onEditar && (
                <button
                  type="button"
                  data-detalhe-acao="editar"
                  onClick={() => onEditar(detalhe.skill as SkillCliente)}
                  className="rounded-[10px] border border-white/[0.20] px-5 py-2.5 text-[12px] font-semibold text-white/80 transition hover:text-white"
                >
                  editar
                </button>
              )}
              {onApagar && (
                <button
                  type="button"
                  data-detalhe-acao="apagar"
                  disabled={ocupado}
                  onClick={() => onApagar(detalhe.skill as SkillCliente)}
                  className="rounded-[10px] border border-[#ff96a0]/40 px-5 py-2.5 text-[12px] font-semibold text-[#ff96a0] transition hover:bg-[#ff96a0]/10 disabled:opacity-40"
                >
                  apagar
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** QUEM FEZ a skill — UMA regra para as duas telas (nada de segunda verdade).
 *
 *  • skill do CATÁLOGO: `nossa` (vem da biblioteca do ecossistema) => "mirai";
 *  • skill DA CONTA: ganha autoria só quando o `base` dela é uma skill NOSSA
 *    (cópia de um padrão da Mirai). Criada do zero na conta => sem autoria.
 *  • pacote de fora: NUNCA ganha crédito — a tela não inventa autor.
 *
 *  O `catalogo` é a lista que a tela já tem em memória (o original da cópia sai
 *  dela pelo nome, o mesmo id do SKILL.md). */
export function criadorDaSkill(detalhe: Detalhe, catalogo: Skill[]): "mirai" | null {
  if (detalhe.tipo === "catalogo") return detalhe.skill.nossa ? "mirai" : null;
  const base = detalhe.skill.base;
  if (!base) return null;
  const alvo = base.trim().toLowerCase();
  const original = catalogo.find((s) => s.nome.trim().toLowerCase() === alvo);
  return original?.nossa ? "mirai" : null;
}
