// Gera os ícones do app (PWA) a partir do ORBE — a marca do MIRAI OS.
// O ícone antigo (laranja, fundo branco) virava quadrado branco no iPhone e
// sumia no Android. Aqui: fundo escuro + orbe ciano, nas medidas que iOS e
// Android EXIGEM (PNG; o iOS ignora SVG).
import sharp from "sharp";
import fs from "node:fs";

const ESCURO = "#03040d";

// A MARCA DA MIRAI (dono, 09/10/2026): bola em BRANCO, LARANJA e AZUL.
// Cores tiradas do próprio app — laranja `--orange: #ff6b35` (o acento da
// interface) e azul `#0aefff` (o brilho do orbe). O branco é o núcleo.
const BRANCO = "#ffffff";
const LARANJA = "#ff6b35";
const LARANJA_CLARA = "#ff9a5c";
// AZUL de verdade (o ciano ficava ambíguo): começa num azul-claro junto do
// laranja (para a transição não ficar dura) e fecha num azul franco.
const AZUL_CLARO = "#12b5ff";
const AZUL = "#0a6bff";

/** A bola da marca: núcleo branco, corpo laranja, aro azul, halo azul. */
function orbe({ size, rx, escala = 1 }) {
  const c = size / 2;
  const rCorpo = 0.32 * size * escala;
  const rHalo = 0.46 * size * escala;
  const rCore = 0.075 * size * escala;
  const rxCanto = rx ? Math.round(rx * size) : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <defs>
    <radialGradient id="halo" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${AZUL}" stop-opacity="0.42"/>
      <stop offset="45%" stop-color="${AZUL}" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="${AZUL}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="bola" cx="50%" cy="44%" r="56%">
      <stop offset="0%" stop-color="${BRANCO}"/>
      <stop offset="24%" stop-color="#fff2e6"/>
      <stop offset="33%" stop-color="${LARANJA_CLARA}"/>
      <stop offset="58%" stop-color="${LARANJA}"/>
      <stop offset="68%" stop-color="${LARANJA}"/>
      <stop offset="73%" stop-color="${AZUL_CLARO}"/>
      <stop offset="86%" stop-color="${AZUL}"/>
      <stop offset="100%" stop-color="${AZUL}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${size}" height="${size}" ${rxCanto ? `rx="${rxCanto}"` : ""} fill="${ESCURO}"/>
  <circle cx="${c}" cy="${c}" r="${rHalo}" fill="url(#halo)"/>
  <circle cx="${c}" cy="${c}" r="${rCorpo}" fill="url(#bola)"/>
  <circle cx="${c}" cy="${c}" r="${rCore}" fill="${BRANCO}" opacity="0.96"/>
</svg>`;
}

async function png(svg, destino, tamanho) {
  await sharp(Buffer.from(svg)).resize(tamanho, tamanho).png({ compressionLevel: 9 }).toFile(destino);
  const { size } = fs.statSync(destino);
  console.log(`  ${destino}  (${tamanho}px, ${(size / 1024).toFixed(1)} KB)`);
}

fs.mkdirSync("public/icons", { recursive: true });

// 1) Ícone "normal" (cantos arredondados) — manifest 192/512.
await png(orbe({ size: 512, rx: 0.22 }), "public/icons/icon-192.png", 192);
await png(orbe({ size: 512, rx: 0.22 }), "public/icons/icon-512.png", 512);

// 2) MASKABLE (Android): fundo cheio, orbe menor, dentro da zona segura (evita
//    que a máscara do Android corte o orbe).
await png(orbe({ size: 512, rx: 0, escala: 0.62 }), "public/icons/icon-maskable-512.png", 512);

// 3) iOS: apple-touch-icon OPAco (o iOS pinta preto onde houver transparência).
await png(orbe({ size: 512, rx: 0 }), "public/apple-touch-icon.png", 180);

// 4) Os arquivos especiais do Next (favicon da aba + apple-icon do iOS) e o
//    public/icon.png (que SOBREPÕE a rota /icon.png — era o favicon laranja antigo).
await png(orbe({ size: 512, rx: 0.22 }), "src/app/icon.png", 512);
await png(orbe({ size: 512, rx: 0 }), "src/app/apple-icon.png", 180);
await png(orbe({ size: 512, rx: 0.22 }), "public/icon.png", 512);

console.log("ícones prontos — todos da MESMA marca (a bola branca, laranja e azul).");
