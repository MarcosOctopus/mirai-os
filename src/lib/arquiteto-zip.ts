// ZIP sem dependência nova — o formato do PKZIP (cabeçalho local + diretório
// central + EOCD) sobre o deflate do zlib, que já vem no Node.
//
// POR QUE à mão: "baixar o app" tem de entregar os arquivos INTEIROS, nas pastas
// reais, prontos para abrir. O app não tem nenhuma lib de zip e a regra da casa é
// não acrescentar dependência para uma função pequena e bem definida como esta.
//
// DECISÕES (e por quê):
//   • método 8 (deflate) no texto, 0 (store) no que já é comprimido — imagem,
//     fonte e zip não ganham byte com deflate; só custam CPU.
//   • flag 0x0800 (UTF-8) nos nomes: acento em nome de arquivo não quebra.
//   • data/hora em DOS time, do momento do download: é o que o Windows espera.
//   • arquivo de 0 byte entra do mesmo jeito (entrada vazia é válida no formato).

import { deflateRawSync } from "zlib";

export type EntradaZip = { caminho: string; conteudo: Buffer | string };

const METODO_DEFLATE = 8;
const METODO_STORE = 0;
const FLAG_UTF8 = 0x0800;
const VERSAO = 20; // 2.0 — deflate

/** Tabela do CRC-32 (polinômio 0xEDB88320), montada uma vez. */
const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABELA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Data/hora no formato do MS-DOS (o do ZIP). Segundos têm passo de 2. */
function horaDos(data: Date): { hora: number; dia: number } {
  const hora =
    ((data.getHours() & 31) << 11) | ((data.getMinutes() & 63) << 5) | ((Math.floor(data.getSeconds() / 2)) & 31);
  const dia =
    (((data.getFullYear() - 1980) & 127) << 9) | (((data.getMonth() + 1) & 15) << 5) | (data.getDate() & 31);
  return { hora, dia };
}

/** Extensões que já vêm comprimidas: guardar cru é mais honesto que inflar. */
const JA_COMPRIMIDO = /\.(png|jpe?g|webp|gif|ico|avif|zip|gz|woff2?|mp4|mp3)$/i;

/** Monta o .zip em memória. Devolve o Buffer pronto para servir. */
export function montarZip(entradas: EntradaZip[], quando = new Date()): Buffer {
  const { hora, dia } = horaDos(quando);
  const partes: Buffer[] = []; // locais + corpos, na ordem
  const diretorio: Buffer[] = []; // cabeçalhos do diretório central
  let deslocamento = 0;

  for (const entrada of entradas) {
    const nome = Buffer.from(entrada.caminho.replace(/\\/g, "/"), "utf8");
    const cru = Buffer.isBuffer(entrada.conteudo) ? entrada.conteudo : Buffer.from(entrada.conteudo, "utf8");
    const metodo = JA_COMPRIMIDO.test(entrada.caminho) ? METODO_STORE : METODO_DEFLATE;
    const corpo = metodo === METODO_DEFLATE ? deflateRawSync(cru) : cru;
    const crc = crc32(cru);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // assinatura
    local.writeUInt16LE(VERSAO, 4);
    local.writeUInt16LE(FLAG_UTF8, 6);
    local.writeUInt16LE(metodo, 8);
    local.writeUInt16LE(hora, 10);
    local.writeUInt16LE(dia, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(corpo.length, 18);
    local.writeUInt32LE(cru.length, 22);
    local.writeUInt16LE(nome.length, 26);
    local.writeUInt16LE(0, 28); // sem campo extra
    partes.push(local, nome, corpo);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // assinatura do diretório
    central.writeUInt16LE(VERSAO, 4); // versão que criou
    central.writeUInt16LE(VERSAO, 6); // versão mínima para ler
    central.writeUInt16LE(FLAG_UTF8, 8);
    central.writeUInt16LE(metodo, 10);
    central.writeUInt16LE(hora, 12);
    central.writeUInt16LE(dia, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(corpo.length, 20);
    central.writeUInt32LE(cru.length, 24);
    central.writeUInt16LE(nome.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comentário
    central.writeUInt16LE(0, 34); // disco inicial
    central.writeUInt16LE(0, 36); // atributos internos
    central.writeUInt32LE(0, 38); // atributos externos
    central.writeUInt32LE(deslocamento, 42); // onde começa o cabeçalho local
    diretorio.push(central, nome);

    deslocamento += local.length + nome.length + corpo.length;
  }

  const cd = Buffer.concat(diretorio);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0); // EOCD
  fim.writeUInt16LE(0, 4);
  fim.writeUInt16LE(0, 6);
  fim.writeUInt16LE(entradas.length, 8);
  fim.writeUInt16LE(entradas.length, 10);
  fim.writeUInt32LE(cd.length, 12);
  fim.writeUInt32LE(deslocamento, 16);
  fim.writeUInt16LE(0, 20); // sem comentário

  return Buffer.concat([...partes, cd, fim]);
}
