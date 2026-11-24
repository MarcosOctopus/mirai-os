"use client";

/* /dashboard/connect — a aba INTEGRAÇÕES do MIRAI OS.
 *
 * PORTE FIEL do template ArtDash. O markup é o de
 * /opt/data/cache/scratch/artdash/src/App.tsx (a referência que o Marcos
 * mandou no print), copiado COMO ESTÁ: as MESMAS artes do zip, nas MESMAS
 * posições. Nada foi redesenhado:
 *   • o hero usa a arte real 474f3.svg (a imagem que preenche o banner) e o
 *     botão de canto é o 771d4.svg do zip;
 *   • o card de saldo usa os ícones reais d6b22.svg / c9864.svg / 7618a.svg e
 *     o gráfico b7da2.svg exatamente na posição original
 *     (bottom-[45px] right-[19px] h-[62px] w-[282px] + img h-[283px] w-[62px] rotate-90);
 *   • a lista lateral usa o avatar 4a796.svg do zip;
 *   • cada card de integração usa um card de leilão do zip como MOLDURA; o
 *     LOGO da integração vai DENTRO da área da imagem do card (o lugar da
 *     foto) e o NOME aparece UMA única vez, na faixa de baixo — não existe
 *     marca colada na lateral do nome;
 *   • a tabela mantém a arte do zip (6d39f.svg) e as setas bf424/8348b.svg.
 *
 * Os assets vivem em /public/artdash/ (cópias idênticas dos arquivos do zip).
 *
 * ═══ REGRA ÚNICA DE ESTADO (fonte da verdade DESTA tela) ══════════════════
 *
 * "Conectada" / "não conectada" é decidido em UM ÚNICO lugar:
 * `estaConectadaDaConta()` (mais abaixo). Os Destaques, os cards do catálogo, o
 * popup do produto e a tabela "Minhas integrações" chamam TODOS ela. Nenhuma
 * seção decide sozinha — por isso é impossível a MESMA integração aparecer
 * "ligada" numa seção e "não conectada" em outra (era o defeito de antes: o
 * catálogo lia uma coisa e os Destaques/tabela liam outra).
 *
 * De onde o estado sai, nessa ordem:
 *   1. as LINHAS de integração DESTA CONTA — GET /api/integracoes: `minhas`
 *      (as da pessoa) primeiro, `daEmpresa` como apoio. É o MESMO dado que o
 *      chat usa pelo resolutor único (src/lib/contexto-da-pessoa.ts);
 *   2. para o CRM, a confirmação AO VIVO — GET /api/integracoes/saaso, que
 *      resolve a credencial na MESMA ordem (pessoa -> empresa -> legado -> dono)
 *      e fala com o MCP do produto. Sem resposta do CRM, ele NÃO aparece
 *      conectado: nunca se finge conexão;
 *   3. por fim, o cofre DESTA CONTA (platform_config), onde OAuth (Drive,
 *      YouTube) e chaves de API ainda gravam. Entra na MESMA função para não
 *      abrir um segundo estado ao lado do primeiro.
 *
 * O clique no CARD abre o POPUP DO PRODUTO (logo, informações e a ação).
 * Só a ação leva adiante, com o comportamento de sempre: tipo mcp abre o
 * site; api com OAuth abre a rota; api com campos abre o popup de chave
 * (ModalApi) e salva por POST /api/auth/connect. E o CRM tem fluxo PRÓPRIO
 * (ModalCrm): pede a credencial crm_…, o SERVIDOR valida ao vivo e só então
 * grava a linha DA PESSOA (POST /api/integracoes, tipo 'crm').
 * O popup reusa o MESMO vidro do login (src/lib/vidro.ts).
 *
 * NENHUM botão desta tela é decorativo: onde não há caminho real (o Google
 * ainda não está configurado neste servidor, por exemplo), o botão aparece
 * como "indisponível" com o motivo — nunca um clique vazio.
 */

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import Shell from "@/components/dash/Shell";
import SeletorModo from "@/components/dash/SeletorModo";
import BarraDeAbas from "@/components/dash/BarraDeAbas";
import SkillsEspelho from "@/components/dash/SkillsEspelho";
import CosmicAgent from "@/components/dash/CosmicAgent";
import { Vazio } from "@/components/dash/kit";
import { IconeCadeado, IconeFechar, IconePlug } from "@/components/dash/icons";
import { VIDRO } from "@/lib/vidro";
import {
  CATALOGO,
  CATEGORIAS,
  COR_PADRAO_CARD,
  quandoLigou,
  type Integracao,
} from "@/lib/integracoes/catalogo";
import {
  ehCrm,
  estaConectadaNaConta,
  linhaDaContaEm,
  type LinhaIntegracao,
  type LinhasDaConta,
} from "@/lib/integracoes/estado-da-conta";
import { A, ARTES_CARD, CardIntegracao, Figura, Logo } from "@/components/dash/integracao-cards";

/* Quantos cartões o catálogo de integrações mostra DE CARA — mesmo número e
   mesmo padrão do lado Skills (espelho). O resto sai no botão "Ver todas as
   integrações". NENHUM cartão foi removido: os 21 continuam no catálogo e
   aparecem inteiros na visão completa, com o estado de cada um intacto. */
const LIMITE_CATALOGO = 10;

/* O CRM_ID, o `ehCrm`, o TIPO_DA_LINHA e a FONTE ÚNICA de estado agora vivem
   em `@/lib/integracoes/estado-da-conta`: esta tela e a grade
   `/dashboard/integracoes` chamam as MESMAS funções — não existe uma segunda
   regra de "o que está conectado". */

/* ── Tipos das nossas fontes reais ───────────────────────────────────── */

interface User {
  id: string | number;
  name: string;
  email: string;
  tenant_id?: string;
  platform_config?: Record<string, unknown>;
  ehDono?: boolean;
}

/* Uma linha de integração desta conta e o par minhas/daEmpresa vêm de
   `@/lib/integracoes/estado-da-conta` (importados acima). */

type Prontidao = Record<string, { pronta: boolean; motivo?: string }>;

interface LinhaUso {
  provedor: string;
  modelo?: string;
  tokens_entrada: number;
  tokens_saida: number;
  tokens_total: number;
  chamadas: number;
  custo: number | null;
}

interface ResumoUso {
  tokens_entrada: number;
  tokens_saida: number;
  tokens_total: number;
  chamadas: number;
  custo: number | null;
  por_provedor: LinhaUso[];
  por_modelo: LinhaUso[];
  medido: boolean;
  aviso: string | null;
  gerado_em: string;
  mes_corrente: { tokens_total: number; chamadas: number };
}

interface SaasoStatus {
  conectado?: boolean;
  ferramentas?: number;
  vinculado?: boolean;
  origem?: "pessoa" | "organizacao" | "dono" | null;
  erro?: string;
}

type Promocao = {
  titulo: string;
  texto: string;
  botaoPrimario: { label: string; href: string; externo?: boolean };
  botaoSecundario: { label: string; href: string; externo?: boolean };
};

/* Promoções reais entram aqui. Vazio = banner convida a explorar o catálogo. */
const PROMOCOES: Promocao[] = [];

/* ── util ────────────────────────────────────────────────────────────── */

function numero(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`;
  if (n >= 1_000) return `${(n / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`;
  return n.toLocaleString("pt-BR");
}

function dataCurta(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

/* As duas seções da Synapse (esta página): Integrações (o catálogo/estado de
   sempre, intacto) e Skills (o catálogo real do ecossistema, explicado). O
   seletor do cabeçalho troca entre as duas sem sair da rota. */
type SynapseAba = "cosmic" | "integracoes" | "skills";

/* Logo, Figura e CardIntegracao saíram daqui para
   `@/components/dash/integracao-cards` (importados no topo): a grade
   `/dashboard/integracoes` desenha O MESMO card. Nada foi redesenhado. */

/* ── Banner (o hero da referência: a arte 474f3.svg preenchendo o bloco) ─ */

const BANNER_PADRAO: Promocao = {
  titulo: "Suas integrações, no comando",
  texto:
    "Ligue as APIs e os MCPs que a Mirai usa no seu trabalho. Cada chave entra no cofre da sua conta e vale só para você — nada compartilhado entre organizações.",
  botaoPrimario: { label: "Explorar catálogo", href: "#catalogo" },
  botaoSecundario: { label: "Falar com a Mirai", href: "/chat" },
};

function Banner({ promocao }: { promocao: Promocao }) {
  /* mesma forma do h2 da referência: um trecho em negrito, um em itálico */
  const palavras = promocao.titulo.trim().split(/\s+/);
  const negrito = palavras.slice(0, 2).join(" ");
  const italico = palavras.length > 2 ? palavras[palavras.length - 1] : "";
  const meio = palavras.length > 3 ? palavras.slice(2, -1).join(" ") : "";

  return (
    <section className="relative h-[240px]">
      {/* a arte do hero do template (474f3.svg), no lugar exato */}
      <img src={`${A}/474f3.svg`} alt="" className="absolute inset-0 h-full w-full" />

      <div className="relative z-10 px-[51px] py-[25px]">
        <h2 className="max-w-[320px] text-[36px] leading-[1.35] text-dash-fg">
          <span className="font-bold">{negrito}</span>
          {meio && <> {meio} </>}
          {italico && <span className="font-italic">{italico}</span>}
        </h2>
        <div className="mt-[18px] flex gap-5">
          <a
            href={promocao.botaoPrimario.href}
            target={promocao.botaoPrimario.externo ? "_blank" : undefined}
            rel={promocao.botaoPrimario.externo ? "noreferrer" : undefined}
            className="rounded-[10px] bg-dash-brand px-5 py-2.5 text-[12px] font-semibold text-dash-fg transition hover:bg-[#ff2d55]"
          >
            {promocao.botaoPrimario.label}
          </a>
          <a
            href={promocao.botaoSecundario.href}
            target={promocao.botaoSecundario.externo ? "_blank" : undefined}
            rel={promocao.botaoSecundario.externo ? "noreferrer" : undefined}
            className="rounded-[10px] border border-dash-side px-5 py-2.5 text-[12px] text-dash-fg transition hover:bg-dash-scrim/10"
          >
            {promocao.botaoSecundario.label}
          </a>
        </div>
      </div>

      {/* o botão de canto é a arte do template (771d4.svg) */}
      <img src={`${A}/771d4.svg`} alt="" className="absolute bottom-0 right-0 h-[42px] w-[42px]" />
    </section>
  );
}

/* ── Uso de tokens (o "Your Balance" da referência, mesma caixa) ─────── */

function UsoTokens({
  resumo,
  carregando,
  falhou,
  recarregar,
}: {
  resumo: ResumoUso | null;
  carregando: boolean;
  falhou: boolean;
  recarregar: () => void;
}) {
  const medido = Boolean(resumo?.medido) && (resumo?.tokens_total ?? 0) > 0;

  return (
    <section className="relative h-[240px] overflow-hidden rounded-[30px] border border-dash-hair/70 bg-dash-card text-dash-fg">
      {/* os blobs do saldo: eram roxos no template, agora o laranja da marca */}
      <div className="absolute -right-8 -top-12 h-44 w-64 rounded-full bg-dash-brand blur-[34px]" />
      <div className="absolute right-24 top-10 h-20 w-32 rounded-full bg-[#ff2d55] blur-[25px]" />
      <div className="absolute inset-0 bg-gradient-to-br from-white/30 via-transparent to-transparent mix-blend-overlay" />

      <div className="relative z-10 px-[19px] py-[24px]">
        <div className="flex items-center gap-2">
          <img src={`${A}/d6b22.svg`} alt="" className="h-[14px] w-3" />
          <span className="text-[14px]">Uso de tokens</span>
          <button
            onClick={recarregar}
            aria-label="Atualizar a medição de tokens"
            className="ml-auto text-dash-muted transition hover:text-dash-fg"
          >
            <img src={`${A}/c9864.svg`} alt="" className="h-[14px] w-[4px]" />
          </button>
        </div>

        <p className="mt-3 public-sans text-[24px] font-medium">
          {carregando && !resumo ? (
            <span className="text-dash-muted">—</span>
          ) : medido ? (
            numero(resumo?.tokens_total ?? 0)
          ) : (
            <span className="text-[15px] text-dash-muted">sem medição ainda</span>
          )}
        </p>
      </div>

      {/* o gráfico decorativo do template (b7da2.svg), na posição ORIGINAL */}
      <div className="absolute bottom-[45px] right-[19px] flex h-[62px] w-[282px] items-center justify-center overflow-hidden">
        <img src={`${A}/b7da2.svg`} alt="" className="h-[283px] w-[62px] rotate-90" />
      </div>

      <div className="absolute bottom-[18px] left-[18px] flex items-center gap-2.5 text-[12px]">
        <img src={`${A}/7618a.svg`} alt="" className="h-[14px] w-[11px]" />
        <span className="public-sans">{medido ? `${numero(resumo?.chamadas ?? 0)} chamadas` : "—"}</span>
        {medido && resumo?.custo ? (
          <span className="public-sans text-dash-warn">US$ {resumo.custo.toFixed(2)}</span>
        ) : null}
      </div>

      <div className="absolute bottom-[17px] right-5 flex -space-x-2">
        <span className="h-[26px] w-[26px] rounded-full border border-dash-hair/50 bg-gradient-to-b from-white/40 to-transparent" />
        <span className="h-[26px] w-[26px] rounded-full border border-dash-hair/50 bg-gradient-to-b from-white/40 to-transparent" />
      </div>

      {/* a tela nunca inventa número: quando não há medição, ela diz isso */}
      {!medido && (falhou || (!carregando && !resumo)) && (
        <p className="absolute bottom-[18px] left-[18px] right-[120px] text-[10px] leading-[1.4] text-dash-dim">
          Não consegui ler a medição agora.
        </p>
      )}
    </section>
  );
}

/* ── Destaques (o "Top Creator" da referência, mesma grade + avatar 4a796) ─ */

function Destaques({
  itens,
  conectada,
  pronta,
  onAbrir,
  onConectarCrm,
}: {
  itens: Integracao[];
  conectada: (i: Integracao) => boolean;
  pronta: (i: Integracao) => { pronta: boolean; motivo?: string };
  onAbrir: (i: Integracao) => void;
  onConectarCrm: () => void;
}) {
  return (
    <section className="min-w-0 pt-2 text-dash-fg">
      <header className="mb-[14px] flex items-center justify-between">
        <h2 className="text-[14px] font-bold">Destaques</h2>
        <a href="#catalogo" className="text-[11px] text-dash-muted hover:text-dash-fg">
          ver todas
        </a>
      </header>
      <div className="space-y-[10px]">
        {/* a referência mostra 4 linhas (cabem nos 240px da coluna ao lado) */}
        {itens.slice(0, 4).map((i) => {
          /* o MESMO estado do resto da tela (uma fonte, uma regra) */
          const on = conectada(i);
          const semDestino = i.tipo === "mcp" && !i.site;
          const p = pronta(i);
          return (
            <div key={i.id} className="grid grid-cols-[43px_1fr_auto] items-center gap-[9px]">
              {/* o avatar do template (4a796.svg) */}
              <img src={`${A}/4a796.svg`} alt="" className="h-[43px] w-[43px]" />
              <div className="min-w-0">
                <p className="truncate text-[12px]">{i.nome}</p>
                <p className="truncate text-[10px] text-dash-dim">{i.empresa}</p>
              </div>
              {semDestino ? (
                <span className="rounded-full bg-dash-raise px-2.5 py-[5px] text-[10px] text-dash-muted">
                  interna
                </span>
              ) : on ? (
                <button
                  onClick={() => onAbrir(i)}
                  className="rounded-full bg-dash-raise px-2.5 py-[5px] text-[10px] text-dash-muted transition hover:text-dash-fg"
                >
                  ligada
                </button>
              ) : !p.pronta ? (
                /* sem caminho real: diz-se "indisponível" COM o motivo — nunca
                   um botão que não faz nada */
                <span
                  title={p.motivo}
                  aria-label={p.motivo}
                  className="cursor-not-allowed rounded-full bg-dash-raise px-2.5 py-[5px] text-[10px] text-dash-dim"
                >
                  indisponível
                </span>
              ) : ehCrm(i) ? (
                <button
                  onClick={onConectarCrm}
                  className="rounded-full bg-dash-brand px-2.5 py-[5px] text-[10px] text-dash-fg transition hover:bg-[#ff2d55]"
                >
                  conectar
                </button>
              ) : (
                <button
                  onClick={() => onAbrir(i)}
                  className="rounded-full bg-dash-brand px-2.5 py-[5px] text-[10px] text-dash-fg transition hover:bg-[#ff2d55]"
                >
                  {i.tipo === "mcp" ? "abrir" : "conectar"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ── Card de integração (o AuctionCard da referência) ────────────────── */

/* Logo, Figura e CardIntegracao saíram daqui para
   `@/components/dash/integracao-cards` (importados no topo): a grade
   `/dashboard/integracoes` desenha O MESMO card. Nada foi redesenhado. */

/* ── Minhas integrações (a HistoryTable da referência) ───────────────── */

function TabelaIntegracoes({
  ligadas,
  desde,
  onAbrir,
}: {
  ligadas: Integracao[];
  desde: (i: Integracao) => string;
  onAbrir: (i: Integracao) => void;
}) {
  const grade = "grid grid-cols-[74px_112px_1.7fr_1.35fr_90px_75px_90px]";

  return (
    <div className="overflow-x-auto rounded-t-[20px] bg-dash-side">
      <div className="min-w-[880px]">
        <div className={`${grade} gap-8 border-b border-dash-line px-[30px] py-[18px] text-[12px] text-dash-muted`}>
          {["", "Nome", "Empresa", "Tipo", "Estado", "Desde", "Ação"].map((rotulo, idx) => (
            <span key={idx}>{rotulo}</span>
          ))}
        </div>

        {ligadas.map((i) => (
          <div
            key={i.id}
            className={`${grade} items-center gap-8 px-[30px] py-[17px] text-[12px] text-dash-muted`}
          >
            {/* a moldura do "Object" da referência, com a arte do zip (6d39f.svg) */}
            <div className="h-14 w-14 overflow-hidden rounded-[10px] bg-[#c4c4c4]">
              <img src={`${A}/6d39f.svg`} alt="" className="h-full w-full" />
            </div>
            <span className="truncate text-dash-fg">{i.nome}</span>
            <span className="truncate">{i.empresa}</span>
            <span className="uppercase">{i.tipo}</span>
            <span className="flex items-center gap-[7px]">
              <span className="h-1.5 w-1.5 rounded-full bg-dash-ok" />
              ativa
            </span>
            <span className="whitespace-nowrap">{desde(i)}</span>
            <span>
              {i.tipo === "mcp" && !i.site ? (
                <span className="text-[11px] text-dash-dim">interna</span>
              ) : (
                <button
                  onClick={() => onAbrir(i)}
                  className="rounded-full bg-dash-raise px-2.5 py-[5px] text-[10px] text-dash-muted transition hover:text-dash-fg"
                >
                  {i.tipo === "mcp" || i.oauthPath || i.conectaEm ? "abrir" : "gerenciar"}
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Popup de API key (comportamento preservado) ─────────────────────── */

function ModalApi({
  item,
  onClose,
  onSalvo,
}: {
  item: Integracao;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const campos = item.campos ?? [];
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(campos.map((c) => [c.chave, ""])),
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const overlay = useRef<HTMLDivElement>(null);

  const enviar = useCallback(async () => {
    const faltando = campos.filter((c) => c.obrigatorio !== false && !(valores[c.chave] || "").trim());
    if (faltando.length) {
      setErro(`Preencha: ${faltando.map((c) => c.rotulo).join(", ")}.`);
      return;
    }
    setSalvando(true);
    setErro("");
    try {
      const config: Record<string, string> = {};
      for (const c of campos) config[c.chave] = (valores[c.chave] || "").trim();
      const res = await fetch("/api/auth/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: item.chaveConfig ?? item.id, config }),
      });
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(d.error || `falha ao salvar (HTTP ${res.status})`);
      onSalvo();
      onClose();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao salvar");
    } finally {
      setSalvando(false);
    }
  }, [campos, valores, item, onSalvo, onClose]);

  return (
    <div
      ref={overlay}
      onClick={(e) => {
        if (e.target === overlay.current) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-dash-scrim/60 px-4 backdrop-blur-sm"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Conectar ${item.nome}`}
        className="relative w-full max-w-md overflow-hidden rounded-[30px] border border-dash-hair/[0.18] p-6 text-dash-fg"
        style={VIDRO}
      >
        <div className="absolute -right-8 -top-12 h-44 w-64 rounded-full bg-dash-brand/60 blur-[34px]" />

        <button
          onClick={onClose}
          aria-label="Fechar"
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-[10px] text-dash-muted transition hover:bg-dash-hair/[0.06] hover:text-dash-fg"
        >
          <IconeFechar className="h-4 w-4" />
        </button>

        <header className="relative z-10 mb-5 flex items-center gap-3.5 pr-8">
          <Logo item={item} />
          <div className="min-w-0">
            <p className="truncate text-[16px] font-semibold text-dash-fg">{item.nome}</p>
            <p className="truncate text-[12px] text-dash-muted">{item.empresa}</p>
          </div>
        </header>

        <div className="relative z-10 space-y-4">
          {campos.map((c) => (
            <label key={c.chave} className="block">
              <span className="mb-1.5 flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-dash-dim">
                <IconeCadeado className="h-3.5 w-3.5" />
                {c.rotulo}
                {c.obrigatorio === false && <span className="normal-case text-dash-dim">(opcional)</span>}
              </span>
              <input
                type={c.tipo === "senha" ? "password" : "text"}
                value={valores[c.chave] || ""}
                onChange={(e) => setValores((s) => ({ ...s, [c.chave]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void enviar();
                }}
                autoFocus={c === campos[0]}
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-[10px] border border-dash-hair/10 bg-dash-bg px-4 py-2.5 text-[13px] text-dash-fg outline-none placeholder:text-dash-dim focus:border-dash-brand/60"
                placeholder={`Cole aqui — ${c.rotulo.toLowerCase()}`}
              />
              {c.dica && <span className="mt-1.5 block text-[11px] text-dash-dim">{c.dica}</span>}
            </label>
          ))}

        </div>

        {erro && <p className="relative z-10 mt-3 text-[12px] text-[#ff2d55]">{erro}</p>}

        <p className="relative z-10 mt-4 text-[11px] leading-[1.5] text-dash-dim">
          A chave vai para o cofre desta conta (platform_config), só para ela.
        </p>

        <div className="relative z-10 mt-5 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-[10px] border border-dash-hair/12 px-5 py-2.5 text-[12px] font-semibold text-dash-muted transition hover:text-dash-fg"
          >
            cancelar
          </button>
          <button
            onClick={() => void enviar()}
            disabled={salvando}
            className="rounded-[10px] bg-dash-brand px-5 py-2.5 text-[12px] font-semibold text-dash-fg transition hover:bg-[#ff2d55] disabled:opacity-40"
          >
            {salvando ? "salvando..." : "salvar e ligar"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Popup do CRM (fluxo próprio: valida a credencial AO VIVO) ────────── */

/* Pede a credencial do CRM (o token crm_…), manda para POST /api/integracoes —
   que SÓ grava depois do próprio CRM confirmar, ao vivo, que a credencial
   serve. Credencial recusada ou CRM mudo = erro em PT-BR e NADA gravado. A
   credencial nunca é registrada em log, nunca fica na tela, nunca entra aqui
   no código. */
function ModalCrm({ onClose, onConectado }: { onClose: () => void; onConectado: () => void }) {
  const [valor, setValor] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const overlay = useRef<HTMLDivElement>(null);

  const conectar = useCallback(async () => {
    const cred = valor.trim();
    if (!cred) {
      setErro("Cole a credencial do seu CRM.");
      return;
    }
    setSalvando(true);
    setErro("");
    try {
      const res = await fetch("/api/integracoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "crm", rotulo: "meu CRM", credencial: cred }),
      });
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErro(d.error || `não consegui conectar (HTTP ${res.status})`);
        return;
      }
      // Só chego aqui depois do CRM ter confirmado a credencial ao vivo.
      setValor(""); // a credencial não fica na tela
      onConectado();
      onClose();
    } catch {
      setErro("O CRM não respondeu agora. Nada foi salvo.");
    } finally {
      setSalvando(false);
    }
  }, [valor, onConectado, onClose]);

  return (
    <div
      ref={overlay}
      onClick={(e) => {
        if (e.target === overlay.current) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-dash-scrim/60 px-4 backdrop-blur-sm"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Conectar meu CRM"
        className="relative w-full max-w-md overflow-hidden rounded-[30px] border border-dash-hair/[0.18] p-6 text-dash-fg"
        style={VIDRO}
      >
        <div className="absolute -right-8 -top-12 h-44 w-64 rounded-full bg-dash-brand/60 blur-[34px]" />

        <button
          onClick={onClose}
          aria-label="Fechar"
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-[10px] text-dash-muted transition hover:bg-dash-hair/[0.06] hover:text-dash-fg"
        >
          <IconeFechar className="h-4 w-4" />
        </button>

        <header className="relative z-10 mb-5 pr-8">
          <p className="text-[16px] font-semibold text-dash-fg">Conectar meu CRM</p>
          <p className="mt-1 text-[12px] text-dash-muted">
            O CRM é seu: a credencial vale só para esta conta e é validada na hora.
          </p>
        </header>

        <label className="relative z-10 block">
          <span className="mb-1.5 flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-dash-dim">
            <IconeCadeado className="h-3.5 w-3.5" />
            Credencial do CRM
          </span>
          <input
            type="password"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void conectar();
            }}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-[10px] border border-dash-hair/10 bg-dash-bg px-4 py-2.5 text-[13px] text-dash-fg outline-none placeholder:text-dash-dim focus:border-dash-brand/60"
            placeholder="Cole aqui — o token que começa com crm_"
          />
          <span className="mt-1.5 block text-[11px] text-dash-dim">
            É o mesmo token de acesso do seu CRM. Os novos começam com crm_; os antigos,
            com dsk_, e continuam valendo.
          </span>
        </label>

        {erro && <p className="relative z-10 mt-3 text-[12px] text-[#ff2d55]">{erro}</p>}

        <p className="relative z-10 mt-4 text-[11px] leading-[1.5] text-dash-dim">
          Ao conectar, a Mirai fala com o CRM e só grava a credencial se ele confirmar. Se o CRM não
          responder ou recusar, nada é salvo.
        </p>

        <div className="relative z-10 mt-5 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-[10px] border border-dash-hair/12 px-5 py-2.5 text-[12px] font-semibold text-dash-muted transition hover:text-dash-fg"
          >
            cancelar
          </button>
          <button
            onClick={() => void conectar()}
            disabled={salvando}
            className="rounded-[10px] bg-dash-brand px-5 py-2.5 text-[12px] font-semibold text-dash-fg transition hover:bg-[#ff2d55] disabled:opacity-40"
          >
            {salvando ? "validando..." : "validar e conectar"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Popup do produto (a camada sobre a tela) ────────────────────────── */

/* Abre no clique do card. Mostra a LOGO em destaque (mesmo critério de cor do
   card: a marca branca sobre a COR DA MARCA), o nome, a empresa, o tipo, o
   estado e as INFORMAÇÕES do catálogo. O caminho adiante depende do item:
   mcp abre o site; api com OAuth abre a rota; api com campos abre o popup de
   chave; e o CRM abre o fluxo de credencial (ModalCrm). O painel reusa o
   VIDRO do login (src/lib/vidro.ts). */
/* ── O bloco do DONO: as chaves do app do GitHub ─────────────────────────
   O app do GitHub (OAuth App) é criado pelo dono NO GitHub; as chaves dele são
   a única coisa que falta para o cartão do GitHub liberar. Elas NÃO passam por
   chat: vão daqui, CIFRADAS, direto ao servidor (`/api/admin/github-app`), que
   só aceita a escrita do dono. */
function BlocoChavesGithub({ pronta }: { pronta: boolean }) {
  const [id, setId] = useState("");
  const [segredo, setSegredo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [recado, setRecado] = useState("");
  const [erro, setErro] = useState("");

  // Já configurado: o bloco não aparece (não há o que fazer aqui).
  if (pronta) return null;

  async function salvar() {
    setSalvando(true);
    setErro("");
    setRecado("");
    try {
      const r = await fetch("/api/admin/github-app", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ client_id: id, client_secret: segredo }),
      });
      const d = (await r.json().catch(() => ({}))) as { erro?: string };
      if (!r.ok) throw new Error(d.erro || `não consegui gravar (HTTP ${r.status})`);
      setRecado("Chaves gravadas. Recarregue a página: o cartão do GitHub libera.");
      setId("");
      setSegredo("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "erro ao gravar");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="mt-6 rounded-[14px] border border-dash-hair/[0.14] bg-dash-scrim/25 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-dash-dim">
        só o dono · o app do GitHub
      </p>
      <p className="mt-2 text-[12px] leading-[1.55] text-dash-fg/80">
        O GitHub precisa de um app nosso, criado uma vez lá. Depois de criado, cole as duas chaves
        aqui — elas vão <strong>cifradas</strong> para o servidor e não passam por chat.
      </p>

      <a
        href="https://github.com/settings/applications/new"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-dash-raise px-3 py-1.5 text-[11px] text-dash-fg/85 transition hover:text-dash-fg"
      >
        abrir a página de criação no GitHub
      </a>

      <ul className="mt-3 flex flex-col gap-1 text-[11px] leading-[1.5] text-dash-fg/70">
        <li>
          · <strong>Application name</strong>: Mirai OS
        </li>
        <li>
          · <strong>Homepage URL</strong>: https://app.miraitohope.com
        </li>
        <li className="break-all">
          · <strong>Authorization callback URL</strong>: https://app.miraitohope.com/api/oauth/github/volta
        </li>
      </ul>

      <div className="mt-3 flex flex-col gap-2">
        <input
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="Client ID (começa com Ov…)"
          autoComplete="off"
          className="w-full rounded-[10px] border border-dash-hair/10 bg-dash-scrim/25 px-3 py-2 text-[12px] text-dash-fg outline-none placeholder:text-dash-dim focus:border-dash-brand/50"
        />
        <input
          value={segredo}
          onChange={(e) => setSegredo(e.target.value)}
          type="password"
          placeholder="Client Secret"
          autoComplete="new-password"
          className="w-full rounded-[10px] border border-dash-hair/10 bg-dash-scrim/25 px-3 py-2 text-[12px] text-dash-fg outline-none placeholder:text-dash-dim focus:border-dash-brand/50"
        />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-[11px] leading-[1.4] text-dash-bad">{erro}</span>
        <button
          onClick={() => void salvar()}
          disabled={salvando || !id.trim() || !segredo.trim()}
          className="shrink-0 rounded-[10px] bg-dash-brand px-4 py-2 text-[11.5px] font-semibold text-dash-fg transition hover:bg-[#ff2d55] disabled:opacity-40"
        >
          {salvando ? "gravando…" : "gravar as chaves"}
        </button>
      </div>

      {recado && <p className="mt-2 text-[11px] leading-[1.4] text-dash-ok">{recado}</p>}
    </div>
  );
}

function ModalProduto({
  item,
  conectada,
  pronta,
  motivo,
  onClose,
  onIntegrar,
  onConectar,
  onColarCredencial,
  ehDono,
}: {
  item: Integracao;
  conectada: boolean;
  pronta: boolean;
  motivo?: string;
  onClose: () => void;
  onIntegrar: (i: Integracao) => void;
  onConectar: () => void;
  /** o caminho SECUNDÁRIO do CRM: colar uma credencial `crm_…` já existente. */
  onColarCredencial: () => void;
  /** só o dono vê o bloco das chaves do GitHub. */
  ehDono?: boolean;
}) {
  const overlay = useRef<HTMLDivElement>(null);
  const crm = ehCrm(item);
  const semDestino = item.tipo === "mcp" && !item.site;
  /* o CRM só ganha o botão de conectar quando há caminho real e ele não está
     conectado — sem botão decorativo. */
  const podeConectarCrm = crm && !conectada && pronta;

  /* O CRM mudou de porta (14/10/2026, dono): a entrada agora é a CONTA MIRAI,
     não o campo de credencial. O texto acompanha o que o botão faz. */
  const comoIntegra = crm
      ? conectada
      ? "Este CRM já está conectado nesta conta. Integrar abre o próprio CRM."
      : "Conectar abre a entrada com a sua conta Mirai. Se o CRM estiver no seu plano, a conexão se completa sozinha — a credencial é cunhada e entregue sem você digitar nada. Se não estiver, a tela diz como pedir a liberação."
    : item.tipo === "mcp"
      ? "Integrar abre o site da integração em uma nova aba."
      : item.oauthPath
        ? "Integrar abre a autorização da conta em uma nova aba."
        : "Integrar abre o espaço da API para você colar a chave.";

  return (
    <div
      ref={overlay}
      onClick={(e) => {
        if (e.target === overlay.current) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-dash-scrim/55 px-4 backdrop-blur-md"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${item.nome} — informações da integração`}
        className="relative max-h-[90vh] w-full max-w-[520px] overflow-y-auto rounded-[30px] border border-dash-hair/[0.18] p-7 text-dash-fg"
        style={VIDRO}
      >
        <button
          onClick={onClose}
          aria-label="Fechar"
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-[10px] text-dash-fg/70 transition hover:bg-dash-hair/[0.12] hover:text-dash-fg"
        >
          <IconeFechar className="h-4 w-4" />
        </button>

        {/* a LOGO em destaque, com o MESMO critério de cor do card:
            a marca branca sobre a cor da marca (item.cor). */}
        <div className="flex items-center gap-5 pr-10">
          <span
            className="grid h-[96px] w-[96px] shrink-0 place-items-center overflow-hidden rounded-[24px]"
            style={{ backgroundColor: item.cor ?? COR_PADRAO_CARD }}
          >
            <Figura item={item} tamanho={54} />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-[22px] font-semibold text-dash-fg">{item.nome}</h3>
            <p className="mt-1 truncate text-[13px] text-dash-fg/70">{item.empresa}</p>
          </div>
        </div>

        {/* TIPO + ESTADO — o estado vem da MESMA fonte do resto da tela. */}
        <div className="mt-6 flex flex-wrap items-center gap-2.5">
          <span className="rounded-full bg-dash-hair/[0.16] px-3 py-[5px] text-[11px] font-semibold uppercase tracking-[0.14em] text-dash-fg">
            {item.tipo === "mcp" ? "MCP" : "API"}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full bg-dash-hair/[0.08] px-3 py-[5px] text-[11px] text-dash-fg/85">
            <span className={`h-1.5 w-1.5 rounded-full ${conectada ? "bg-dash-ok" : "bg-[#ff2d55]"}`} />
            {conectada ? "conectada" : "não conectada"}
          </span>
          {!pronta && (
            <span className="rounded-full bg-[#ff2d55]/[0.16] px-3 py-[5px] text-[11px] text-dash-bad">
              indisponível
            </span>
          )}
        </div>

        {/* INFORMAÇÕES do produto — o subtítulo do catálogo, sem invenção. */}
        {item.subtitulo ? (
          <p className="mt-5 text-[13.5px] leading-[1.6] text-dash-fg/90">{item.subtitulo}</p>
        ) : (
          <p className="mt-5 text-[13px] text-dash-fg/50">Sem descrição no catálogo.</p>
        )}

        <p className="mt-4 text-[11.5px] leading-[1.5] text-dash-fg/60">{comoIntegra}</p>

        <div className="mt-7 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-[10px] border border-dash-hair/[0.20] px-5 py-2.5 text-[12px] font-semibold text-dash-fg/80 transition hover:text-dash-fg"
          >
            fechar
          </button>
          {podeConectarCrm ? (
            <button
              onClick={onConectar}
              className="rounded-[10px] bg-dash-brand px-6 py-2.5 text-[12px] font-semibold text-dash-fg transition hover:bg-[#ff2d55]"
            >
              conectar com a conta Mirai
            </button>
          ) : (
            <button
              onClick={() => onIntegrar(item)}
              disabled={!pronta}
              className="rounded-[10px] bg-dash-brand px-6 py-2.5 text-[12px] font-semibold text-dash-fg transition hover:bg-[#ff2d55] disabled:opacity-40"
            >
              Integrar
            </button>
          )}
        </div>

        {/* O caminho SECUNDÁRIO do CRM: quem já tem uma credencial `crm_…` em
            mãos (token legado, CRM em outra instalação) não perde a porta —
            mas ela deixou de ser a principal: o caminho normal é a conta Mirai,
            que cunha a credencial sozinha. */}
        {crm && !conectada && pronta && (
          <p className="mt-3 text-right text-[11px] text-dash-fg/55">
            já tem uma credencial do CRM?{" "}
            <button
              onClick={onColarCredencial}
              className="underline underline-offset-2 transition hover:text-dash-fg"
            >
              colar aqui
            </button>
          </p>
        )}

        {/* O BLOCO DO DONO (dono, 13/10/2026): o app do GitHub (OAuth App) é
            criado no GitHub pelo dono, mas as chaves NÃO passam por chat — vão
            cifradas direto ao servidor, por aqui. Só o dono vê este bloco. */}
        {item.id === "github" && ehDono && (
          <BlocoChavesGithub pronta={pronta} />
        )}

        {!pronta ? (
          <p className="mt-3 text-right text-[11px] text-dash-fg/50">
            {motivo || "Esta integração ainda não está pronta para conectar neste servidor."}
          </p>
        ) : (
          semDestino && (
            <p className="mt-3 text-right text-[11px] text-dash-fg/50">
              Esta integração roda dentro do MIRAI OS — ainda sem site próprio.
            </p>
          )
        )}
      </div>
    </div>
  );
}

/* ── Tela ────────────────────────────────────────────────────────────── */

export default function IntegracoesPage() {
  const [user, setUser] = useState<User | null>(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [categoria, setCategoria] = useState<string>("todas");
  const [busca, setBusca] = useState("");
  const [soSemConexao, setSoSemConexao] = useState(false);
  /* O catálogo abre LIMITADO (10 cartões). O "Ver todas as integrações" não
     infla mais a própria página: virou um atalho, AO LADO DA BUSCA, para a
     GRADE dedicada `/dashboard/integracoes` (pedido do dono, 08/10/2026). */
  const [modal, setModal] = useState<Integracao | null>(null);
  const [produto, setProduto] = useState<Integracao | null>(null);
  const [crmAberto, setCrmAberto] = useState(false);
  const [saaso, setSaaso] = useState<SaasoStatus | null>(null);

  /* Qual das três seções está à vista. Começa em INTEGRAÇÕES: é o DASHBOARD —
     dono, 11/11/2026: "copia a página de Integrações e coloca como Dashboard.
     Depois fazemos as outras". A ordem dos BOTÕES segue a ordem dele (Cosmic
     Agent em primeiro); o que abre por padrão é o dash. */
  const [aba, setAba] = useState<SynapseAba>("integracoes");

  const [linhas, setLinhas] = useState<LinhasDaConta>({ minhas: [], daEmpresa: [] });
  const [prontidao, setProntidao] = useState<Prontidao>({});

  const [resumo, setResumo] = useState<ResumoUso | null>(null);
  const [tokensCarregando, setTokensCarregando] = useState(true);
  const [tokensFalhou, setTokensFalhou] = useState(false);

  const carregarConta = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const r = await fetch("/api/auth/me", { cache: "no-store" });
      if (!r.ok) throw new Error(`não consegui ler a conta (HTTP ${r.status})`);
      const d = (await r.json()) as { user: User };
      setUser(d.user);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "erro ao ler a conta");
    } finally {
      setCarregando(false);
    }
  }, []);

  const carregarTokens = useCallback(async () => {
    setTokensCarregando(true);
    try {
      const r = await fetch("/api/integracoes/tokens", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setResumo((await r.json()) as ResumoUso);
      setTokensFalhou(false);
    } catch {
      // Sem medição: a tela mostra "sem medição ainda", nunca um número inventado.
      setResumo(null);
      setTokensFalhou(true);
    } finally {
      setTokensCarregando(false);
    }
  }, []);

  const carregarSaaso = useCallback(async () => {
    try {
      const r = await fetch("/api/integracoes/saaso", { cache: "no-store" });
      if (r.ok) setSaaso((await r.json()) as SaasoStatus);
    } catch {
      /* o CRM é um dos cards; se não responder, o resto da tela segue */
    }
  }, []);

  /* AS LINHAS desta conta — a base da fonte única de estado. */
  const carregarIntegracoes = useCallback(async () => {
    try {
      const r = await fetch("/api/integracoes", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = (await r.json()) as {
        minhas?: LinhaIntegracao[];
        daEmpresa?: LinhaIntegracao[];
        prontidao?: Prontidao;
      };
      setLinhas({ minhas: d.minhas ?? [], daEmpresa: d.daEmpresa ?? [] });
      setProntidao(d.prontidao ?? {});
    } catch {
      // Sem as linhas a tela não inventa: nada aparece como conectado.
      setLinhas({ minhas: [], daEmpresa: [] });
    }
  }, []);

  useEffect(() => {
    void carregarConta();
    void carregarTokens();
    void carregarSaaso();
    void carregarIntegracoes();
  }, [carregarConta, carregarTokens, carregarSaaso, carregarIntegracoes]);

  /* VOLTAR DA ABA DO CRM ATUALIZA A TELA. O "Entrar com Mirai" acontece em
     OUTRA aba (o CRM); quando a pessoa volta para cá, nada recarregaria e o
     card continuaria dizendo "não conectada" com a conexão já feita — ela
     concluiria que não funcionou. O evento `focus` é o sinal de que a pessoa
     voltou: recarrega as linhas e o estado do CRM. */
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState !== "visible") return;
      void carregarIntegracoes();
      void carregarSaaso();
    };
    window.addEventListener("focus", aoVoltar);
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      window.removeEventListener("focus", aoVoltar);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [carregarIntegracoes, carregarSaaso]);

  const config = user?.platform_config ?? {};
  const saasoAoVivo = Boolean(saaso?.conectado);

  /* a LINHA desta conta para um item — a metade "linhas" da fonte única, agora
     em `@/lib/integracoes/estado-da-conta` (compartilhada pelas duas telas). */
  const linhaDaConta = useCallback(
    (i: Integracao): LinhaIntegracao | null => linhaDaContaEm(i, linhas),
    [linhas],
  );

  /* ═══ A FONTE ÚNICA ═══════════════════════════════════════════════════
     A REGRA vive em `@/lib/integracoes/estado-da-conta` (`estaConectadaNaConta`)
     — a MESMA função que a grade `/dashboard/integracoes` chama. Aqui só se
     entrega o contexto desta tela: o CRM ao vivo, as linhas da conta e o cofre.
     Se a regra mudar, muda lá uma vez, e nenhuma tela discorda das outras. */
  const estaConectadaDaConta = useCallback(
    (i: Integracao): boolean => estaConectadaNaConta(i, { saasoAoVivo, linhas, config }),
    [saasoAoVivo, linhas, config],
  );

  /* Chegando de outra tela com parâmetro na URL:
       - `?produto=<id>` (grade /dashboard/integracoes) abre o popup do produto;
       - `?aba=skills` (botão "Voltar para Skills" da grade) abre a aba SKILLS —
         era o pedido do dono (08/10/2026): o botão tem de cair AQUI, na Skills da
         Synapse, não na página do menu esquerdo (que deixou de existir).
     O parâmetro é limpo em seguida para não reabrir a cada volta à tela. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    const a = q.get("aba");
    // O Dashboard é a cópia CONGELADA: ele ignora ?aba= de propósito. A navegação
    // entre as telas vem do quarto botão do toggle, não da URL. `a` continua lido
    // para o resto deste efeito (?produto / ?gh / ?cv) seguir igual.
    void a;
    const id = q.get("produto");
    if (id) {
      const item = CATALOGO.find((i) => i.id === id);
      if (item) setProduto(item);
    }
    /* Voltando do consentimento do GitHub (dono, 13/10/2026): a conexão é da
       CONTA e vale para todos os projetos. Dizer o resultado é obrigatório —
       a pessoa precisa saber se conectou ou não, sem adivinhar pelo ícone. */
    const gh = q.get("github");
    if (gh) {
      setAviso(
        gh === "conectado"
          ? "GitHub conectado nesta conta — vale para todos os seus projetos."
          : gh === "instalado"
            ? "App do GitHub instalado."
            : "A conexão com o GitHub não foi concluída. Tente de novo.",
      );
    }
    /* Voltando do consentimento do CANVA (dono, 19/10/2026 — "cada pessoa na
       própria conta"). Mesma obrigação do GitHub: dizer o resultado. Sem isto a
       FALHA seria silenciosa — a pessoa voltaria para a tela sem saber por que o
       cartão continua desconectado. */
    const cv = q.get("canva");
    if (cv) {
      setAviso(
        cv === "conectado"
          ? "Canva conectado nesta conta — os designs são os seus, não os de outra pessoa."
          : cv === "recusado"
            ? "Você não autorizou o Canva. Nada foi alterado."
            : "A conexão com o Canva não foi concluída. Tente de novo.",
      );
    }
    if (a || id || gh || cv) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  /* categoria + busca + filtro: a grade da referência (mesma faixa que rola na
     horizontal). O filtro usa a MESMA fonte única — esconde o que já está
     conectado. Nada de botão de filtro decorativo. */
  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return CATALOGO.filter((i) => {
      if (categoria !== "todas" && i.categoria !== categoria) return false;
      if (soSemConexao && estaConectadaDaConta(i)) return false;
      if (!termo) return true;
      return `${i.nome} ${i.empresa} ${i.subtitulo} ${i.explicacao ?? ""}`.toLowerCase().includes(termo);
    });
  }, [categoria, busca, soSemConexao, estaConectadaDaConta]);

  /* O que se vê NESTA tela: o limite de fachada. O catálogo INTEIRO (os 21) vive
     na grade dedicada `/dashboard/integracoes`, aberta pelo atalho ao lado da
     busca (pedido do dono, 08/10/2026). */
  const visiveis = useMemo(() => filtradas.slice(0, LIMITE_CATALOGO), [filtradas]);

  /* A tabela "Minhas integrações" usa a MESMA função — nada de uma segunda
     regra de "o que está ligado". */
  const ligadas = useMemo(() => CATALOGO.filter((i) => estaConectadaDaConta(i)), [estaConectadaDaConta]);

  /* "Desde" também sai da fonte certa: o CRM da linha da conta, o resto do cofre. */
  const desde = useCallback(
    (i: Integracao): string => {
      if (ehCrm(i)) {
        const linha = linhaDaConta(i);
        return linha ? dataCurta(linha.criada_em) : "pelo CRM";
      }
      return dataCurta(quandoLigou(i, config));
    },
    [linhaDaConta, config],
  );

  const destaques = useMemo(() => CATALOGO.filter((i) => i.destaque), []);

  /* Prontidão de cada item — vem do servidor (depende de env que a tela não vê).
     Sem mapa (ex.: a rota falhou), assume-se pronta: o caminho normal costuma
     ser o site/rota/chave. */
  const pronta = useCallback((i: Integracao) => prontidao[i.id] ?? { pronta: true }, [prontidao]);

  /* O destino (usado pelo botão Integrar do popup e pelos atalhos lateral/tabela):
     mcp -> site; api com OAuth -> rota; api com campos -> popup de chave.
     Item sem caminho real NÃO dispara nada em silêncio: avisa o motivo. */
  const abrir = useCallback(
    (item: Integracao) => {
      const p = prontidao[item.id];
      if (p && !p.pronta) {
        setAviso(p.motivo || "Esta integração ainda não está pronta para conectar neste servidor.");
        return;
      }
      if (item.conectaEm) {
        /* A conexão NÃO é nesta tela (o GitHub se conecta dentro de um
           projeto): leva ao lugar onde ela acontece, em vez de abrir uma
           autorização que não sabe de qual projeto é. */
        window.open(item.conectaEm.caminho, "_blank", "noopener");
        return;
      }
      if (item.oauthPath) {
        window.open(item.oauthPath, "_blank", "noopener");
        return;
      }
      if (item.tipo === "mcp") {
        if (item.site) window.open(item.site, "_blank", "noopener");
        else setAviso("Esta integração roda dentro do MIRAI OS — ainda sem site próprio.");
        return;
      }
      setModal(item);
    },
    [prontidao],
  );

  /* O clique no CARD abre o popup do produto — não vai mais direto ao destino. */
  const verProduto = useCallback((item: Integracao) => {
    setAviso("");
    setProduto(item);
  }, []);

  /* Só o botão Integrar leva adiante: fecha o popup e retoma o destino de sempre. */
  const integrar = useCallback(
    (item: Integracao) => {
      setProduto(null);
      abrir(item);
    },
    [abrir],
  );

  /* O CRM tem fluxo próprio — e ele NÃO é mais o campo de credencial.
     (Dono, 14/10/2026: "ainda pedindo código e não clicando e indo direto pro
     login com conta Mirai".)
     
     O botão leva DIRETO à tela de login do CRM, onde está o botão "Entrar com
     Mirai" — que é onde a pessoa espera encontrar isso. Lá dentro:
       - a conta tem o CRM no PLANO → entra, o CRM cunha a credencial da
         organização e a entrega a este app pela ponte. Nada é digitado.
       - a conta NÃO tem o CRM no plano → a tela diz que falta liberação.
     
     Pedir o código aqui seria pedir à pessoa o trabalho que o SSO já faz — e
     era exatamente o que o dono via na tela. */
  const conectarCrm = useCallback(() => {
    setProduto(null);
    const crm = CATALOGO.find((i) => ehCrm(i));
    if (!crm?.site) {
      setAviso("O CRM ainda não tem endereço configurado neste servidor.");
      return;
    }
    window.open(`${crm.site}/login`, "_blank", "noopener");
  }, []);

  /* O caminho SECUNDÁRIO: quem já tem uma credencial `crm_…` em mãos cola
     aqui. Continua validando ao vivo com o CRM antes de gravar. */
  const colarCredencialCrm = useCallback(() => {
    setProduto(null);
    setCrmAberto(true);
  }, []);

  /* Depois de conectar: recarrega as LINHAS e o estado ao vivo — o card passa a
     "conectada" pela MESMA fonte única, e "Minhas integrações" lista o CRM. */
  const conectouCrm = useCallback(() => {
    void carregarIntegracoes();
    void carregarSaaso();
  }, [carregarIntegracoes, carregarSaaso]);

  /* O MESMO destino para a pílula do desktop e a barra do celular — uma regra só
     (dono, 11/11/2026: "tem que ser separadas"): "Dashboard" É esta página; os
     outros três navegam para as abas vivas da Synapse. */
  const trocarAba = useCallback((id: string) => {
    if (id === "dashboard") return;
    window.location.href = `/dashboard/connect?aba=${id}`;
  }, []);

  return (
    <Shell
      titulo="Synapse"
      usuario={user}
      /* à DIREITA do cabeçalho, o MESMO seletor da primeira tela (SeletorModo:
         o Chat/Orb de `/`, extraído e reusado aqui) trocando as duas seções. */
      cabecalhoDireita={
        /* NO CELULAR ESTE MENU NÃO FICA AQUI (dono, 23/11/2026: "menu lá em cima
           tá horrível, móbile um em cima do outro"): com 4 opções a pílula
           disputava a linha com título/sininho/avatar e os botões se
           atropelavam. Abaixo de lg ele desce para a BarraDeAbas do rodapé. */
        <div className="hidden lg:flex">
          <SeletorModo
            rotuloAria="Alternar entre Dashboard, Cosmic Agent, Integrações e Skills"
            ativo="dashboard"
            onTrocar={trocarAba}
            opcoes={[
              { id: "dashboard", rotulo: "Dashboard" },
              { id: "cosmic", rotulo: "Cosmic Agent" },
              { id: "integracoes", rotulo: "Integrações" },
              { id: "skills", rotulo: "Skills" },
            ]}
          />
        </div>
      }
    >
      {aba === "cosmic" ? (
        <CosmicAgent />
      ) : aba === "integracoes" ? (
        <>
      {erro && (
        <p className="mb-5 rounded-[16px] border border-[#ff2d55]/30 bg-[#ff2d55]/[0.07] px-5 py-4 text-[13px] text-[#ff2d55]">
          {erro}
        </p>
      )}

      {aviso && (
        <p className="mb-5 flex items-start justify-between gap-4 rounded-[16px] border border-dash-brand/30 bg-dash-brand/[0.07] px-5 py-4 text-[13px] text-dash-brandHi">
          <span>{aviso}</span>
          <button onClick={() => setAviso("")} className="shrink-0 text-[12px] text-dash-brandHi underline">
            ok
          </button>
        </p>
      )}

      {/* ⚠️ 11/11/2026 — ESTE ARQUIVO É A CÓPIA CONGELADA (o Dashboard). Palavras do
          dono: "vc tirou do dashboard tbm e era só de integrações". A limpeza (hero,
          fio divisório, Uso de tokens, Destaque) vale SÓ para a página de INTEGRAÇÃO
          (`connect/page.tsx`). Aqui fica como estava no momento da cópia: hero +
          tokens + Destaque, na grade de 3 colunas. NÃO limpar este arquivo junto. */}
      <div className="mt-[55px] grid gap-5 xl:grid-cols-[1.35fr_1fr_0.65fr]">
        <Banner promocao={PROMOCOES[0] ?? BANNER_PADRAO} />
        <UsoTokens
          resumo={resumo}
          carregando={tokensCarregando}
          falhou={tokensFalhou}
          recarregar={() => void carregarTokens()}
        />
        <Destaques
          itens={destaques}
          conectada={estaConectadaDaConta}
          pronta={pronta}
          onAbrir={abrir}
          onConectarCrm={conectarCrm}
        />
      </div>

      <div className="mt-[30px] border-t border-dash-line2" />

      {/* o "Live Auctions" da referência: título, busca, filtro, chips e a faixa de cards */}
      <section id="catalogo" className="mt-5 scroll-mt-6">
        <div className="flex flex-wrap items-center gap-5">
          <h2 className="text-[20px] font-bold text-dash-fg">Integrações</h2>
          <span data-catalogo-contagem className="text-[13px] text-dash-muted">
            {`${filtradas.length} de ${CATALOGO.length}`}
          </span>
          {/* busca, filtro e o atalho da GRADE completa, todos juntos no canto
              direito — o "Ver todas" fica AO LADO DA BUSCA (pedido do dono,
              08/10/2026). O atalho leva a /dashboard/integracoes, onde os 21
              aparecem em grade, com o mesmo card e o mesmo estado. */}
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
            <Link
              href="/dashboard/integracoes"
              data-ver-todas-integracoes
              title="Ver o catálogo inteiro em grade"
              className="rounded-[10px] border border-dash-hair/12 px-4 py-2 text-[12px] text-dash-muted transition hover:text-dash-fg"
            >
              Ver todas as integrações ({CATALOGO.length})
            </Link>
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

        {filtradas.length === 0 ? (
          <div className="mt-[27px]">
            <Vazio
              icone={<IconePlug className="h-7 w-7" />}
              titulo={soSemConexao ? "Tudo por aqui já está conectado" : "Nada nesta categoria ainda"}
              texto={
                soSemConexao
                  ? "Desligue o filtro (o botão laranja ao lado da busca) para ver o catálogo inteiro."
                  : "Escolha outra categoria no topo — o catálogo é declarativo e cresce sem refazer a tela."
              }
            />
          </div>
        ) : (
          <>
            <div
              data-integ-visiveis={visiveis.length}
              className="mt-[27px] flex gap-[18px] overflow-x-auto pb-2"
            >
              {visiveis.map((i, idx) => (
                <CardIntegracao
                  key={i.id}
                  item={i}
                  arte={ARTES_CARD[idx % ARTES_CARD.length]}
                  conectada={estaConectadaDaConta(i)}
                  pronta={pronta(i).pronta}
                  motivo={pronta(i).motivo}
                  onAbrir={verProduto}
                />
              ))}
            </div>
            {/* o "Ver todas" saiu daqui: virou atalho ao lado da busca e leva à
                grade /dashboard/integracoes. */}
            <p className="mt-3 text-[11px] text-dash-dim">
              {filtradas.length > LIMITE_CATALOGO
                ? `mostrando ${visiveis.length} de ${filtradas.length} — o catálogo inteiro está em “Ver todas as integrações”`
                : `mostrando ${visiveis.length} de ${filtradas.length}`}
            </p>
          </>
        )}
      </section>

      {/* o "Recent History" da referência: título + contagem, e a tabela com as proporções */}
      <section className="mt-[30px]">
        <div className="mb-[19px] flex flex-wrap items-center gap-5">
          <h2 className="text-[20px] font-bold text-dash-fg">Minhas integrações</h2>
          <span className="text-[13px] text-dash-muted">{ligadas.length} nesta conta</span>
          <button
            onClick={() => {
              void carregarConta();
              void carregarSaaso();
              void carregarIntegracoes();
            }}
            className="ml-auto rounded-[10px] border border-dash-hair/12 px-4 py-2 text-[12px] text-dash-muted transition hover:text-dash-fg"
          >
            atualizar
          </button>
        </div>

        {carregando && !user ? (
          <p className="text-[12px] text-dash-dim">Lendo as integrações desta conta...</p>
        ) : ligadas.length === 0 ? (
          <Vazio
            icone={<IconePlug className="h-7 w-7" />}
            titulo="Nenhuma integração ligada ainda"
            texto="Escolha uma integração na grade acima: as de MCP abrem o site, as de API pedem a chave e o CRM pede a credencial — todas ligam na hora."
          />
        ) : (
          <TabelaIntegracoes ligadas={ligadas} desde={desde} onAbrir={abrir} />
        )}
      </section>

      {produto && (
        <ModalProduto
          item={produto}
          conectada={estaConectadaDaConta(produto)}
          pronta={pronta(produto).pronta}
          motivo={pronta(produto).motivo}
          onClose={() => setProduto(null)}
          onIntegrar={integrar}
          onConectar={conectarCrm}
          onColarCredencial={colarCredencialCrm}
          ehDono={user?.ehDono === true}
        />
      )}

      {modal && (
        <ModalApi
          item={modal}
          onClose={() => setModal(null)}
          onSalvo={() => {
            void carregarConta();
            void carregarIntegracoes();
          }}
        />
      )}

      {crmAberto && <ModalCrm onClose={() => setCrmAberto(false)} onConectado={conectouCrm} />}
        </>
      ) : (
        /* Seção SKILLS — ESPELHO ESTRUTURAL das Integrações (SkillsEspelho):
           mesma ordem e mesma língua visual, com as quatro trocas do dono:
             Destaques           → Top criadores da comunidade (em breve)
             Uso de tokens       → Skills da comunidade        (em breve)
             catálogo            → catálogo de skills          (o real, do disco)
             Minhas integrações  → Minhas skills               (as da conta)
           As duas seções de comunidade são espaços ESTRUTURADOS e honestos
           ("em breve") — nada inventado. */
        <SkillsEspelho />
      )}

      {/* o menu de 4 abas no RODAPÉ, só no celular; no desktop ele é a pílula
          do cabeçalho. O espaço acima evita que a barra cubra o fim da página. */}
      <div aria-hidden className="h-6 lg:hidden" />
      <BarraDeAbas
        rotuloAria="Alternar entre Dashboard, Cosmic Agent, Integrações e Skills"
        ativo="dashboard"
        onTrocar={trocarAba}
        opcoes={[
          { id: "dashboard", rotulo: "Dashboard" },
          { id: "cosmic", rotulo: "Cosmic Agent" },
          { id: "integracoes", rotulo: "Integrações" },
          { id: "skills", rotulo: "Skills" },
        ]}
      />
    </Shell>
  );
}
