// Tipos e limites do upload de anexos do chat — seguro para CLIENTE e SERVIDOR.
// Nada de fs/node aqui: o navegador importa isto para validar antes de subir.

export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024; // 30 MB (teto duro, vale nos dois lados)
export const MAX_UPLOAD_ROTULO = "30 MB";

export type CategoriaAnexo = "documento" | "imagem" | "audio";

export type DefinicaoTipo = { cat: CategoriaAnexo; ext: string; rotulo: string };

// Tipos aceitos (categoria manda no rótulo mostrado na conversa).
export const MIMES_PERMITIDOS: Record<string, DefinicaoTipo> = {
  // documento
  "application/pdf": { cat: "documento", ext: "pdf", rotulo: "PDF" },
  "text/plain": { cat: "documento", ext: "txt", rotulo: "Texto" },
  "text/markdown": { cat: "documento", ext: "md", rotulo: "Markdown" },
  "text/csv": { cat: "documento", ext: "csv", rotulo: "CSV" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    cat: "documento",
    ext: "docx",
    rotulo: "Word",
  },
  // imagem
  "image/png": { cat: "imagem", ext: "png", rotulo: "Imagem" },
  "image/jpeg": { cat: "imagem", ext: "jpg", rotulo: "Imagem" },
  "image/webp": { cat: "imagem", ext: "webp", rotulo: "Imagem" },
  "image/gif": { cat: "imagem", ext: "gif", rotulo: "Imagem" },
  // audio / video curto
  "audio/mpeg": { cat: "audio", ext: "mp3", rotulo: "Áudio" },
  "audio/mp4": { cat: "audio", ext: "m4a", rotulo: "Áudio" },
  "audio/wav": { cat: "audio", ext: "wav", rotulo: "Áudio" },
  "audio/ogg": { cat: "audio", ext: "ogg", rotulo: "Áudio" },
  "audio/webm": { cat: "audio", ext: "webm", rotulo: "Áudio" },
  "video/webm": { cat: "audio", ext: "webm", rotulo: "Áudio/Vídeo" },
};

// Extensão -> mime. Usado quando o navegador não informa `file.type`
// (texto/.md/.csv às vezes vêm vazios).
export const EXT_PARA_MIME: Record<string, string> = {
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  csv: "text/csv",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  webm: "video/webm",
};

export function extensaoDe(nome: string): string {
  const i = nome.lastIndexOf(".");
  return i >= 0 ? nome.slice(i + 1).toLowerCase() : "";
}

/** Família declarada pelo navegador (ou pela extensão) — só para validar no cliente. */
export function mimeDeclarado(file: { name: string; type?: string }): string {
  const t = (file.type || "").toLowerCase().trim();
  if (t && MIMES_PERMITIDOS[t]) return t;
  const ext = extensaoDe(file.name);
  return EXT_PARA_MIME[ext] || t;
}

export function ehMimePermitido(mime: string): boolean {
  return !!MIMES_PERMITIDOS[mime];
}

export function categoriaDeMime(mime: string): CategoriaAnexo {
  return MIMES_PERMITIDOS[mime]?.cat ?? "documento";
}

export function rotuloDeMime(mime: string): string {
  return MIMES_PERMITIDOS[mime]?.rotulo ?? "Arquivo";
}

export const LISTA_ACEITOS =
  "PDF, TXT, MD, CSV, DOCX, PNG, JPG, JPEG, WEBP, GIF, MP3, M4A, WAV, OGG, WEBM";

export const MENSAGEM_TIPO_RECUSADO = `Tipo de arquivo não aceito. Aceito: ${LISTA_ACEITOS}.`;

export type AnexoCliente = {
  id: string;
  nome: string;
  mime: string;
  categoria: CategoriaAnexo;
  rotulo: string;
  tamanho: number;
  url: string;
};

/** Valida no NAVEGADOR — devolve null se passou, ou a mensagem de recusa. */
export function validarArquivoNoNavegador(file: { name: string; size: number; type?: string }): string | null {
  if (file.size <= 0) return `"${file.name}" está vazio.`;
  if (file.size > MAX_UPLOAD_BYTES) {
    return `"${file.name}" tem ${(file.size / 1024 / 1024).toFixed(1)} MB — o limite é ${MAX_UPLOAD_ROTULO}.`;
  }
  const mime = mimeDeclarado(file);
  if (!mime || !ehMimePermitido(mime)) return `"${file.name}": ${MENSAGEM_TIPO_RECUSADO}`;
  return null;
}
