/**
 * A MESCLA DA MUDANÇA (dono, 11/10/2026).
 *
 * O construtor devolve SÓ os arquivos que mudaram; aqui eles entram no projeto
 * ATUAL e **os que não vieram ficam intocados, byte a byte**. Foi isto que
 * resolveu o "demorou, demorou e deu erro": num projeto grande (~38 mil
 * caracteres) o modelo tinha de reescrever o projeto INTEIRO para trocar uma
 * palavra — não terminava dentro do tempo de nenhum provedor e a pessoa esperava
 * 12 minutos (medido: 721s) para receber "o provedor não respondeu". Com a
 * mescla, a mesma mudança volta em 94s.
 *
 * Efeito colateral desejado: "o resto sai igual" deixa de ser confiança no
 * modelo e passa a ser garantia do código.
 *
 * FALHA SEGURA: nunca se perde trabalho. Um arquivo devolvido que pareça CORTADO
 * (vazio, ou uma fração pequena do que já existia) NÃO substitui o atual — o
 * nome volta em `recusados` e a tela diz. Erra para o lado de não mexer.
 */
export type ArquivoSimples = { nome: string; conteudo: string };

/** Abaixo desta fração do original, um arquivo devolvido é tratado como cortado. */
const FRACAO_MINIMA = 0.25;
/** Abaixo deste tamanho, não há corpo suficiente para julgar "cortado". */
const TAMANHO_MINIMO_PARA_JULGAR = 800;

export function mesclarMudanca(
  atuais: ArquivoSimples[],
  devolvidos: ArquivoSimples[],
): { arquivos: ArquivoSimples[]; recusados: string[] } {
  // Primeira construção: não há projeto anterior — o que veio É o projeto.
  if (!atuais.length) return { arquivos: devolvidos, recusados: [] };

  const out = atuais.map((a) => ({ nome: a.nome, conteudo: a.conteudo }));
  const recusados: string[] = [];
  for (const d of devolvidos) {
    const nome = (d.nome || "").trim();
    if (!nome) continue;
    const exato = out.findIndex((a) => a.nome === nome);
    const idx = exato >= 0 ? exato : out.findIndex((a) => a.nome.toLowerCase() === nome.toLowerCase());
    // Nome desconhecido = arquivo NOVO pedido pelo pedido. Entra no fim.
    if (idx < 0) {
      out.push({ nome, conteudo: d.conteudo });
      continue;
    }
    const antigo = out[idx].conteudo;
    const novo = d.conteudo;
    const vazio = !novo.trim();
    const cortado =
      antigo.length >= TAMANHO_MINIMO_PARA_JULGAR &&
      novo.length < Math.floor(antigo.length * FRACAO_MINIMA);
    if (vazio || cortado) {
      recusados.push(out[idx].nome);
      continue;
    }
    out[idx] = { nome: out[idx].nome, conteudo: novo };
  }
  return { arquivos: out, recusados };
}
