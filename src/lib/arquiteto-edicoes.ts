/**
 * AS EDIÇÕES DO CONSTRUTOR (dono, 11/10/2026).
 *
 * Por que existe: medido — trocar UMA palavra num projeto grande levava ~91s
 * porque o modelo REESCREVIA o arquivo inteiro (14.369 chars de saída). O tempo
 * está na GERAÇÃO, não na entrada (mandar só 1 arquivo deu o mesmo tempo). Aqui
 * o modelo devolve só a TROCA:
 *
 *   === EDIT: index.html ===
 *   @@BUSCAR
 *   <trecho EXATO que já existe>
 *   @@TROCAR
 *   <trecho novo>
 *   @@FIM
 *
 * A troca é aplicada por substituição LITERAL, uma única vez. Saída de algumas
 * dezenas de caracteres em vez de 14 mil — a resposta cai de ~90s para segundos.
 *
 * FALHA SEGURA (nunca corrompe): se o trecho não for achado, ou aparecer MAIS DE
 * UMA vez (ambíguo), a edição é RECUSADA e o arquivo fica como estava. Nunca se
 * adivinha qual dos vários lugares era.
 */
export type Edicao = { nome: string; buscar: string; trocar: string };

export type ArquivoEditavel = { nome: string; conteudo: string };

/** Parser do formato `=== EDIT: arquivo ===` com @@BUSCAR/@@TROCAR/@@FIM. */
export function extrairEdicoes(texto: string): Edicao[] {
  const linhas = texto.split("\n");
  const edicoes: Edicao[] = [];
  let nome = "";
  let buscar: string[] | null = null;
  let trocar: string[] | null = null;

  const fechar = () => {
    if (nome && buscar && trocar) {
      const b = buscar.join("\n").trim();
      const t = trocar.join("\n").trim();
      if (b) edicoes.push({ nome: nome.trim(), buscar: b, trocar: t });
    }
    nome = "";
    buscar = null;
    trocar = null;
  };

  for (const bruta of linhas) {
    // Cercas de código vêm por fora do formato: ignora a linha inteira.
    const ln = /^\s*```/.test(bruta) ? "" : bruta;
    const mEdit = ln.match(/^===\s*EDIT:\s*(.+?)\s*===\s*$/i);
    if (mEdit) {
      fechar();
      nome = mEdit[1].trim();
      continue;
    }
    if (/^@@\s*BUSCAR\s*$/i.test(ln)) {
      buscar = [];
      trocar = null;
      continue;
    }
    if (/^@@\s*TROCAR\s*$/i.test(ln)) {
      if (buscar) trocar = [];
      continue;
    }
    if (/^@@\s*FIM\s*$/i.test(ln) || /^===\s*FIM\s*===\s*$/i.test(ln)) {
      fechar();
      continue;
    }
    if (!nome) continue;
    if (trocar) trocar.push(ln);
    else if (buscar) buscar.push(ln);
  }
  fechar();
  return edicoes;
}

/**
 * Mapa do conteúdo com os espaços NORMALIZADOS: devolve o texto com toda corrida
 * de espaço/tab/quebra vira UM espaço, e a posição no ORIGINAL de cada caractere.
 * Serve para achar um trecho que o modelo reindentou ou reespaçou.
 */
function mapearNormalizado(conteudo: string): { norm: string; mapa: number[] } {
  let norm = "";
  const mapa: number[] = [];
  let i = 0;
  while (i < conteudo.length) {
    const c = conteudo[i];
    if (/\s/.test(c)) {
      norm += " ";
      mapa.push(i);
      while (i < conteudo.length && /\s/.test(conteudo[i])) i++;
      continue;
    }
    norm += c;
    mapa.push(i);
    i++;
  }
  return { norm, mapa };
}

/**
 * Procura o trecho tolerando ESPAÇAMENTO (indentação, tabs, quebras de linha).
 * O modelo reindenta com frequência ao copiar; exigir byte a byte reprovava
 * edições corretas. Devolve o intervalo no conteúdo ORIGINAL, ou null.
 * Só devolve quando o trecho aparece UMA ÚNICA VEZ — ambíguo continua recusado.
 */
function acharTrecho(conteudo: string, buscar: string): [number, number] | null {
  const exato = conteudo.split(buscar).length - 1;
  if (exato === 1) {
    const i = conteudo.indexOf(buscar);
    return [i, i + buscar.length];
  }
  if (exato > 1) return null; // ambíguo: não se adivinha

  // Tentativa normalizada (espaçamento flexível).
  const { norm, mapa } = mapearNormalizado(conteudo);
  const alvo = buscar
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
  const ocorrencias = norm.split(alvo).length - 1;
  if (ocorrencias !== 1) return null;
  const inicio = norm.indexOf(alvo);
  const fimNorm = inicio + alvo.length - 1;
  return [mapa[inicio], mapa[fimNorm] + 1];
}

/**
 * Aplica as edições nos arquivos atuais por substituição LITERAL (tolerando
 * espaçamento). Devolve os arquivos (novos objetos) e o que foi recusado.
 */
export function aplicarEdicoes(
  atuais: ArquivoEditavel[],
  edicoes: Edicao[],
): { arquivos: ArquivoEditavel[]; aplicadas: number; recusadas: { nome: string; motivo: string }[] } {
  const out = atuais.map((a) => ({ nome: a.nome, conteudo: a.conteudo }));
  const recusadas: { nome: string; motivo: string }[] = [];
  let aplicadas = 0;

  for (const e of edicoes) {
    const nome = (e.nome || "").trim();
    if (!nome || !e.buscar) continue;
    const exato = out.findIndex((a) => a.nome === nome);
    const idx = exato >= 0 ? exato : out.findIndex((a) => a.nome.toLowerCase() === nome.toLowerCase());
    if (idx < 0) {
      recusadas.push({ nome, motivo: "arquivo não existe neste projeto" });
      continue;
    }
    const conteudo = out[idx].conteudo;
    const amb = conteudo.split(e.buscar).length - 1;
    if (amb > 1) {
      recusadas.push({ nome, motivo: `trecho aparece ${amb} vezes (ambíguo)` });
      continue;
    }
    const faixa = acharTrecho(conteudo, e.buscar);
    if (!faixa) {
      recusadas.push({ nome, motivo: "trecho a trocar não foi encontrado (copie do arquivo exatamente)" });
      continue;
    }
    const novo = conteudo.slice(0, faixa[0]) + e.trocar + conteudo.slice(faixa[1]);
    out[idx] = { nome: out[idx].nome, conteudo: novo };
    aplicadas++;
  }
  return { arquivos: out, aplicadas, recusadas };
}
