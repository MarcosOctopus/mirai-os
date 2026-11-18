"use client";

/**
 * A ARCA — segundo cérebro, navegável por PASTAS (estilo Obsidian).
 *
 * O QUE O DONO PEDIU (2ª rodada, palavra dele): "tem que ter algo visual estilo
 * Obsidian. a divisão deve ser por pastas e o usuário pode criar pastas e
 * subpastas também. claro que a IA também pode, porém de forma organizada. a
 * ideia é ter um segundo cérebro. visualmente tá muito bagunçado."
 *
 * COMO ESTÁ ORGANIZADO (a bagunça era não ter zonas):
 *   coluna 1 — ESTRUTURA: árvore de pastas/subpastas com contagem, mais
 *              "nova pasta" e "nova nota". A divisão do cérebro é por pasta.
 *   coluna 2 — LEITURA: a nota aberta (corpo, ficha, elos).
 *   topo     — busca (filtra tudo) e o estado do acervo em números.
 * Cada zona tem fio e cabeçalho próprios; nada flutua.
 *
 * ESCRITA: a pessoa cria pasta e nota por aqui. O pedido vai para a ARCA (com o
 * token da org) — é lá que mora a governança: template versionado, guard_write
 * auditado, auto-commit no histórico. A IA escreve pelo MESMO caminho auditado.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import NotaTexto from "@/components/dash/NotaTexto";
import Shell from "@/components/dash/Shell";
// O MESMO toggle do Chat|Orb (mesma cor, mesmo componente). Antes a Arca tinha
// uma copia local com visual proprio — dono, 10/11/2026: "quero o toggle igual
// do orb mesma cor e mesmo efeito na troca que o chat pro orb tem".
import SeletorModo from "@/components/dash/SeletorModo";
import Fontes from "@/components/dash/Fontes";
import Youniverse from "@/components/dash/Youniverse";
import { ProvedorAcesso, Fotinhas, PainelCompartilhar, useAcesso } from "./Compartilhar";
import { Chip } from "@/components/dash/kit";
import { IconeUsuarios, IconeMais, IconeDocumento } from "@/components/dash/icons";

const API = "/api/acervo";

/** Pasta RECEBIDA é só-leitura na tela: some o que a pessoa não pode fazer
 *  (apagar, renomear, ver quem mais tem acesso). O bloqueio de verdade continua
 *  no proxy/Arca — isto é para não oferecer o que não é dela. */
const ContextoRecebido = createContext(false);

/** Pasta compartilhada COM esta conta (concessão por e-mail, com herança). */
type Recebido = {
  org: string;
  alvo: string;
  ver: boolean;
  editar: boolean;
  excluir: boolean;
  de?: string | null;
};
const TEMPLATES = ["nota", "diario", "reuniao", "decisao"];

/** AS CORES DO CANON — a mesma paleta que a camada usa para derivar cor estável
 *  de pasta (`PALETA` em `arca/api/app/acervo.py`). Se a tela inventasse a sua,
 *  a cor escolhida aqui não casaria com a que o céu pinta. */
const PALETA_CANON: { cor: string; nome: string }[] = [
  { cor: "#6b7280", nome: "cinza" },
  { cor: "#eab308", nome: "âmbar" },
  { cor: "#d946ef", nome: "magenta" },
  { cor: "#3b82f6", nome: "azul" },
  { cor: "#22c55e", nome: "verde" },
  { cor: "#06b6d4", nome: "ciano" },
  { cor: "#8b5cf6", nome: "violeta" },
  { cor: "#ec4899", nome: "rosa" },
  { cor: "#f97316", nome: "laranja" },
  { cor: "#ef4444", nome: "vermelho" },
];

/** O QUE está sendo editado agora — nota (título + arquivo) ou pasta (nome
 *  exibido + cor). Um estado só serve aos dois: o editor é o MESMO formulário
 *  em linha, dentro da própria linha da árvore. */
type EditorAlvo = { tipo: "nota" | "pasta"; caminho: string };

type CtxEditor = {
  editor: EditorAlvo | null;
  rascunho: string;
  setRascunho: (v: string) => void;
  corEscolhida: string;
  setCorEscolhida: (v: string) => void;
  salvandoEdicao: boolean;
  editarNota: (caminho: string, nome: string) => void;
  editarPasta: (caminho: string, nome: string, cor?: string) => void;
  salvarEdicao: () => void;
  cancelarEdicao: () => void;
  /** APAGAR pasta: confirmação em duas etapas na própria linha. `temConteudo`
   *  decide se o pedido vai como recursivo — e a camada ainda exige o nome
   *  repetido, então a tela nunca apaga conteúdo por um clique solto. */
  apagando: { caminho: string; nome: string; temConteudo: boolean } | null;
  pedirApagarPasta: (caminho: string, nome: string, temConteudo: boolean) => void;
  cancelarApagar: () => void;
  confirmarApagar: () => void;
  salvandoApagar: boolean;
};

/** Contexto, e não props: `Ramo` é recursivo (pasta dentro de pasta) e o lápis
 *  nasce em TODA linha — passar o editor por sete níveis de props seria uma
 *  costura a mais para furar na próxima mudança. */
const CtxArcaEditor = createContext<CtxEditor | null>(null);

function useEditorArca(): CtxEditor {
  const c = useContext(CtxArcaEditor);
  if (!c) throw new Error("editor da Arca fora do provedor");
  return c;
}

type NoArvore = {
  nome: string;
  path: string;
  /** Ordem e cor vêm da camada de operações (`/acervo/arvore`). A ordem da pasta
   *  é o que o arraste de pasta reescreve — sem lê-la aqui, reordenar gravaria
   *  sempre os mesmos números e a pasta não sairia do lugar. */
  ordem?: number;
  cor?: string;
  notas: { path: string; nome: string; modificado?: string; bytes?: number; ordem?: number }[];
  subpastas: NoArvore[];
  total_notas: number;
};

type ItemNota = { path: string; titulo?: string; trecho?: string };

type NotaAberta = {
  titulo: string;
  path: string;
  frontmatter: Record<string, string>;
  corpo: string;
  palavras: number;
  backlinks: { src_note?: string; edge_type?: string }[];
  links: { dst_note?: string; edge_type?: string }[];
};

type Panorama = {
  notas_md: number;
  total_arestas: number;
  orfas: number;
  pct_orfas: number;
  tags_distintas: number;
};

const fmt = (n: unknown) => (typeof n === "number" ? n.toLocaleString("pt-BR") : String(n ?? "—"));

function tituloDe(id?: string): string {
  if (!id) return "";
  const base = id.split("/").pop() || id;
  return base.replace(/\.md$/i, "").replace(/[-_]+/g, " ");
}

/** Acha um nó da árvore pelo caminho (a pasta das notas que estão sendo arrastadas). */
function acharNo(raiz: NoArvore | null, alvo: string): NoArvore | null {
  if (!raiz) return null;
  if (raiz.path === alvo) return raiz;
  for (const s of raiz.subpastas) {
    const achado = acharNo(s, alvo);
    if (achado) return achado;
  }
  return null;
}

/**
 * Acha o nó cujo `subpastas` contém `alvo` — é o "pai" da pasta arrastada.
 * Reordenar só faz sentido entre IRMÃS: comparar filhas de pais diferentes seria
 * mover de nível, que é outra operação (e a tela não oferece aqui).
 */
function acharPaiDe(raiz: NoArvore | null, alvo: string): NoArvore | null {
  if (!raiz) return null;
  if (raiz.subpastas.some((s) => s.path === alvo)) return raiz;
  for (const s of raiz.subpastas) {
    const achado = acharPaiDe(s, alvo);
    if (achado) return achado;
  }
  return null;
}

function quando(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const h = Math.floor((Date.now() - d.getTime()) / 3_600_000);
  if (h < 1) return "agora";
  if (h < 24) return `${h}h`;
  const dias = Math.floor(h / 24);
  return dias === 1 ? "ontem" : `${dias}d`;
}

export default function ArcaPage() {
  // A CONTA DESTA PESSOA — só para o perfil/foto do topo ficarem iguais aos do resto
  // do OS. Sem isto o cabeçalho da Arca não sabia quem entrou (dono, 10/11/2026:
  // "acerte também o perfil e foto do menu superior direito e deixa igual do resto").
  const [usuario, setUsuario] = useState<{ nome?: string; email?: string; ehDono?: boolean } | null>(null);
  const [arvore, setArvore] = useState<NoArvore | null>(null);
  const [panorama, setPanorama] = useState<Panorama | null>(null);
  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  const [pasta, setPasta] = useState<string>("");

  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<ItemNota[] | null>(null);
  const [buscando, setBuscando] = useState(false);

  const [nota, setNota] = useState<NotaAberta | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // "COMPARTILHADO COM VOCÊ": o que ESTA conta recebeu. Não se mistura com o
  // acervo próprio — entra por uma faixa no topo da coluna, diz de quem veio, e
  // abre em modo só-leitura (o filtro de verdade é do proxy/Arca, não da tela).
  const [recebidos, setRecebidos] = useState<Recebido[]>([]);
  const [recebidoAtivo, setRecebidoAtivo] = useState<{ org: string; alvo: string; editar: boolean } | null>(null);
  const [recebidosAbertos, setRecebidosAbertos] = useState(true);
  const sufixoRecebido = recebidoAtivo
    ? `&org=${encodeURIComponent(recebidoAtivo.org)}&recebido=${encodeURIComponent(recebidoAtivo.alvo)}`
    : "";

  /* O "+" ao lado do compartilhar só pergunta: pasta ou nota? A escolha abre o
     formulário que já existia; nenhuma criação nova nasceu aqui. */
  const [novoMenu, setNovoMenu] = useState(false);

  useEffect(() => {
    if (!novoMenu) return;
    const fora = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && el.closest("[data-arca-novo-wrap]")) return;
      setNovoMenu(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNovoMenu(false);
    };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [novoMenu]);

  const [novaPasta, setNovaPasta] = useState<string | null>(null);
  const [novaNota, setNovaNota] = useState<{ titulo: string; template: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const campoBusca = useRef<HTMLInputElement>(null);

  // MODO: "pastas" é a bancada de documentos (já aprovada pelo dono); "youniverse"
  // é a malha universal em tela cheia — o mesmo lugar, outra lente. Fica na URL
  // (?modo=youniverse) para dar para guardar e mandar o link.
  // "fontes" (18/11/2026): o que está LIGADO trazendo coisa para dentro (fonte viva do Drive).
  const [modo, setModo] = useState<"pastas" | "youniverse" | "fontes">("pastas");
  // O CEU so monta na PRIMEIRA visita e depois fica montado (as trocas viram
  // cross-fade) — exatamente o que a tela inicial faz com o Orb.
  const [ceuMontado, setCeuMontado] = useState(false);

  // O céu monta na primeira visita — QUALQUER que seja o caminho: link direto com
  // ?modo=youniverse, voltar no navegador, ou a troca pelo seletor. Sem isto, entrar
  // direto no Youniverse deixava a tela vazia (o `ceuMontado` só era ligado dentro do
  // trocarModo, que não roda quando a página abre já nesse modo).
  useEffect(() => {
    if (modo === "youniverse") setCeuMontado(true);
  }, [modo]);
  const trocarModo = useCallback((m: "pastas" | "youniverse" | "fontes") => {
    if (m === "youniverse") setCeuMontado(true);
    setModo(m);
    const u = new URL(window.location.href);
    if (m === "youniverse") u.searchParams.set("modo", "youniverse");
    else if (m === "fontes") u.searchParams.set("modo", "fontes");
    else u.searchParams.delete("modo");
    window.history.replaceState(null, "", u.toString());
  }, []);

  const carregarArvore = useCallback(async () => {
    try {
      const [a, p] = await Promise.all([
        fetch(`${API}?acao=arvore${sufixoRecebido}`, { cache: "no-store" }),
        fetch(`${API}?acao=stats${sufixoRecebido}`, { cache: "no-store" }),
      ]);
      if (a.status === 401 || a.status === 403) {
        setErro("sua sessão expirou — entre de novo para abrir a Arca.");
        return;
      }
      const da = await a.json().catch(() => null);
      const dp = await p.json().catch(() => null);
      // Formato inesperado (proxy/rota devolvendo HTML, por exemplo) NÃO pode virar
      // tela quebrada: avisa e para.
      if (da && da.arvore && Array.isArray(da.arvore.subpastas) && Array.isArray(da.arvore.notas)) {
        const arv = da.arvore as NoArvore;
        setArvore(arv);
        // TUDO FECHADO AO ABRIR (dono, 17/11/2026): antes o PRIMEIRO NÍVEL vinha aberto
        // ("a estrutura aparece sem precisar clicar") e a árvore ocupava a tela já expandida.
        // O dono pediu o oposto: abrir sempre recolhido, e ele abre o que quer ver.
        // `abertas` nasce vazio, então não abrir nada aqui é o estado "tudo fechado".
        // As ações que PRECISAM do pai aberto continuam abrindo o pai na mão (criar pasta,
        // criar nota, arrastar) — só o automático do primeiro nível saiu.
      } else if (a.ok) {
        setErro("a Arca respondeu num formato inesperado — recarregue em instantes.");
      } else {
        // NUNCA engolir a falha: sem isto a tela mostrava "0 pastas · 0 notas"
        // como se o acervo estivesse vazio (medido 17/11/2026 no Stage).
        const recado =
          (da && typeof da === "object" && typeof (da as { error?: unknown }).error === "string"
            ? String((da as { error?: unknown }).error)
            : "") || "não consegui abrir a Arca agora — tente de novo em instantes.";
        setErro(recado);
      }
      if (dp && typeof dp === "object") setPanorama(dp as Panorama);
    } catch {
      setErro("não consegui abrir a Arca agora");
    }
  }, [sufixoRecebido]);

  // ── SUBIR ARQUIVO PARA O ACERVO (18/11/2026) ──────────────────────────────
  // Por que existe: o dono tentou ARRASTAR um documento para esta tela e nada aconteceu —
  // não havia porta de upload (só arraste de pasta/nota, por ponteiro). No chat existia
  // `/api/upload`, mas ali o arquivo vira ANEXO da conversa, não conteúdo do acervo.
  // Aqui o arquivo vai para a Arca e vira NOTA CATALOGADA (pasta/keywords/cor decididas
  // pelo classificador dela). Depois a árvore recarrega e a pasta da nota ABRE — sem isso
  // a pessoa solta o arquivo e acha que nada aconteceu, porque a pasta estava fechada.
  const [arrastando, setArrastando] = useState(false);
  const [subindo, setSubindo] = useState(false);
  const inputArquivoRef = useRef<HTMLInputElement | null>(null);

  const subirArquivos = useCallback(
    async (arquivos: FileList | File[]) => {
      const lista = Array.from(arquivos);
      if (!lista.length) return;
      setSubindo(true);
      setErro("");
      try {
        const form = new FormData();
        for (const f of lista) form.append("files", f, f.name);
        const r = await fetch("/api/acervo/subir", { method: "POST", body: form });
        const j = (await r.json().catch(() => null)) as {
          enviados?: { nome: string; nota: string; pasta: string; subpasta: string }[];
          recusados?: { nome: string; erro: string }[];
          error?: string;
        } | null;
        const env = j?.enviados || [];
        if (!r.ok && !env.length) {
          setErro(j?.error || j?.recusados?.[0]?.erro || `não consegui subir (HTTP ${r.status}).`);
          return;
        }
        if (env.length) {
          setAbertas((antes) => {
            const n = new Set(antes);
            for (const e of env) {
              if (e.pasta) n.add(e.pasta);
              if (e.pasta && e.subpasta) n.add(`${e.pasta}/${e.subpasta}`);
            }
            return n;
          });
          setAviso(
            env.length === 1
              ? `"${env[0].nome}" entrou no acervo em ${[env[0].pasta, env[0].subpasta].filter(Boolean).join("/") || "—"}.`
              : `${env.length} arquivos entraram no acervo já catalogados.`,
          );
        }
        if (j?.recusados?.length) {
          setErro(j.recusados.map((x) => `"${x.nome}": ${x.erro}`).join(" · "));
        }
        await carregarArvore();
      } catch (e) {
        setErro(`falha ao subir: ${e instanceof Error ? e.message : "?"}`);
      } finally {
        setSubindo(false);
      }
    },
    [carregarArvore],
  );

  const abrir = useCallback(async (alvo: string) => {
    if (!alvo) return;
    setErro(null);
    setAbrindo(true);
    try {
      const r = await fetch(`${API}?acao=nota${sufixoRecebido}&path=${encodeURIComponent(alvo)}`, { cache: "no-store" });
      if (r.ok) {
        const d = await r.json();
        setNota(d as NotaAberta);
        window.history.replaceState(null, "", `/dashboard/arca?nota=${encodeURIComponent(d.path)}`);
        return;
      }
      // Wikilink costuma trazer só o nome: procura e abre o primeiro que casar.
      const nome = alvo.split("/").pop() || alvo;
      const b = await fetch(`${API}?acao=buscar${sufixoRecebido}&termo=${encodeURIComponent(nome)}`, { cache: "no-store" });
      if (b.ok) {
        const d = await b.json();
        const achado = (d.notas || [])[0];
        if (achado?.path) {
          const r2 = await fetch(`${API}?acao=nota${sufixoRecebido}&path=${encodeURIComponent(achado.path)}`, { cache: "no-store" });
          if (r2.ok) {
            const d2 = await r2.json();
            setNota(d2 as NotaAberta);
            window.history.replaceState(null, "", `/dashboard/arca?nota=${encodeURIComponent(d2.path)}`);
            return;
          }
        }
      }
      setErro(`não encontrei “${alvo}” no acervo`);
    } catch {
      setErro("falha ao abrir a nota");
    } finally {
      setAbrindo(false);
    }
  }, []);

  useEffect(() => {
    // quem entrou (mesma rota que a tela inicial usa)
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.user && setUsuario(d.user))
      .catch(() => {});
  }, []);

  useEffect(() => {
    // o que foi compartilhado comigo (independe do espaço que eu abro)
    fetch(`${API}?acao=recebidos`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && Array.isArray(d.pastas)) setRecebidos(d.pastas as Recebido[]);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const modoUrl = p.get("modo");
    if (modoUrl === "youniverse" || modoUrl === "fontes") setModo(modoUrl);
    // DEEP LINK DO CONVITE: o e-mail traz `?recebido=<org>/<pasta>` — quem tem
    // conta cai DIRETO na pasta, sem procurar nada.
    const rec = p.get("recebido");
    if (rec && rec.includes("/")) {
      const [orgDoRec, ...resto] = rec.split("/");
      if (orgDoRec && resto.join("/")) {
        setRecebidoAtivo({ org: orgDoRec, alvo: resto.join("/"), editar: false });
      }
    }
    void carregarArvore().then(() => {
      const alvo = p.get("nota");
      if (alvo) void abrir(alvo);
    });
  }, [carregarArvore, abrir]);

  // O MODO também vem do endereço: abrir um link (?modo=youniverse) ou voltar no
  // navegador tem de trocar a tela. Sem este ouvinte, navegação client-side (mesmo
  // caminho, query diferente) NÃO re-monta o componente e o parâmetro era ignorado.
  useEffect(() => {
    const ler = () =>
      setModo(
        (() => {
          const m = new URLSearchParams(window.location.search).get("modo");
          return m === "youniverse" || m === "fontes" ? m : "pastas";
        })(),
      );
    ler();
    window.addEventListener("popstate", ler);
    return () => window.removeEventListener("popstate", ler);
  }, []);

  // Busca instantânea (sem botão no meio do caminho).
  useEffect(() => {
    const t = termo.trim();
    if (t.length < 2) {
      setResultados(null);
      return;
    }
    setBuscando(true);
    const id = setTimeout(async () => {
      try {
        const r = await fetch(`${API}?acao=buscar&termo=${encodeURIComponent(t)}`, { cache: "no-store" });
        const d = r.ok ? await r.json() : null;
        setResultados(d?.notas || []);
      } catch {
        setResultados([]);
      } finally {
        setBuscando(false);
      }
    }, 240);
    return () => clearTimeout(id);
  }, [termo]);

  // Teclado: `/` foca a busca; Esc desfaz o que estiver aberto.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      const digitando = tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";
      if (e.key === "/" && !digitando) {
        e.preventDefault();
        campoBusca.current?.focus();
      }
      if (e.key === "Escape") {
        if (termo) {
          setTermo("");
          setResultados(null);
        } else if (novaPasta !== null) setNovaPasta(null);
        else if (novaNota) setNovaNota(null);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [termo, novaPasta, novaNota]);

  const alternar = (p: string) =>
    setAbertas((antes) => {
      const novo = new Set(antes);
      if (novo.has(p)) novo.delete(p);
      else novo.add(p);
      return novo;
    });

  const criarPasta = async () => {
    const caminho = (novaPasta || "").trim();
    if (!caminho) return;
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "criar-pasta", caminho }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.detail || d?.error || `HTTP ${r.status}`);
      setNovaPasta(null);
      const pai = caminho.includes("/") ? caminho.slice(0, caminho.lastIndexOf("/")) : "";
      if (pai) setAbertas((a) => new Set([...a, pai]));
      setPasta(caminho);
      await carregarArvore();
      setAviso(`pasta “${caminho}” criada — e o histórico do acervo guardou o momento.`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "não consegui criar a pasta");
    } finally {
      setSalvando(false);
    }
  };

  const criarNota = async () => {
    const titulo = (novaNota?.titulo || "").trim();
    if (!titulo) return;
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "criar-nota",
          titulo,
          pasta,
          template: novaNota?.template || "nota",
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.detail || d?.error || `HTTP ${r.status}`);
      const caminho = String(d.nota || "");
      setNovaNota(null);
      await carregarArvore();
      if (caminho) void abrir(caminho);
      setAviso(`nota “${titulo}” criada de template em ${pasta || "raiz"} — já versionada.`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "não consegui criar a nota");
    } finally {
      setSalvando(false);
    }
  };

  // ── ARRASTE DE NOTA (pedido do dono, 10/11/2026) ──────────────────────────
  // Duas coisas e SÓ duas: (1) reordenar a nota entre as irmãs da pasta e
  // (2) mover a nota para dentro de uma pasta/subpasta.
  //
  // Por que PONTEIRO e não o `draggable` do HTML: o arraste nativo do navegador
  // não é reproduzível por evento de mouse sintético (a prova automatizada não
  // consegue disparar `dragstart`), e aí a funcionalidade existiria sem prova.
  // Com `pointerdown` → `pointermove` → `pointerup` a mesma interação vale para
  // o mouse real E para a prova. O clique continua funcionando: só vira arraste
  // depois de 5 px de movimento.
  const arrastoRef = useRef<{
    /** "nota" move/reordena nota; "pasta" reordena pasta entre as irmãs. */
    tipo: "nota" | "pasta";
    path: string;
    pasta: string;
    pai: string;
    nome: string;
    x: number;
    y: number;
    ativo: boolean;
  } | null>(null);
  const suprimeClique = useRef(false);
  const arvoreRef = useRef<NoArvore | null>(null);
  const acoesRef = useRef<{
    reordenar: (pasta: string, de: string, para: string) => Promise<void>;
    mover: (path: string, destino: string) => Promise<void>;
    reordenarPasta: (de: string, para: string) => Promise<void>;
  } | null>(null);
  const [fantasma, setFantasma] = useState<{ nome: string; tipo: "nota" | "pasta"; x: number; y: number } | null>(null);
  const [sobreAlvo, setSobreAlvo] = useState<string>("");

  useEffect(() => {
    arvoreRef.current = arvore;
  }, [arvore]);

  /** Grava a ordem de UM item (a camada aceita `ordem` na PATCH de nota). */
  const gravarOrdem = useCallback(async (caminho: string, pasta: string, ordem: number) => {
    const r = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "mover-nota", path: caminho, nova_pasta: pasta, ordem }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d?.detail || d?.error || `HTTP ${r.status}`);
    }
  }, []);

  /** (1) Reordenar: a nota arrastada assume a posição da nota alvo. */
  const reordenar = useCallback(
    async (pasta: string, de: string, para: string) => {
      const no = acharNo(arvoreRef.current, pasta);
      if (!no || de === para) return;
      const lista = no.notas.map((n) => n.path);
      const i = lista.indexOf(de);
      const j = lista.indexOf(para);
      if (i < 0 || j < 0) return;
      const nova = lista.slice();
      nova.splice(i, 1);
      nova.splice(j, 0, de);
      setErro(null);
      try {
        // Renumera em passos de 10: a ordem fica estável e sobra espaço entre as
        // notas sem renumerar o resto do acervo. Só grava quem MUDOU.
        for (let k = 0; k < nova.length; k++) {
          const atual = no.notas.find((n) => n.path === nova[k]);
          const alvoOrdem = (k + 1) * 10;
          if ((atual?.ordem ?? 100) === alvoOrdem) continue;
          await gravarOrdem(nova[k], pasta, alvoOrdem);
        }
        await carregarArvore();
        setAviso(`ordem de “${tituloDe(de)}” atualizada em ${pasta || "raiz"}.`);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "não consegui salvar a ordem");
      }
    },
    [carregarArvore, gravarOrdem],
  );

  /** Grava a `ordem` de UMA pasta (PATCH /acervo/pasta pela camada). */
  const gravarOrdemPasta = useCallback(async (caminho: string, ordem: number) => {
    const r = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "editar-pasta", caminho, ordem }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d?.detail || d?.error || `HTTP ${r.status}`);
    }
  }, []);

  /**
   * (1b) Reordenar PASTA: a arrastada assume o lugar da irmã alvo.
   *
   * Mesma régua da nota — renumera em passos de 10 e só grava quem mudou —, mas
   * o metadado é de PASTA: vive no registro por tenant (`/acervo/pasta`), não no
   * frontmatter de arquivo nenhum. Só vale entre irmãs: em pais diferentes não
   * existe "ordem comum" para comparar.
   */
  const reordenarPasta = useCallback(
    async (de: string, para: string) => {
      const pai = acharPaiDe(arvoreRef.current, de);
      if (!pai || de === para) return;
      const irmaos = pai.subpastas.map((s) => s.path);
      const i = irmaos.indexOf(de);
      const j = irmaos.indexOf(para);
      if (i < 0 || j < 0) return;
      const nova = irmaos.slice();
      nova.splice(i, 1);
      nova.splice(j, 0, de);
      setErro(null);
      try {
        for (let k = 0; k < nova.length; k++) {
          const alvoOrdem = (k + 1) * 10;
          const atual = pai.subpastas.find((s) => s.path === nova[k]);
          if ((atual?.ordem ?? 100) === alvoOrdem) continue;
          await gravarOrdemPasta(nova[k], alvoOrdem);
        }
        await carregarArvore();
        const nome = (de.split("/").pop() || de).replace(/^[0-9]+_/, "").replace(/[-_]+/g, " ");
        setAviso(`ordem de “${nome}” atualizada — agora é a ${nova.indexOf(de) + 1}ª pasta de ${pai.path || "a raiz"}.`);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "não consegui salvar a ordem da pasta");
      }
    },
    [carregarArvore, gravarOrdemPasta],
  );

  /** (2) Mover para dentro de uma pasta/subpasta. */
  const moverParaPasta = useCallback(
    async (caminho: string, destino: string) => {
      setErro(null);
      try {
        const r = await fetch(API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acao: "mover-nota", path: caminho, nova_pasta: destino }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d?.detail || d?.error || `HTTP ${r.status}`);
        setAbertas((a) => new Set([...a, destino]));
        await carregarArvore();
        setAviso(`“${tituloDe(caminho)}” movida para ${destino}.`);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "não consegui mover a nota");
      }
    },
    [carregarArvore],
  );

  useEffect(() => {
    acoesRef.current = { reordenar, mover: moverParaPasta, reordenarPasta };
  }, [reordenar, moverParaPasta, reordenarPasta]);

  /**
   * Começa um arraste. `tipo` decide o que o SOLTAR faz:
   *  - nota → reordenar entre irmãs (solta em nota) ou mover de pasta (solta em pasta);
   *  - pasta → reordenar entre irmãs (solta em pasta irmã).
   */
  const iniciarArrasto = useCallback(
    (tipo: "nota" | "pasta", path: string, pasta: string, pai: string, nome: string, e: React.PointerEvent) => {
      if (e.button !== 0) return;
      arrastoRef.current = { tipo, path, pasta, pai, nome, x: e.clientX, y: e.clientY, ativo: false };
    },
    [],
  );

  // Um único par de ouvintes na janela: quem decide o alvo é o elemento sob o
  // ponteiro (o mesmo critério do dedo do usuário).
  useEffect(() => {
    const aoMover = (e: MouseEvent) => {
      const a = arrastoRef.current;
      if (!a) return;
      if (!a.ativo) {
        if (Math.abs(e.clientX - a.x) < 5 && Math.abs(e.clientY - a.y) < 5) return;
        a.ativo = true;
        // Mãozinha fechada durante o arraste inteiro — não só sobre a nota.
        document.body.style.cursor = "grabbing";
        setFantasma({ nome: a.nome, tipo: a.tipo, x: e.clientX, y: e.clientY });
      }
      setFantasma((f) => (f ? { ...f, x: e.clientX, y: e.clientY } : f));
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const alvoNota = el?.closest("[data-arca-nota-drop]") as HTMLElement | null;
      const alvoPasta = el?.closest("[data-arca-pasta]") as HTMLElement | null;
      // Pasta não se move para dentro de nota: para ela, só pasta conta.
      if (a.tipo === "nota" && alvoNota) setSobreAlvo(`nota:${alvoNota.dataset.arcaNotaDrop || ""}`);
      else if (alvoPasta) setSobreAlvo(`pasta:${alvoPasta.dataset.arcaPasta || ""}`);
      else setSobreAlvo("");
    };
    const aoSoltar = (e: MouseEvent) => {
      const a = arrastoRef.current;
      arrastoRef.current = null;
      document.body.style.cursor = "";
      if (!a || !a.ativo) {
        setFantasma(null);
        setSobreAlvo("");
        return;
      }
      suprimeClique.current = true;
      setTimeout(() => {
        suprimeClique.current = false;
      }, 60);
      setFantasma(null);
      setSobreAlvo("");
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const alvoNota = el?.closest("[data-arca-nota-drop]") as HTMLElement | null;
      const alvoPasta = el?.closest("[data-arca-pasta]") as HTMLElement | null;
      const acoes = acoesRef.current;
      if (!acoes) return;
      if (a.tipo === "pasta") {
        const destino = alvoPasta?.dataset.arcaPasta || "";
        if (destino && destino !== a.path) void acoes.reordenarPasta(a.path, destino);
        return;
      }
      if (alvoNota) {
        const destino = alvoNota.dataset.arcaNotaDrop || "";
        const pasta = alvoNota.dataset.arcaNotaPasta || "";
        if (destino && destino !== a.path) void acoes.reordenar(pasta, a.path, destino);
      } else if (alvoPasta) {
        const destino = alvoPasta.dataset.arcaPasta || "";
        if (destino && destino !== a.pasta) void acoes.mover(a.path, destino);
      }
    };
    window.addEventListener("pointermove", aoMover);
    window.addEventListener("mousemove", aoMover);
    window.addEventListener("pointerup", aoSoltar);
    window.addEventListener("mouseup", aoSoltar);
    window.addEventListener("pointercancel", aoSoltar);
    return () => {
      window.removeEventListener("pointermove", aoMover);
      window.removeEventListener("mousemove", aoMover);
      window.removeEventListener("pointerup", aoSoltar);
      window.removeEventListener("mouseup", aoSoltar);
      window.removeEventListener("pointercancel", aoSoltar);
    };
  }, []);

  // Wrappers com o `tipo` já cravado: as linhas não precisam saber que o arraste
  // é polimórfico (nota vs pasta), e o fantasma nasce com o nome já legível.
  const arrastarNota = useCallback(
    (path: string, pasta: string, e: React.PointerEvent) => iniciarArrasto("nota", path, pasta, pasta, tituloDe(path), e),
    [iniciarArrasto],
  );
  const arrastarPasta = useCallback(
    (path: string, nome: string, pai: string, e: React.PointerEvent) => iniciarArrasto("pasta", path, "", pai, nome, e),
    [iniciarArrasto],
  );

  const pastaAtual = pasta || "raiz";

  /* ── EDITAR NOME E COR PELA TELA (dono, 10/11/2026) ──────────────────────
     Duas operações, uma régua: a escrita vai para a CAMADA (`PATCH /acervo/*`
     pela porta `/api/acervo`), que é a mesma do MCP. Renomear NOTA muda título
     E nome do arquivo; renomear PASTA muda só o NOME EXIBIDO — o diretório
     numerado é a ordem estável da árvore e nunca é renomeado (renomeá-lo
     quebraria caminhos e índice). */
  const [editor, setEditor] = useState<EditorAlvo | null>(null);
  const [rascunho, setRascunho] = useState("");
  const [corEscolhida, setCorEscolhida] = useState(PALETA_CANON[3].cor);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  const editarNota = useCallback((caminho: string, nome: string) => {
    setErro(null);
    setEditor({ tipo: "nota", caminho });
    setRascunho(nome.replace(/\.md$/i, ""));
  }, []);

  const editarPasta = useCallback((caminho: string, nome: string, cor?: string) => {
    setErro(null);
    setEditor({ tipo: "pasta", caminho });
    setRascunho(nome);
    setCorEscolhida(cor || PALETA_CANON[3].cor);
  }, []);

  const cancelarEdicao = useCallback(() => {
    setEditor(null);
    setRascunho("");
  }, []);

  const salvarEdicao = useCallback(async () => {
    const alvo = editor;
    if (!alvo) return;
    const nome = rascunho.trim();
    if (!nome) {
      setErro("dê um nome antes de salvar.");
      return;
    }
    setSalvandoEdicao(true);
    setErro(null);
    try {
      const corpo =
        alvo.tipo === "nota"
          ? { path: alvo.caminho, novo_titulo: nome }
          : { caminho: alvo.caminho, novo_nome: nome, cor: corEscolhida };
      const r = await fetch(API, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const d = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      if (!r.ok || d?.ok === false) {
        throw new Error(String(d?.erro || d?.detalhe || "a Arca não aceitou a mudança"));
      }
      if (alvo.tipo === "nota") {
        const novo = String(d?.para || alvo.caminho);
        setAviso(`nota renomeada — título “${String(d?.titulo || nome)}” e arquivo ${novo} no acervo.`);
        if (nota?.path === alvo.caminho) await abrir(novo);
      } else {
        const meta = (d?.meta || {}) as { nome?: string; cor?: string };
        setAviso(
          `pasta “${String(meta.nome || nome)}” atualizada — nome e cor no registro; o diretório continua ${alvo.caminho}.`,
        );
      }
      setEditor(null);
      setRascunho("");
      await carregarArvore();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "não consegui salvar a edição");
    } finally {
      setSalvandoEdicao(false);
    }
  }, [editor, rascunho, corEscolhida, nota?.path, abrir, carregarArvore]);

  /* ── APAGAR PASTA (dono, 10/11/2026) ─────────────────────────────────────
     Duas etapas na própria linha: o 🗑 pede confirmação e só o segundo clique
     apaga. Pasta com conteúdo vai como `recursivo` + `confirmar` = o caminho —
     a camada recusa sem isso, então não existe apagar-por-engano. */
  const [apagando, setApagando] = useState<{ caminho: string; nome: string; temConteudo: boolean } | null>(null);
  const [salvandoApagar, setSalvandoApagar] = useState(false);

  const pedirApagarPasta = useCallback((caminho: string, nome: string, temConteudo: boolean) => {
    setErro(null);
    setEditor(null);
    setApagando({ caminho, nome, temConteudo });
  }, []);

  const cancelarApagar = useCallback(() => setApagando(null), []);

  const confirmarApagar = useCallback(async () => {
    const alvo = apagando;
    if (!alvo) return;
    setSalvandoApagar(true);
    setErro(null);
    try {
      const r = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "apagar-pasta",
          caminho: alvo.caminho,
          recursivo: alvo.temConteudo,
          confirmar: alvo.temConteudo ? alvo.caminho : "",
        }),
      });
      const d = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      if (!r.ok || d?.ok === false) {
        const det = d?.detail as Record<string, unknown> | string | undefined;
        const motivo =
          typeof det === "string" ? det : String((det?.motivo as string) || (d?.error as string) || "");
        throw new Error(motivo || "a Arca não apagou a pasta");
      }
      const apagados = Array.isArray(d?.apagados) ? (d.apagados as string[]) : [];
      setAviso(
        `pasta “${alvo.nome}” apagada${apagados.length ? ` com ${apagados.length} item(ns)` : " (estava vazia)"} — o histórico do acervo guardou o momento.`,
      );
      setApagando(null);
      if (nota?.path && nota.path.startsWith(`${alvo.caminho}/`)) setNota(null);
      await carregarArvore();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "não consegui apagar a pasta");
    } finally {
      setSalvandoApagar(false);
    }
  }, [apagando, nota?.path, carregarArvore]);

  return (
    <ProvedorAcesso>
    <CtxArcaEditor.Provider
      value={{
        editor,
        rascunho,
        setRascunho,
        corEscolhida,
        setCorEscolhida,
        salvandoEdicao,
        editarNota,
        editarPasta,
        salvarEdicao: () => void salvarEdicao(),
        cancelarEdicao,
        apagando,
        pedirApagarPasta,
        cancelarApagar,
        confirmarApagar: () => void confirmarApagar(),
        salvandoApagar,
      }}
    >
    <Shell
      titulo="A Arca"
      usuario={usuario}
      cheio
      recolhidaInicial={false}
    >
      {/* O TOPO — UMA peça só, nas MESMAS coordenadas nos dois modos (dono,
          10/11/2026: "quando troque eles fiquem no mesmo lugar. Quando faz a troca
          atualmente ele sobe, a foto do perfil sobe. n quero isso. quero que mantenha
          um padrão"). Antes o modo Pastas desenhava o toggle dentro do cabeçalho da
          casca e o Youniverse num flutuante — duas alturas diferentes, e tudo pulava
          na troca. Agora é fixo aqui, sobre as duas visões. */}
      <div data-arca-topo="sim" className="pointer-events-auto absolute left-1/2 top-5 z-40 -translate-x-1/2 lg:top-8">
        <SeletorModo
          rotuloAria="Modo de leitura da Arca"
          grande
          ativo={modo}
          onTrocar={(m) => trocarModo(m as "pastas" | "youniverse" | "fontes")}
          opcoes={[
            { id: "pastas", rotulo: "Pastas" },
            { id: "youniverse", rotulo: "Youniverse" },
            { id: "fontes", rotulo: "Fontes" },
          ]}
        />
      </div>

      {/* PALCO — as duas visões ficam empilhadas e trocam por CROSS-FADE, igual ao
          Chat ⇄ Orb da tela inicial (mesmas classes: transition-opacity duration-300
          ease-out e `pointer-events-none` na camada inativa). Antes era corte seco. */}
      <div className="relative h-full min-h-0">
      <div
        aria-hidden={modo !== "youniverse"}
        className={`absolute inset-0 z-0 transition-opacity duration-300 ease-out ${modo === "youniverse" ? "opacity-100" : "pointer-events-none opacity-0"}`}
      >
      {ceuMontado && (
        <Youniverse
          aoAbrirNota={(caminho) => {
            trocarModo("pastas");
            void abrir(caminho);
          }}
        />
      )}
      </div>
      <div
        aria-hidden={modo !== "fontes"}
        className={`absolute inset-0 z-20 overflow-y-auto bg-dash-bg/80 backdrop-blur-[2px] transition-opacity duration-300 ease-out ${modo === "fontes" ? "opacity-100" : "pointer-events-none opacity-0"}`}
      >
        {/* FONTES (18/11/2026): clicar no que entrou abre a nota — e volta para "Pastas",
            onde a nota é lida de verdade. Sem isso a pessoa clica e nada acontece. */}
        <Fontes
          onAbrirNota={(caminho) => {
            trocarModo("pastas");
            void abrir(caminho);
          }}
        />
      </div>
      <div
        aria-hidden={modo !== "pastas"}
        className={`absolute inset-0 z-10 transition-opacity duration-300 ease-out ${modo === "pastas" ? "opacity-100" : "pointer-events-none opacity-0"}`}
      >
      <div className="flex h-full min-h-0 flex-col">
        {/* ── TOPO: marca, busca e estado ── */}
        <header className="shrink-0 border-b border-white/[0.07] px-5 pb-4 pt-[92px] sm:px-7 lg:pt-[104px]">
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
            <div className="min-w-[170px]">
              <div className="flex items-center gap-2.5">
                <h1 className="text-[25px] font-semibold leading-none tracking-[-0.01em] text-dash-fg">
                  A Arca
                </h1>
                {!recebidoAtivo && <BotaoCompartilharArca soIcone />}
                {!recebidoAtivo && (
                  <span data-arca-novo-wrap="sim" className="relative inline-flex">
                    <button
                      type="button"
                      onClick={() => setNovoMenu((v) => !v)}
                      aria-label="criar pasta ou nota"
                      aria-expanded={novoMenu}
                      title="criar pasta ou nota"
                      data-arca-mais="sim"
                      className="inline-flex h-6 w-6 items-center justify-center rounded-[8px] text-dash-muted transition hover:bg-white/[0.06] hover:text-dash-brandHi"
                    >
                      <IconeMais className="h-[14px] w-[14px]" />
                    </button>
                    {novoMenu && (
                      <div
                        data-arca-novo-menu="sim"
                        className="absolute left-1/2 top-[calc(100%+8px)] z-30 w-[142px] -translate-x-1/2 rounded-[12px] border border-white/[0.08] bg-[#0d1119]/95 p-1 shadow-[0_18px_44px_-14px_rgba(0,0,0,0.9)] backdrop-blur-xl"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setNovaPasta(pasta);
                            setNovaNota(null);
                            setNovoMenu(false);
                          }}
                          className="flex w-full items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-left text-[12.5px] text-dash-fg/90 transition hover:bg-white/[0.06]"
                        >
                          <span
                            aria-hidden
                            style={{ width: 6, height: 6, borderRadius: 999, background: "rgba(160,164,173,0.6)", flexShrink: 0 }}
                          />
                          pasta
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setNovaNota({ titulo: "", template: "nota" });
                            setNovaPasta(null);
                            setNovoMenu(false);
                          }}
                          className="flex w-full items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-left text-[12.5px] text-dash-fg/90 transition hover:bg-white/[0.06]"
                        >
                          <IconeDocumento className="h-[13px] w-[13px] shrink-0 text-dash-muted" />
                          nota
                        </button>
                      </div>
                    )}
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-[12px] text-dash-muted">
                {recebidoAtivo ? (
                  <>
                    pasta de outra pessoa · só o que foi liberado a você{" · "}
                    <button
                      type="button"
                      onClick={() => setRecebidoAtivo(null)}
                      className="text-dash-muted underline decoration-dotted underline-offset-2 transition hover:text-dash-fg"
                    >
                      sair
                    </button>
                  </>
                ) : (
                  <>
                    segundo cérebro ·{" "}
                    {arvore
                      ? `${arvore.subpastas.length} pastas · ${fmt(arvore.total_notas)} notas`
                      : "sem números agora"}
                  </>
                )}
              </p>
            </div>
            <div className="flex min-w-[260px] flex-1 items-center gap-3 border-b border-white/[0.1] pb-1.5 focus-within:border-dash-brandHi/60">
              <span aria-hidden className="text-dash-muted">
                ⌕
              </span>
              <label htmlFor="arca-busca" className="sr-only">
                buscar em todo o acervo
              </label>
              <input
                ref={campoBusca}
                id="arca-busca"
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
                placeholder="buscar em todo o acervo"
                data-arca-busca="sim"
                autoComplete="off"
                spellCheck={false}
                className="w-full bg-transparent text-[14.5px] text-dash-fg outline-none placeholder:text-dash-muted/70"
              />
              {termo ? (
                <button
                  onClick={() => setTermo("")}
                  className="text-[12px] text-dash-muted hover:text-dash-fg"
                >
                  limpar
                </button>
              ) : (
                <kbd className="hidden rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-dash-muted sm:block">
                  /
                </kbd>
              )}
            </div>
            {panorama && (
              <div className="text-right text-[12px] text-dash-muted">
                <span className="text-[14px] font-medium text-dash-fg">{fmt(panorama.total_arestas)}</span> elos ·{" "}
                <span className={panorama.orfas > 0 ? "text-dash-brandHi" : ""}>{fmt(panorama.orfas)}</span> ilhadas
              </div>
            )}
          </div>
        </header>
        {/* O painel de compartilhamento vive DENTRO da casca: é dela a fonte e a cor. */}
        <PainelCompartilhar />

        {(erro || aviso) && (
          <div className="shrink-0 px-5 pt-3 sm:px-7">
            {erro ? (
              <p data-arca-erro="sim" className="text-[12.5px] text-dash-brandHi">
                {erro}
              </p>
            ) : (
              <p data-arca-aviso="sim" className="text-[12.5px] text-dash-muted">
                {aviso}
              </p>
            )}
          </div>
        )}

        {/* ── ZONAS ── */}
        {fantasma && (
          /* O FANTASMA é o CARTÃO daquilo que está sendo arrastado: mesmo raio
             (10px) e mesmas cores da linha da nota, fundo translúcido com blur e
             sombra leve. Antes era um retângulo de borda dura — parecia um tooltip
             quebrado, não algo que a pessoa está carregando na mão. */
          <div
            data-arca-fantasma="sim"
            data-arca-fantasma-tipo={fantasma.tipo}
            className="pointer-events-none fixed z-50 flex max-w-[260px] items-center gap-2 px-3 py-1.5"
            style={{
              left: fantasma.x,
              top: fantasma.y,
              /* Visual em ESTILO INLINE de propósito: as classes utilitárias
                 arbitrárias (raio/sombra/borda translúcida) não estão no CSS
                 compilado deste app — medidas como "0px de raio e nenhuma sombra"
                 no DOM durante o arraste. Inline garante o cartão igual ao da
                 linha da nota em qualquer build. */
              transform: "translate(-50%, -50%) rotate(-1.5deg)",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(13, 17, 25, 0.85)",
              boxShadow: "0 10px 28px -6px rgba(0,0,0,0.7)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              color: "rgba(244,246,250,0.90)",
              fontSize: 13,
              cursor: "grabbing",
              touchAction: "none",
            }}
          >
            <span aria-hidden style={{ fontSize: 11, lineHeight: 1, opacity: 0.65, userSelect: "none" }}>
              ⠿
            </span>
            <span className="truncate">{fantasma.nome}</span>
          </div>
        )}
        <div className="flex min-h-0 flex-1">
          {/* COLUNA 1 — ESTRUTURA (a divisão é por pasta) */}
          <aside
            data-arca-dropzone="sim"
            onDragOver={(e) => {
              // ARRASTAR ARQUIVO PARA CÁ (18/11/2026): o dono tentou e não acontecia nada —
              // a tela não tinha porta de upload nenhuma (só arraste de pasta/nota, que usa
              // ponteiro, não `dataTransfer`). Soltar arquivo aqui sobe para a Arca e o
              // arquivo entra como NOTA CATALOGADA.
              if (e.dataTransfer?.types?.includes("Files")) {
                e.preventDefault();
                setArrastando(true);
              }
            }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => {
              const fs = e.dataTransfer?.files;
              if (fs && fs.length) {
                e.preventDefault();
                setArrastando(false);
                void subirArquivos(fs);
              }
            }}
            className={
              "w-full shrink-0 overflow-y-auto border-r border-white/[0.07] px-3 py-4 sm:w-[310px] " +
              (arrastando ? "bg-dash-brandHi/[0.06] ring-1 ring-inset ring-dash-brandHi/40 " : "") +
              (nota ? "hidden sm:block" : "block")
            }
          >
            {arrastando && (
              <p
                data-arca-arrastando="sim"
                className="mb-2 rounded border border-dashed border-dash-brandHi/50 px-2 py-1.5 text-[11.5px] text-dash-brandHi"
              >
                solte aqui — o arquivo entra no acervo já catalogado
              </p>
            )}
            <div className="mb-2 flex items-center gap-2">
              <input
                ref={inputArquivoRef}
                type="file"
                multiple
                className="hidden"
                data-arca-input-arquivo="sim"
                onChange={(e) => {
                  const fs = e.target.files;
                  if (fs && fs.length) void subirArquivos(fs);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                data-arca-subir="sim"
                disabled={subindo}
                onClick={() => inputArquivoRef.current?.click()}
                className="rounded border border-white/[0.14] px-2 py-1 text-[11.5px] text-dash-fg/85 transition hover:border-dash-brandHi/50 hover:text-dash-fg disabled:opacity-50"
              >
                {subindo ? "subindo…" : "subir arquivo"}
              </button>
              <span className="text-[10.5px] text-dash-muted/70">ou arraste para cá</span>
            </div>
                        {novaPasta !== null && (
              <form
                className="mt-2 flex items-center gap-2 rounded border border-dash-brandHi/30 bg-white/[0.02] px-2 py-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void criarPasta();
                }}
              >
                <input
                  autoFocus
                  value={novaPasta}
                  onChange={(e) => setNovaPasta(e.target.value)}
                  placeholder="Clientes/2027 (use / para subpasta)"
                  className="w-full bg-transparent text-[12.5px] text-dash-fg outline-none placeholder:text-dash-muted/60"
                />
                <button type="submit" disabled={salvando} className="text-[11.5px] text-dash-brandHi">
                  criar
                </button>
              </form>
            )}

            {novaNota && (
              <form
                className="mt-2 space-y-1.5 rounded border border-dash-brandHi/30 bg-white/[0.02] px-2 py-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void criarNota();
                }}
              >
                <input
                  autoFocus
                  value={novaNota.titulo}
                  onChange={(e) => setNovaNota({ ...novaNota, titulo: e.target.value })}
                  placeholder="título da nota"
                  className="w-full bg-transparent text-[12.5px] text-dash-fg outline-none placeholder:text-dash-muted/60"
                />
                <div className="flex items-center gap-2">
                  <select
                    value={novaNota.template}
                    onChange={(e) => setNovaNota({ ...novaNota, template: e.target.value })}
                    className="bg-transparent text-[11.5px] text-dash-muted outline-none"
                  >
                    {TEMPLATES.map((t) => (
                      <option key={t} value={t} className="bg-[#0a0d14]">
                        {t}
                      </option>
                    ))}
                  </select>
                  <span className="truncate text-[11px] text-dash-muted/70">em {pastaAtual}</span>
                  <button type="submit" disabled={salvando} className="ml-auto text-[11.5px] text-dash-brandHi">
                    criar
                  </button>
                </div>
              </form>
            )}

            {resultados !== null ? (
              <section className="mt-3">
                <h3 className="px-1 text-[10px] uppercase tracking-[0.18em] text-dash-muted">
                  {buscando ? "buscando" : `${resultados.length} resultado(s)`}
                </h3>
                <ul className="mt-1">
                  {resultados.map((n) => (
                    <li key={n.path}>
                      <button
                        onClick={() => void abrir(n.path)}
                        className={
                          "w-full border-b border-white/[0.04] px-1.5 py-2 text-left hover:bg-white/[0.03] " +
                          (nota?.path === n.path
                            ? "border-l-2 border-l-dash-brandHi pl-2.5"
                            : "border-l-2 border-l-transparent")
                        }
                      >
                        <span className="block truncate text-[13px] text-dash-fg">{tituloDe(n.path)}</span>
                        <span className="block truncate text-[10.5px] text-dash-muted/80">{n.path}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : arvore ? (
              <ContextoRecebido.Provider value={Boolean(recebidoAtivo)}>
              <nav className="mt-2" data-arca-arvore="sim">
                {arvore.notas.map((n) => (
                  <div key={n.path}>
                    <LinhaNota
                      caminho={n.path}
                      nome={n.nome}
                      nivel={0}
                      pastaPai=""
                      aberta={nota?.path}
                      abrir={(p) => void abrir(p)}
                      meta={quando(n.modificado)}
                      iniciarArrasto={arrastarNota}
                      suprimeClique={suprimeClique}
                      sobre={sobreAlvo === `nota:${n.path}`}
                    />
                  </div>
                ))}
                {arvore.subpastas.map((s) => (
                  <Ramo
                    key={s.path}
                    no={s}
                    nivel={0}
                    pai=""
                    abertas={abertas}
                    alternar={alternar}
                    pasta={pasta}
                    setPasta={setPasta}
                    notaAberta={nota?.path}
                    abrir={(p) => void abrir(p)}
                    iniciarArrasto={arrastarNota}
                    iniciarArrastoPasta={arrastarPasta}
                    suprimeClique={suprimeClique}
                    sobreAlvo={sobreAlvo}
                  />
                ))}
                {arvore.total_notas === 0 && (
                  <p className="px-1.5 py-3 text-[12.5px] leading-relaxed text-dash-muted">
                    seu acervo está vazio. crie a primeira pasta — a divisão do cérebro é por pasta.
                  </p>
                )}
              </nav>
              </ContextoRecebido.Provider>
            ) : (
              <p className="mt-3 px-1.5 text-[12.5px] text-dash-muted">abrindo a estrutura…</p>
            )}
          </aside>

          {/* COLUNA 2 — LEITURA */}
          <section className="min-w-0 flex-1 overflow-y-auto" id="leitura">
            {abrindo && !nota && <p className="p-6 text-[13px] text-dash-muted">abrindo…</p>}

            {!nota && !abrindo && (
              <div className="flex h-full items-center justify-center px-6">
                <div className="max-w-[430px] text-center">
                  <p className="text-[15px] text-dash-fg">escolha uma nota na estrutura</p>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-dash-muted">
                    as pastas à esquerda são o mapa do cérebro. cada nota mostra de onde vem e para onde leva — e
                    você pode criar pasta e nota por aqui.
                  </p>
                </div>
              </div>
            )}

            {nota && (
              <article data-arca-nota="sim" className="mx-auto max-w-[780px] px-5 py-6 sm:px-8">
                <button
                  onClick={() => setNota(null)}
                  className="mb-3 text-[12.5px] text-dash-muted hover:text-dash-fg sm:hidden"
                >
                  ← voltar à estrutura
                </button>

                <p className="font-mono text-[11px] text-dash-muted">{nota.path.replace(/\.md$/i, "")}</p>
                <h2 className="mt-1 text-[23px] font-semibold leading-tight tracking-[-0.01em] text-dash-fg">
                  {nota.titulo}
                </h2>
                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-dash-muted">
                  <span>{fmt(nota.palavras)} palavras</span>
                  {nota.frontmatter.status && <span>· {nota.frontmatter.status}</span>}
                  {nota.frontmatter.type && <span>· {nota.frontmatter.type}</span>}
                  {(nota.frontmatter.tags || "")
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean)
                    .map((t) => (
                      <span key={t} className="rounded-full border border-white/10 px-2 py-0.5">
                        {t}
                      </span>
                    ))}
                </p>

                <hr className="my-5 border-white/[0.07]" />

                <NotaTexto corpo={nota.corpo} aoAbrir={(alvo) => void abrir(alvo)} />

                <Elos
                  titulo="vem de"
                  itens={nota.backlinks.map((e) => e.src_note || "")}
                  tipos={nota.backlinks.map((e) => e.edge_type || "")}
                  vazio="nenhuma nota aponta para esta ainda."
                  abrir={(p) => void abrir(p)}
                />
                <Elos
                  titulo="leva a"
                  itens={nota.links.map((e) => e.dst_note || "")}
                  tipos={nota.links.map((e) => e.edge_type || "")}
                  vazio="esta nota ainda não cita outra."
                  abrir={(p) => void abrir(p)}
                />
              </article>
            )}
          </section>
        </div>
      </div>
      </div>
      </div>
    </Shell>
    </CtxArcaEditor.Provider>
    </ProvedorAcesso>
  );
}

/**
 * A ALCINHA — a ÚNICA superfície com `touch-action: none`.
 *
 * A regra que isso cumpre: se `touch-action: none` ficasse na LINHA inteira, o
 * dedo parado sobre a nota nunca rolaria a lista (o navegador entrega o gesto ao
 * nosso código e a rolagem morre). Com a alcinha, o celular rola normalmente na
 * linha e arrasta só por ela — e, de quebra, fica ÓBVIO que a nota/pasta aceita
 * arraste, que era o pedido.
 */
function Pegador({
  rotulo,
  onIniciar,
}: {
  rotulo: string;
  onIniciar: (e: React.PointerEvent) => void;
}) {
  const [apertado, setApertado] = useState(false);
  return (
    <span
      role="button"
      tabIndex={-1}
      data-arca-pegador="sim"
      aria-label={rotulo}
      title={rotulo}
      onPointerDown={(e) => {
        e.stopPropagation();
        setApertado(true);
        onIniciar(e);
      }}
      onPointerUp={() => setApertado(false)}
      onPointerCancel={() => setApertado(false)}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
      className={
        "flex h-6 w-3.5 shrink-0 select-none items-center justify-center text-[10px] leading-none " +
        "text-dash-muted/35 hover:text-dash-muted group-hover:text-dash-muted/80" +
        (apertado ? " text-dash-brandHi" : "")
      }
      /* `cursor` e COR inline: as utilidades `cursor-grab`/`cursor-grabbing` não
         saem no CSS compilado deste app (medido: computed `auto`) e a alcinha em
         `text-dash-muted/35` media alpha 0,35 — praticamente invisível na tela.
         A alcinha precisa ser VISTA: é ela que anuncia que a linha arrasta. */
      style={{
        touchAction: "none",
        cursor: apertado ? "grabbing" : "grab",
        color: apertado ? "#e6e8ee" : "rgba(160,164,173,0.85)",
        fontSize: 12,
      }}
    >
      <span aria-hidden>⠿</span>
    </span>
  );
}

/** RENOMEAR NOTA — mora NA PRÓPRIA LINHA (não em modal): a pessoa vê o nome
 *  antigo virando o novo no lugar em que tocou no lápis. O campo é o TÍTULO; a
 *  camada também renomeia o ARQUIVO (slug do título) e mantém o catálogo. */
function EditorNotaInline({ caminho }: { caminho: string }) {
  const ed = useEditorArca();
  return (
    <form
      data-arca-editor-nota={caminho}
      onSubmit={(e) => {
        e.preventDefault();
        ed.salvarEdicao();
      }}
      className="flex min-w-0 flex-1 items-center gap-1.5 py-1"
    >
      <input
        autoFocus
        value={ed.rascunho}
        onChange={(e) => ed.setRascunho(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") ed.cancelarEdicao();
        }}
        data-arca-editor-campo="nota"
        aria-label="novo título da nota"
        spellCheck={false}
        className="min-w-0 flex-1 bg-transparent text-[12.5px] text-dash-fg outline-none"
        style={{ borderBottom: "1px solid rgba(160,164,173,0.5)", paddingBottom: 2 }}
      />
      <button
        type="submit"
        disabled={ed.salvandoEdicao}
        data-arca-editor-salvar="nota"
        className="shrink-0 text-[11px] text-dash-brandHi disabled:opacity-50"
      >
        {ed.salvandoEdicao ? "salvando" : "salvar"}
      </button>
      <button
        type="button"
        onClick={ed.cancelarEdicao}
        data-arca-editor-cancelar="nota"
        className="shrink-0 text-[11px] text-dash-muted hover:text-dash-fg"
      >
        cancelar
      </button>
    </form>
  );
}

/** RENOMEAR PASTA + COR — o nome aqui é SÓ o exibido: o diretório numerado
 *  (`03_PROJETOS`) continua sendo a ordem estável da árvore. A cor vem da
 *  paleta do canon (a mesma da camada) e há escolha livre; ela aparece na hora
 *  na bolinha da linha. */
function EditorPastaInline({ caminho }: { caminho: string }) {
  const ed = useEditorArca();
  return (
    <form
      data-arca-editor-pasta={caminho}
      onSubmit={(e) => {
        e.preventDefault();
        ed.salvarEdicao();
      }}
      className="min-w-0 flex-1 py-1"
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <input
          autoFocus
          value={ed.rascunho}
          onChange={(e) => ed.setRascunho(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") ed.cancelarEdicao();
          }}
          data-arca-editor-campo="pasta"
          aria-label="novo nome da pasta"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-[12.5px] font-medium text-dash-fg outline-none"
          style={{ borderBottom: "1px solid rgba(160,164,173,0.5)", paddingBottom: 2 }}
        />
        <button
          type="submit"
          disabled={ed.salvandoEdicao}
          data-arca-editor-salvar="pasta"
          className="shrink-0 text-[11px] text-dash-brandHi disabled:opacity-50"
        >
          {ed.salvandoEdicao ? "salvando" : "salvar"}
        </button>
        <button
          type="button"
          onClick={ed.cancelarEdicao}
          data-arca-editor-cancelar="pasta"
          className="shrink-0 text-[11px] text-dash-muted hover:text-dash-fg"
        >
          cancelar
        </button>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {PALETA_CANON.map((p) => {
          const atual = ed.corEscolhida.toLowerCase() === p.cor;
          return (
            <button
              key={p.cor}
              type="button"
              onClick={() => ed.setCorEscolhida(p.cor)}
              title={p.nome}
              aria-label={`cor ${p.nome}`}
              data-arca-cor={p.cor}
              data-arca-cor-atual={atual ? "sim" : "nao"}
              style={{
                width: 15,
                height: 15,
                borderRadius: 999,
                background: p.cor,
                border: atual ? "2px solid #e6e8ee" : "1px solid rgba(255,255,255,0.18)",
                boxShadow: atual ? `0 0 6px ${p.cor}` : "none",
                flexShrink: 0,
              }}
            />
          );
        })}
        <label className="ml-0.5 flex items-center gap-1 text-[10px] text-dash-muted" title="cor livre">
          <input
            type="color"
            value={ed.corEscolhida}
            onChange={(e) => ed.setCorEscolhida(e.target.value)}
            data-arca-cor-livre="sim"
            aria-label="escolher cor livre"
            style={{ width: 16, height: 16, background: "transparent", border: "none", padding: 0 }}
          />
          livre
        </label>
      </div>
    </form>
  );
}

/** O LÁPIS — visível sempre, não só no hover: é ele que anuncia que o nome e a
 *  cor se editam. `cursor: pointer` e cor INLINE porque as utilidades
 *  arbitrárias deste app não saem no CSS compilado (medido: cursor `auto`). */
function Lapis({ rotulo, aoClicar, alvo, marca }: {
  rotulo: string;
  aoClicar: () => void;
  alvo: string;
  marca: "nota" | "pasta";
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        aoClicar();
      }}
      aria-label={rotulo}
      title={rotulo}
      data-arca-editar-nota={marca === "nota" ? alvo : undefined}
      data-arca-editar-pasta={marca === "pasta" ? alvo : undefined}
      className="shrink-0 select-none rounded px-1 text-[10px] leading-none hover:bg-white/[0.06]"
      style={{ cursor: "pointer", color: "rgba(198,202,212,0.8)" }}
    >
      <span aria-hidden style={{ fontSize: 12 }}>
        ✎
      </span>
    </button>
  );
}

function LinhaNota({
  caminho,
  nome,
  nivel,
  pastaPai,
  aberta,
  abrir,
  meta,
  iniciarArrasto,
  suprimeClique,
  sobre,
}: {
  caminho: string;
  nome: string;
  nivel: number;
  pastaPai: string;
  aberta?: string;
  abrir: (p: string) => void;
  meta?: string;
  iniciarArrasto: (path: string, pasta: string, e: React.PointerEvent) => void;
  suprimeClique: React.MutableRefObject<boolean>;
  sobre: boolean;
}) {
  const selecionada = aberta === caminho;
  const ed = useEditorArca();
  const soLeitura = useContext(ContextoRecebido);
  const editando = ed.editor?.tipo === "nota" && ed.editor.caminho === caminho;
  return (
    /* A LINHA é um contêiner (a alcinha é IRMÃ do botão, não filha): botão dentro
       de botão é HTML inválido e o React reclama no console. A área de drop é
       esta div — o mesmo `data-arca-nota-drop` de antes. */
    <div
      data-arca-nota-drop={caminho}
      data-arca-nota-pasta={pastaPai}
      className={
        "group flex w-full items-center gap-1 pr-1 hover:bg-white/[0.03] " +
        (sobre
          ? "bg-dash-brandHi/[0.08] outline outline-1 -outline-offset-1 outline-dash-brandHi/50 "
          : selecionada
            ? "border-l-2 border-l-dash-brandHi bg-white/[0.03] "
            : "border-l-2 border-l-transparent ")
      }
      style={{ paddingLeft: `${4 + nivel * 13}px` }}
    >
      <Pegador rotulo={`arrastar “${nome.replace(/\.md$/i, "")}”`} onIniciar={(e) => iniciarArrasto(caminho, pastaPai, e)} />
      {editando ? (
        <EditorNotaInline caminho={caminho} />
      ) : (
        <button
        onClick={() => {
          // O fim de um ARRASTE não é clique: sem isto, soltar a nota abriria a nota.
          if (suprimeClique.current) return;
          abrir(caminho);
        }}
        // Arraste pelo corpo da linha só com MOUSE. No dedo, quem arrasta é a
        // alcinha: puxar arraste de um toque na linha mataria a rolagem.
        onPointerDown={(e) => {
          if (e.pointerType === "mouse") iniciarArrasto(caminho, pastaPai, e);
        }}
        aria-current={selecionada ? "true" : undefined}
        className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
      >
        <span className="truncate text-[13px] text-dash-fg/90 group-hover:text-dash-fg">
          {nome.replace(/\.md$/i, "")}
        </span>
        {meta && <span className="ml-auto shrink-0 text-[10px] text-dash-muted/70">{meta}</span>}
        </button>
      )}
      {!editando && !soLeitura && (
        <Lapis
          marca="nota"
          alvo={caminho}
          rotulo={`renomear “${nome.replace(/\.md$/i, "")}”`}
          aoClicar={() => ed.editarNota(caminho, nome)}
        />
      )}
    </div>
  );
}

/**
 * COMPARTILHAR TODA A ARCA — o botão ao lado do título.
 *
 * Concede o acervo INTEIRO (alvo `*`), não uma pasta: o convidado enxerga tudo
 * o que é seu no espaço, sempre com os níveis separados (ver/editar/excluir).
 * Fica discreto no topo porque compartilhar a Arca inteira é decisão grande —
 * o painel mostra quem já tem acesso antes de qualquer clique.
 */
function BotaoCompartilharArca({ comIcone, soIcone }: { comIcone?: boolean; soIcone?: boolean }) {
  const { abrir, concessoes } = useAcesso();
  const todos = concessoes.filter((c) => (c.alvo || "").trim() === "*");
  return (
    <span
      data-arca-compartilhar-tudo="sim"
      title={
        todos.length
          ? `toda a Arca: ${todos.map((c) => c.nome || c.convidado).join(", ")}`
          : "compartilhar toda a Arca"
      }
      style={{ transform: "translateY(-2px)" }}
      className={soIcone ? "relative inline-flex" : undefined}
    >
      {/* Dois pesos, mesma cor. Ao lado do título é SÓ O ÍCONE (o texto aparece
          no hover): nada de moldura, nada de rótulo competindo com "A Arca". Na
          linha do rótulo "estrutura" fica o texto, junto de + pasta / + nota. */}
      {soIcone ? (
        <button
          type="button"
          onClick={() => abrir("*")}
          aria-label="compartilhar toda a Arca"
          className="inline-flex h-6 w-6 items-center justify-center rounded-[8px] text-dash-brandHi transition hover:bg-white/[0.06] hover:text-dash-fg"
        >
          <IconeUsuarios className="h-[14px] w-[14px]" />
          {todos.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-dash-brandHi" aria-hidden />
          )}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => abrir("*")}
          aria-label="compartilhar toda a Arca"
          className="text-[11.5px] font-medium text-dash-brandHi transition hover:text-dash-fg"
        >
          compartilhar
          {todos.length > 0 && <span className="opacity-80"> ·{todos.length}</span>}
        </button>
      )}
    </span>
  );
}

/** Um ramo da árvore: pasta + subpastas + notas. */
function Ramo({
  no,
  nivel,
  pai,
  abertas,
  alternar,
  pasta,
  setPasta,
  notaAberta,
  abrir,
  iniciarArrasto,
  iniciarArrastoPasta,
  suprimeClique,
  sobreAlvo,
}: {
  no: NoArvore;
  nivel: number;
  /** Caminho do nó que CONTÉM esta pasta — o arraste só reordena entre irmãs. */
  pai: string;
  abertas: Set<string>;
  alternar: (p: string) => void;
  pasta: string;
  setPasta: (p: string) => void;
  notaAberta?: string;
  abrir: (p: string) => void;
  iniciarArrasto: (path: string, pasta: string, e: React.PointerEvent) => void;
  iniciarArrastoPasta: (path: string, nome: string, pai: string, e: React.PointerEvent) => void;
  suprimeClique: React.MutableRefObject<boolean>;
  sobreAlvo: string;
}) {
  const aberta = abertas.has(no.path);
  const selecionada = pasta === no.path;
  const ed = useEditorArca();
  const soLeitura = useContext(ContextoRecebido);
  const editando = ed.editor?.tipo === "pasta" && ed.editor.caminho === no.path;
  return (
    <div>
      <div
        data-arca-pasta={no.path}
        data-arca-pasta-cor={no.cor || ""}
        className={
          "group flex items-center gap-1 py-1.5 pr-1 " +
          (sobreAlvo === `pasta:${no.path}`
            ? "bg-dash-brandHi/[0.10] outline outline-1 -outline-offset-1 outline-dash-brandHi/50"
            : selecionada
              ? "bg-white/[0.04]"
              : "hover:bg-white/[0.03]")
        }
        style={{ paddingLeft: `${4 + nivel * 13}px` }}
      >
        <Pegador
          rotulo={`arrastar pasta “${no.nome}”`}
          onIniciar={(e) => iniciarArrastoPasta(no.path, no.nome, pai, e)}
        />
        {editando ? (
          <EditorPastaInline caminho={no.path} />
        ) : (
          <button
            onClick={() => {
              alternar(no.path);
              setPasta(no.path);
            }}
            title={no.path}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          >
            <span aria-hidden className="w-3 shrink-0 text-[9px] text-dash-muted">
              {aberta ? "▾" : "▸"}
            </span>
            {/* A COR DA PASTA — a bolinha que mostra, na hora, a cor do registro. */}
            <span
              aria-hidden
              data-arca-bolinha-cor={no.cor || ""}
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: no.cor || "rgba(160,164,173,0.5)",
                flexShrink: 0,
              }}
            />
            <span className="truncate text-[12.5px] font-medium text-dash-fg">{no.nome}</span>
          </button>
        )}
        {!soLeitura && <Fotinhas pasta={no.path} />}
        <span className="shrink-0 text-[10px] text-dash-muted/70">{no.total_notas}</span>
        {!editando && !soLeitura && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                ed.pedirApagarPasta(no.path, no.nome, no.total_notas > 0 || no.subpastas.length > 0);
              }}
              aria-label={`apagar a pasta “${no.nome}”`}
              title={`apagar a pasta “${no.nome}”`}
              data-arca-apagar-pasta={no.path}
              className="shrink-0 select-none rounded px-1 text-[10px] leading-none hover:bg-white/[0.06]"
              style={{ cursor: "pointer", color: "rgba(198,202,212,0.55)" }}
            >
              <span aria-hidden style={{ fontSize: 11 }}>
                🗑
              </span>
            </button>
            <Lapis
              marca="pasta"
              alvo={no.path}
              rotulo={`renomear e colorir a pasta “${no.nome}”`}
              aoClicar={() => ed.editarPasta(no.path, no.nome, no.cor)}
            />
          </>
        )}
      </div>
      {ed.apagando?.caminho === no.path && (
        <div
          data-arca-confirma-apagar={no.path}
          className="flex flex-wrap items-center gap-2 border-l-2 border-l-[#ef4444] bg-[#ef4444]/[0.07] py-1.5 pr-2"
          style={{ paddingLeft: `${20 + nivel * 13}px` }}
        >
          <span className="text-[11.5px] text-dash-fg">
            apagar “{no.nome}”
            {ed.apagando.temConteudo
              ? ` e o conteúdo (${no.total_notas} nota(s)${no.subpastas.length ? `, ${no.subpastas.length} subpasta(s)` : ""})?`
              : " (vazia)?"}
          </span>
          <button
            type="button"
            onClick={ed.confirmarApagar}
            disabled={ed.salvandoApagar}
            data-arca-apagar-sim={no.path}
            className="text-[11px] text-[#ef4444] disabled:opacity-50"
          >
            {ed.salvandoApagar ? "apagando…" : "apagar"}
          </button>
          <button
            type="button"
            onClick={ed.cancelarApagar}
            data-arca-apagar-nao={no.path}
            className="text-[11px] text-dash-muted hover:text-dash-fg"
          >
            cancelar
          </button>
        </div>
      )}
      {aberta && (
        <div>
          {no.notas.map((n) => (
            <div key={n.path}>
              <LinhaNota
                caminho={n.path}
                nome={n.nome}
                nivel={nivel + 1}
                pastaPai={no.path}
                aberta={notaAberta}
                abrir={abrir}
                meta={quando(n.modificado)}
                iniciarArrasto={iniciarArrasto}
                suprimeClique={suprimeClique}
                sobre={sobreAlvo === `nota:${n.path}`}
              />
            </div>
          ))}
          {no.subpastas.map((s) => (
            <Ramo
              key={s.path}
              no={s}
              nivel={nivel + 1}
              pai={no.path}
              abertas={abertas}
              alternar={alternar}
              pasta={pasta}
              setPasta={setPasta}
              notaAberta={notaAberta}
              abrir={abrir}
              iniciarArrasto={iniciarArrasto}
              iniciarArrastoPasta={iniciarArrastoPasta}
              suprimeClique={suprimeClique}
              sobreAlvo={sobreAlvo}
            />
          ))}
          {no.notas.length === 0 && no.subpastas.length === 0 && (
            <p className="py-1.5 text-[11.5px] text-dash-muted/70" style={{ paddingLeft: `${24 + nivel * 13}px` }}>
              pasta vazia — crie uma nota aqui
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Os elos de uma nota — navegar é clicar. */
function Elos({
  titulo,
  itens,
  tipos,
  vazio,
  abrir,
}: {
  titulo: string;
  itens: string[];
  tipos: string[];
  vazio: string;
  abrir: (p: string) => void;
}) {
  return (
    <section className="mt-9">
      <h3 className="text-[10px] uppercase tracking-[0.18em] text-dash-muted">
        {titulo}
        {itens.length > 0 && <span className="ml-2 normal-case tracking-normal">{itens.length}</span>}
      </h3>
      {itens.length === 0 ? (
        <p className="mt-1.5 text-[12px] text-dash-muted">{vazio}</p>
      ) : (
        <ul className="mt-1.5">
          {itens.map((alvo, i) => (
            <li key={`${alvo}-${i}`}>
              <button
                onClick={() => abrir(alvo)}
                className="flex w-full items-baseline justify-between gap-3 border-b border-white/[0.04] py-1.5 text-left hover:bg-white/[0.02]"
              >
                <span className="truncate text-[13px] text-dash-fg/90">{tituloDe(alvo)}</span>
                {tipos[i] && <span className="shrink-0 text-[10.5px] text-dash-muted">{tipos[i]}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
