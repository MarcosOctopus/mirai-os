"use client";

// Estado do histórico de conversas no NAVEGADOR — uma fonte só para os dois
// lugares que mostram a mesma coisa: a lista da lateral (Shell) e o chat
// (ChatEscrito). Sem Context/Provider: um módulo com assinatura e
// useSyncExternalStore resolve, e funciona igual na navegação entre páginas
// (o módulo sobrevive à troca de rota porque o bundle é o mesmo).
//
// A verdade mora no servidor (/api/conversas). Aqui é só o espelho: a lista,
// qual está aberta e se a primeira carga já aconteceu.
import { useSyncExternalStore } from "react";

export type ConversaResumo = {
  id: string;
  titulo: string;
  atualizada_em: string;
};

export type EstadoConversas = {
  lista: ConversaResumo[];
  aberta: string | null;
  carregada: boolean;
};

const INICIAL: EstadoConversas = { lista: [], aberta: null, carregada: false };

// Snapshot imutável: troca de referência a cada mudança (é o que o React
// compara). Nunca se muta `estado` no lugar.
let estado: EstadoConversas = INICIAL;
const ouvintes = new Set<() => void>();
let buscando = false;

function definir(patch: Partial<EstadoConversas>) {
  estado = { ...estado, ...patch };
  for (const f of ouvintes) f();
}

function assinar(f: () => void) {
  ouvintes.add(f);
  return () => {
    ouvintes.delete(f);
  };
}

export function useConversas(): EstadoConversas {
  return useSyncExternalStore(
    assinar,
    () => estado,
    () => INICIAL,
  );
}

/** Lê a lista da conta. Idempotente: chamadas concorrentes não duplicam. */
export async function carregarLista(): Promise<ConversaResumo[]> {
  if (buscando) return estado.lista;
  buscando = true;
  try {
    const r = await fetch("/api/conversas", { cache: "no-store" });
    const j = r.ok ? await r.json() : null;
    const lista: ConversaResumo[] = Array.isArray(j?.conversas) ? j.conversas : [];
    // A conversa aberta some da lista (apagada em outra aba)? Então solta.
    const aberta =
      estado.aberta && lista.some((c) => c.id === estado.aberta) ? estado.aberta : null;
    definir({ lista, aberta, carregada: true });
    return lista;
  } catch {
    definir({ carregada: true });
    return estado.lista;
  } finally {
    buscando = false;
  }
}

export function definirAberta(id: string | null) {
  if (estado.aberta === id) return;
  definir({ aberta: id });
}

/**
 * Cria uma conversa NOVA no servidor e a coloca no topo da lista. Devolve o id
 * (ou "" se não deu para criar — aí o envio cria no /api/chat e adota o id que
 * vier no header). Nunca inventa id no cliente: o id é do servidor.
 */
export async function novaConversa(): Promise<string> {
  try {
    const r = await fetch("/api/conversas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const j = await r.json().catch(() => null);
    const c: ConversaResumo | null = j?.conversa ?? null;
    if (!c?.id) return "";
    definir({ lista: [c, ...estado.lista], aberta: c.id, carregada: true });
    return c.id;
  } catch {
    return "";
  }
}

/** Apaga no servidor e ajusta lista/aberta no espelho. */
export async function apagarConversaCliente(id: string): Promise<void> {
  try {
    await fetch(`/api/conversas/${id}`, { method: "DELETE" });
  } catch {
    /* sem rede: a lista se ajusta localmente de qualquer forma */
  }
  const lista = estado.lista.filter((c) => c.id !== id);
  const aberta = estado.aberta === id ? (lista[0]?.id ?? null) : estado.aberta;
  definir({ lista, aberta });
}
