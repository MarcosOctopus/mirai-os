"use client";

/**
 * YOUNIVERSE — o acervo como CÉU: estrelas coloridas e nebulosas.
 *
 * O QUE O DONO PEDIU (3ª rodada, palavra dele): "fazer o estilo como se fossem
 * estrelas e nebulosas coloridas, que deixe esse que tá fazendo ainda mais bonito
 * mas SEM PESAR".
 *
 * POR QUE ISSO FICOU MAIS LEVE DO QUE ESTAVA (e não mais pesado):
 *   antes: 236 esferas (≈92 mil triângulos, 236 desenhos) + 528 linhas.
 *   agora: 1 desenho de PONTOS (236 vértices, zero triângulo) + 528 linhas + ~10
 *   nuvens de gradiente (10 quadriláteros). A cintilação e o halo são calculados
 *   no SHADER (placa de vídeo), então não custam nada por quadro. E não há
 *   pós-processamento (bloom é o que costuma derrubar gráfico assim): o brilho
 *   vem de mistura aditiva + sprite suave.
 *
 * O QUE CADA COISA SIGNIFICA (nada aqui é decoração solta):
 *   estrela   = uma nota. TAMANHO = grau (quantos elos ela tem): quem é "hub"
 *               brilha maior.
 *   cor       = pasta (a mesma cor sempre).
 *   nebulosa  = uma pasta: fica no centro onde aquelas notas realmente se
 *               aglomeraram, então o "continente" do mapa virou nuvem colorida.
 *   entrelinha= elo do grafo (quem cita quem).
 *   altura (z)= idade: nota mais nova fica mais PERTO — o céu tem profundidade
 *               com sentido.
 *
 * Posição e elos vêm da Arca (`/vault/youniverse`, t-SNE sobre os vetores do
 * palácio). Clique e rótulo são calculados em tela (HTML), não por raycaster —
 * mais previsível e não custa um segundo desenho.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { ChevronDown, Eye, EyeOff, Focus, Layers, Search, SlidersHorizontal, Sparkles } from "lucide-react";

const API = "/api/acervo";
const ESCALA = 9;
// FORÇA DAS LINHAS (elos). Com AdditiveBlending o que aparece é `cor × opacidade`,
// e o fundo do céu é ~(5,7,13) — calibre AQUI, só este par.
// Histórico: `#26375c` × 0,28 = ~(11,15,26); `#4a78cc` × 0,5 = ~(37,60,102) ficou forte
// demais. CALIBRADO PELO DONO (17/11/2026): "AS LINHAS ESTÃO CERTAS" com o par abaixo.
// LIÇÃO: com AdditiveBlending a luz SOMA onde as linhas se cruzam, então a legibilidade
// depende também da QUANTIDADE de elos — com 9 elos nada aparece em nenhuma opacidade;
// com 760 elos este par lê como malha. Antes de mexer aqui, confira `meta.elos` do mapa.
const ELO_COR = "#26375c";
const ELO_FORCA = 0.28;
const ALCANCE_Z = 7.0; // profundidade total (era 4.2: de lado virava folha amassada)

type No = {
  id: string;
  path: string;
  titulo: string;
  pasta: string;
  subpasta?: string;
  tags?: string[];
  status?: string;
  x: number;
  y: number;
  dias?: number | null;
  grau?: number;
};
type Elo = { de: string; para: string; tipo: string };
type Dados = { org?: string; meta?: Record<string, unknown>; nodes: No[]; links: Elo[] };

/** Cor por pasta — estável (mesma pasta, mesma cor, sempre). */
type Escopo = "tudo" | "pessoal" | "organizacoes";

const CORES_CANONICAS: Record<string, string> = {
  "00_SYSTEM": "#9aa4b2",
  "01_MARCOS": "#ffb020",
  "02_MEDIA": "#ff4fd8",
  "03_PROJETOS": "#3d8bff",
  "04_EMPRESAS": "#22c55e",
  "05_REUNIOES": "#22d3ee",
  "06_APRENDIZADOS": "#a855f7",
  "07_PESSOAS": "#fb7185",
  "08_DECISOES": "#ff9f1c",
  "09_INCIDENTES": "#ef4444",
  "10_TIMELINE": "#eab308",
  "99_ARQUIVO": "#5b6472",
};

/** Cor por pasta — estável E com SIGNIFICADO. O canon define nome e cor de cada pasta
 *  (dono, 10/11/2026: "as pastas podem e as tags podem escolher nome e cor para que
 *  apareça diferente no youniverse"). Pasta fora do canon recebe um tom derivado do
 *  nome — nunca fica sem cor. */
function corDaPasta(pasta: string): THREE.Color {
  const canon = CORES_CANONICAS[pasta];
  if (canon) return new THREE.Color(canon);
  let h = 0;
  for (let i = 0; i < pasta.length; i++) h = (h * 31 + pasta.charCodeAt(i)) % 360;
  return new THREE.Color().setHSL(h / 360, 1.0, 0.6);
}

/** Profundidade pela idade: 0 = mais antiga (longe), 1 = mais nova (perto). */
function zDaIdade(dias: number | null | undefined, maxDias: number): number {
  if (dias == null || !maxDias) return 0;
  const fresco = Math.min(1, Math.max(0, 1 - dias / maxDias)); // 1 = recém-criada
  return (fresco - 0.5) * 2 * ALCANCE_Z;
}

const VERT = `
attribute float aSize;
attribute float aTwinkle;
attribute vec3 aCor;
uniform float uTempo;
uniform float uEscala;
varying vec3 vCor;
varying float vForte;
void main() {
  vCor = aCor;

  // Cores mais vivas: afasta do cinza (satura) sem clarear. O brilho continua vindo

  // do multiplicador do fragmento, entao a cor nao lava para branco.

  float cinzaCor = dot(vCor, vec3(0.299, 0.587, 0.114));

  vCor = clamp(mix(vec3(cinzaCor), vCor, 1.35), 0.0, 1.0);
  vForte = aTwinkle;
  vec4 vista = modelViewMatrix * vec4(position, 1.0);
  float cintila = 0.72 + 0.38 * sin(uTempo * (0.6 + aTwinkle * 1.4) + aTwinkle * 37.0);
  gl_PointSize = aSize * cintila * uEscala * (280.0 / max(0.001, -vista.z));
  gl_Position = projectionMatrix * vista;
}`;

const FRAG = `
varying vec3 vCor;
varying float vForte;
uniform float uBrilho;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = length(d) * 2.0;
  float halo = smoothstep(0.85, 0.05, r);
  float nucleo = smoothstep(0.26, 0.0, r);
  float a = halo * 0.42 * uBrilho + nucleo * 1.0;
  if (a < 0.015) discard;
  gl_FragColor = vec4(vCor * (1.25 + vForte * 0.5), a);
}`;

const NEB_VERT = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const NEB_FRAG = `
varying vec2 vUv;
uniform vec3 uCor;
uniform float uForca;
uniform float uSemente;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float borda = smoothstep(1.0, 0.12, d);
  float mancha = 0.55 + 0.45 * sin(vUv.x * 7.0 + uSemente) * sin(vUv.y * 6.2 - uSemente);
  gl_FragColor = vec4(uCor, borda * uForca * (0.55 + 0.45 * mancha));
}`;

export default function Youniverse({
  aoAbrirNota,
  seletor,
}: {
  aoAbrirNota: (caminho: string) => void;
  /** O seletor de modo (Pastas | Youniverse) — vem da tela e flutua aqui em cima,
   *  porque em tela cheia o CSS da casca ESCONDE o cabeçalho (`.dash-cheio … header
   *  { display:none }`) e com ele o seletor ia junto. */
  seletor?: React.ReactNode;
}) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [termo, setTermo] = useState("");
  const [pastaAtiva, setPastaAtiva] = useState<string | null>(null);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [resumo, setResumo] = useState("");
  const [rotulos, setRotulos] = useState(true);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API}?acao=youniverse`, { cache: "no-store" });
        const d = await r.json().catch(() => null);
        if (!r.ok) {
          setErro(
            r.status === 404
              ? "o mapa deste acervo ainda está sendo construído — o cérebro precisa ser lido antes de ser desenhado."
              : (d as { detail?: string; error?: string })?.detail ||
                  (d as { error?: string })?.error ||
                  `não consegui carregar o céu (HTTP ${r.status})`,
          );
          return;
        }
        // NUNCA confiar no 200: se a resposta não tiver a forma do mapa (ex.: um
        // proxy/rota devolvendo HTML ou outro JSON), isto virava `dados={}` e o
        // 3D quebrava lendo `nodes` — a página morria inteira em vez de avisar.
        const mapa = d as Dados | null;
        if (!mapa || !Array.isArray(mapa.nodes) || !Array.isArray(mapa.links)) {
          console.error("[youniverse] resposta sem forma de mapa", d);
          setErro("o acervo respondeu num formato inesperado — recarregue em instantes.");
          return;
        }
        setDados(mapa);
      } catch {
        setErro("não consegui carregar o céu agora");
      }
    })();
  }, []);

  const vizinhos = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const e of dados?.links || []) {
      if (!m.has(e.de)) m.set(e.de, new Set());
      if (!m.has(e.para)) m.set(e.para, new Set());
      m.get(e.de)!.add(e.para);
      m.get(e.para)!.add(e.de);
    }
    return m;
  }, [dados]);

  const pastas = useMemo(() => {
    const c = new Map<string, number>();
    for (const n of dados?.nodes || []) c.set(n.pasta, (c.get(n.pasta) || 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [dados]);

  const casam = useMemo(() => {
    const t = termo.trim().toLowerCase();
    if (t.length < 2) return null;
    const s = new Set<string>();
    for (const n of dados?.nodes || []) {
      if (`${n.titulo} ${n.path} ${n.pasta} ${(n.tags || []).join(" ")}`.toLowerCase().includes(t)) s.add(n.id);
    }
    return s;
  }, [termo, dados]);

  const noSel = useMemo(() => dados?.nodes.find((n) => n.id === selecionado) || null, [dados, selecionado]);
  const ligados = useMemo(() => {
    if (!noSel || !dados) return [];
    return [...(vizinhos.get(noSel.id) || [])]
      .map((id) => dados.nodes.find((n) => n.id === id))
      .filter((n): n is No => Boolean(n))
      .sort((a, b) => (b.grau || 0) - (a.grau || 0));
  }, [noSel, dados, vizinhos]);

  useEffect(() => {
    if (!noSel) {
      setResumo("");
      return;
    }
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`${API}?acao=nota&path=${encodeURIComponent(noSel.path)}`, { cache: "no-store" });
        const d = await r.json().catch(() => ({}));
        if (vivo)
          setResumo(String(d.corpo || "").replace(/[#*>`\-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 420));
      } catch {
        if (vivo) setResumo("");
      }
    })();
    return () => {
      vivo = false;
    };
  }, [noSel]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      const digitando = tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";
      if (e.key.toLowerCase() === "l" && !digitando) setRotulos((v) => !v);
      if (e.key === "Escape") {
        if (termo) setTermo("");
        else setSelecionado(null);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [termo]);

  const metricas = (dados?.meta || {}) as Record<string, unknown>;

  // ── CAMADAS (pastas) com checkbox, como o dono pediu ──────────────────────
  // `ocultas` vazio = "ver tudo". Escolher grupos é ver o cérebro por recorte
  // (só Pessoas, só Reuniões…), sem perder o resto do acervo.
  // QUEM E PESSOAL E QUEM E ORGANIZACAO (ajustar aqui, num lugar so). O dono pediu
  // o recorte: so as pessoas, so as organizacoes, ou tudo junto.
  const PESSOAIS = new Set(["Pessoas", "01_MARCOS", "Aprendizados", "Timeline", "(raiz)"]);
  const [escopos, setEscopos] = useState<Set<string>>(new Set());
  // AS ORGANIZACOES VEM DO MIRAI OS (registro da plataforma), nao do acervo: e o
  // que o dono pediu. O acervo so entra como rede de seguranca se a rota faltar.
  const [orgsPlataforma, setOrgsPlataforma] = useState<{ id: string; nome: string; slug: string }[]>([]);
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch("/api/organizacoes", { cache: "no-store" });
        const d = (await r.json().catch(() => null)) as { organizacoes?: { id: string; nome: string; slug: string }[] } | null;
        if (vivo && r.ok && Array.isArray(d?.organizacoes)) setOrgsPlataforma(d.organizacoes);
      } catch {
        /* sem a rota: cai no criterio do acervo abaixo (nunca fica sem lista) */
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);
  const [escopoAberto, setEscopoAberto] = useState(false);
  const alternarEscopo = (chave: string) =>
    setEscopos((antes) => {
      const novo = new Set(antes);
      if (novo.has(chave)) novo.delete(chave);
      else novo.add(chave);
      return novo;
    });

  // AS ORGANIZACOES DO ACERVO (nada fixo no codigo): quem esta na pasta `Empresas`
  // ou carrega a tag `empresa`. Cada uma alcanca as notas LIGADAS a ela no grafo mais
  // as que a citam no caminho/titulo/tags — e o drop mostra esse alcance de verdade.
  const empresas = useMemo(() => {
    type Grupo = { chave: string; nome: string; ids: Set<string>; cor: string };
    if (!dados) return [] as Grupo[];
    const viz = new Map<string, Set<string>>();
    for (const e of dados.links) {
      if (!viz.has(e.de)) viz.set(e.de, new Set());
      if (!viz.has(e.para)) viz.set(e.para, new Set());
      viz.get(e.de)?.add(e.para);
      viz.get(e.para)?.add(e.de);
    }
    const tagsDe = (n: (typeof dados.nodes)[number]) =>
      ((n as unknown as { tags?: string[] }).tags || []).map((t) => String(t).toLowerCase());
    // Fonte principal: organizacoes do MIRAI OS (por nome). Se a rota nao responder,
    // cai no criterio do propio acervo (pasta `Empresas` / tag `empresa`).
    const daPlataforma = orgsPlataforma.map((o) => o.nome).filter(Boolean);
    const nomes = daPlataforma.length
      ? daPlataforma
      : dados.nodes
          .filter((n) => n.pasta === "Empresas" || tagsDe(n).includes("empresa"))
          .map((n) => n.titulo);

    return [...new Set(nomes)].map((nome) => {
      // Se o acervo tem uma nota com esse nome, ela entra junto com o que o grafo
      // liga nela. Se nao tem (org de cliente sem nota), o alcance e so o que cita
      // o nome — honesto, nunca herda resultado de outra organizacao.
      const no = dados.nodes.find((n) => n.titulo.toLowerCase() === nome.toLowerCase());
      const ids = new Set<string>(no ? [no.id, ...(viz.get(no.id) || [])] : []);
      const slug = nome.toLowerCase();
      for (const x of dados.nodes) {
        const texto = `${x.titulo} ${x.path} ${tagsDe(x).join(" ")}`.toLowerCase();
        if (slug && texto.includes(slug)) ids.add(x.id);
      }
      return {
        chave: `org:${nome}`,
        nome,
        ids,
        cor: no ? `#${corDaPasta(no.pasta).getHexString()}` : "#7c8db5",
      };
    });

  }, [dados, orgsPlataforma]);
  const [ocultas, setOcultas] = useState<Set<string>>(new Set(["99_ARQUIVO"])); // arquivo morto fora do ceu por padrao
  const [camadasAbertas, setCamadasAbertas] = useState(false); // dropdown: abre a pedido
  const [nebulosasLigadas, setNebulosasLigadas] = useState(true); // nuvens de fundo (a pedido do dono)
  const alternarPasta = useCallback((p: string) => {
    setOcultas((antes) => {
      const novo = new Set(antes);
      if (novo.has(p)) novo.delete(p);
      else novo.add(p);
      return novo;
    });
  }, []);
  const marcarTodas = useCallback(
    (ver: boolean) => setOcultas(ver ? new Set() : new Set(pastas.map(([p]) => p))),
    [pastas],
  );
  const dadosVisiveis = useMemo(() => {
    if (!dados) return null;
    if (!ocultas.size && !escopos.size) return dados;
    const idsEscopo = new Set<string>();
    if (escopos.size) {
      if (escopos.has("pessoal")) for (const n of dados.nodes) if (PESSOAIS.has(n.pasta)) idsEscopo.add(n.id);
      for (const emp of empresas) if (escopos.has(emp.chave)) for (const id of emp.ids) idsEscopo.add(id);
    }
    const restantes = dados.nodes.filter(
      (n) => (!escopos.size || idsEscopo.has(n.id)) && !ocultas.has(n.pasta),
    );
    const ids = new Set(restantes.map((n) => n.id));
    return { ...dados, nodes: restantes, links: dados.links.filter((l) => ids.has(l.de) && ids.has(l.para)) };
  }, [dados, ocultas, escopos, empresas]);

  // ── ENQUADRAMENTO: "sempre zoom out quando abre" (pedido do dono) ──────────
  // Calcula a distância que faz o mapa INTEIRO caber, em vez de abrir colado num
  // aglomerado (era o que deixava a tela exagerada: estrelas gigantes, rótulos
  // atropelados e o resto do cérebro fora de quadro).
  const giro = useRef({ x: -0.16, y: 0 });
  const distancia = useRef(17);
  const distanciaIdeal = useCallback(() => {
    const lista = dados?.nodes || [];
    if (!lista.length) return 17;
    const larg = typeof window !== "undefined" ? window.innerWidth : 1600;
    const alt = typeof window !== "undefined" ? window.innerHeight : 900;
    const aspecto = Math.max(0.45, larg / Math.max(1, alt));
    const eixoX = Math.max(...lista.map((n) => Math.abs(n.x * ESCALA))) / aspecto;
    const eixoY = Math.max(...lista.map((n) => Math.abs(n.y * ESCALA)));
    const vFov = (46 * Math.PI) / 180;
    return Math.min(60, Math.max(8, (Math.max(eixoX, eixoY) / Math.tan(vFov / 2)) * 1.16 + 2.5));
  }, [dados]);
  useEffect(() => {
    if (dados) distancia.current = distanciaIdeal();
  }, [dados, distanciaIdeal]);
  const enquadrar = useCallback(() => {
    distancia.current = distanciaIdeal();
    giro.current = { x: -0.16, y: 0 };
  }, [distanciaIdeal]);

  // Sem WebGL (navegador antigo, GPU bloqueada, modo economia) o Canvas não sobe.
  // Melhor avisar do que deixar um quadrado morto — e o caminho de pastas continua.
  const [temWebgl, setTemWebgl] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      const c = document.createElement("canvas");
      setTemWebgl(!!(c.getContext("webgl2") || c.getContext("webgl")));
    } catch {
      setTemWebgl(false);
    }
  }, []);

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden rounded-[14px] border border-white/[0.06] bg-[#03050a]">
      {seletor && (
        <div data-youniverse-seletor="sim" className="absolute left-1/2 top-3 z-40 -translate-x-1/2">
          {seletor}
        </div>
      )}

      {/* poeira de fundo: dá "céu" sem custo nenhum */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(70% 60% at 50% 46%, rgba(38,70,150,0.16) 0%, rgba(4,6,12,0) 72%), radial-gradient(40% 34% at 16% 82%, rgba(120,60,180,0.10) 0%, rgba(0,0,0,0) 70%), radial-gradient(34% 30% at 86% 20%, rgba(255,120,70,0.07) 0%, rgba(0,0,0,0) 70%)",
        }}
      />

      {dados && temWebgl !== false && (
        <div ref={caixa} className="absolute inset-0">
          <Ceu
            dados={dadosVisiveis ?? dados}
            mostrarNebulosas={nebulosasLigadas}
            selecionado={selecionado}
            aoSelecionar={setSelecionado}
            casam={casam}
            pastaAtiva={pastaAtiva}
            rotulos={rotulos}
            caixa={caixa}
            giro={giro}
            distancia={distancia}
          />
        </div>
      )}

      {temWebgl === false && (
        <div data-youniverse-sem-webgl="sim" className="absolute inset-0 grid place-items-center px-6">
          <p className="max-w-[430px] text-center text-[13px] leading-relaxed text-dash-muted">
            este navegador não consegue desenhar o céu (sem WebGL/GPU). O acervo segue inteiro no modo{" "}
            <b className="text-dash-fg">Pastas</b> — e quase sempre é só atualizar o navegador ou tirar o modo
            economia de bateria.
          </p>
        </div>
      )}

      {!dados && !erro && (
        <p className="absolute inset-0 grid place-items-center text-[13px] text-dash-muted">abrindo o céu…</p>
      )}
      {erro && (
        <div className="absolute inset-0 grid place-items-center px-6">
          <p data-youniverse-erro="sim" className="max-w-[440px] text-center text-[13px] leading-relaxed text-dash-muted">
            {erro}
          </p>
        </div>
      )}

      {dados && (
        <>
                              <div className="absolute left-4 top-[74px] w-[302px] max-w-[calc(100%-2rem)] space-y-2" data-youniverse-ui="sim">
            {/* BUSCA */}
            <div className="flex items-center gap-2 rounded-[11px] border border-white/[0.09] bg-black/60 px-3 py-2 backdrop-blur transition-colors focus-within:border-white/[0.22]">
              <Search className="h-3.5 w-3.5 shrink-0 text-dash-muted" />
              <label htmlFor="uni-busca" className="sr-only">
                buscar no céu
              </label>
              <input
                id="uni-busca"
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
                placeholder="Buscar e acender no céu"
                data-youniverse-busca="sim"
                autoComplete="off"
                spellCheck={false}
                className="w-full bg-transparent text-[13px] text-dash-fg outline-none placeholder:text-dash-muted/70"
              />
              {termo ? (
                <button onClick={() => setTermo("")} title="Limpar busca" className="shrink-0 text-[11px] text-dash-muted hover:text-dash-fg">
                  limpar
                </button>
              ) : (
                casam && <span className="shrink-0 text-[11px] text-dash-brandHi">{casam.size}</span>
              )}
            </div>

            {/* ESCOPO: tudo / pessoal / cada organização — marcável, na mesma linguagem
                do drop de camadas (pedido do dono: organizações individuais, não o geral). */}
            <div className="relative">
              <button
                onClick={() => setEscopoAberto((v) => !v)}
                data-youniverse-escopo="sim"
                title="O que mostrar no céu"
                className="flex w-full items-center gap-2 rounded-[11px] border border-white/[0.09] bg-black/60 px-3 py-2 text-[12.5px] text-dash-muted backdrop-blur hover:text-dash-fg"
              >
                <Layers className="h-3.5 w-3.5 shrink-0" />
                <span className="text-dash-fg/90">Escopo</span>
                <span className="ml-auto font-mono text-[10.5px]">
                  {escopos.size === 0 ? "Tudo" : `${escopos.size} marcado${escopos.size > 1 ? "s" : ""}`}
                </span>
                <ChevronDown className={"h-3.5 w-3.5 shrink-0 transition-transform " + (escopoAberto ? "rotate-180" : "")} />
              </button>

              {escopoAberto && (
                <div
                  data-youniverse-escopo-painel="sim"
                  className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 max-h-[46vh] overflow-y-auto rounded-[11px] border border-white/[0.1] bg-[#080c14]/95 p-1.5 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.9)] backdrop-blur-xl"
                >
                  <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-white/[0.04]">
                    <input
                      type="checkbox"
                      checked={escopos.size === 0}
                      onChange={(e) =>
                        setEscopos(
                          e.target.checked
                            ? new Set()
                            : new Set(["pessoal", ...empresas.map((emp) => emp.chave)]),
                        )
                      }
                      data-youniverse-tudo="sim"
                      className="h-3.5 w-3.5 accent-dash-brandHi"
                    />
                    <span className="text-[12.5px] font-medium text-dash-fg">Tudo</span>
                    <span className="ml-auto font-mono text-[10px] text-dash-muted">{dados.nodes.length}</span>
                  </label>

                  <div className="my-1 h-px bg-white/[0.07]" />

                  <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-white/[0.04]">
                    <input
                      type="checkbox"
                      checked={escopos.has("pessoal")}
                      onChange={() => alternarEscopo("pessoal")}
                      data-youniverse-pessoal="sim"
                      className="h-3.5 w-3.5 accent-dash-brandHi"
                    />
                    <span className="h-2 w-2 shrink-0 rounded-full bg-dash-brandHi" />
                    <span className="text-[12px] text-dash-fg/90">Pessoal</span>
                    <span className="ml-auto font-mono text-[10px] text-dash-muted/70">
                      {dados.nodes.filter((n) => PESSOAIS.has(n.pasta)).length}
                    </span>
                  </label>

                  {empresas.map((emp) => (
                    <label key={emp.chave} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-white/[0.04]">
                      <input
                        type="checkbox"
                        checked={escopos.has(emp.chave)}
                        onChange={() => alternarEscopo(emp.chave)}
                        data-youniverse-organizacao={emp.nome}
                        className="h-3.5 w-3.5 accent-dash-brandHi"
                      />
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: emp.cor }} />
                      <span className="truncate text-[12px] text-dash-fg/90" title={emp.nome}>
                        {emp.nome}
                      </span>
                      <span className="ml-auto shrink-0 font-mono text-[10px] text-dash-muted/70">{emp.ids.size}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* CAMADAS: um drop que abre POR CIMA do céu */}
            <div className="relative">
              <button
                onClick={() => setCamadasAbertas((v) => !v)}
                data-youniverse-camadas="sim"
                title="Escolher as pastas do céu"
                className="flex w-full items-center gap-2 rounded-[11px] border border-white/[0.09] bg-black/60 px-3 py-2 text-[12.5px] text-dash-muted backdrop-blur hover:text-dash-fg"
              >
                <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
                <span className="text-dash-fg/90">Camadas</span>
                <span className="ml-auto font-mono text-[10.5px]">
                  {pastas.length - ocultas.size}/{pastas.length}
                </span>
                <ChevronDown className={"h-3.5 w-3.5 shrink-0 transition-transform " + (camadasAbertas ? "rotate-180" : "")} />
              </button>

              {camadasAbertas && (
                <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 max-h-[46vh] overflow-y-auto rounded-[11px] border border-white/[0.1] bg-[#080c14]/95 p-1.5 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.9)] backdrop-blur-xl">
                  <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-white/[0.04]">
                    <input
                      type="checkbox"
                      checked={ocultas.size === 0}
                      onChange={(e) => marcarTodas(e.target.checked)}
                      data-youniverse-ver-tudo="sim"
                      className="h-3.5 w-3.5 accent-dash-brandHi"
                    />
                    <span className="text-[12.5px] font-medium text-dash-fg">Ver tudo</span>
                    <span className="ml-auto font-mono text-[10px] text-dash-muted">{dados.nodes.length}</span>
                  </label>

                  <div className="my-1 h-px bg-white/[0.07]" />

                  {pastas.map(([p, n]) => (
                    <label key={p} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-white/[0.04]">
                      <input
                        type="checkbox"
                        checked={!ocultas.has(p)}
                        onChange={() => alternarPasta(p)}
                        data-youniverse-pasta={p}
                        className="h-3.5 w-3.5 accent-dash-brandHi"
                      />
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: `#${corDaPasta(p).getHexString()}` }} />
                      <span className="truncate text-[12px] text-dash-fg/90" title={p}>
                        {p}
                      </span>
                      <span className="ml-auto shrink-0 font-mono text-[10px] text-dash-muted/70">{n}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* AÇÕES: só ícone, com dica no hover */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setRotulos((v) => !v)}
                data-youniverse-nomes="sim"
                title={rotulos ? "Esconder os nomes" : "Mostrar os nomes"}
                className={
                  "grid h-8 w-8 place-items-center rounded-[9px] border backdrop-blur transition-colors " +
                  (rotulos
                    ? "border-white/[0.14] bg-white/[0.06] text-dash-fg"
                    : "border-white/[0.09] bg-black/60 text-dash-muted hover:text-dash-fg")
                }
              >
                {rotulos ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </button>

              <button
                onClick={enquadrar}
                data-youniverse-enquadrar="sim"
                title="Enquadrar o mapa inteiro"
                className="grid h-8 w-8 place-items-center rounded-[9px] border border-white/[0.09] bg-black/60 text-dash-muted backdrop-blur transition-colors hover:text-dash-fg"
              >
                <Focus className="h-4 w-4" />
              </button>

              <button
                onClick={() => setNebulosasLigadas((v) => !v)}
                data-youniverse-nebulosas-botao="sim"
                title={nebulosasLigadas ? "Esconder as nebulosas de fundo" : "Mostrar as nebulosas de fundo"}
                className={
                  "grid h-8 w-8 place-items-center rounded-[9px] border backdrop-blur transition-colors " +
                  (nebulosasLigadas
                    ? "border-white/[0.14] bg-white/[0.06] text-dash-fg"
                    : "border-white/[0.09] bg-black/60 text-dash-muted hover:text-dash-fg")
                }
              >
                <Sparkles className="h-4 w-4" />
              </button>
            </div>
          </div>

          {noSel && (
            <aside
              data-youniverse-painel="sim"
              className="absolute right-4 top-4 max-h-[calc(100%-2rem)] w-[340px] max-w-[calc(100%-2rem)] overflow-y-auto rounded-[12px] border border-white/[0.09] bg-black/55 p-4 backdrop-blur"
            >
              <p className="font-mono text-[10.5px] text-dash-muted">{noSel.path.replace(/\.md$/i, "")}</p>
              <h3 className="mt-1 text-[17px] font-semibold leading-tight text-dash-fg">{noSel.titulo}</h3>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-dash-muted">
                <span
                  className="rounded-full px-2 py-0.5"
                  style={{ background: `#${corDaPasta(noSel.pasta).getHexString()}26` }}
                >
                  {noSel.pasta}
                </span>
                {noSel.status && <span>{noSel.status}</span>}
                {noSel.dias != null && <span>{noSel.dias < 1 ? "de hoje" : `${Math.round(noSel.dias)} dias`}</span>}
                {(noSel.tags || []).slice(0, 3).map((t) => (
                  <span
                    key={t}
                    className="rounded border px-1.5 py-0.5"
                    style={{
                      background: `#${corDaPasta(noSel.pasta).getHexString()}26`,
                      color: `#${corDaPasta(noSel.pasta).getHexString()}`,
                      borderColor: `#${corDaPasta(noSel.pasta).getHexString()}44`,
                    }}
                  >
                    #{t}
                  </span>
                ))}
              </p>

              <button
                onClick={() => aoAbrirNota(noSel.path)}
                className="mt-3 w-full rounded-[9px] bg-dash-brand py-2 text-[12.5px] font-semibold text-white transition hover:bg-dash-brandHi"
              >
                abrir no modo pastas
              </button>

              <h4 className="mt-4 text-[10px] uppercase tracking-[0.16em] text-dash-muted">visão geral</h4>
              <p className="mt-1.5 text-[12px] leading-relaxed text-dash-muted">
                {resumo || "nota sem corpo para resumir."}
              </p>

              <h4 className="mt-4 text-[10px] uppercase tracking-[0.16em] text-dash-muted">
                ligadas a esta <span className="ml-1 normal-case tracking-normal">{ligados.length}</span>
              </h4>
              {ligados.length === 0 ? (
                <p className="mt-1.5 text-[12px] text-dash-muted">nenhum elo ainda — uma estrela solitária.</p>
              ) : (
                <ul className="mt-1.5">
                  {ligados.map((n) => (
                    <li key={n.id}>
                      <button
                        onClick={() => setSelecionado(n.id)}
                        data-youniverse-ligada={n.path}
                        className="flex w-full items-center gap-2 border-b border-white/[0.05] py-1.5 text-left hover:bg-white/[0.03]"
                      >
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: `#${corDaPasta(n.pasta).getHexString()}` }}
                        />
                        <span className="truncate text-[12.5px] text-dash-fg/90">{n.titulo}</span>
                        <span className="ml-auto shrink-0 text-[10px] text-dash-muted/70">{n.grau ?? 0} elos</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
          )}

          {!noSel && (
            <p className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-white/[0.08] bg-black/45 px-3.5 py-1.5 text-[11.5px] text-dash-muted backdrop-blur">
              cada estrela é uma nota · papel de parede colorido = a pasta onde ela nasceu
            </p>
          )}
        </>
      )}
    </div>
  );
}

/* ───────────────────────── CÉU (3D) ───────────────────────── */

function Ceu({
  dados,
  mostrarNebulosas,
  selecionado,
  aoSelecionar,
  casam,
  pastaAtiva,
  rotulos,
  caixa,
  giro,
  distancia,
}: {
  dados: Dados;
  selecionado: string | null;
  aoSelecionar: (id: string | null) => void;
  casam: Set<string> | null;
  pastaAtiva: string | null;
  rotulos: boolean;

  mostrarNebulosas: boolean;
  caixa: React.RefObject<HTMLDivElement | null>;
  // Câmera e enquadramento vêm de fora: a tela decide o zoom inicial
  // ("sempre zoom out quando abre") e o botão enquadrar mexe nos dois.
  giro: React.RefObject<{ x: number; y: number }>;
  distancia: React.RefObject<number>;
}) {
  // ⚠️ REGRA DO REACT-THREE-FIBER (a que derrubou a página em 10/11/2026):
  // `useThree` e `useFrame` SÓ existem DENTRO de <Canvas>. Aqui fora, chamá-los
  // lança "R3F: Hooks can only be used within the Canvas component!" e o React
  // derruba a tela inteira ("Application error"). Por isso este componente é só
  // a CASCA (DOM: rótulos, dica do cursor, interação) e todo o 3D mora em
  // <Cena3D>, que é renderizado DENTRO do Canvas.
  const nos = useMemo(() => dados.nodes || [], [dados]);
  const elosDados = useMemo(() => dados.links || [], [dados]);
  const [passaro, setPassaro] = useState(-1);
  const [, redesenhar] = useState(0);

  // A cena 3D escreve aqui a posição de cada estrela em % da tela. Sem câmera
  // aqui fora: quem projeta é quem tem o Canvas.
  const projecoes = useRef<{ id: string; x: number; y: number; dentro: boolean }[]>([]);
  const arrasto = useRef({ ativo: false, x: 0, y: 0, moveu: false });

  const viz = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const e of elosDados) {
      if (!m.has(e.de)) m.set(e.de, new Set());
      if (!m.has(e.para)) m.set(e.para, new Set());
      m.get(e.de)!.add(e.para);
      m.get(e.para)!.add(e.de);
    }
    return m;
  }, [elosDados]);

  const foco = useMemo(() => {
    if (selecionado) return new Set([selecionado, ...(viz.get(selecionado) || [])]);
    if (casam) return casam;
    if (pastaAtiva) return new Set(nos.filter((n) => n.pasta === pastaAtiva).map((n) => n.id));
    return null;
  }, [selecionado, casam, pastaAtiva, viz, nos]);

  // RÓTULOS POR ZOOM (pedido do dono): longe = poucos nomes, sem poluição;
    // aproximando, os nomes vão aparecendo. Não é memo de propósito — a distância
    // muda a cada quadro e isto roda junto com a projeção (~2x/s).
    const tetoRotulos = (d: number) => (d > 26 ? 8 : d > 20 ? 14 : d > 15 ? 26 : d > 11 ? 40 : 56);
    const rotulados = (() => {
      if (!rotulos) return [] as string[];
      if (foco) return nos.filter((n) => foco.has(n.id)).slice(0, 44).map((n) => n.id);
      return [...nos]
        .sort((a, b) => (viz.get(b.id)?.size || 0) - (viz.get(a.id)?.size || 0))
        .slice(0, tetoRotulos(distancia.current))
        .map((n) => n.id);
    })();

  // Clique/hover por proximidade em TELA — sem raycaster, usando o que a cena
  // reportou. O índice devolvido é a posição em `nos`.
  const maisProxima = useCallback(
    (cx: number, cy: number, raio: number) => {
      const r = caixa.current?.getBoundingClientRect();
      if (!r) return -1;
      const lista = projecoes.current;
      let melhor = -1;
      let dist = raio;
      for (let i = 0; i < lista.length; i++) {
        const p = lista[i];
        if (!p.dentro) continue;
        const px = (p.x / 100) * r.width + r.left;
        const py = (p.y / 100) * r.height + r.top;
        const d = Math.hypot(px - cx, py - cy);
        if (d < dist) {
          dist = d;
          melhor = i;
        }
      }
      return melhor;
    },
    [caixa],
  );

  const posicaoDe = (id: string) => projecoes.current.find((p) => p.id === id);

  return (
    <>
      <Canvas
        camera={{ position: [0, 0, 17], fov: 46 }}
        dpr={[1, 1.75]}
        gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
        onPointerDown={(e) => {
          arrasto.current = { ativo: true, x: e.clientX, y: e.clientY, moveu: false };
        }}
        onPointerMove={(e) => {
          const id = maisProxima(e.clientX, e.clientY, 14);
          if (id !== passaro) setPassaro(id);
          if (!arrasto.current.ativo) return;
          const dx = e.clientX - arrasto.current.x;
          const dy = e.clientY - arrasto.current.y;
          if (Math.abs(dx) + Math.abs(dy) > 3) arrasto.current.moveu = true;
          giro.current.y += dx * 0.005;
          giro.current.x = Math.max(-1.15, Math.min(1.15, giro.current.x + dy * 0.004));
          arrasto.current.x = e.clientX;
          arrasto.current.y = e.clientY;
        }}
        onPointerUp={(e) => {
          const moveu = arrasto.current.moveu;
          arrasto.current.ativo = false;
          if (moveu) return; // foi giro, não clique
          const id = maisProxima(e.clientX, e.clientY, 16);
          aoSelecionar(id >= 0 ? nos[id]?.id ?? null : null);
        }}
        onWheel={(e) => {
          distancia.current = Math.max(4.5, Math.min(42, distancia.current + e.deltaY * 0.02));
        }}
      >
        <Cena3D
          nos={nos}
          elosDados={elosDados}
          selecionado={selecionado}
          foco={foco}
          projecoes={projecoes}
          aoProjetar={() => redesenhar((v) => v + 1)}
          giro={giro}
          distancia={distancia}
          mostrarNebulosas={mostrarNebulosas}
        />
      </Canvas>

      {/* nomes: HTML projetado — nítido em qualquer zoom, zero custo no 3D */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {rotulados.map((id) => {
          const n = nos.find((x) => x.id === id);
          const p = posicaoDe(id);
          if (!n || !p || !p.dentro) return null;
          const aceso = foco ? foco.has(n.id) : true;
          return (
            <span
              key={n.id}
              className="absolute whitespace-nowrap text-[10.5px]"
              style={{
                left: `${p.x}%`,
                top: `${p.y}%`,
                transform: "translate(9px,-50%)",
                color: aceso ? "rgba(232,238,252,0.92)" : "rgba(120,132,158,0.3)",
                textShadow: "0 1px 6px rgba(0,0,0,0.95)",
              }}
            >
              {n.titulo.length > 32 ? `${n.titulo.slice(0, 31)}…` : n.titulo}
            </span>
          );
        })}
      </div>

      {passaro >= 0 && nos[passaro] && (
        <div className="pointer-events-none absolute bottom-4 right-4 max-w-[320px] rounded-[10px] border border-white/[0.08] bg-black/60 px-3 py-2 text-[11.5px] text-dash-muted backdrop-blur">
          <span className="text-dash-fg">{nos[passaro].titulo}</span>
          <br />
          {nos[passaro].pasta} · {viz.get(nos[passaro].id)?.size || 0} elo(s) ·{" "}
          {nos[passaro].dias != null ? `${Math.round(nos[passaro].dias)} dias` : "sem data"}
        </div>
      )}
    </>
  );
}

/* ─── A CENA (roda DENTRO do Canvas: aqui useThree/useFrame são legais) ─── */

function Cena3D({
  nos,
  elosDados,
  selecionado,
  foco,
  projecoes,
  aoProjetar,
  giro,
  distancia,
  mostrarNebulosas,
}: {
  nos: No[];
  elosDados: Elo[];
  selecionado: string | null;
  foco: Set<string> | null;
  projecoes: React.RefObject<{ id: string; x: number; y: number; dentro: boolean }[]>;
  aoProjetar: () => void;
  giro: React.RefObject<{ x: number; y: number }>;
  distancia: React.RefObject<number>;
  mostrarNebulosas: boolean;
}) {
  const estrelas = useRef<THREE.Points>(null);
  const grupo = useRef<THREE.Group>(null);
  const ceuFundo = useRef<THREE.Points>(null);
  const cam = useThree((s) => s.camera);
  const relogio = useRef(0);

  const maxDias = useMemo(() => Math.max(1, ...nos.map((n) => n.dias || 0)), [nos]);

  // Posições: x,y do significado; z da idade (mais nova, mais perto).
  const posicoes = useMemo(() => {
    const p = new Float32Array(nos.length * 3);
    nos.forEach((n, i) => {
      p[i * 3] = n.x * ESCALA;
      p[i * 3 + 1] = n.y * ESCALA;
      p[i * 3 + 2] = zDaIdade(n.dias, maxDias);
    });
    return p;
  }, [nos, maxDias]);

  // Tamanho da estrela = grau (quem conecta mais, brilha maior).
  const tamanhos = useMemo(() => {
    const t = new Float32Array(nos.length);
    nos.forEach((n, i) => (t[i] = 3.6 + Math.sqrt(n.grau || 0) * 2.4));
    return t;
  }, [nos]);

  const sementes = useMemo(() => {
    const s = new Float32Array(nos.length);
    nos.forEach((_, i) => (s[i] = Math.random()));
    return s;
  }, [nos]);

  const cores = useMemo(() => new Float32Array(nos.length * 3), [nos]);

  useEffect(() => {
    const branco = new THREE.Color("#ffffff");
    const apagado = new THREE.Color("#141a28");
    nos.forEach((n, i) => {
      let c = corDaPasta(n.pasta);
      if (foco) c = foco.has(n.id) ? c.clone().lerp(branco, 0.3) : apagado.clone();
      if (n.id === selecionado) c = branco.clone();
      cores[i * 3] = c.r;
      cores[i * 3 + 1] = c.g;
      cores[i * 3 + 2] = c.b;
    });
    const at = estrelas.current?.geometry?.getAttribute("aCor") as THREE.BufferAttribute | undefined;
    if (at) at.needsUpdate = true;
  }, [nos, foco, selecionado, cores]);

  const elos = useMemo(() => {
    const idx = new Map(nos.map((n, i) => [n.id, i]));
    const pares: number[] = [];
    for (const e of elosDados) {
      const a = idx.get(e.de);
      const b = idx.get(e.para);
      if (a == null || b == null) continue;
      pares.push(posicoes[a * 3], posicoes[a * 3 + 1], posicoes[a * 3 + 2]);
      pares.push(posicoes[b * 3], posicoes[b * 3 + 1], posicoes[b * 3 + 2]);
    }
    return new Float32Array(pares);
  }, [elosDados, nos, posicoes]);

  const elosAcesos = useMemo(() => {
    if (!foco) return new Float32Array(0);
    const idx = new Map(nos.map((n, i) => [n.id, i]));
    const pares: number[] = [];
    for (const e of elosDados) {
      if (!foco.has(e.de) || !foco.has(e.para)) continue;
      const a = idx.get(e.de);
      const b = idx.get(e.para);
      if (a == null || b == null) continue;
      pares.push(posicoes[a * 3], posicoes[a * 3 + 1], posicoes[a * 3 + 2]);
      pares.push(posicoes[b * 3], posicoes[b * 3 + 1], posicoes[b * 3 + 2]);
    }
    return new Float32Array(pares);
  }, [elosDados, nos, posicoes, foco]);

  // NEBULOSAS: uma por pasta, no centro onde aquelas estrelas caíram.
  const nebulosas = useMemo(() => {
    const porPasta = new Map<string, { x: number; y: number; z: number; n: number }>();
    for (const n of nos) {
      const z = zDaIdade(n.dias, maxDias);
      const a = porPasta.get(n.pasta) || { x: 0, y: 0, z: 0, n: 0 };
      a.x += n.x * ESCALA;
      a.y += n.y * ESCALA;
      a.z += z;
      a.n += 1;
      porPasta.set(n.pasta, a);
    }
    const saida: { chave: string; x: number; y: number; z: number; raio: number; cor: THREE.Color }[] = [];
    for (const [pasta, a] of porPasta) {
      if (a.n < 3) continue; // pasta pequena não faz nuvem
      const cx = a.x / a.n;
      const cy = a.y / a.n;
      const cz = a.z / a.n;
      let esp = 0;
      for (const n of nos) {
        if (n.pasta !== pasta) continue;
        esp = Math.max(esp, Math.hypot(n.x * ESCALA - cx, n.y * ESCALA - cy));
      }
      saida.push({
        chave: pasta,
        x: cx,
        y: cy,
        z: cz,
        raio: THREE.MathUtils.clamp(esp * 0.72, 1.1, 3.0), // TETO: sem bola gigante
        cor: new THREE.Color("#2b4a8f"), // azul frio FIXO: as rosas/amarelas ficavam esquisitas
      });
    }
    return saida;
  }, [nos, maxDias]);



  // Textura redonda da poeira: pointsMaterial sem mapa desenha QUADRADO — era o
  // "quadradinho voando" que o dono viu. Um gradiente radial resolve (estrelinha macia).
  const texturaPoeira = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    if (g) {
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(0.35, "rgba(255,255,255,0.8)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
    }
    return new THREE.CanvasTexture(c);
  }, []);

  const fundo = useMemo(() => {
    const n = 420;
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 30 + Math.random() * 26;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      p[i * 3] = r * Math.sin(ph) * Math.cos(th);
      p[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th) * 0.7;
      p[i * 3 + 2] = r * Math.cos(ph);
    }
    return p;
  }, []);

  useFrame(({ camera, clock }, dt) => {
    if (grupo.current) {
      grupo.current.rotation.y += (giro.current.y - grupo.current.rotation.y) * Math.min(1, dt * 6);
      grupo.current.rotation.x += (giro.current.x - grupo.current.rotation.x) * Math.min(1, dt * 6);
      grupo.current.updateMatrixWorld();
    }
    if (ceuFundo.current) ceuFundo.current.rotation.y += dt * 0.006;
    camera.position.z = THREE.MathUtils.damp(camera.position.z, distancia.current, 6, dt);
    camera.lookAt(0, 0, 0);
    const mat = estrelas.current?.material as THREE.ShaderMaterial | undefined;
    if (mat) mat.uniforms.uTempo.value = clock.elapsedTime;

    // Projeta para a tela ~10x por segundo e avisa a casca (rótulos e clique).
    relogio.current += dt;
    if (relogio.current > 0.1) {
      relogio.current = 0;
      const v = new THREE.Vector3();
      const lista: { id: string; x: number; y: number; dentro: boolean }[] = [];
      for (let i = 0; i < nos.length; i++) {
        v.set(posicoes[i * 3], posicoes[i * 3 + 1], posicoes[i * 3 + 2]);
        if (grupo.current) v.applyMatrix4(grupo.current.matrixWorld);
        v.project(cam);
        lista.push({
          id: nos[i].id,
          x: (v.x * 0.5 + 0.5) * 100,
          y: (-v.y * 0.5 + 0.5) * 100,
          dentro: v.z < 1,
        });
      }
const matEstrelas = estrelas.current?.material as THREE.ShaderMaterial | undefined;

      if (matEstrelas?.uniforms?.uBrilho) {

        matEstrelas.uniforms.uBrilho.value = THREE.MathUtils.clamp((camera.position.z - 7) / 16, 0.3, 1);

      }

      projecoes.current = lista;
      aoProjetar();
    }
  });

  return (
    <>
      <group>
        <points ref={ceuFundo}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[fundo, 3]} />
          </bufferGeometry>
          <pointsMaterial
            map={texturaPoeira}
            color="#9db4e0"
            size={0.62}
            sizeAttenuation
            transparent
            opacity={0.55}
            depthWrite={false}
          />
        </points>
      </group>

      <group ref={grupo}>
        {mostrarNebulosas &&
          nebulosas.map((nb) => <Nebulosa key={nb.chave} {...nb} />)}

        {/* LINHAS: finas, como o dono prefere (as cores fortes sao das bolinhas).
            A força mora em ELO_COR × ELO_FORCA, no topo do arquivo — calibre lá. */}
        <lineSegments>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[elos, 3]} />
          </bufferGeometry>
          <lineBasicMaterial
            color={ELO_COR}
            transparent
            opacity={ELO_FORCA}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </lineSegments>

        {elosAcesos.length > 0 && (
          <lineSegments>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[elosAcesos, 3]} />
            </bufferGeometry>
            <lineBasicMaterial
              color="#9fc4ff"
              transparent
              opacity={0.75}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </lineSegments>
        )}

        {/* AS ESTRELAS: 1 desenho, brilho e cintilação no shader */}
        <points ref={estrelas} frustumCulled={false}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[posicoes, 3]} />
            <bufferAttribute attach="attributes-aSize" args={[tamanhos, 1]} />
            <bufferAttribute attach="attributes-aTwinkle" args={[sementes, 1]} />
            <bufferAttribute attach="attributes-aCor" args={[cores, 3]} />
          </bufferGeometry>
          <shaderMaterial
            vertexShader={VERT}
            fragmentShader={FRAG}
            uniforms={{ uTempo: { value: 0 }, uEscala: { value: 1 } }}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </points>
      </group>
    </>
  );
}

/* ───────────────────────── NEBULOSA ───────────────────────── */

/** Uma nebulosa: nuvem de gradiente virada para a câmera (billboard barato). */
function Nebulosa({ x, y, z, raio, cor }: { x: number; y: number; z: number; raio: number; cor: THREE.Color }) {
  const malha = useRef<THREE.Mesh>(null);
  const lado = raio * 2.6;
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: NEB_VERT,
        fragmentShader: NEB_FRAG,
        uniforms: {
          uCor: { value: cor.clone() },
          uForca: { value: 0.14 },
          uSemente: { value: Math.random() * 10 },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [cor],
  );
  const geometria = useMemo(() => new THREE.PlaneGeometry(lado, lado * 0.82), [lado]);
  useFrame(({ camera }) => {
    if (malha.current) malha.current.quaternion.copy(camera.quaternion);

    // Zoom aproximado = brilho contido: era isto que deixava a tela \"estourada\"

    // quando o dono chegava perto (halos aditivos somando ate virar mancha branca).

    material.uniforms.uForca.value = 0.14 * THREE.MathUtils.clamp((camera.position.z - 7) / 16, 0.3, 1);
  });
  return <mesh ref={malha} position={[x, y, z]} material={material} geometry={geometria} />;
}
