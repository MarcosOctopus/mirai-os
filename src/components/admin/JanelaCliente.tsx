"use client";

/**
 * JANELA DE CLIENTE — cadastro manual numa janela, no mesmo padrão da janela de plano.
 *
 * Pedido do dono, 19/11/2026: *"esse design na parte de listar os clientes (...) quero um espaço
 * pra colocar cliente manual também"*. Ele aprovou a janela da tela de planos ("ficou maneiro
 * agora"), então o cadastro manual saiu de dentro da lista e virou a mesma janela.
 *
 * A criação NÃO põe senha: cria a organização e o convite do dono — a conta nasce quando a pessoa
 * entrar com aquele e-mail (o plano já fica escolhido aqui).
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { IconeFechar } from "@/components/dash/icons";

const campo =
  "rounded-[10px] border border-dash-hair/10 bg-dash-bg px-3.5 py-2.5 text-[13px] text-dash-fg outline-none placeholder:text-dash-dim focus:border-dash-brand/60";

export interface OpcaoProduto {
  id: string;
  rotulo: string;
}

export interface OpcaoPlano {
  plan_id: string;
  nome: string;
}

export default function JanelaCliente({
  aberto,
  aoFechar,
  criando,
  erro,
  aoCriar,
  produtos,
  planos,
  nome,
  setNome,
  email,
  setEmail,
  produto,
  setProduto,
  plano,
  setPlano,
}: {
  aberto: boolean;
  aoFechar: () => void;
  criando: boolean;
  erro: string;
  aoCriar: () => void;
  produtos: OpcaoProduto[];
  planos: OpcaoPlano[];
  nome: string;
  setNome: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  produto: string;
  setProduto: (v: string) => void;
  plano: string;
  setPlano: (v: string) => void;
}) {
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFechar();
    };
    document.addEventListener("keydown", aoTeclar);
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = antes;
    };
  }, [aberto, aoFechar]);

  if (!aberto || !montado) return null;

  const podeCriar = nome.trim().length > 1 && email.includes("@") && !criando;

  /* Portal pelo mesmo motivo da janela de plano: a barra lateral tem `transform`, e
     `transform` prende `position: fixed`. */
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="fechar"
        onClick={aoFechar}
        className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-[2px]"
      />

      <div className="relative flex w-[min(680px,95vw)] flex-col overflow-hidden rounded-[24px] border border-dash-hair/[0.09] bg-dash-card shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]">
        <header className="flex items-center gap-3 border-b border-dash-hair/[0.07] px-6 py-4">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-dash-fg">Novo cliente</p>
            <p className="mt-0.5 text-[11.5px] text-dash-muted">
              Cria o espaço e o convite do dono. A conta nasce quando a pessoa entrar.
            </p>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-full text-dash-dim transition hover:bg-dash-raise/60 hover:text-dash-fg"
            title="fechar (Esc)"
          >
            <IconeFechar className="h-4 w-4" />
          </button>
        </header>

        <div className="px-6 py-5">
          {erro && (
            <p className="mb-4 rounded-[12px] border border-dash-brand/30 bg-dash-brand/[0.08] px-3.5 py-2.5 text-[12px] text-dash-fg">
              {erro}
            </p>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-[11.5px] text-dash-muted">
              Nome
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome da pessoa ou empresa"
                className={campo}
                autoFocus
              />
            </label>
            <label className="flex flex-col gap-1.5 text-[11.5px] text-dash-muted">
              E-mail (o login dela)
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="pessoa@empresa.com"
                className={campo}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-[11.5px] text-dash-muted">
              Produto
              <select
                value={produto}
                onChange={(e) => {
                  setProduto(e.target.value);
                  setPlano("");
                }}
                className={campo}
              >
                {produtos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.rotulo}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-[11.5px] text-dash-muted">
              Plano inicial
              <select value={plano} onChange={(e) => setPlano(e.target.value)} className={campo}>
                <option value="">Free (padrão)</option>
                {planos.map((p) => (
                  <option key={p.plan_id} value={p.plan_id}>
                    {p.nome || p.plan_id}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p className="mt-4 text-[11px] leading-relaxed text-dash-dim">
            Nada de senha: a conta nasce quando a pessoa entrar com esse e-mail — e ela cai direto
            neste espaço, no plano escolhido aqui.
          </p>
        </div>

        <footer className="flex items-center gap-4 border-t border-dash-hair/[0.07] px-6 py-4">
          <span className="text-[11.5px] text-dash-dim">
            o plano pode ser trocado depois, na própria lista
          </span>
          <button
            type="button"
            onClick={aoCriar}
            disabled={!podeCriar}
            className="ml-auto rounded-[10px] bg-dash-brand px-5 py-2.5 text-[12px] font-semibold text-white shadow-[0_10px_30px_-16px_rgb(255_117_31/0.9)] transition hover:bg-dash-brandHi disabled:cursor-not-allowed disabled:opacity-35 disabled:shadow-none"
          >
            {criando ? "Criando…" : "Criar cliente"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
