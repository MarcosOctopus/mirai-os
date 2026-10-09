// Gera os ícones do app (PWA) a partir do ORBE — a marca do MIRAI OS.
// O ícone antigo (laranja, fundo branco) virava quadrado branco no iPhone e
// sumia no Android. Aqui: fundo escuro + orbe ciano, nas medidas que iOS e
// Android EXIGEM (PNG; o iOS ignora SVG).
import sharp from "sharp";
import fs from "node:fs";

const ESCURO = "#080812";

/** O orbe: halo, corpo com gradiente, núcleo ciano, centro branco. */
function orbe({ size, rx, escala = 1 }) {
  const c = size / 2;
  const rCorpo = 0.29 * size * escala;
  const rHalo = 0.42 * size * escala;
  const rNucleo = 0.095 * size * escala;
  const rCentro = 0.038 * size * escala;
  const rxCanto = rx ? Math.round(rx * size) : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <defs>
    <radialGradient id="corpo" cx="50%" cy="46%" r="55%">
      <stop offset="0%" stop-color="#9ff7ff"/>
      <stop offset="34%" stop-color="#00f0ff"/>
      <stop offset="70%" stop-color="#0a63ff"/>
      <stop offset="100%" stop-color="#160a3a"/>
    </radialGradient>
    <radialGradient id="halo" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#00f0ff" stop-opacity="0.34"/>
      <stop offset="55%" stop-color="#0a63ff" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#0a63ff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${size}" height="${size}" ${rxCanto ? `rx="${rxCanto}"` : ""} fill="${ESCURO}"/>
  <circle cx="${c}" cy="${c}" r="${rHalo}" fill="url(#halo)"/>
  <circle cx="${c}" cy="${c}" r="${rCorpo}" fill="url(#corpo)"/>
  <circle cx="${c}" cy="${c}" r="${rNucleo}" fill="#c9fbff" opacity="0.55"/>
  <circle cx="${c}" cy="${c}" r="${rCentro}" fill="#ffffff" opacity="0.95"/>
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

// 4) Os arquivos especiais do Next (favicon da aba + apple-icon do iOS).
await png(orbe({ size: 512, rx: 0.22 }), "src/app/icon.png", 512);
await png(orbe({ size: 512, rx: 0 }), "src/app/apple-icon.png", 180);

console.log("ícones prontos — todos da MESMA marca (o orbe ciano).");
