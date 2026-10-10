// Ícone do app = a LOGO DA MIRAI (o mark de sempre) em BRANCO sobre o LARANJA
// da Mirai. Pedido do dono (09/10/2026): "só quero o fundo laranja da Mirai e a
// logo ... que já tem". A marca fica em `assets/marca-mirai.png` (a original,
// fundo transparente). Branca porque laranja sobre laranja não se vê.
import sharp from "sharp";
import fs from "node:fs";

const LARANJA = "#ff6b35"; // o laranja da Mirai (o mesmo da interface)
const FONTE = "assets/marca-mirai.png";
const MARK = { left: 0, top: 3, width: 512, height: 506 }; // recorte justo do mark

/** A marca recortada, no tamanho pedido, com o RGB trocado por BRANCO. */
async function marcaBranca(lado) {
  // A imagem de origem tem as bordas em degraus (foi ampliada de um tamanho
  // menor). Um leve desfoque na máscara ANTES de reduzir dá anti-aliasing e a
  // silhueta deixa de sair serrilhada.
  const grande = await sharp(FONTE).extract(MARK).ensureAlpha().extractChannel("alpha").blur(1.1).toBuffer();
  const mascara = await sharp(grande).resize({ width: lado, height: lado, fit: "inside" }).png().toBuffer();
  const m = await sharp(mascara).metadata();
  // branco puro, com a ALFA da marca (é a alfa que desenha a silhueta).
  return sharp({
    create: { width: m.width, height: m.height, channels: 3, background: "#ffffff" },
  })
    .joinChannel(mascara)
    .png()
    .toBuffer();
}

async function icone(destino, lado, fracao) {
  const marca = await marcaBranca(Math.round(lado * fracao));
  await sharp({ create: { width: lado, height: lado, channels: 4, background: LARANJA } })
    .composite([{ input: marca, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toFile(destino);
  console.log(`  ${destino}  (${lado}px, marca ${Math.round(lado * fracao)}px)`);
}

fs.mkdirSync("public/icons", { recursive: true });
await icone("public/icons/icon-192.png", 192, 0.68);
await icone("public/icons/icon-512.png", 512, 0.66);
// Android: o mark menor, dentro da zona segura (a máscara redonda não pode cortá-lo).
await icone("public/icons/icon-maskable-512.png", 512, 0.52);
// iOS: opaco (o iOS pinta preto onde houver transparência).
await icone("public/apple-touch-icon.png", 180, 0.7);
// Os arquivos especiais do Next (favicon da aba + apple do iOS) e o
// public/icon.png (que sobrepõe a rota /icon.png).
await icone("src/app/icon.png", 512, 0.66);
await icone("src/app/apple-icon.png", 180, 0.7);
await icone("public/icon.png", 512, 0.66);

console.log("ícones prontos — a logo da Mirai (branca) sobre o laranja da Mirai.");
