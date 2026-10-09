// Servidor: guardar anexos do chat, conferir teto (30 MB/arquivo e 3 GB/usuário)
// e EXTRAIR o conteúdo para o modelo. Só roda no servidor (fs/db/child_process).
import { createHash, randomUUID } from "crypto";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { promisify } from "util";
import Database from "better-sqlite3";

import {
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_ROTULO,
  LISTA_ACEITOS,
  MIMES_PERMITIDOS,
  categoriaDeMime,
  ehMimePermitido,
  extensaoDe,
  type CategoriaAnexo,
} from "./upload-tipos";
import { transcreverAudio } from "./stt-providers";

const execFileAsync = promisify(execFile);

// ─── Teto do espaço do usuário ─────────────────────────────────────
export const LIMITE_WORKSPACE_BYTES = 3 * 1024 * 1024 * 1024; // 3 GB

// ─── Chaves (mesmo padrão do resto do app) ─────────────────────────
function loadEnv(name: string): string {
  try {
    const envFile = "/opt/data/.env";
    if (fs.existsSync(envFile)) {
      const content = fs.readFileSync(envFile, "utf8");
      for (const line of content.split("\n")) {
        const m1 = line.match(new RegExp(`export\\s+${name}=["']([^"']+)["']`));
        if (m1) return m1[1];
        const m2 = line.match(new RegExp(`${name}=["']([^"']+)["']`));
        if (m2) return m2[1];
        const m3 = line.match(new RegExp(`${name}=([^\\s#]+)`));
        if (m3) return m3[1];
      }
    }
  } catch {}
  return process.env[name] || "";
}
const OPENROUTER_KEY = loadEnv("OPENROUTER_API_KEY");

// ─── Transporte de VISÃO (imagem/PDF → texto) ──────────────────────────────
// 09/10/2026, dono: "o GLM entende imagem? então nem precisamos do OpenRouter pra olhar
// imagem né?" — resposta medida: SIM, e melhor. A chave do OpenRouter NÃO está configurada
// neste app (a leitura caía em "sem chave de visão configurada"), enquanto o Verboo é a MESMA
// chave que o resto do app já usa. Medido: `glm-5.3-flash` leu uma imagem de 44 KB em 8s
// (descrição + OCR fiel) e um PDF em 4s. O OpenRouter fica só como RESERVA, e só se houver chave.
const VERBOO_KEY = process.env.VERBOO_API_KEY || loadEnv("VERBOO_API_KEY");
const VERBOO_BASE = "https://code.verboo.ai/router/v1";
const MODELO_VISAO = "glm-5.3-flash"; // Verboo (principal)
const MODELO_LEITURA = "google/gemini-2.5-flash"; // OpenRouter (reserva)
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

/**
 * Visão do app: manda as partes (texto + imagem/arquivo) para quem ENXERGA e devolve o texto.
 * Principal = Verboo (`glm-5.3-flash`); se falhar e houver chave, tenta o OpenRouter. O `motor`
 * que volta é o que de verdade leu — é ele que aparece na tela, então nada de fingir.
 */
async function chamarVisao(partes: unknown[], maxTok = 2048): Promise<{ texto: string; motor: string }> {
  const tentativas: { motor: string; base: string; key: string; model: string }[] = [];
  if (VERBOO_KEY) tentativas.push({ motor: `vision:${MODELO_VISAO}`, base: VERBOO_BASE, key: VERBOO_KEY, model: MODELO_VISAO });
  if (OPENROUTER_KEY)
    tentativas.push({ motor: `vision:${MODELO_LEITURA}`, base: OPENROUTER_BASE, key: OPENROUTER_KEY, model: MODELO_LEITURA });
  if (!tentativas.length) throw new Error("leitura de documento indisponível (sem chave de visão configurada)");

  let ultimoErro: Error | null = null;
  for (const t of tentativas) {
    try {
      const resp = await fetch(`${t.base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t.key}` },
        body: JSON.stringify({
          model: t.model,
          max_tokens: maxTok,
          temperature: 0.1,
          stream: false,
          ...(t.base === VERBOO_BASE ? { reasoning_effort: "low" } : {}),
          messages: [{ role: "user", content: partes }],
        }),
        signal: AbortSignal.timeout(90000),
      });
      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        ultimoErro = new Error(`leitura falhou (${resp.status}) ${txt.slice(0, 160)}`);
        console.error("Visão:", t.motor, resp.status, txt.slice(0, 160));
        continue;
      }
      const j = await resp.json();
      const texto = (j?.choices?.[0]?.message?.content || "").toString().trim();
      if (!texto) {
        ultimoErro = new Error("leitura voltou vazia");
        console.error("Visão: leitura vazia em", t.motor);
        continue;
      }
      return { texto, motor: t.motor };
    } catch (e) {
      ultimoErro = e instanceof Error ? e : new Error(String(e));
      console.error("Visão rede:", t.motor, ultimoErro.message);
    }
  }
  throw ultimoErro || new Error("leitura falhou");
}

// ─── Caminhos ──────────────────────────────────────────────────────
const RAIZ = path.join(process.cwd(), "data", "uploads");
const TMP = path.join(RAIZ, ".tmp");

export function raizUploads(): string {
  return RAIZ;
}

/** Pasta do usuário: data/uploads/<userId>/<orgId|_sem_org>/ (base para o teto de 3 GB). */
export function pastaDoUsuario(userId: number): string {
  return path.join(RAIZ, String(userId));
}

export function pastaDaConta(userId: number, orgId: string | null): string {
  return path.join(pastaDoUsuario(userId), orgId || "_sem_org");
}

// ─── DB ────────────────────────────────────────────────────────────
function db() {
  const d = new Database(path.join(process.cwd(), "data", "auth.db"));
  d.pragma("journal_mode = WAL");
  d.exec(`
    CREATE TABLE IF NOT EXISTS uploads (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      org_id TEXT,
      nome_original TEXT NOT NULL,
      nome_arquivo TEXT NOT NULL,
      mime TEXT NOT NULL,
      categoria TEXT NOT NULL,
      tamanho INTEGER NOT NULL,
      caminho TEXT NOT NULL,
      texto_extraido TEXT,
      extraido_motor TEXT,
      erro_extracao TEXT,
      extraido_em TEXT,
      criado_em TEXT NOT NULL
    )
  `);
  d.exec(`CREATE INDEX IF NOT EXISTS idx_uploads_user ON uploads(user_id)`);
  return d;
}

export type RegistroUpload = {
  id: string;
  user_id: number;
  org_id: string | null;
  nome_original: string;
  nome_arquivo: string;
  mime: string;
  categoria: CategoriaAnexo;
  tamanho: number;
  caminho: string;
  texto_extraido: string | null;
  extraido_motor: string | null;
  erro_extracao: string | null;
  extraido_em: string | null;
  criado_em: string;
};

// ─── Detecção de TIPO REAL (não confia na extensão) ────────────────
function tem(buf: Buffer, off: number, bytes: number[]): boolean {
  if (buf.length < off + bytes.length) return false;
  return bytes.every((b, i) => buf[off + i] === b);
}
const ascii = (buf: Buffer, off: number, len: number) =>
  buf.length >= off + len ? buf.toString("latin1", off, off + len) : "";

/** ZIP mínimo (sem dependência): acha o EOCD e devolve as entradas. */
export function lerZip(buf: Buffer): Record<string, Buffer> {
  const out: Record<string, Buffer> = {};
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return out;
  const n = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  for (let k = 0; k < n; k++) {
    if (off + 46 > buf.length || buf.readUInt32LE(off) !== 0x02014b50) break;
    const metodo = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nomeLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const comLen = buf.readUInt16LE(off + 32);
    const local = buf.readUInt32LE(off + 42);
    const nome = buf.toString("utf8", off + 46, off + 46 + nomeLen);
    if (local + 30 <= buf.length) {
      const lNomeLen = buf.readUInt16LE(local + 26);
      const lExtraLen = buf.readUInt16LE(local + 28);
      const inicio = local + 30 + lNomeLen + lExtraLen;
      const dados = buf.subarray(inicio, inicio + compSize);
      if (metodo === 0) out[nome] = Buffer.from(dados);
      else if (metodo === 8) {
        try {
          out[nome] = zlib.inflateRawSync(dados);
        } catch {}
      }
    }
    off += 46 + nomeLen + extraLen + comLen;
  }
  return out;
}

/** Devolve o mime REAL pelo conteúdo (magic bytes). null = não reconhecido. */
export function detectarTipoReal(buf: Buffer): string | null {
  if (tem(buf, 0, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  if (tem(buf, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (tem(buf, 0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (ascii(buf, 0, 6) === "GIF87a" || ascii(buf, 0, 6) === "GIF89a") return "image/gif";
  if (ascii(buf, 0, 4) === "RIFF" && ascii(buf, 8, 4) === "WEBP") return "image/webp";
  if (ascii(buf, 0, 4) === "RIFF" && ascii(buf, 8, 4) === "WAVE") return "audio/wav";
  if (ascii(buf, 0, 4) === "OggS") return "audio/ogg";
  if (ascii(buf, 0, 3) === "ID3") return "audio/mpeg";
  if (tem(buf, 0, [0xff, 0xfb]) || tem(buf, 0, [0xff, 0xf3]) || tem(buf, 0, [0xff, 0xf2]) || tem(buf, 0, [0xff, 0xfa]))
    return "audio/mpeg";
  if (tem(buf, 0, [0x1a, 0x45, 0xdf, 0xa3])) return "video/webm"; // EBML
  if (ascii(buf, 4, 4) === "ftyp") {
    const brand = ascii(buf, 8, 4);
    if (["M4A ", "mp42", "mp41", "isom", "iso2", "M4B ", "f4a "].includes(brand)) return "audio/mp4";
    return "audio/mp4";
  }
  if (tem(buf, 0, [0x50, 0x4b, 0x03, 0x04]) || tem(buf, 0, [0x50, 0x4b, 0x05, 0x06])) {
    const z = lerZip(buf);
    if (z["word/document.xml"]) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    return null; // zip que não é docx: recusado
  }
  return null;
}

/** Texto puro não tem assinatura: valida que é UTF-8 sem NUL e imprimível. */
function pareceTexto(buf: Buffer): boolean {
  if (!buf.length) return false;
  if (buf.includes(0)) return false;
  const amostra = buf.subarray(0, 8192);
  let imprimiveis = 0;
  for (const b of amostra) {
    if (b === 9 || b === 10 || b === 13 || (b >= 32 && b !== 127)) imprimiveis++;
  }
  return imprimiveis / amostra.length > 0.9;
}

const MIMES_TEXTO = new Set(["text/plain", "text/markdown", "text/csv"]);

/**
 * Resolve o tipo do arquivo: magic bytes mandam. Para texto puro, exige que a
 * extensão declarada seja de texto E que o conteúdo pareça texto.
 */
export function resolverTipoReal(buf: Buffer, nome: string, mimeDeclarado: string): string | null {
  const porConteudo = detectarTipoReal(buf);
  if (porConteudo) return porConteudo;
  const ext = extensaoDe(nome);
  if (pareceTexto(buf)) {
    if (mimeDeclarado && MIMES_TEXTO.has(mimeDeclarado)) return mimeDeclarado;
    if (ext === "txt") return "text/plain";
    if (ext === "md" || ext === "markdown") return "text/markdown";
    if (ext === "csv") return "text/csv";
  }
  return null;
}

// ─── Uso do espaço (varredura REAL, sem cache) ─────────────────────
function somarPastaRecursivo(dir: string): number {
  let total = 0;
  let itens: fs.Dirent[];
  try {
    itens = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const it of itens) {
    if (it.name === ".tmp") continue; // temporários de conversão não contam
    const p = path.join(dir, it.name);
    if (it.isDirectory()) total += somarPastaRecursivo(p);
    else if (it.isFile()) {
      try {
        total += fs.statSync(p).size;
      } catch {}
    }
  }
  return total;
}

/** Soma real dos bytes de data/uploads/<userId> — sem chute e sem cache. */
export function calcularUsoBytes(userId: number): number {
  return somarPastaRecursivo(pastaDoUsuario(userId));
}

// ─── Guardar ───────────────────────────────────────────────────────
export type ResultadoSalvar =
  | { ok: true; registro: RegistroUpload }
  | { ok: false; status: number; erro: string; usado_bytes?: number; limite_bytes?: number };

export async function salvarUpload(
  conta: { id: number; org: { id: string } | null },
  file: File,
): Promise<ResultadoSalvar> {
  const buf = Buffer.from(await file.arrayBuffer());
  const nomeOriginal = (file.name || "arquivo").slice(0, 200);
  const emMb = (n: number) => (n / 1024 / 1024).toFixed(1);

  // 1) teto por arquivo (30 MB) — conferido nos BYTES reais
  if (buf.length > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      status: 413,
      erro: `"${nomeOriginal}" tem ${emMb(buf.length)} MB — o limite é ${MAX_UPLOAD_ROTULO} por arquivo.`,
    };
  }
  if (buf.length === 0) return { ok: false, status: 400, erro: "Arquivo vazio." };

  // 2) tipo REAL (não a extensão)
  const real = resolverTipoReal(buf, nomeOriginal, (file.type || "").toLowerCase());
  if (!real || !ehMimePermitido(real)) {
    return {
      ok: false,
      status: 415,
      erro: `"${nomeOriginal}": tipo não aceito (detectado: ${real || "desconhecido"}). Aceito: ${LISTA_ACEITOS}.`,
    };
  }

  // 3) teto de 3 GB do espaço do usuário (soma do que já existe)
  const usado = calcularUsoBytes(conta.id);
  if (usado + buf.length > LIMITE_WORKSPACE_BYTES) {
    const falta = Math.max(0, LIMITE_WORKSPACE_BYTES - usado);
    return {
      ok: false,
      status: 413,
      erro:
        `Sem espaço: você já usa ${(usado / 1024 / 1024).toFixed(1)} MB de ` +
        `${(LIMITE_WORKSPACE_BYTES / 1024 / 1024 / 1024).toFixed(0)} GB ` +
        `(sobra ${(falta / 1024 / 1024).toFixed(1)} MB). Apague algo ou suba um arquivo menor.`,
      usado_bytes: usado,
      limite_bytes: LIMITE_WORKSPACE_BYTES,
    };
  }

  // 4) salva com nome GERADO (o nome do usuário nunca vira caminho)
  const id = randomUUID();
  const ext = MIMES_PERMITIDOS[real].ext;
  const nomeArquivo = `${id}.${ext}`;
  const pasta = pastaDaConta(conta.id, conta.org?.id ?? null);
  fs.mkdirSync(pasta, { recursive: true });
  const caminho = path.join(pasta, nomeArquivo);
  fs.writeFileSync(caminho, buf);

  const registro: RegistroUpload = {
    id,
    user_id: conta.id,
    org_id: conta.org?.id ?? null,
    nome_original: nomeOriginal,
    nome_arquivo: nomeArquivo,
    mime: real,
    categoria: categoriaDeMime(real),
    tamanho: buf.length,
    caminho,
    texto_extraido: null,
    extraido_motor: null,
    erro_extracao: null,
    extraido_em: null,
    criado_em: new Date().toISOString(),
  };

  const d = db();
  d.prepare(
    `INSERT INTO uploads (id, user_id, org_id, nome_original, nome_arquivo, mime, categoria,
       tamanho, caminho, texto_extraido, extraido_motor, erro_extracao, extraido_em, criado_em)
     VALUES (@id, @user_id, @org_id, @nome_original, @nome_arquivo, @mime, @categoria,
       @tamanho, @caminho, @texto_extraido, @extraido_motor, @erro_extracao, @extraido_em, @criado_em)`,
  ).run(registro);
  d.close();

  return { ok: true, registro };
}

function linhaParaRegistro(r: any): RegistroUpload {
  return r as RegistroUpload;
}

/** Busca um upload conferindo a dono (userId). null = não é dele / não existe. */
export function obterUpload(id: string, userId: number): RegistroUpload | null {
  const d = db();
  const r = d.prepare("SELECT * FROM uploads WHERE id = ? AND user_id = ?").get(id, userId);
  d.close();
  return r ? linhaParaRegistro(r) : null;
}

export function listarUploads(userId: number, limite = 100): RegistroUpload[] {
  const d = db();
  const r = d.prepare("SELECT * FROM uploads WHERE user_id = ? ORDER BY criado_em DESC LIMIT ?").all(userId, limite);
  d.close();
  return (r as any[]).map(linhaParaRegistro);
}

// ─── Extração de conteúdo ──────────────────────────────────────────
const LIMITE_TEXTO_ANEXO = 24000; // caracteres por anexo (evita estourar contexto)

function recortar(texto: string, limite = LIMITE_TEXTO_ANEXO): string {
  const t = (texto || "").trim();
  if (t.length <= limite) return t;
  return t.slice(0, limite) + "\n[...] (texto truncado)";
}

function limparXmlDocx(xml: string): string {
  return xml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:tab[^>]*\/>/g, "\t")
    .replace(/<w:br[^>]*\/>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function extrairDocx(buf: Buffer): string {
  const z = lerZip(buf);
  const xml = z["word/document.xml"];
  if (!xml) throw new Error("document.xml não encontrado no .docx");
  return limparXmlDocx(new TextDecoder().decode(xml));
}

async function extrairPdf(buf: Buffer): Promise<{ texto: string; motor: string }> {
  const data = `data:application/pdf;base64,${buf.toString("base64")}`;
  return chamarVisao(
    [
      { type: "text", text: "Extraia TODO o texto deste PDF, sem comentários e sem resumir. Devolva apenas o texto." },
      { type: "file", file: { filename: "documento.pdf", file_data: data } },
    ],
    4096,
  );
}

async function lerImagem(buf: Buffer, mime: string): Promise<{ texto: string; motor: string }> {
  const data = `data:${mime};base64,${buf.toString("base64")}`;
  return chamarVisao(
    [
      {
        type: "text",
        text:
          "Descreva esta imagem em português de forma objetiva e transcreva TODO o texto visível nela (OCR). " +
          "Formato: primeiro a descrição, depois, se houver, o texto transcrito. Não invente.",
      },
      { type: "image_url", image_url: { url: data } },
    ],
    1536,
  );
}

/** Áudio grande: reduz com ffmpeg antes de mandar pro Whisper (limite 25 MB). */
async function prepararAudio(buf: Buffer, mime: string): Promise<Blob> {
  const MAX_WHISPER = 24 * 1024 * 1024;
  const comoBlob = (b: Buffer, t: string) => new Blob([new Uint8Array(b)], { type: t });
  if (buf.length <= MAX_WHISPER) return comoBlob(buf, mime);
  try {
    fs.mkdirSync(TMP, { recursive: true });
    const entrada = path.join(TMP, `${randomUUID()}.${MIMES_PERMITIDOS[mime]?.ext || "bin"}`);
    const saida = path.join(TMP, `${randomUUID()}.mp3`);
    fs.writeFileSync(entrada, buf);
    await execFileAsync("ffmpeg", ["-y", "-i", entrada, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k", saida], {
      timeout: 120000,
    });
    const reduzido = fs.readFileSync(saida);
    fs.rmSync(entrada, { force: true });
    fs.rmSync(saida, { force: true });
    return comoBlob(reduzido, "audio/mpeg");
  } catch {
    return comoBlob(buf, mime);
  }
}

async function extrairConteudo(reg: RegistroUpload, buf: Buffer): Promise<{ texto: string; motor: string; erro?: string }> {
  try {
    if (reg.mime === "application/pdf") {
      const r = await extrairPdf(buf);
      return { texto: recortar(r.texto), motor: r.motor };
    }
    if (reg.mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      return { texto: recortar(extrairDocx(buf)), motor: "docx:local" };
    }
    if (reg.categoria === "imagem") {
      const r = await lerImagem(buf, reg.mime);
      return { texto: recortar(r.texto), motor: r.motor };
    }
    if (reg.categoria === "audio") {
      const blob = await prepararAudio(buf, reg.mime);
      const r = await transcreverAudio(blob);
      if (r) return { texto: recortar(r.texto), motor: `stt:${r.provedor}` };
      return { texto: "", motor: "stt", erro: "não consegui transcrever o áudio" };
    }
    // texto puro
    return { texto: recortar(buf.toString("utf8")), motor: "texto:utf8" };
  } catch (e: any) {
    return { texto: "", motor: "erro", erro: e?.message || "falha ao ler o conteúdo" };
  }
}

function gravarExtracao(id: string, texto: string, motor: string, erro: string | null) {
  const d = db();
  d.prepare(
    "UPDATE uploads SET texto_extraido = ?, extraido_motor = ?, erro_extracao = ?, extraido_em = ? WHERE id = ?",
  ).run(texto, motor, erro, new Date().toISOString(), id);
  d.close();
}

/** Extrai 1x e guarda (cache no banco). Rechamadas não re-transcrevem nem re-leem. */
export async function garantirExtracao(reg: RegistroUpload): Promise<{ texto: string; erro: string | null }> {
  if (reg.extraido_em) {
    return { texto: reg.texto_extraido || "", erro: reg.erro_extracao || null };
  }
  let buf: Buffer;
  try {
    buf = fs.readFileSync(reg.caminho);
  } catch {
    return { texto: "", erro: "arquivo não encontrado no disco" };
  }
  const { texto, motor, erro } = await extrairConteudo(reg, buf);
  gravarExtracao(reg.id, texto, motor, erro || null);
  return { texto, erro: erro || null };
}

/**
 * Monta o bloco de contexto de uma mensagem do usuário com seus anexos.
 * Sempre inclui o nome do arquivo; se não deu para ler, DIZ isso (não quebra a conversa).
 */
export async function blocoDeAnexos(
  anexos: { id: string }[],
  userId: number,
): Promise<{ blocos: string[]; imagens: { nome: string; mime: string; b64: string }[] }> {
  const blocos: string[] = [];
  const imagens: { nome: string; mime: string; b64: string }[] = [];
  for (const a of anexos || []) {
    if (!a?.id) continue;
    const reg = obterUpload(a.id, userId);
    if (!reg) {
      blocos.push(`[ANEXO não encontrado: ${a.id}]`);
      continue;
    }
    const { texto, erro } = await garantirExtracao(reg);
    if (texto.trim()) {
      blocos.push(`[ANEXO: ${reg.nome_original} (${reg.mime})]\n${texto}`);
    } else {
      blocos.push(
        `[ANEXO: ${reg.nome_original} (${reg.mime})] Conteúdo não legível${erro ? `: ${erro}` : ""}. ` +
          `O arquivo continua guardado.`,
      );
    }
    if (reg.categoria === "imagem") {
      try {
        imagens.push({ nome: reg.nome_original, mime: reg.mime, b64: fs.readFileSync(reg.caminho).toString("base64") });
      } catch {}
    }
  }
  return { blocos, imagens };
}

/** Distância mínima exposta p/ futuras features (ex.: dedupe). */
export function hashConteudo(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}
