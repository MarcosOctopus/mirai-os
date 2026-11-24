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
import TextoDaResposta from "@/components/dash/TextoDaResposta";
import {
  IconeClipe,
  IconeDocumento,
  IconeFechar,
  IconeImagem,
  IconeMusica,
} from "@/components/dash/icons";
import CaixaDeEntrada from "@/components/dash/CaixaDeEntrada";
import type { ModoId } from "@/lib/modos-do-chat";
import {
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

/**
 * ENTREGA DE ARQUIVO NA CONVERSA (dono, 20/10/2026).
 *
 * Pedido, verbatim: *"send a PDF or a image to chat for a person, not to be able
 * to get out of the chat"*. Antes disto a Mirai só sabia devolver um LINK do
 * Canva (que vale 24h e obriga a pessoa a sair da conversa para baixar).
 *
 * Contrato: a resposta da ferramenta traz `[arquivo:<id>]` no meio do texto. Aqui
 * o marcador vira um cartão clicável servido por `/api/arquivo/<id>?dl=1` — a
 * rota confere a POSSE (só o dono do anexo baixa), então o id não é público.
 *
 * O texto é renderizado como está (o chat não usa markdown): o marcador é
 * substituído no meio da frase, sem quebrar o resto.
 */
function TextoComArquivos({ texto }: { texto: string }) {
  const partes = texto.split(/(\[arquivo:[0-9a-f-]{36}\])/i);
  if (partes.length === 1) return <>{texto}</>;
  return (
    <>
      {partes.map((p, i) => {
        const m = p.match(/^\[arquivo:([0-9a-f-]{36})\]$/i);
        if (!m) return <span key={i}>{p}</span>;
        const id = m[1];
        return (
          <a
            key={i}
            href={`/api/arquivo/${id}?dl=1`}
            target="_blank"
            rel="noopener noreferrer"
            className="my-1 flex w-fit items-center gap-2 rounded-lg border border-dash-line bg-dash-surface px-3 py-2 text-[13px] text-dash-text transition hover:border-dash-brand"
          >
            <IconeDocumento className="h-4 w-4 shrink-0 text-dash-brand" />
            <span className="font-medium">Baixar arquivo</span>
          </a>
        );
      })}
    </>
  );
}

/* ── DE QUAL CAIXA LER (13/11/2026) ────────────────────────────────────────
 * Chip arredondado, mesma família do seletor de modelo. Só aparece com MAIS DE
 * UMA caixa: com uma só, um seletor de uma opção é ruído.
 *
 * Vive num componente porque a tela tem DOIS compositores (o de "nova conversa"
 * e o da conversa aberta) e o seletor tem de existir nos dois — antes ele só
 * existia no segundo, e quem ainda não tinha aberto conversa não conseguia
 * escolher a caixa.
 *
 * Com mais de um espaço (pessoal + organização), o rótulo mostra DE ONDE é a
 * caixa; senão dois endereços parecidos ficam indistinguíveis.
 */
function SeletorDeCaixa({
  contas,
  valor,
  onEscolher,
}: {
  contas: { email: string; rotulo: string; escopoId: string; escopoNome: string }[];
  valor: string;
  onEscolher: (chave: string) => void;
}) {
  if (contas.length < 2) return null;
  const variosEspacos = new Set(contas.map((c) => c.escopoId)).size > 1;
  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-[0.14em] text-dash-dim">ler de</span>
      {contas.map((c) => {
        const chave = `${c.escopoId}|${c.email}`;
        const ativa = valor === chave;
        return (
          <button
            key={chave}
            type="button"
            title={variosEspacos ? `${c.email} · ${c.escopoNome}` : c.email}
            onClick={() => onEscolher(chave)}
            className={`max-w-[210px] truncate rounded-full px-3 py-[5px] text-[11px] transition-all duration-200 ${
              ativa ? "bg-dash-brand/[0.15] text-dash-fg" : "text-dash-muted hover:text-dash-fg"
            }`}
            style={{
              border: `1px solid ${ativa ? "rgba(255,117,31,0.40)" : "rgba(255,255,255,0.06)"}`,
            }}
          >
            {variosEspacos ? `${c.email} · ${c.escopoNome}` : c.email}
          </button>
        );
      })}
    </div>
  );
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
  const { lista, aberta, carregada, emBranco } = useConversas();

  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [texto, setTexto] = useState("");
  /* Modelo e autonomia: escolha da pessoa, salva no navegador. Supernova é o
     nosso white label, fixo no DeepSeek que usamos aqui. */
  const [modelo, setModelo] = useState<string>(() => {
    try {
      return localStorage.getItem("mirai:modelo") || "supernova-flash";
    } catch {
      return "supernova-flash";
    }
  });
  const [sozinho, setSozinho] = useState<boolean>(() => {
    try {
      return localStorage.getItem("mirai:autonomia") === "sozinho";
    } catch {
      return false;
    }
  });

  /* A autonomia virou preferência da CONTA (dono, 19/11/2026: "só coloca o
     agir sozinho em configuração da conta e n ali"). Ela é ligada em /perfil e
     chega aqui por evento — sem isso, mudar no perfil não valeria nesta aba
     até recarregar. */
  useEffect(() => {
    const ao = (e: Event) => {
      setSozinho((e as CustomEvent<string>).detail === "sozinho");
    };
    window.addEventListener("mirai:autonomia", ao);
    return () => window.removeEventListener("mirai:autonomia", ao);
  }, []);
  // O CHAT É SÓ CONVERSA (dono, 10/10/2026): o modo "arquiteto" saiu DESTA tela —
  // o Arquiteto tem a própria tela, alcançada pelo menu. Antes havia duas abas
  // (conversa/arquiteto) aqui, e o dono foi claro: "não tem modo arquiteto" no chat.
  const modo = "conversa";

  // ── O MODO DE RESPOSTA (dono, 14/10/2026) ────────────────────────────────
  // Sempre COMEÇA no Leve: é a base, e a profundidade é um pedido — nunca um
  // imposto. Não se guarda no navegador de propósito: abrir o app e cair num
  // modo caro (ou numa tela que demora) seria decidir pelo cliente.
  const [modoPesquisa, setModoPesquisa] = useState<ModoId>("leve");
  // Quando o servidor sobe o modo sozinho (o texto pediu), a tela diz — para o
  // cliente não achar que escolheu nem estranhar a demora.
  const [avisoModo, setAvisoModo] = useState<string | null>(null);
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

  /* ── DE QUAL CAIXA LER (multi-conta, 13/11/2026) ────────────────────
   * O cofre já guardava várias contas Google; o chat não sabia qual abrir e
   * sempre perguntava. Aqui a pessoa escolhe de antemão e a escolha viaja no
   * corpo do pedido (`contaEmail`) — a ferramenta de leitura respeita.
   * Só aparece com MAIS DE UMA caixa: com uma só, um seletor de uma opção é
   * ruído. A escolha fica no navegador (localStorage) porque é preferência
   * de quem usa, não estado de servidor. */
  /* Cada caixa carrega o ESCOPO de onde ela vem (pessoal ou organização):
     a escolha do seletor é, na prática, "ler de qual espaço e de qual
     endereço". Uma chave única `escopo|email` evita ambiguidade quando o mesmo
     endereço estiver nos dois espaços. */
  const [contasEmail, setContasEmail] = useState<
    { email: string; rotulo: string; escopoId: string; escopoNome: string }[]
  >([]);
  const [contaEmail, setContaEmail] = useState<string>("");
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch("/api/gmail/contas", { cache: "no-store" });
        if (!r.ok) return;
        const d = (await r.json()) as {
          contas?: { email: string; rotulo: string }[];
          outrosEspacos?: {
            escopo: { id: string; nome: string };
            contas: { email: string; rotulo: string }[];
          }[];
          escopo?: { id: string; nome: string };
        };
        const lista: { email: string; rotulo: string; escopoId: string; escopoNome: string }[] = [];
        // As caixas do espaço PESSOAL (o padrão) entram primeiro.
        const pessoalId = d.escopo?.id || "pessoal";
        const pessoalNome = d.escopo?.nome || "Meu espaço";
        for (const c of d.contas || []) {
          lista.push({ email: c.email, rotulo: c.rotulo, escopoId: pessoalId, escopoNome: pessoalNome });
        }
        // As dos outros espaços (a organização) aparecem com o nome de onde vêm:
        // a pessoa escolhe a CAIXA, não um "modo organização".
        for (const bloco of d.outrosEspacos || []) {
          for (const c of bloco.contas || []) {
            lista.push({
              email: c.email,
              rotulo: c.rotulo,
              escopoId: bloco.escopo.id,
              escopoNome: bloco.escopo.nome,
            });
          }
        }
        if (!vivo) return;
        setContasEmail(lista);
        // Recupera a escolha anterior SÓ se aquela caixa ainda existir — um
        // endereço desconectado (ou um escopo perdido) não pode seguir escolhido.
        let guardada = "";
        try {
          guardada = localStorage.getItem("mirai:contaEmail") || "";
        } catch {}
        const chave = (c: { escopoId: string; email: string }) => `${c.escopoId}|${c.email}`;
        if (guardada && lista.some((c) => chave(c) === guardada)) setContaEmail(guardada);
        else if (lista.length) setContaEmail(chave(lista[0]));
      } catch {
        /* sem seletor: a ferramenta pergunta qual caixa, como antes */
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

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
  // MAS não quando a pessoa pediu uma conversa em branco no "+ Novo": aí a tela
  // tem de ficar vazia, esperando a primeira mensagem (que cria a conversa).
  useEffect(() => {
    if (carregada && !aberta && !emBranco && lista.length) definirAberta(lista[0].id);
  }, [carregada, aberta, lista, emBranco]);

  // Carrega as mensagens quando a conversa aberta muda. Não roda durante um
  // envio (senão apagaria as mensagens otimistas que a tela já mostrou).
  useEffect(() => {
    if (!aberta) {
      carregadaRef.current = null;
      // Conversa em branco ("+ Novo"): a tela tem de ficar VAZIA, não mostrar as
      // mensagens da conversa anterior. Nunca durante um envio — aí as mensagens
      // otimistas estão à mostra e apagá-las seria perder o que a pessoa escreveu.
      if (!enviando) setMensagens([]);
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
  const vaiAbrirAlguma = !aberta && !emBranco && lista.length > 0;
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
          modelo,
          autonomia: sozinho ? "sozinho" : "aprovar",
          modoPesquisa,
          // A caixa escolhida no seletor (vazio = a ferramenta pergunta qual).
          // Vai junto o ESCOPO da CAIXA — não é um "modo organização": é de
          // onde aquela conta de email foi conectada.
          contaEmail: contaEmail ? contaEmail.split("|")[1] : undefined,
          escopoEmail: contaEmail ? contaEmail.split("|")[0] : undefined,
          conversaId: idConversa || undefined,
        }),
      });

      // O servidor devolve QUAL modo rodou — e se subiu sozinho porque o texto
      // pediu. Aqui a tela acompanha: o dropdown passa a mostrar o modo real e
      // o cliente é avisado, em vez de achar que escolheu ou que travou.
      const modoRodou = r.headers.get("x-mirai-modo") as ModoId | null;
      const escalouPorque = r.headers.get("x-mirai-modo-escalou");
      if (escalouPorque && modoRodou && modoRodou !== modoPesquisa) {
        setModoPesquisa(modoRodou);
        setAvisoModo(
          modoRodou === "profundo"
            ? "Você pediu para ir a fundo — chamei o Sr. Xi. Leva um pouco mais, ele está apurando."
            : "Você pediu busca — subi para o modo Observador, vou varrer as fontes.",
        );
      }

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
              className="flex items-center gap-2 rounded-[10px] border border-dash-hair/10 bg-dash-raise px-2.5 py-1.5 text-[11px] text-dash-fg/90"
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
                p.estado === "erro" ? "border-dash-bad/40 bg-dash-bad/10 text-dash-bad" : "border-dash-hair/10 bg-dash-raise text-dash-muted"
              }`}
              title={p.erro}
            >
              <span className="max-w-[160px] truncate">{p.nome}</span>
              <span className="text-[10px]">{p.estado === "erro" ? "falhou" : "subindo…"}</span>
              {p.estado === "erro" && (
                <button onClick={() => removerPendente(p.tempId)} aria-label="Remover" className="hover:text-dash-fg">
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
                arrastando ? "border-dash-brand ring-2 ring-dash-brand/40" : "border-dash-hair/[0.07]"
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
            <div className="flex items-center gap-2 rounded-full border border-dash-brand/40 bg-dash-card px-5 py-3 text-[13px] text-dash-fg">
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
              <h1 className="mb-7 text-center text-[26px] font-medium leading-tight tracking-tight text-dash-fg sm:text-[38px]">
                O que vamos explorar hoje?
              </h1>

              {faixaAnexos}

              {/* O seletor de caixa também aqui: quem chega pela home e ainda
                  não abriu conversa precisa poder escolher de onde ler. */}
              <SeletorDeCaixa
                contas={contasEmail}
                valor={contaEmail}
                onEscolher={(chave) => {
                  setContaEmail(chave);
                  try {
                    localStorage.setItem("mirai:contaEmail", chave);
                  } catch {}
                }}
              />

              {/* A CAIXA — a mesma do outro estado da conversa (componente único).
                  Dono, 19/11/2026: "TENTA IMITAR ESSA CAIXA" (o composer do ChatGPT):
                  um retângulo arredondado, texto em cima, controles dentro embaixo. */}
              <CaixaDeEntrada
                texto={texto}
                setTexto={setTexto}
                enviando={enviando}
                podeEnviar={!!texto.trim() || anexos.length > 0}
                enviar={() => void enviar()}
                subirArquivos={subirArquivos}
                inputArquivo={inputArquivo}
                caixa={caixa}
                setCaixaFocada={setCaixaFocada}
                modelo={modelo}
                setModelo={(id) => {
                  setModelo(id);
                  try {
                    localStorage.setItem("mirai:modelo", id);
                  } catch {}
                }}
                ouvindo={ouvindo}
                temDitado={temDitado}
                alternarDitado={alternarDitado}
                usoTexto={
                  uso
                    ? `${tamanhoLegivel(uso.usado_bytes)} de ${tamanhoLegivel(uso.limite_bytes)}`
                    : null
                }
              />

              {!!avisoModo && (
                <div className="mt-2 flex items-start gap-2 px-2 text-[11px] text-dash-brand">
                  <span className="min-w-0 flex-1">{avisoModo}</span>
                  <button onClick={() => setAvisoModo(null)} aria-label="Dispensar">
                    <IconeFechar className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

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
            {/* TÍTULO DA CONVERSA: só fora da tela inicial cheia. O dono pediu
                (24/11/2026) "tira essas linhas e nome do chat aí" — na tela `/`
                ele só repetia a primeira frase do usuário e a linha de baixo
                cortava o canvas. Na página própria do chat (`/chat`) ele FICA:
                lá é o único lugar que diz em que conversa você está. */}
            {!cheio && (
              <div className="flex items-center gap-3 border-b border-dash-hair/[0.07] px-5 py-3.5">
                <p className="truncate text-[13px] text-dash-muted">{tituloAberto}</p>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              {carregandoConversa && mensagens.length === 0 && (
                <p className="px-1 text-[12px] text-dash-dim">Carregando conversa…</p>
              )}

              <div className="flex flex-col gap-[22px]">
                {mensagens.map((m, i) => (
                  <div
                    key={i}
                    className={
                      m.role === "user"
                        ? "ml-auto max-w-[85%] rounded-[18px] rounded-br-sm bg-dash-brand/18 px-4 py-3 text-[13.5px] text-dash-fg"
                        /* RESPOSTA SEM CAIXA (dono, 23/11/2026: "tem que ser igual do
                           GPT e do Claude"): a fala da Mirai é texto corrido no canvas,
                           não um balão com borda e fundo. Balão atrás de cada parágrafo
                           é o visual de "chat de suporte", não de assistente. */
                        : "mr-auto px-1 py-0.5 text-[15.5px] text-dash-fg/[0.92]"
                    }
                    /* MEDIDA DE LEITURA (dono, 23/11/2026): a bolha da resposta não
                       pode atravessar a tela toda — linha de 1100px cansa. Em px (e
                       não em `ch`): medido no navegador, `max-width: 76ch` computa
                       `none` aqui — a unidade é DESCARTADA — enquanto `500px` aplica
                       na hora. 640px com corpo de 13,5px dá a faixa de ~70 caracteres.
                       No celular (92% da tela) o limite nunca chega a pegar. */
                    style={m.role === "assistant" ? { maxWidth: "720px" } : undefined}
                  >
                    {!!m.anexos?.length && (
                      <div className="mb-2 flex flex-wrap gap-2">
                        {m.anexos.map((a) => (
                          <a
                            key={a.id}
                            href={`${a.url}?dl=1`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex max-w-[220px] items-center gap-2 overflow-hidden rounded-[12px] border border-dash-hair/10 bg-dash-scrim/20 p-2 transition hover:border-dash-brand/50"
                          >
                            {a.categoria === "imagem" ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={a.url} alt={a.nome} className="h-11 w-11 shrink-0 rounded-[8px] object-cover" />
                            ) : (
                              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[8px] bg-dash-hair/[0.06] text-dash-muted">
                                <IconeDoAnexo categoria={a.categoria} className="h-4 w-4" />
                              </span>
                            )}
                            <span className="min-w-0">
                              <span className="block truncate text-[11px] text-dash-fg/90">{a.nome}</span>
                              <span className="block text-[10px] text-dash-dim">
                                {a.rotulo} · {tamanhoLegivel(a.tamanho)}
                              </span>
                            </span>
                          </a>
                        ))}
                      </div>
                    )}

                    {m.content ? (
                      /* RESPOSTA = texto com estrutura (dono, 23/11/2026: "deixa a
                         visualização da escrita de respostas melhor no chat"). Antes
                         tudo saía com o mesmo peso, num span pre-wrap; agora parágrafo,
                         lista, título e código têm forma. A fala do usuário continua
                         crua — ela é curta e o pre-wrap preserva o que ele digitou. */
                      m.role === "assistant" ? (
                        <TextoDaResposta
                          texto={m.content}
                          cursor={enviando && i === mensagens.length - 1}
                        />
                      ) : (
                        <span className="whitespace-pre-wrap break-words">
                          <TextoComArquivos texto={m.content} />
                        </span>
                      )
                    ) : m.role === "assistant" ? (
                      /* UM ponto pulsando, sem texto (padrão ChatGPT/Claude). Antes eram
                         três bolinhas saltando + "pensando…" — enfeite, não informação. */
                      <span
                        className="my-1.5 inline-flex h-2 w-2 animate-pulse rounded-full bg-dash-muted"
                        aria-label="Mirai está respondendo"
                      />
                    ) : null}
                  </div>
                ))}
                <div ref={fim} />
              </div>
            </div>

            <div className="border-t border-dash-hair/[0.07] px-4 py-3">
              {faixaAnexos}

              <SeletorDeCaixa
                contas={contasEmail}
                valor={contaEmail}
                onEscolher={(chave) => {
                  setContaEmail(chave);
                  try {
                    localStorage.setItem("mirai:contaEmail", chave);
                  } catch {}
                }}
              />

              {/* A CAIXA — a mesma do outro estado da conversa (componente único).
                  Dono, 19/11/2026: "TENTA IMITAR ESSA CAIXA" (o composer do ChatGPT):
                  um retângulo arredondado, texto em cima, controles dentro embaixo. */}
              <CaixaDeEntrada
                texto={texto}
                setTexto={setTexto}
                enviando={enviando}
                podeEnviar={!!texto.trim() || anexos.length > 0}
                enviar={() => void enviar()}
                subirArquivos={subirArquivos}
                inputArquivo={inputArquivo}
                caixa={caixa}
                setCaixaFocada={setCaixaFocada}
                modelo={modelo}
                setModelo={(id) => {
                  setModelo(id);
                  try {
                    localStorage.setItem("mirai:modelo", id);
                  } catch {}
                }}
                ouvindo={ouvindo}
                temDitado={temDitado}
                alternarDitado={alternarDitado}
                usoTexto={
                  uso
                    ? `${tamanhoLegivel(uso.usado_bytes)} de ${tamanhoLegivel(uso.limite_bytes)}`
                    : null
                }
              />
            </div>
          </>
        )}
      </section>
    </div>
  );
}
