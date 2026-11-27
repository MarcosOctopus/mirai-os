/**
 * APRENDIZADO (lado do navegador) — as três portas do gatilho automático e o
 * atalho "Guarda isso".
 *
 * Regra de ouro: nada aqui pode ATRASAR nem QUEBRAR a conversa. Tudo é
 * disparado e esquecido (`void`, `sendBeacon`) — a resposta do chat segue o
 * caminho dela.
 *
 * As portas do "fim da conversa" são três porque nenhuma sozinha cobre o que
 * acontece de verdade no navegador: a pessoa troca de conversa, fecha a aba, ou
 * simplesmente para de escrever e vai fazer outra coisa.
 */

export type MensagemParaNota = {
  role: "user" | "assistant";
  content: string;
  anexos?: { id: string }[];
};

export type RespostaAprendizado = {
  ok: boolean;
  ja_existia?: boolean;
  caminho?: string;
  destilacao?: "ia" | "resumo";
  aviso?: string;
  ignorado?: string;
  error?: string;
};

/** Tempo parado na conversa que já conta como "acabou" (5 min). */
export const OCIOSIDADE_MS = 5 * 60 * 1000;

/* ── O PEDIDO EM TEXTO ────────────────────────────────────────────────────
 * Lista de expressões, não regex esperta: o que vale é o pedido no imperativo
 * ("guarda isso", "salva isso no acervo"), não uma palavra solta no meio da
 * frase. Comparação sobre o texto normalizado (sem acento, minúsculo). */
const PEDIDOS = [
  "guarda isso",
  "guarde isso",
  "guardar isso",
  "guarda essa conversa",
  "guarda esta conversa",
  "guarda a conversa",
  "guarda no acervo",
  "guarde no acervo",
  "guarda na arca",
  "salva isso",
  "salve isso",
  "salvar isso",
  "salva essa conversa",
  "salva esta conversa",
  "salva a conversa",
  "salva no acervo",
  "salve no acervo",
  "salva na arca",
  "anota isso",
  "anote isso",
  "anotar isso",
  "anota no acervo",
  "anote no acervo",
  "anota essa conversa",
  "registra isso",
  "registre isso",
  "registra no acervo",
  "põe isso no acervo",
  "poe isso no acervo",
  "aprende isso",
];

/** A pessoa pediu, na última mensagem, para guardar a conversa? */
export function pediuParaGuardar(texto: string): boolean {
  const t = (texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (!t || t.length > 600) return false;
  return PEDIDOS.some((p) => t.includes(p));
}

/** Anexos só com o id: o servidor confere a posse ao ler cada um. */
export function paraNota(mensagens: { role: "user" | "assistant"; content: string; anexos?: { id: string }[] }[]): MensagemParaNota[] {
  return mensagens
    .filter((m) => (m.content || "").trim() || m.anexos?.length)
    .map((m) => ({
      role: m.role,
      content: (m.content || "").slice(0, 6000),
      ...(m.anexos?.length ? { anexos: m.anexos.map((a) => ({ id: a.id })) } : {}),
    }));
}

/** "Guarda isso" (e o botão): grava AGORA e devolve o que o acervo respondeu. */
export async function guardarAgora(
  conversaId: string,
  mensagens: MensagemParaNota[],
): Promise<RespostaAprendizado> {
  try {
    const r = await fetch("/api/aprendizado", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modo: "agora", conversaId, mensagens }),
    });
    const d = (await r.json().catch(() => null)) as RespostaAprendizado | null;
    if (!r.ok) return { ok: false, error: d?.error || `a rota respondeu ${r.status}` };
    return d || { ok: true };
  } catch {
    return { ok: false, error: "caiu a conexão" };
  }
}

/**
 * O fecho da conversa, por `sendBeacon` — a única forma que sobrevive a
 * `pagehide`/troca de aba (o `fetch` é cancelado quando a página morre).
 * `sendBeacon` manda o cookie da sessão: a rota sabe de quem é a conversa.
 */
export function guardarNoFim(conversaId: string, mensagens: MensagemParaNota[]): boolean {
  if (!conversaId || !mensagens.length) return false;
  try {
    const corpo = JSON.stringify({ modo: "fim", conversaId, mensagens });
    const blob = new Blob([corpo], { type: "application/json" });
    return navigator.sendBeacon("/api/aprendizado", blob);
  } catch {
    // Navegador sem sendBeacon: tenta o fetch comum, sem esperar.
    try {
      void fetch("/api/aprendizado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modo: "fim", conversaId, mensagens }),
        keepalive: true,
      });
    } catch {
      /* nada a fazer: a próxima porta tenta de novo */
    }
    return false;
  }
}
