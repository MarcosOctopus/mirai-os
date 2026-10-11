"use client";

// Corpo do chat por ESCRITO — o MESMO chat em dois lugares: a página `/chat`
// (cartão dentro da casca) e a tela inicial `/` (tela cheia, ao lado do menu).
//
// O HISTÓRICO agora é da CONTA (servidor), não do navegador: as conversas vêm
// de /api/conversas e o envio guarda a pergunta e a resposta na conversa aberta.
// A lista da lateral mora no Shell (uma fonte só, `@/lib/conversas-cliente`);
// aqui o componente só LÊ a conversa aberta e grava os turnos.
//
// Mesma rota de sempre (`POST /api/chat`, streaming formato OpenAI) e os mesmos
// dois modos. Anexos seguem iguais: sobe o arquivo (POST /api/upload), o id vai
// junto da mensagem e o backend extrai o conteúdo para o modelo.
//
// TELA DE INÍCIO (estado VAZIO da conversa, como o começo do ChatGPT): quando a
// conversa aberta não tem NENHUMA mensagem, em vez da lista vazia o componente
// mostra um palco limpo — o título "O que vamos explorar hoje?" e a caixa de
// escrever no meio. É a MESMA caixa de sempre, só posicionada no centro e com o
// campo que cresce ao focar. Assim que a primeira mensagem sai, cai na conversa
// normal (a de hoje), sem mudança nenhuma no comportamento da conversa.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  IconeClipe,
  IconeDocumento,
  IconeFechar,
  IconeImagem,
  IconeMais,
  IconeMicrofone,
  IconeMusica,
  IconeSeta,
} from "@/components/dash/icons";
import {
  MAX_UPLOAD_ROTULO,
  MIMES_PERMITIDOS,
  type AnexoCliente,
  validarArquivoNoNavegador,
} from "@/lib/upload-tipos";
import {
  carregarLista,
  definirAberta,
  novaConversa,
  useConversas,
} from "@/lib/conversas-cliente";
import SessaoVencida, { ehSessaoVencida } from "@/components/dash/SemSessao";

type Papel = "user" | "assistant";
type Mensagem = { role: Papel; content: string; anexos?: AnexoCliente[] };

type Pendente = {
  tempId: string;
  nome: string;
  tamanho: number;
  estado: "subindo" | "erro";
  erro?: string;
};

const ACEITA_INPUT = Object.entries(MIMES_PERMITIDOS)
  .map(([mime, def]) => `${mime},.${def.ext}`)
  .join(",");

function novoId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function IconeDoAnexo({ categoria, className }: { categoria: AnexoCliente["categoria"]; className?: string }) {
  if (categoria === "imagem") return <IconeImagem className={className} />;
  if (categoria === "audio") return <IconeMusica className={className} />;
  return <IconeDocumento className={className} />;
}

export default function ChatEscrito({
  cheio = false,
  onInicioChange,
}: {
  cheio?: boolean;
  /** Avisa o pai quando a TELA DE INÍCIO (conversa vazia) está no ar — a tela
      inicial usa isso para dar mais corpo ao seletor Chat/Orb enquanto o palco
      limpo está à mostra. Não interfere na conversa em andamento. */
  onInicioChange?: (inicio: boolean) => void;
}) {
  const { lista, aberta, carregada } = useConversas();

  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [texto, setTexto] = useState("");
  // O CHAT É SÓ CONVERSA (dono, 10/10/2026): o modo "arquiteto" saiu DESTA tela —
  // o Arquiteto tem a própria tela, alcançada pelo menu. Antes havia duas abas
  // (conversa/arquiteto) aqui, e o dono foi claro: "não tem modo arquiteto" no chat.
  const modo = "conversa";
  const [enviando, setEnviando] = useState(false);
  const [carregandoConversa, setCarregandoConversa] = useState(false);
  // SESSÃO VENCIDA (dono, 11/10/2026): antes o chat dizia "Não consegui falar com
  // a Mirai agora (401). Tenta de novo." — mandava repetir o que NUNCA ia dar
  // certo, sem dizer a causa nem dar caminho de volta. A causa era a sessão.
  const [semSessao, setSemSessao] = useState(false);

  // ── anexos ───────────────────────────────────────────────────────
  const [anexos, setAnexos] = useState<AnexoCliente[]>([]);
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [arrastando, setArrastando] = useState(false);
  const [uso, setUso] = useState<{ usado_bytes: number; limite_bytes: number } | null>(null);
  const inputArquivo = useRef<HTMLInputElement>(null);

  const fim = useRef<HTMLDivElement>(null);
  // Qual conversa já foi CARREGADA do servidor (evita recarregar a cada render
  // e evita limpar a tela quando o envio acabou de criar a conversa).
  const carregadaRef = useRef<string | null>(null);

  /* ── tela de início: a caixa que cresce e o ditado por voz ─────── */
  // A caixa começa com UMA linha (40px) e cresce conforme o texto até um teto
  // (200px); passando disso, rola por dentro. Tudo medido no navegador.
  // A caixa fechada é FINA (uma linha só, como a do GPT). O foco NÃO a
  // aumenta: ela só abre quando o texto passa a pedir outra linha — e a
  // transição de altura (CSS) faz o efeito de abrir.
  const ALTURA_UMA_LINHA = 40;
  const ALTURA_MAX = 200;
  const caixa = useRef<HTMLTextAreaElement>(null);
  const [caixaFocada, setCaixaFocada] = useState(false);

  // Ditado (Web Speech API do próprio navegador, pt-BR). Sem suporte: o botão
  // DIZ isso e fica desabilitado — nunca finge que está gravando.
  const [temDitado, setTemDitado] = useState(false);
  const [ouvindo, setOuvindo] = useState(false);
  const [avisoVoz, setAvisoVoz] = useState<string | null>(null);
  const reconhecimento = useRef<any>(null);
  const falaBase = useRef(""); // o que já estava escrito quando o ditado começou
  const falaFinal = useRef(""); // trechos que o reconhecedor já fechou

  /* ── consumo do espaço (contrato do perfil) ────────────────────── */
  const atualizarUso = useCallback(() => {
    fetch("/api/perfil/armazenamento", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setUso(d))
      .catch(() => {});
  }, []);
  useEffect(() => {
    atualizarUso();
  }, [atualizarUso]);

  /* ── histórico da conta ────────────────────────────────────────── */
  useEffect(() => {
    void carregarLista();
  }, []);

  // Sem conversa escolhida, abre a MAIS RECENTE (o pedido: `/` abre a última).
  useEffect(() => {
    if (carregada && !aberta && lista.length) definirAberta(lista[0].id);
  }, [carregada, aberta, lista]);

  // Carrega as mensagens quando a conversa aberta muda. Não roda durante um
  // envio (senão apagaria as mensagens otimistas que a tela já mostrou).
  useEffect(() => {
    if (!aberta) {
      carregadaRef.current = null;
      return;
    }
    if (enviando) return;
    if (carregadaRef.current === aberta) return;
    carregadaRef.current = aberta;
    setCarregandoConversa(true);
    fetch(`/api/conversas/${aberta}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const ms: { papel: Papel; conteudo: string }[] = d?.conversa?.mensagens || [];
        setMensagens(ms.map((m) => ({ role: m.papel, content: m.conteudo })));
      })
      .catch(() => setMensagens([]))
      .finally(() => setCarregandoConversa(false));
  }, [aberta, enviando]);

  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [mensagens]);

  /* ── a TELA DE INÍCIO: quando ela deve aparecer ────────────────── */
  // Regra: só há tela de início quando a conversa aberta está REALMENTE vazia.
  // Uma conversa COM mensagens nunca cai aqui (mensagens.length > 0). Enquanto
  // a lista carrega, ou a conversa da vez está vindo do servidor, ou ainda não
  // escolhemos qual abrir, também não é "início" — é espera.
  const vaiAbrirAlguma = !aberta && lista.length > 0;
  const mostrarInicio =
    carregada && !enviando && !carregandoConversa && !vaiAbrirAlguma && mensagens.length === 0;

  // Avisa a tela inicial (o pai) para o seletor Chat/Orb ganhar corpo no palco.
  useEffect(() => {
    onInicioChange?.(mostrarInicio);
  }, [mostrarInicio, onInicioChange]);

  /* ── a caixa que cresce (auto-resize medido) ───────────────────── */
  const ajustarCaixa = useCallback(() => {
    const el = caixa.current;
    if (!el) return;
    const piso = ALTURA_UMA_LINHA;
    // volta a "auto" para o navegador MEDIR o conteúdo; depois fixa em px — a
    // transição de altura (CSS) faz o crescer/encolher suave.
    el.style.height = "auto";
    const alvo = Math.min(Math.max(el.scrollHeight, piso), ALTURA_MAX);
    el.style.height = `${alvo}px`;
  }, [caixaFocada]);

  useEffect(() => {
    ajustarCaixa();
    // `mostrarInicio` entra na lista para RE-MEDIR quando o palco limpo aparece
    // (o texto pode ter vindo de antes, e a caixa precisa nascer no tamanho certo).
  }, [texto, caixaFocada, mostrarInicio, ajustarCaixa]);

  /* ── ditado por voz (Web Speech API) ───────────────────────────── */
  useEffect(() => {
    const R =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setTemDitado(typeof R === "function");
  }, []);

  const pararDitado = useCallback(() => {
    try {
      reconhecimento.current?.stop();
    } catch {
      /* já parado */
    }
    reconhecimento.current = null;
    setOuvindo(false);
  }, []);

  const alternarDitado = useCallback(() => {
    const R =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (typeof R !== "function") {
      setAvisoVoz("Este navegador não oferece ditado por voz.");
      return;
    }
    if (ouvindo) {
      pararDitado();
      return;
    }
    const rec = new R();
    rec.lang = "pt-BR";
    rec.continuous = true;
    rec.interimResults = true;
    falaBase.current = texto.trim();
    falaFinal.current = "";
    rec.onresult = (e: any) => {
      let fechado = "";
      let parcial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const t = r?.[0]?.transcript || "";
        if (r.isFinal) fechado += t;
        else parcial += t;
      }
      if (fechado) falaFinal.current = `${falaFinal.current} ${fechado}`.trim();
      const junto = [falaBase.current, falaFinal.current, parcial]
        .map((s) => s.trim())
        .filter(Boolean)
        .join(" ");
      setTexto(junto);
    };
    rec.onerror = (e: any) => {
      const codigo = e?.error || "";
      if (codigo === "not-allowed" || codigo === "service-not-allowed") {
        setAvisoVoz("Permita o microfone para ditar.");
      } else if (codigo !== "aborted" && codigo !== "no-speech") {
        setAvisoVoz("O ditado parou. Tente de novo.");
      }
      setOuvindo(false);
      reconhecimento.current = null;
    };
    rec.onend = () => {
      setOuvindo(false);
      reconhecimento.current = null;
    };
    reconhecimento.current = rec;
    try {
      rec.start();
      setAvisoVoz(null);
      setOuvindo(true);
    } catch {
      setOuvindo(false);
      reconhecimento.current = null;
      setAvisoVoz("Não consegui ligar o ditado agora.");
    }
  }, [ouvindo, pararDitado, texto]);

  // Ao sair da tela, o microfone NÃO fica aberto.
  useEffect(
    () => () => {
      try {
        reconhecimento.current?.stop();
      } catch {
        /* nada a fazer */
      }
    },
    [],
  );

  /* ── anexos: subir ─────────────────────────────────────────────── */
  const subirArquivos = useCallback(
    async (listaArquivos: File[]) => {
      if (!listaArquivos.length) return;
      const recusas: string[] = [];
      const aceitos: File[] = [];
      for (const f of listaArquivos) {
        const erro = validarArquivoNoNavegador(f);
        if (erro) recusas.push(erro);
        else aceitos.push(f);
      }
      if (recusas.length) setAvisos((a) => [...a, ...recusas]);
      if (!aceitos.length) return;

      const novosPendentes: Pendente[] = aceitos.map((f) => ({
        tempId: novoId(),
        nome: f.name,
        tamanho: f.size,
        estado: "subindo",
      }));
      setPendentes((p) => [...p, ...novosPendentes]);

      const form = new FormData();
      for (const f of aceitos) form.append("files", f);

      try {
        const r = await fetch("/api/upload", { method: "POST", body: form });
        const j = await r.json().catch(() => null);
        if (r.ok && j?.anexos?.length) {
          setAnexos((a) => [...a, ...(j.anexos as AnexoCliente[])]);
          setPendentes((p) => p.filter((x) => !novosPendentes.some((n) => n.tempId === x.tempId)));
          if (j.recusados?.length) {
            setAvisos((a) => [...a, ...j.recusados.map((x: { nome: string; erro: string }) => `${x.nome}: ${x.erro}`)]);
          }
          atualizarUso();
        } else {
          const msg = j?.error || `não deu para subir (HTTP ${r.status}).`;
          setPendentes((p) =>
            p.map((x) => (novosPendentes.some((n) => n.tempId === x.tempId) ? { ...x, estado: "erro", erro: msg } : x)),
          );
          if (r.status === 413) atualizarUso();
        }
      } catch {
        setPendentes((p) =>
          p.map((x) =>
            novosPendentes.some((n) => n.tempId === x.tempId) ? { ...x, estado: "erro", erro: "caiu a conexão." } : x,
          ),
        );
      }
    },
    [atualizarUso],
  );

  const escolherArquivos = useCallback(
    (listaArquivos: FileList | null) => {
      if (!listaArquivos?.length) return;
      void subirArquivos(Array.from(listaArquivos));
    },
    [subirArquivos],
  );

  const removerAnexo = useCallback((id: string) => setAnexos((a) => a.filter((x) => x.id !== id)), []);
  const removerPendente = useCallback((tempId: string) => setPendentes((p) => p.filter((x) => x.tempId !== tempId)), []);

  /* ── envio (mesma rota e mesmo streaming de antes) ─────────────── */
  async function enviar() {
    const conteudo = texto.trim();
    const doTurno = anexos;
    if ((!conteudo && !doTurno.length) || enviando) return;

    // Se o ditado estava ligado, encerra: o texto vai virar mensagem.
    if (ouvindo) pararDitado();

    const msgUsuario: Mensagem = {
      role: "user",
      content: conteudo,
      anexos: doTurno.length ? doTurno : undefined,
    };
    const historico: Mensagem[] = [...mensagens, msgUsuario];
    setMensagens([...historico, { role: "assistant", content: "" }]);
    setTexto("");
    setAnexos([]);
    setEnviando(true);

    const trocarUltima = (novo: string) =>
      setMensagens((atualMsg) => {
        const copia = [...atualMsg];
        copia[copia.length - 1] = { role: "assistant", content: novo };
        return copia;
      });

    try {
      // Garante uma conversa no servidor ANTES de enviar, para o turno ter onde
      // ser guardado. Se o servidor criar outra, o header manda o id de verdade.
      let idConversa = aberta;
      if (!idConversa) {
        idConversa = await novaConversa();
        if (idConversa) carregadaRef.current = idConversa;
      }

      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: historico.map((m) => ({
            role: m.role,
            content: m.content,
            anexos: m.anexos?.map((a) => ({ id: a.id })),
          })),
          mode: modo,
          conversaId: idConversa || undefined,
        }),
      });

      const idDoServidor = r.headers.get("x-conversa-id");
      if (idDoServidor && idDoServidor !== idConversa) {
        definirAberta(idDoServidor);
        carregadaRef.current = idDoServidor;
        idConversa = idDoServidor;
      }

      if (ehSessaoVencida(r)) {
        // 401 NÃO é "tenta de novo": o token venceu e repetir nunca resolve.
        // Diz a causa e leva para a entrada — a mensagem certa para o problema certo.
        trocarUltima("Sua sessão expirou. Entre de novo para continuar — o que você escreveu não se perde.");
        setSemSessao(true);
        return;
      }
      if (!r.ok || !r.body) {
        trocarUltima(`Não consegui falar com a Mirai agora (${r.status}). Tenta de novo.`);
        return;
      }

      const leitor = r.body.getReader();
      const decodificador = new TextDecoder();
      let acumulado = "";

      while (true) {
        const { done, value } = await leitor.read();
        if (done) break;
        const bloco = decodificador.decode(value, { stream: true });
        for (const linha of bloco.split("\n")) {
          if (!linha.startsWith("data: ")) continue;
          const dado = linha.slice(6).trim();
          if (!dado || dado === "[DONE]") continue;
          try {
            const p = JSON.parse(dado);
            const pedaco: string = p.choices?.[0]?.delta?.content || "";
            if (pedaco) {
              acumulado += pedaco;
              trocarUltima(acumulado);
            }
          } catch {
            /* linha parcial do SSE */
          }
        }
      }

      if (!acumulado) trocarUltima("(resposta vazia — tenta de novo)");
    } catch {
      trocarUltima("Caiu a conexão no meio. Tenta de novo.");
    } finally {
      setEnviando(false);
      // O que acabou de ser salvo pode ter mudado título/ordem: recarrega.
      void carregarLista();
    }
  }

  const tituloAberto = lista.find((c) => c.id === aberta)?.titulo || "Nova conversa";

  /* Faixa de anexos/avisos — a MESMA nos dois palcos (tela de início e rodapé
     da conversa): só markup, o estado é o de cima. Sem duas verdades sobre o
     que está anexado. */
  const faixaAnexos = (
    <>
      {!!avisos.length && (
        <div className="mb-2 space-y-1">
          {avisos.map((a, i) => (
            <div
              key={i}
              className="flex items-start gap-2 rounded-[10px] bg-dash-bad/10 px-3 py-2 text-[11px] text-dash-bad"
            >
              <span className="min-w-0 flex-1">{a}</span>
              <button onClick={() => setAvisos((x) => x.filter((_, k) => k !== i))} aria-label="Dispensar">
                <IconeFechar className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {!!(anexos.length || pendentes.length) && (
        <div className="mb-2 flex flex-wrap gap-2">
          {anexos.map((a) => (
            <span
              key={a.id}
              className="flex items-center gap-2 rounded-[10px] border border-white/10 bg-dash-raise px-2.5 py-1.5 text-[11px] text-white/90"
            >
              {a.categoria === "imagem" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.url} alt={a.nome} className="h-6 w-6 rounded object-cover" />
              ) : (
                <IconeDoAnexo categoria={a.categoria} className="h-3.5 w-3.5 text-dash-muted" />
              )}
              <span className="max-w-[160px] truncate">{a.nome}</span>
              <button onClick={() => removerAnexo(a.id)} aria-label="Remover anexo" className="text-dash-dim hover:text-dash-bad">
                <IconeFechar className="h-3 w-3" />
              </button>
            </span>
          ))}
          {pendentes.map((p) => (
            <span
              key={p.tempId}
              className={`flex items-center gap-2 rounded-[10px] border px-2.5 py-1.5 text-[11px] ${
                p.estado === "erro" ? "border-dash-bad/40 bg-dash-bad/10 text-dash-bad" : "border-white/10 bg-dash-raise text-dash-muted"
              }`}
              title={p.erro}
            >
              <span className="max-w-[160px] truncate">{p.nome}</span>
              <span className="text-[10px]">{p.estado === "erro" ? "falhou" : "subindo…"}</span>
              {p.estado === "erro" && (
                <button onClick={() => removerPendente(p.tempId)} aria-label="Remover" className="hover:text-white">
                  <IconeFechar className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </>
  );

  // Sessão vencida toma a tela: entrar de novo é o único caminho, e é melhor
  // dizer isso do que deixar a pessoa tentando reenviar para sempre.
  if (semSessao) {
    return (
      <div className="grid h-full w-full place-items-center">
        <SessaoVencida oQue="sua conversa continua aqui." />
      </div>
    );
  }

  return (
    <div className={cheio ? "flex h-full w-full min-h-0" : "flex h-[calc(100dvh-140px)] min-h-[420px]"}>
      {/* conversa */}
      <section
        className={
          cheio
            ? "relative flex min-w-0 flex-1 flex-col"
            : `relative flex min-w-0 flex-1 flex-col rounded-[24px] border bg-dash-card transition ${
                arrastando ? "border-dash-brand ring-2 ring-dash-brand/40" : "border-white/[0.07]"
              }`
        }
        onDragOver={(e) => {
          e.preventDefault();
          if (!arrastando) setArrastando(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setArrastando(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          escolherArquivos(e.dataTransfer?.files || null);
        }}
      >
        {arrastando && (
          <div
            className={`pointer-events-none absolute inset-0 z-20 grid place-items-center bg-dash-bg/70 ${
              cheio ? "" : "rounded-[24px]"
            }`}
          >
            <div className="flex items-center gap-2 rounded-full border border-dash-brand/40 bg-dash-card px-5 py-3 text-[13px] text-white">
              <IconeClipe className="h-4 w-4" /> Solta aqui para anexar
            </div>
          </div>
        )}

        {/* o seletor de arquivo é ÚNICO na tela e vive fora dos dois palcos:
            a "+" da tela de início e o clipe da conversa apontam para ele. */}
        <input
          ref={inputArquivo}
          type="file"
          multiple
          accept={ACEITA_INPUT}
          className="hidden"
          onChange={(e) => {
            escolherArquivos(e.target.files);
            e.target.value = "";
          }}
        />

        {/* ── TELA DE INÍCIO ──────────────────────────────────────────
            Estado VAZIO da conversa (chegada por "Novo" ou pela home): palco
            limpo, sem cartão e sem sugestão. Título grande no meio e a caixa
            de escrever logo abaixo — a MESMA caixa de sempre, com o campo que
            cresce ao focar e os botões de anexo e ditado. Ao mandar a primeira
            mensagem, isto sai e entra a conversa de sempre (abaixo). */}
        {mostrarInicio && (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-4 pb-12 pt-6 sm:px-8">
            <div className="w-full max-w-[720px]">
              <h1 className="mb-7 text-center text-[26px] font-medium leading-tight tracking-tight text-white sm:text-[38px]">
                O que vamos explorar hoje?
              </h1>

              {faixaAnexos}

              {/* a caixa: "+" à esquerda, campo que cresce, microfone e enviar à direita */}
              <div className="rounded-[26px] border border-white/10 bg-dash-card p-2 shadow-2xl transition focus-within:border-dash-brand/60">
                <div className="flex items-end gap-1 sm:gap-1.5">
                  <button
                    type="button"
                    onClick={() => inputArquivo.current?.click()}
                    disabled={enviando}
                    aria-label="Anexar arquivo"
                    title={`Anexar arquivo (até ${MAX_UPLOAD_ROTULO} por arquivo)`}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-dash-muted transition hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
                  >
                    <IconeMais className="h-[19px] w-[19px]" />
                  </button>

                  <textarea
                    ref={caixa}
                    value={texto}
                    rows={1}
                    onFocus={() => setCaixaFocada(true)}
                    onBlur={() => setCaixaFocada(false)}
                    onChange={(e) => setTexto(e.target.value)}
                    onPaste={(e) => {
                      const files = Array.from(e.clipboardData?.files || []);
                      if (files.length) {
                        e.preventDefault();
                        void subirArquivos(files);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void enviar();
                      }
                    }}
                    placeholder="Escreve para a Mirai…"
                    style={{ transition: "height 220ms cubic-bezier(.22,.61,.36,1)" }}
                    className="min-h-[40px] max-h-[200px] min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-1 py-[9px] text-[15px] leading-[22px] text-white outline-none placeholder:text-dash-dim"
                  />

                  <button
                    type="button"
                    onClick={alternarDitado}
                    disabled={!temDitado}
                    aria-pressed={ouvindo}
                    aria-label={
                      temDitado ? (ouvindo ? "Parar ditado" : "Ditar") : "Ditado por voz indisponível"
                    }
                    title={
                      temDitado
                        ? ouvindo ? "Parar ditado" : "Ditar (voz, pt-BR)"
                        : "Seu navegador não oferece ditado por voz"
                    }
                    className={`grid h-11 w-11 shrink-0 place-items-center rounded-full transition ${
                      !temDitado
                        ? "cursor-not-allowed text-dash-dim opacity-50"
                        : ouvindo
                          ? "bg-dash-bad/20 text-dash-bad ring-1 ring-dash-bad/50"
                          : "text-dash-muted hover:bg-white/[0.06] hover:text-white"
                    }`}
                  >
                    <IconeMicrofone className="h-[19px] w-[19px]" />
                  </button>

                  <button
                    type="button"
                    onClick={() => void enviar()}
                    disabled={enviando || (!texto.trim() && !anexos.length)}
                    aria-label="Enviar"
                    title="Enviar (Enter)"
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-dash-brand text-white transition hover:bg-dash-brandHi disabled:opacity-40"
                  >
                    <IconeSeta />
                  </button>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3 px-2 text-[10px] text-dash-dim">
                <span>Até {MAX_UPLOAD_ROTULO} por arquivo · documento, imagem ou áudio</span>
                {ouvindo ? (
                  <span className="flex items-center gap-1.5 text-dash-brand">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-dash-brand" />
                    Ouvindo…
                  </span>
                ) : (
                  uso && (
                    <span>
                      {tamanhoLegivel(uso.usado_bytes)} de {tamanhoLegivel(uso.limite_bytes)}
                    </span>
                  )
                )}
              </div>

              {!!avisoVoz && (
                <div className="mt-2 flex items-start gap-2 px-2 text-[11px] text-dash-warn">
                  <span className="min-w-0 flex-1">{avisoVoz}</span>
                  <button onClick={() => setAvisoVoz(null)} aria-label="Dispensar">
                    <IconeFechar className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── CONVERSA EM ANDAMENTO — nada mudou em relação ao de antes ── */}
        {!mostrarInicio && (
          <>
            <div className="flex items-center gap-3 border-b border-white/[0.07] px-5 py-3.5">
              <p className="truncate text-[13px] text-dash-muted">{tituloAberto}</p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              {carregandoConversa && mensagens.length === 0 && (
                <p className="px-1 text-[12px] text-dash-dim">Carregando conversa…</p>
              )}

              <div className="flex flex-col gap-4">
                {mensagens.map((m, i) => (
                  <div
                    key={i}
                    className={
                      m.role === "user"
                        ? "ml-auto max-w-[85%] rounded-[18px] rounded-br-sm bg-dash-brand/18 px-4 py-3 text-[13px] text-white"
                        : "mr-auto max-w-[92%] rounded-[18px] rounded-bl-sm border border-white/[0.07] bg-dash-side px-4 py-3 text-[13px] text-white/85"
                    }
                  >
                    <span className="mb-1 block text-[10px] uppercase tracking-[0.18em] text-dash-dim">
                      {m.role === "user" ? "você" : "mirai"}
                    </span>

                    {!!m.anexos?.length && (
                      <div className="mb-2 flex flex-wrap gap-2">
                        {m.anexos.map((a) => (
                          <a
                            key={a.id}
                            href={`${a.url}?dl=1`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex max-w-[220px] items-center gap-2 overflow-hidden rounded-[12px] border border-white/10 bg-black/20 p-2 transition hover:border-dash-brand/50"
                          >
                            {a.categoria === "imagem" ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={a.url} alt={a.nome} className="h-11 w-11 shrink-0 rounded-[8px] object-cover" />
                            ) : (
                              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[8px] bg-white/[0.06] text-dash-muted">
                                <IconeDoAnexo categoria={a.categoria} className="h-4 w-4" />
                              </span>
                            )}
                            <span className="min-w-0">
                              <span className="block truncate text-[11px] text-white/90">{a.nome}</span>
                              <span className="block text-[10px] text-dash-dim">
                                {a.rotulo} · {tamanhoLegivel(a.tamanho)}
                              </span>
                            </span>
                          </a>
                        ))}
                      </div>
                    )}

                    {m.content ? (
                      <span className="whitespace-pre-wrap break-words">
                        {m.content}
                        {enviando && i === mensagens.length - 1 && (
                          <span className="ml-0.5 inline-block h-[13px] w-[2px] animate-pulse bg-dash-brand align-middle" />
                        )}
                      </span>
                    ) : m.role === "assistant" ? (
                      <span className="flex items-center gap-1.5 py-1" aria-label="Mirai está digitando">
                        {[0, 150, 300].map((atraso) => (
                          <span
                            key={atraso}
                            className="h-1.5 w-1.5 animate-bounce rounded-full bg-dash-muted"
                            style={{ animationDelay: `${atraso}ms`, animationDuration: "1s" }}
                          />
                        ))}
                        <span className="ml-1 text-[11px] text-dash-dim">pensando…</span>
                      </span>
                    ) : null}
                  </div>
                ))}
                <div ref={fim} />
              </div>
            </div>

            <div className="border-t border-white/[0.07] px-4 py-3">
              {faixaAnexos}

              <div className="flex items-end gap-2">
                <button
                  onClick={() => inputArquivo.current?.click()}
                  disabled={enviando}
                  aria-label="Anexar arquivo"
                  title={`Anexar arquivo (até ${MAX_UPLOAD_ROTULO} por arquivo)`}
                  className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-[12px] border border-white/10 bg-dash-bg text-dash-muted transition hover:border-dash-brand/50 hover:text-white disabled:opacity-40"
                >
                  <IconeClipe />
                </button>

                <textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onPaste={(e) => {
                    const files = Array.from(e.clipboardData?.files || []);
                    if (files.length) {
                      e.preventDefault();
                      void subirArquivos(files);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void enviar();
                    }
                  }}
                  rows={1}
                  placeholder="Escreve para a Mirai…"
                  style={{ transition: "height 220ms cubic-bezier(.22,.61,.36,1)" }}
                  className="max-h-32 min-h-[40px] flex-1 resize-none rounded-[12px] border border-white/10 bg-dash-bg px-4 py-2 text-[13px] text-white outline-none placeholder:text-dash-dim focus:border-dash-brand/60"
                />
                <button
                  onClick={() => void enviar()}
                  disabled={enviando || (!texto.trim() && !anexos.length)}
                  aria-label="Enviar"
                  className="grid h-[46px] w-[46px] place-items-center rounded-[12px] bg-dash-brand text-white transition hover:bg-dash-brandHi disabled:opacity-40"
                >
                  <IconeSeta />
                </button>
              </div>

              <div className="mt-2 flex items-center justify-between px-1 text-[10px] text-dash-dim">
                <span>Até {MAX_UPLOAD_ROTULO} por arquivo · documento, imagem ou áudio</span>
                {uso && (
                  <span>
                    {tamanhoLegivel(uso.usado_bytes)} de {tamanhoLegivel(uso.limite_bytes)}
                  </span>
                )}
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
