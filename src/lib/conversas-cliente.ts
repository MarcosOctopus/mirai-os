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
  /** 0/1 — vem do servidor. `1` = favoritada (fica no topo da lateral). */
  favorita?: number;
};

export type EstadoConversas = {
  lista: ConversaResumo[];
  aberta: string | null;
  carregada: boolean;
  /**
   * A pessoa pediu uma conversa EM BRANCO ("+ Novo") e ainda não enviou nada.
   *
   * Por que existe (dono, 14/10/2026: *"toda hora que clico no +novo vc cria uma
   * conversa nova. Só pode criar conversa nova quando inicia o chat"*): antes o
   * "+ Novo" fazia POST e criava a conversa na hora — clicar três vezes enchia a
   * lista de conversas vazias. Agora o clique só abre a tela em branco; a
   * conversa nasce no ENVIO da primeira mensagem.
   *
   * E ele é preciso porque `aberta: null` sozinho não basta: há um efeito que
   * reabre a última conversa quando `aberta` é nula (é o que faz a tela abrir na
   * conversa de sempre). Sem esta bandeira, o "+ Novo" reabriria a última —
   * pareceria que o botão não faz nada.
   */
  emBranco: boolean;
};

const INICIAL: EstadoConversas = { lista: [], aberta: null, carregada: false, emBranco: false };

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

/** Abre uma conversa existente (ou solta, com null). Encerra o "em branco". */
export function definirAberta(id: string | null) {
  if (estado.aberta === id && !estado.emBranco) return;
  definir({ aberta: id, emBranco: false });
}

/**
 * "+ Novo": abre uma conversa EM BRANCO — SEM criar nada no servidor.
 * A conversa nasce no envio da primeira mensagem (o /api/chat cria e devolve o
 * id no header `x-conversa-id`). Clicar várias vezes não deixa lixo na lista.
 */
export function abrirEmBranco() {
  definir({ aberta: null, emBranco: true });
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
    definir({ lista: [c, ...estado.lista], aberta: c.id, carregada: true, emBranco: false });
    return c.id;
  } catch {
    return "";
  }
}

/**
 * Favorita/desfavorita no servidor e reordena o espelho (favoritas no topo).
 * A ORDEM é refeita aqui do mesmo jeito que o servidor ordena — assim a lista
 * não "pula" quando a próxima carga chegar: o que a tela mostra já é o que o
 * servidor devolveria.
 */
export async function favoritarConversaCliente(id: string, favorita: boolean): Promise<void> {
  // Otimista: a estrela responde na hora; se o servidor recusar, volta atrás.
  const antes = estado.lista;
  aplicar(id, favorita ? 1 : 0);
  try {
    const r = await fetch(`/api/conversas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favorita }),
    });
    if (!r.ok) definir({ lista: antes });
  } catch {
    definir({ lista: antes }); // sem rede: não finge que gravou
  }
}

/** Troca a bandeira de UMA conversa e reordena (favoritas primeiro, recentes
 *  dentro de cada grupo). Puro: devolve uma lista nova, nunca muta a antiga. */
function aplicar(id: string, favorita: number) {
  const lista = estado.lista
    .map((c) => (c.id === id ? { ...c, favorita } : c))
    .sort((a, b) => {
      const f = (b.favorita ? 1 : 0) - (a.favorita ? 1 : 0);
      if (f !== 0) return f;
      return (b.atualizada_em || "").localeCompare(a.atualizada_em || "");
    });
  definir({ lista });
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
  definir({ lista, aberta, emBranco: false });
}
