/**
 * APRENDIZADO — a conversa vira NOTA no acervo (o entendimento, não o log).
 *
 * POR QUE EXISTE (dono, 27/11/2026): a conversa é onde as coisas são decididas,
 * e até aqui ela morria no histórico do chat. O acervo é a memória do produto;
 * o que ficou combinado numa conversa tem de chegar lá — sem arrastar o arquivo
 * pesado junto.
 *
 * Três regras que este módulo não negocia:
 *
 *  1. UMA NOTA POR CONVERSA. Reprocessar a mesma conversa não pode duplicar
 *     (o gatilho automático dispara em troca de conversa, em sair da tela e em
 *     ociosidade — três portas para o mesmo evento). O carimbo vive no
 *     `data/auth.db` (`notas_aprendizado`, chave `user_id + conversa_id`).
 *
 *  2. O BINÁRIO NÃO ENTRA NA NOTA. De áudio entra a transcrição resumida; de
 *     imagem, a descrição do que ela mostra. O arquivo segue no trilho de mídia
 *     (`/api/arquivo/<id>`) e a nota carrega o MARCADOR do cartão —
 *     `[[arquivo:midia:<id>|<nome>]]` — nunca caminho de disco.
 *
 *  3. A DESTILAÇÃO PASSA PELO GATEWAY DA CONTA (`gatewayDaConta`), o MESMO
 *     caminho do chat: o consumo é abatido da cota de quem conversou. Se o
 *     modelo não responder, a nota é gravada mesmo assim com um resumo simples
 *     montado do próprio texto — ninguém fica sem nota por causa de um erro de
 *     modelo.
 *
 * Escopo: a nota vive no espaço de QUEM CONVERSOU. Em "Tudo" (que é leitura de
 * pessoal + organizações) a escrita cai no espaço PESSOAL — "Tudo" não é um
 * lugar onde se grava. Escopo de organização usa a credencial DAQUELA
 * organização (`credencialDoEscopo`), nunca a credencial pessoal de alguém.
 */
import { createHash } from "node:crypto";
import path from "node:path";

import Database from "better-sqlite3";

import {
  ARCA_URL,
  guardarArcaDaConta,
  pedirTokenNaArca,
  tokenArcaDaConta,
} from "./arca-conta";
import { credencialDoEscopo } from "./credencial-do-escopo";
import { gatewayDaConta, MODELO_DA_CONTA } from "./gateway-da-conta";
import { tetoEstouradoDaConta } from "./limite-de-tokens";
import type { Conta } from "./orgs";
import { escopoPessoal, type Escopo } from "./escopos";
import { cifrar } from "./segredo-guardado";
import { garantirExtracao, obterUpload } from "./uploads";

const DB_PATH = path.join(process.cwd(), "data", "auth.db");
const API_ARCA = (process.env.ARCA_API_URL || ARCA_URL).replace(/\/+$/, "");

/** Teto de caracteres da conversa que vai para o modelo (contexto, não arquivo). */
const TETO_TRANSCRICAO = 26000;
const TETO_MENSAGEM = 6000;
/** A pasta onde a nota de conversa mora, quando o acervo não tem uma melhor. */
const PASTA_PADRAO = "06_APRENDIZADOS";
const SUBPASTA = "conversas";

export type PapelAprendizado = "user" | "assistant";

export type MensagemAprendizado = {
  role: PapelAprendizado;
  content: string;
  anexos?: { id: string }[];
};

export type ModoAprendizado = "agora" | "fim";

/* ══════════════════════════════════════════════════════════════════════════
 * 1) CARIMBO — uma nota por conversa (idempotência)
 * ══════════════════════════════════════════════════════════════════════════ */

type RegistroAprendizado = {
  user_id: number;
  conversa_id: string;
  caminho: string;
  escopo_id: string;
  hash: string;
  modo: string;
  criado_em: string;
};

function getDb() {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS notas_aprendizado (
      user_id     INTEGER NOT NULL,
      conversa_id TEXT NOT NULL,
      caminho     TEXT NOT NULL,
      escopo_id   TEXT NOT NULL DEFAULT '',
      hash        TEXT NOT NULL DEFAULT '',
      modo        TEXT NOT NULL DEFAULT '',
      criado_em   TEXT NOT NULL,
      PRIMARY KEY (user_id, conversa_id)
    )
  `);
  return db;
}

/** O carimbo da conversa, se a nota já foi gerada. */
export function registroDeAprendizado(userId: number, conversaId: string): RegistroAprendizado | null {
  try {
    const db = getDb();
    const linha = db
      .prepare("SELECT * FROM notas_aprendizado WHERE user_id = ? AND conversa_id = ?")
      .get(userId, conversaId) as RegistroAprendizado | undefined;
    db.close();
    return linha || null;
  } catch {
    return null;
  }
}

function gravarRegistro(r: RegistroAprendizado): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO notas_aprendizado (user_id, conversa_id, caminho, escopo_id, hash, modo, criado_em)
     VALUES (@user_id, @conversa_id, @caminho, @escopo_id, @hash, @modo, @criado_em)
     ON CONFLICT(user_id, conversa_id) DO UPDATE SET
       caminho = excluded.caminho, escopo_id = excluded.escopo_id,
       hash = excluded.hash, modo = excluded.modo`,
  ).run(r);
  db.close();
}

/* ══════════════════════════════════════════════════════════════════════════
 * 2) ENTRADA — o que o cliente manda é NÃO CONFIÁVEL
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Normaliza as mensagens recebidas do navegador.
 *
 * O corpo vem do cliente (ou de uma requisição forjada), então aqui só passa o
 * que tem forma de mensagem: papel conhecido, texto limitado e ids de anexo que
 * EXISTEM na conta de quem pediu (a posse é conferida na leitura, em `obterUpload`).
 */
export function normalizarMensagens(bruto: unknown): MensagemAprendizado[] {
  if (!Array.isArray(bruto)) return [];
  const saida: MensagemAprendizado[] = [];
  for (const item of bruto.slice(-80)) {
    const m = item as Record<string, unknown>;
    const role = m?.role === "assistant" ? "assistant" : m?.role === "user" ? "user" : null;
    if (!role) continue;
    const content = typeof m?.content === "string" ? m.content.slice(0, TETO_MENSAGEM) : "";
    const anexos = Array.isArray(m?.anexos)
      ? (m.anexos as unknown[])
          .map((a) => (typeof a === "string" ? a : (a as { id?: unknown })?.id))
          .filter((id): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id))
          .map((id) => ({ id }))
      : [];
    if (!content.trim() && !anexos.length) continue;
    saida.push({ role, content, ...(anexos.length ? { anexos } : {}) });
  }
  return saida;
}

/** Impressão do conteúdo: mesma conversa reenviada = mesmo hash = nada de novo. */
export function hashDaConversa(mensagens: MensagemAprendizado[]): string {
  const texto = mensagens.map((m) => `${m.role}:${m.content}`).join("\n");
  return createHash("sha256").update(texto).digest("hex").slice(0, 32);
}

/* ══════════════════════════════════════════════════════════════════════════
 * 3) ANEXOS — a referência entra; o binário fica no trilho de mídia
 * ══════════════════════════════════════════════════════════════════════════ */

type AnexoDaNota = {
  id: string;
  nome: string;
  categoria: string;
  /** Texto extraído (transcrição do áudio, OCR do documento, nada na imagem). */
  texto: string;
  /** O marcador que vira cartão na conversa e no acervo. */
  marcador: string;
};

async function anexosDaConversa(
  mensagens: MensagemAprendizado[],
  userId: number,
): Promise<AnexoDaNota[]> {
  const vistos = new Set<string>();
  const saida: AnexoDaNota[] = [];
  for (const m of mensagens) {
    for (const a of m.anexos || []) {
      if (vistos.has(a.id)) continue;
      vistos.add(a.id);
      const reg = obterUpload(a.id, userId);
      if (!reg) continue; // não é desta conta: fica de fora, sem aviso de posse
      let texto = reg.texto_extraido || "";
      if (!reg.extraido_em) {
        try {
          texto = (await garantirExtracao(reg)).texto || "";
        } catch {
          texto = "";
        }
      }
      const nome = reg.nome_original || "arquivo";
      saida.push({
        id: reg.id,
        nome,
        categoria: reg.categoria,
        texto: texto.slice(0, 4000),
        marcador: `[[arquivo:midia:${reg.id}|${nome}]]`,
      });
    }
  }
  return saida;
}

/* ══════════════════════════════════════════════════════════════════════════
 * 4) A DESTILAÇÃO — o entendimento, pelo gateway da conta
 * ══════════════════════════════════════════════════════════════════════════ */

const SISTEMA = `Você é o arquivista da Mirai. Recebe a transcrição de uma conversa entre uma pessoa e a Mirai e devolve UMA nota de aprendizado, curta, em markdown, em português do Brasil.

Formato exato — nada antes, nada depois:
TITULO: <3 a 7 palavras, minúsculas, sem acento e sem pontuação, resumindo o assunto>
## O que foi tratado
- ...
## O que ficou decidido
- ... (ou "- nada ficou decidido")
## O que ficou pendente
- ... (ou "- nada ficou pendente")
## Anexos
- <marcador exato do anexo> — <uma frase: o que o áudio diz, ou o que a imagem mostra>

Regras:
- É o ENTENDIMENTO, não o log: não repita a conversa linha a linha, nem "o usuário perguntou X e a Mirai respondeu Y".
- No máximo 6 itens por seção; frase curta.
- Em "Anexos", copie o marcador EXATAMENTE como foi entregue, sem alterar id nem nome. Se não houver anexo, escreva "- nenhum".
- NUNCA escreva caminho de disco, nome de arquivo binário, base64 ou id de upload fora do marcador.
- Se não houver decisão nem pendência, diga isso honestamente em vez de inventar.`;

type Destilacao = {
  titulo: string;
  secoes: string;
  origem: "ia" | "resumo";
  aviso?: string;
};

/** Tira acento, pontuação e espaço — é o que vira nome de arquivo.
 *  O corte é SEMPRE em fim de palavra: nome de arquivo cortado no meio
 *  ("...do-crm-praz") parece defeito, e a Arca corta o slug no limite do
 *  caminho sem dó nenhuma. */
export function resumoDoTitulo(texto: string, limite = 60): string {
  const palavras = (texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  const escolhidas: string[] = [];
  for (const p of palavras) {
    const tentativa = [...escolhidas, p].join(" ");
    if (tentativa.length > limite) break;
    escolhidas.push(p);
    if (escolhidas.length >= 8) break;
  }
  // Palavra de ligação no fim ("...funil de crm E") é sobra do corte: sai.
  const LIGACAO = new Set(["e", "de", "do", "da", "dos", "das", "com", "que", "o", "a", "os", "as", "em", "no", "na", "para", "por", "sobre"]);
  while (escolhidas.length > 1 && LIGACAO.has(escolhidas[escolhidas.length - 1])) escolhidas.pop();
  return escolhidas.join(" ");
}

function corpoDaConversa(mensagens: MensagemAprendizado[], anexos: AnexoDaNota[]): string {
  const linhas: string[] = [];
  let total = 0;
  for (const m of mensagens) {
    const quem = m.role === "user" ? "PESSOA" : "MIRAI";
    const pedaco = `[${quem}] ${m.content}`.slice(0, TETO_MENSAGEM);
    if (total + pedaco.length > TETO_TRANSCRICAO) {
      linhas.push("[... conversa cortada por tamanho ...]");
      break;
    }
    linhas.push(pedaco);
    total += pedaco.length;
  }
  if (anexos.length) {
    linhas.push("", "ANEXOS (só o texto extraído; o binário NÃO entra na nota):");
    for (const a of anexos) {
      const rotulo = a.categoria === "audio" ? "áudio (transcrição)" : a.categoria === "imagem" ? "imagem (sem leitura automática de conteúdo)" : `${a.categoria} (texto extraído)`;
      linhas.push(`- marcador: ${a.marcador} · ${rotulo}`);
      if (a.texto.trim()) linhas.push(`  conteúdo: ${a.texto.slice(0, 2500)}`);
    }
  }
  return linhas.join("\n");
}

/** Resumo de emergência: monta das próprias mensagens, sem modelo nenhum. */
function resumoSimples(mensagens: MensagemAprendizado[], aviso: string): Destilacao {
  const daPessoa = mensagens.filter((m) => m.role === "user" && m.content.trim());
  const primeiras = daPessoa.slice(0, 4).map((m) => `- ${m.content.replace(/\s+/g, " ").slice(0, 220)}`);
  const titulo = resumoDoTitulo(daPessoa[0]?.content || "conversa sem título") || "conversa";
  return {
    titulo,
    origem: "resumo",
    aviso,
    secoes: [
      "## O que foi tratado",
      ...(primeiras.length ? primeiras : ["- conversa sem texto do lado da pessoa"]),
      "",
      "## O que ficou decidido",
      "- não extraído (a destilação por IA não rodou)",
      "",
      "## O que ficou pendente",
      "- não extraído (a destilação por IA não rodou)",
    ].join("\n"),
  };
}

async function destilar(
  conta: Conta,
  mensagens: MensagemAprendizado[],
  anexos: AnexoDaNota[],
): Promise<Destilacao> {
  const gw = gatewayDaConta(conta.id);
  if (!gw) {
    return resumoSimples(mensagens, "a conta não tem vínculo com a inteligência da casa");
  }
  /* ── TETO DE TOKENS (27/11/2026) ───────────────────────────────────────────
     A destilação da nota roda SOZINHA (troca de conversa, sair da tela,
     ociosidade): é o único caminho deste app que chama modelo sem a pessoa
     pedir. Com a franquia do mês estourada, ele tem de PARAR aqui — uma
     tentativa por evento, que o gateway recusaria, só encheria o log e a espera.
     A nota continua sendo gravada, montada localmente: o aprendizado não perde
     nada, só perde a redação do modelo. O dono nunca é barrado. */
  if (!conta.ehDono) {
    const estouro = await tetoEstouradoDaConta(conta.id);
    if (estouro) {
      console.warn(
        `[aprendizado] conta ${conta.id}: tokens do mês esgotados (${estouro.usado}/${estouro.teto}) — nota gravada SEM modelo`,
      );
      return resumoSimples(
        mensagens,
        "os tokens de IA do plano deste mês acabaram — a nota foi montada sem modelo",
      );
    }
  }
  try {
    const chamada = gw.chamar({
      model: MODELO_DA_CONTA,
      messages: [
        { role: "system", content: SISTEMA },
        { role: "user", content: corpoDaConversa(mensagens, anexos) },
      ],
      max_tokens: 1200,
      temperature: 0.3,
      stream: false,
    });
    // O gateway não aceita `signal` no contrato: o teto é por corrida.
    const r = await Promise.race([
      chamada,
      new Promise<null>((ok) => setTimeout(() => ok(null), 45000)),
    ]);
    if (!r) return resumoSimples(mensagens, "a destilação passou do tempo");
    if (!r.ok) {
      if (r.status === 402) {
        console.warn("[aprendizado] gateway recusou por teto de tokens — nota gravada SEM modelo");
        return resumoSimples(
          mensagens,
          "os tokens de IA do plano deste mês acabaram — a nota foi montada sem modelo",
        );
      }
      return resumoSimples(mensagens, `o gateway da conta respondeu HTTP ${r.status}`);
    }

    const d = (await r.json().catch(() => null)) as {
      choices?: { message?: { content?: string } }[];
    } | null;
    const texto = (d?.choices?.[0]?.message?.content || "").trim();
    if (!texto) return resumoSimples(mensagens, "o modelo devolveu vazio");

    const linhas = texto.replace(/\r\n/g, "\n").split("\n");
    let titulo = "";
    const corpo: string[] = [];
    for (const l of linhas) {
      const t = /^T[ÍI]TULO:\s*(.+)$/i.exec(l.trim());
      if (t && !titulo) {
        titulo = t[1].trim();
        continue;
      }
      // Um "# título" solto do modelo não vira título de novo: o título é NOSSO
      // (data + resumo) e a nota já abre com ele.
      if (/^#\s+/.test(l) && corpo.length === 0) continue;
      corpo.push(l);
    }
    const secoes = corpo.join("\n").trim();
    if (!secoes || !/##\s*O que foi tratado/i.test(secoes)) {
      return resumoSimples(mensagens, "o modelo devolveu fora do formato");
    }
    const primeiraDaPessoa = mensagens.find((m) => m.role === "user" && m.content.trim())?.content || "";
    return { titulo: resumoDoTitulo(titulo || primeiraDaPessoa) || "conversa", secoes, origem: "ia" };
  } catch (e) {
    const motivo = e instanceof Error ? e.message.slice(0, 80) : "erro";
    return resumoSimples(mensagens, `a destilação falhou (${motivo})`);
  }
}

/* ══════════════════════════════════════════════════════════════════════════
 * 5) A NOTA — data no nome, entendimento no corpo, marcador nas referências
 * ══════════════════════════════════════════════════════════════════════════ */

function dataDeHoje(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Descarta marcadores com id de anexo que não é desta conversa (modelo inventou). */
function limparMarcadores(secoes: string, anexos: AnexoDaNota[]): string {
  const ids = new Set(anexos.map((a) => a.id.toLowerCase()));
  return secoes.replace(/\[\[arquivo:midia:([^\]]+)\]\]/gi, (todo, dentro: string) => {
    const id = dentro.split("|")[0].trim().toLowerCase();
    return ids.has(id) ? todo : "";
  });
}

function montarCorpo({
  tituloComData,
  conta,
  escopo,
  mensagens,
  anexos,
  destilacao,
  modo,
  conversaId,
}: {
  tituloComData: string;
  conta: Conta;
  escopo: Escopo;
  mensagens: MensagemAprendizado[];
  anexos: AnexoDaNota[];
  destilacao: Destilacao;
  modo: ModoAprendizado;
  conversaId: string;
}): string {
  const hoje = dataDeHoje();
  const linhas: string[] = [`# ${tituloComData}`, ""];
  linhas.push(`- **Data:** ${hoje}`);
  linhas.push(`- **Com quem:** ${conta.nome || conta.email} (${conta.email})`);
  linhas.push(`- **Espaço:** ${escopo.nome}`);
  linhas.push(`- **Conversa:** \`${conversaId.slice(0, 60)}\``);
  linhas.push(`- **Guardada:** ${modo === "agora" ? "a pedido, no meio da conversa" : "ao fim da conversa"}`);
  if (destilacao.origem === "resumo") {
    linhas.push(`- **Destilação:** não rodou — ${destilacao.aviso || "motivo não informado"}. Abaixo, resumo montado do texto da conversa.`);
  }
  linhas.push("");

  const secoesLimpas = limparMarcadores(destilacao.secoes, anexos).trim();
  // Respiro antes de cada título de seção: o modelo às vezes entrega
  // "- item" e "## Seção" colados, e aí a seção vira continuação da lista em
  // qualquer renderizador de markdown.
  const secoesComRespiro = secoesLimpas.replace(/\n(#{2,4}\s)/g, "\n\n$1").replace(/\n{3,}/g, "\n\n");
  // O modelo pode ter esquecido um anexo: a referência é OBRIGATÓRIA (sem ela o
  // cartão não existe e o arquivo some da história). Completa no fim.
  const faltando = anexos.filter((a) => !secoesComRespiro.includes(a.marcador));

  // Se a destilação não trouxe seção de anexos, cria uma.
  const temSecaoAnexos = /##\s*Anexos/i.test(secoesComRespiro);
  linhas.push(secoesComRespiro);
  linhas.push("");
  if (anexos.length && (!temSecaoAnexos || faltando.length)) {
    if (!temSecaoAnexos) linhas.push("## Anexos");
    for (const a of faltando) {
      const oQue = a.categoria === "audio"
        ? "áudio — a transcrição está resumida acima"
        : a.categoria === "imagem"
          ? "imagem — o arquivo continua no acervo, preso a esta nota"
          : `${a.categoria} — o conteúdo está resumido acima`;
      linhas.push(`- ${a.marcador} — ${oQue}`);
    }
    linhas.push("");
  }
  // Nada de quantidade de mensagens no corpo: a nota é o entendimento, não o log.
  if (!mensagens.length) linhas.push("_(conversa sem mensagens no momento da gravação)_");
  return linhas.join("\n").trim() + "\n";
}

/* ══════════════════════════════════════════════════════════════════════════
 * 6) O ACERVO — onde a nota vive e com qual credencial
 * ══════════════════════════════════════════════════════════════════════════ */

export type EscritaNoAcervo =
  | {
      ok: true;
      caminho: string;
      pasta: string;
      subpasta: string;
      /** A Arca recusou a pasta pedida e o classificador escolheu outra. */
      canonAjustado: string;
    }
  | { ok: false; erro: string; status: number };

async function tokenDoEspaco(conta: Conta, escopo: Escopo): Promise<string | null> {
  if (escopo.tipo === "organizacao") return credencialDoEscopo(escopo, conta);
  // Pessoal: o token da PRÓPRIA conta; se ainda não está no cofre, pede à Arca
  // (idempotente) e guarda cifrado — o mesmo caminho do resto do app.
  const guardado = await tokenArcaDaConta(conta.id);
  if (guardado) return guardado;
  const r = await pedirTokenNaArca(conta.email);
  if (!r.ok) return null;
  try {
    guardarArcaDaConta(conta.id, {
      tokenCifrado: cifrar(r.token),
      org: r.org,
      usuario: r.usuario,
      criadoEm: r.criadoEm,
    });
  } catch {
    /* cache do cofre é melhor-esforço */
  }
  return r.token;
}

type NoArvore = { path?: string; nome?: string; subpastas?: NoArvore[] };

/** A pasta de aprendizado que JÁ existe neste acervo (senão, a canônica). */
function acharPastaDeAprendizado(arvore: NoArvore | undefined): { pasta: string; subpasta: string } {
  const raizes = arvore?.subpastas || [];
  const achada =
    raizes.find((n) => /aprendiz/i.test(n.path || "")) ||
    raizes.find((n) => /aprendiz/i.test(n.nome || ""));
  if (!achada?.path) return { pasta: PASTA_PADRAO, subpasta: SUBPASTA };
  const sub = (achada.subpastas || []).find((n) => /conversa/i.test(n.path || "") || /conversa/i.test(n.nome || ""));
  return { pasta: achada.path, subpasta: sub?.path?.split("/").pop() || SUBPASTA };
}

export async function escreverNoAcervo({
  conta,
  escopo,
  titulo,
  corpo,
  conversaId,
  modo,
}: {
  conta: Conta;
  escopo: Escopo;
  titulo: string;
  corpo: string;
  conversaId: string;
  modo: ModoAprendizado;
}): Promise<EscritaNoAcervo> {
  const token = await tokenDoEspaco(conta, escopo);
  if (!token) {
    return {
      ok: false,
      status: 503,
      erro:
        escopo.tipo === "organizacao"
          ? `não consegui abrir o acervo de ${escopo.nome} agora — a credencial da organização não está disponível.`
          : "seu acervo não está conectado neste ambiente agora — não consegui a credencial da Arca.",
    };
  }

  // Onde a nota vive: a árvore manda. Sem árvore, a pasta canônica de aprendizado.
  let pasta = PASTA_PADRAO;
  let subpasta = SUBPASTA;
  try {
    const r = await fetch(`${API_ARCA}/acervo/arvore?com_notas=false`, {
      headers: { "X-Arca-Token": token, "user-agent": "MIRAI-OS/1.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (r.ok) {
      const d = (await r.json()) as { arvore?: NoArvore };
      const escolha = acharPastaDeAprendizado(d.arvore);
      pasta = escolha.pasta;
      subpasta = escolha.subpasta;
    }
  } catch {
    /* sem árvore: tenta a pasta canônica */
  }

  // A subpasta ganha nome e cor no céu (best-effort; a nota cria o diretório de
  // qualquer forma). Não é motivo para falhar a gravação.
  try {
    await fetch(`${API_ARCA}/acervo/pasta`, {
      method: "POST",
      headers: { "X-Arca-Token": token, "content-type": "application/json", "user-agent": "MIRAI-OS/1.0" },
      body: JSON.stringify({
        caminho: `${pasta}/${subpasta}`,
        nome: "Conversas",
        keywords: ["conversa", "aprendizado", "chat"],
      }),
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    /* segue */
  }

  try {
    const r = await fetch(`${API_ARCA}/acervo/nota`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Arca-Token": token,
        "user-agent": "MIRAI-OS/1.0",
      },
      body: JSON.stringify({
        titulo,
        conteudo: corpo,
        pasta,
        subpasta,
        keywords: ["conversa", "aprendizado", "chat"],
        tags: ["aprendizado", "conversa"],
        campos: {
          origem: "aprendizado",
          conversa: conversaId.slice(0, 60),
          modo,
        },
      }),
      signal: AbortSignal.timeout(25000),
    });
    const d = (await r.json().catch(() => ({}))) as {
      nota?: string;
      pasta?: string;
      subpasta?: string;
      canon_recusado?: string;
      detail?: unknown;
    };
    if (!r.ok || !d.nota) {
      const det = typeof d.detail === "string" ? d.detail : "";
      return { ok: false, status: r.status || 502, erro: det || `a Arca respondeu HTTP ${r.status}` };
    }
    return {
      ok: true,
      caminho: d.nota,
      pasta: d.pasta || pasta,
      subpasta: d.subpasta || subpasta,
      canonAjustado: d.canon_recusado || "",
    };
  } catch (e) {
    return { ok: false, status: 502, erro: e instanceof Error ? e.message.slice(0, 160) : "falha de rede" };
  }
}

/* ══════════════════════════════════════════════════════════════════════════
 * 7) O FLUXO INTEIRO — usado pela rota, com trava contra duas gravações
 * ══════════════════════════════════════════════════════════════════════════ */

const emVoo = new Map<string, Promise<ResultadoAprendizado>>();

export type ResultadoAprendizado =
  | {
      ok: true;
      /** Já existia nota desta conversa: nada foi criado agora. */
      ja_existia: boolean;
      /** Nada de novo (mesmo conteúdo) ou sem conteúdo para guardar. */
      ignorado?: string;
      caminho?: string;
      pasta?: string;
      subpasta?: string;
      destilacao?: "ia" | "resumo";
      aviso?: string;
    }
  | { ok: false; status: number; erro: string };

export function escopoDaEscrita(conta: Conta, pedido: Escopo): Escopo {
  // "Tudo" é leitura de pessoal + organizações, não um lugar: escreve no pessoal.
  return pedido.tipo === "tudo" ? escopoPessoal(conta) : pedido;
}

export async function gerarNotaDeAprendizado({
  conta,
  escopo,
  conversaId,
  modo,
  mensagens,
}: {
  conta: Conta;
  escopo: Escopo;
  conversaId: string;
  modo: ModoAprendizado;
  mensagens: MensagemAprendizado[];
}): Promise<ResultadoAprendizado> {
  const alvo = escopoDaEscrita(conta, escopo);
  const chave = `${conta.id}:${conversaId}`;

  const rodando = emVoo.get(chave);
  if (rodando) return rodando;

  const tarefa = (async (): Promise<ResultadoAprendizado> => {
    // O carimbo é conferido DEPOIS da trava: duas requisições simultâneas não
    // passam as duas pelo mesmo "não existe".
    const anterior = registroDeAprendizado(conta.id, conversaId);
    if (anterior) {
      return {
        ok: true,
        ja_existia: true,
        caminho: anterior.caminho,
        ignorado: "esta conversa já tem nota no acervo",
      };
    }
    if (!mensagens.length) return { ok: true, ja_existia: false, ignorado: "conversa sem conteúdo" };

    const anexos = await anexosDaConversa(mensagens, conta.id);
    const destilacao = await destilar(conta, mensagens, anexos);

    const hoje = dataDeHoje();
    // NOME DO ARQUIVO: `AAAA-MM-DD-conversa-sobre-<resumo>.md`. A Arca corta o
    // slug no limite do caminho (`06_APRENDIZADOS/conversas` → 45 caracteres) e
    // corta no MEIO da palavra. Então o resumo já nasce no tamanho que cabe.
    const prefixoSlug = `${hoje}-conversa-sobre`;
    const orcamento = Math.max(12, 45 - prefixoSlug.length - 1);
    const resumo = resumoDoTitulo(destilacao.titulo || "conversa", orcamento) || "conversa";
    const tituloComData = `${hoje} conversa sobre ${resumo}`;
    const corpo = montarCorpo({
      tituloComData,
      conta,
      escopo: alvo,
      mensagens,
      anexos,
      destilacao,
      modo,
      conversaId,
    });

    const escrita = await escreverNoAcervo({
      conta,
      escopo: alvo,
      titulo: tituloComData,
      corpo,
      conversaId,
      modo,
    });
    if (!escrita.ok) return { ok: false, status: escrita.status, erro: escrita.erro };

    try {
      gravarRegistro({
        user_id: conta.id,
        conversa_id: conversaId,
        caminho: escrita.caminho,
        escopo_id: alvo.id,
        hash: hashDaConversa(mensagens),
        modo,
        criado_em: new Date().toISOString(),
      });
    } catch {
      /* sem carimbo a nota existe e a próxima chamada tenta de novo (duplicaria);
         é melhor gravar a nota do que devolver erro com a nota já no acervo. */
    }

    return {
      ok: true,
      ja_existia: false,
      caminho: escrita.caminho,
      pasta: escrita.pasta,
      subpasta: escrita.subpasta,
      destilacao: destilacao.origem,
      ...(destilacao.origem === "resumo" ? { aviso: destilacao.aviso || "" } : {}),
    };
  })();

  emVoo.set(chave, tarefa);
  try {
    return await tarefa;
  } finally {
    emVoo.delete(chave);
  }
}
