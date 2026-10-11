// A prova das 4 REGRAS NOVAS: elas têm de estar no padrão que o construtor recebe.
// Roda: npx tsx scripts/prova-regras-design.ts
import { REGRAS_VISUAL, promptComVisual } from "../src/lib/arquiteto-craft";

const MARCADORES: [string, RegExp][] = [
  ["25 · cor com significado", /25\.\s*COR COM SIGNIFICADO/],
  ["26 · sem rótulo interno", /26\.\s*NADA DE R[ÓO]TULO INTERNO VIS[ÍI]VEL/],
  ["27 · dado legível e verdadeiro", /27\.\s*DADO MOSTRADO TEM DE SER LEG[ÍI]VEL E VERDADEIRO/],
  ["28 · microcopy sem contradição", /28\.\s*MICROCOPY SEM CONTRADI[ÇC][ÃA]O/],
];

let falhas = 0;
console.log("=== as 4 regras novas estão no PADRÃO VISUAL? ===");
for (const [nome, re] of MARCADORES) {
  const ok = re.test(REGRAS_VISUAL);
  if (!ok) falhas++;
  console.log(`  ${ok ? "✅" : "❌"} ${nome}`);
}

console.log("\n=== e chegam no prompt do construtor (promptComVisual)? ===");
const prompt = promptComVisual("(system do construtor)");
for (const [nome, re] of MARCADORES) {
  const ok = re.test(prompt);
  if (!ok) falhas++;
  console.log(`  ${ok ? "✅" : "❌"} ${nome}`);
}

console.log("\n=== as regras ANTIGAS continuam lá (não substituí nada)? ===");
const antigas: [string, RegExp][] = [
  ["8 · escala tipográfica fixa", /8\.\s*ESCALA [ÚU]NICA E FIXA/],
  ["11 · contraste AA", /11\.\s*CONTRASTE AA OBRIGAT[ÓO]RIO/],
  ["17 · nada de ordem por reflexo", /17\.\s*Nada de "Features/],
  ["20 · arte real ou nenhuma", /20\.\s*ARTE REAL OU NENHUMA/],
];
for (const [nome, re] of antigas) {
  const ok = re.test(prompt);
  if (!ok) falhas++;
  console.log(`  ${ok ? "✅" : "❌"} ${nome}`);
}

const total = MARCADORES.length * 2 + antigas.length;
console.log(falhas === 0 ? `\nTODAS AS PROVAS PASSARAM ✅ (${total}/${total})` : `\n${falhas} FALHA(S) ❌`);
process.exit(falhas === 0 ? 0 : 1);
