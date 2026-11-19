"use client";

/**
 * SELETOR DE MODELO — o dropdown do Super Nova (e do que a pessoa trouxer).
 *
 * ─── Por que ele existe (dono, 19/11/2026, verbatim) ─────────────────────────
 *
 *   "no chat tem as opcoes de mais avancado e mais leve no nosso modelo que
 *    chamamos de super nova. Agora oq quero é coloque em dropdown e que quando
 *    as pessoas colcoarem a api deles apareca la blz?"
 *
 * ─── As decisões de desenho, e por quê ───────────────────────────────────────
 *
 * 1. O ATIVO fica visível no botão. Os dois níveis eram dois botões lado a lado;
 *    em dropdown, se o rótulo só aparecesse aberto, o cliente não saberia com o
 *    que está falando.
 * 2. O menu vai para um PORTAL no `<body>`, com `position: fixed` e `z-index:
 *    100` — e os estilos que decidem VISIBILIDADE são inline, não classe.
 *    ⚠️ Isto não é preciosismo: medido em produção, o botão aparecia com a
 *    setinha e o menu **não abria**. O composer vive dentro de containers com
 *    stacking context (`tela-cheia ... overflow-hidden`, camadas de crossfade
 *    com `z-10`), e um menu absoluto ali dentro é cortado ou fica atrás. É o
 *    mesmo conserto já usado em `JanelaCliente`: fora da árvore do composer,
 *    nada o prende nem o cobre. O inline garante que ele apareça mesmo que uma
 *    classe não seja gerada pelo Tailwind.
 * 3. A lista vem do servidor (`/api/modelos`) e SÓ na primeira abertura: é quando
 *    ela serve para alguma coisa, e assim quem nunca abre não paga uma ida ao
 *    provedor da pessoa a cada conversa.
 * 4. Quem não tem chave própria vê o convite, não um vazio: é o caminho para os
 *    modelos dele aparecerem aqui.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { IconeSeta } from "@/components/dash/icons";

type Modelo = { id: string; nome: string; dica?: string; nivel?: string; provedor?: string };

/** Os nossos, para o botão já nascer certo antes de a lista chegar. */
const CONHECIDOS: Record<string, string> = {
  "supernova-flash": "Super Nova Leve",
  "supernova-high": "Super Nova Avançado",
};

/** O menu tem largura fixa; a altura é o teto do que ele pode ocupar. */
const LARGURA = 320;
const ALTURA_MAX = 340;

export default function SeletorDeModelo({
  modelo,
  aoTrocar,
  desabilitado,
}: {
  modelo: string;
  aoTrocar: (id: string) => void;
  desabilitado?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [jaBuscou, setJaBuscou] = useState(false);
  const [nossos, setNossos] = useState<Modelo[]>([]);
  const [proprios, setProprios] = useState<Modelo[]>([]);
  const [provedor, setProvedor] = useState<string>("");
  const [avisoProprio, setAvisoProprio] = useState<string>("");
  const [pos, setPos] = useState<{ esquerda: number; base: number } | null>(null);

  const botao = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const nomeAtual =
    CONHECIDOS[modelo] || [...nossos, ...proprios].find((m) => m.id === modelo)?.nome || modelo;

  /** Onde o menu cai: logo acima do botão, sem sair da tela pela esquerda. */
  const medir = useCallback(() => {
    const b = botao.current;
    if (!b) return;
    const r = b.getBoundingClientRect();
    const esquerda = Math.max(8, Math.min(r.left, window.innerWidth - LARGURA - 8));
    setPos({ esquerda, base: Math.max(8, window.innerHeight - r.top + 8) });
  }, []);

  // Fecha ao clicar fora e no Escape. O menu mora num portal, então "dentro" são
  // DOIS elementos (o botão e o menu) — olhar só o botão fecharia ao clicar nele.
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: Event) => {
      const alvo = e.target as Node;
      if (botao.current?.contains(alvo) || menu.current?.contains(alvo)) return;
      setAberto(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    /* Rolar ou redimensionar move o botão e deixaria o menu solto no ar: fechar
       é mais honesto que um menu desalinhado. */
    const saiu = () => setAberto(false);
    document.addEventListener("pointerdown", fora, true);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", saiu, true);
    window.addEventListener("resize", saiu);
    return () => {
      document.removeEventListener("pointerdown", fora, true);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", saiu, true);
      window.removeEventListener("resize", saiu);
    };
  }, [aberto]);

  async function buscar() {
    if (jaBuscou || carregando) return;
    setCarregando(true);
    try {
      const r = await fetch("/api/modelos", { cache: "no-store" });
      const d = (await r.json().catch(() => ({}))) as {
        supernova?: Modelo[];
        proprios?: Modelo[];
        provedor?: string;
        erroProprio?: string;
      };
      setNossos(d.supernova || []);
      setProprios(d.proprios || []);
      setProvedor(d.provedor || "");
      setAvisoProprio(d.erroProprio || "");
    } catch {
      /* sem lista: o botão continua funcionando com os nomes conhecidos */
    } finally {
      setCarregando(false);
      setJaBuscou(true);
    }
  }

  function alternar() {
    const vaiAbrir = !aberto;
    if (vaiAbrir) medir();
    setAberto(vaiAbrir);
    if (vaiAbrir) void buscar();
  }

  const grupos: { titulo: string; itens: Modelo[] }[] = [
    {
      titulo: "Super Nova",
      itens: nossos.length
        ? nossos
        : [
            { id: "supernova-flash", nome: "Super Nova Leve", dica: "resposta rápida — o dia a dia" },
            {
              id: "supernova-high",
              nome: "Super Nova Avançado",
              dica: "raciocínio profundo, código e análise",
            },
          ],
    },
  ];
  if (proprios.length) {
    grupos.push({ titulo: `Sua API${provedor ? ` — ${provedor}` : ""}`, itens: proprios });
  }

  const doProprio = proprios.some((m) => m.id === modelo);

  /** Casca do menu: o que decide aparecer/ser lido vai INLINE, não em classe. */
  const casca: React.CSSProperties = {
    position: "fixed",
    left: pos?.esquerda ?? 8,
    bottom: pos?.base ?? 8,
    width: LARGURA,
    maxHeight: ALTURA_MAX,
    overflowY: "auto",
    zIndex: 100,
    background: "#161719",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 16,
    boxShadow: "0 24px 60px rgba(0,0,0,0.65)",
    padding: 6,
    color: "#F4F4F5",
  };

  return (
    <>
      <button
        ref={botao}
        type="button"
        onClick={alternar}
        disabled={desabilitado}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label={`Modelo: ${nomeAtual}`}
        title={modelo}
        className={`flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium transition ${
          doProprio ? "text-dash-fg" : "text-dash-muted"
        } ${
          desabilitado
            ? "cursor-not-allowed opacity-50"
            : "hover:bg-dash-hair/[0.06] hover:text-dash-fg"
        }`}
      >
        <span className="max-w-[190px] truncate">{nomeAtual}</span>
        <IconeSeta className={`h-3 w-3 transition-transform ${aberto ? "" : "rotate-180"}`} />
      </button>

      {aberto &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div ref={menu} role="menu" aria-label="Modelo do chat" style={casca}>
            {carregando && (
              <div style={{ padding: "8px 12px", fontSize: 11, opacity: 0.6 }}>
                falando com o provedor…
              </div>
            )}

            {grupos.map((g) => (
              <div key={g.titulo}>
                <div
                  style={{
                    padding: "8px 12px 4px",
                    fontSize: 10,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    opacity: 0.5,
                  }}
                >
                  {g.titulo}
                </div>
                {g.itens.map((m) => {
                  const escolhido = m.id === modelo;
                  return (
                    <button
                      key={`${g.titulo}-${m.id}`}
                      type="button"
                      role="menuitemradio"
                      aria-checked={escolhido}
                      onClick={() => {
                        aoTrocar(m.id);
                        setAberto(false);
                      }}
                      style={{
                        display: "flex",
                        width: "100%",
                        flexDirection: "column",
                        alignItems: "flex-start",
                        gap: 2,
                        padding: "8px 12px",
                        borderRadius: 12,
                        textAlign: "left",
                        background: escolhido ? "rgba(255,117,31,0.14)" : "transparent",
                        cursor: "pointer",
                      }}
                    >
                      <span
                        style={{ fontSize: 12, color: escolhido ? "#FF751F" : "#F4F4F5" }}
                      >
                        {m.nome}
                      </span>
                      <span style={{ fontSize: 10, opacity: 0.5 }}>{m.dica || m.id}</span>
                    </button>
                  );
                })}
              </div>
            ))}

            {jaBuscou && proprios.length === 0 && (
              <div
                style={{
                  marginTop: 4,
                  borderTop: "1px solid rgba(255,255,255,0.08)",
                  padding: "10px 12px",
                  fontSize: 10.5,
                  lineHeight: 1.5,
                  opacity: 0.55,
                }}
              >
                {avisoProprio
                  ? `Sua chave não respondeu (${avisoProprio}).`
                  : "Traga a sua própria chave de API em Chaves de API e os modelos dela aparecem aqui."}
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
