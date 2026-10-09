// APONTAR O DOMÍNIO NO CLOUDFLARE — a ação do botão (dono, 09/10/2026).
//
// O que faz, em uma frase: pega a conexão OAuth guardada, acha a zona do domínio
// do projeto e cria (ou corrige) os registros A apontando para a borda — deixando
// em DNS-only, que é o que faz o fluxo andar.
//
// Quem chama: o retorno do consentimento (`/api/oauth/cloudflare/volta`, logo
// depois de o cliente autorizar) e o botão do painel, para tentar de novo.
// Nunca lança: tudo volta como recado em PT-BR para a tela mostrar.
import { dominioPublicoDoProjeto, guardarConexaoCloudflare, tokenCloudflareCifrado } from "./arquiteto-projetos";
import { apontarDominio, zonaParaDominio, zonasDoToken } from "./cloudflare-oauth";
import { IP_DA_BORDA } from "./dominio-projetos";
import { decifrar } from "./segredo-guardado";

export type ResultadoApontar =
  | { ok: true; mensagem: string; zona: string }
  | { ok: false; erro: string };

export async function apontarDominioDoProjeto(projetoId: string): Promise<ResultadoApontar> {
  const p = dominioPublicoDoProjeto(projetoId);
  if (!p) return { ok: false, erro: "Projeto não encontrado." };
  const dominio = (p.dominio || "").toLowerCase();
  if (!dominio) {
    return { ok: false, erro: "Conecte um domínio no projeto primeiro — aí eu crio o registro no Cloudflare." };
  }

  const cifrado = tokenCloudflareCifrado(projetoId);
  const token = decifrar(cifrado);
  if (!token) {
    return { ok: false, erro: "O Cloudflare não está conectado neste projeto (ou a conexão venceu)." };
  }

  const z = await zonasDoToken(token);
  if (!z.ok) return { ok: false, erro: z.erro };

  const zona = zonaParaDominio(z.zonas, dominio);
  if (!zona) {
    return {
      ok: false,
      erro: `O domínio ${dominio} não está nesta conta do Cloudflare (vi: ${z.zonas.map((x) => x.name).join(", ") || "nenhum domínio"}).`,
    };
  }

  // O apex primeiro: é ele que faz o site abrir. O www é bônus — se falhar (ex.:
  // já existe um CNAME ali), o dono fica sabendo sem perder o principal.
  const raiz = await apontarDominio(token, zona.id, dominio, IP_DA_BORDA);
  if (!raiz.ok) return { ok: false, erro: raiz.erro };

  const www = await apontarDominio(token, zona.id, `www.${dominio}`, IP_DA_BORDA);

  guardarConexaoCloudflare(projetoId, cifrado as string, zona.id);

  const partes = [`Registro A de ${dominio} ${raiz.acao} no Cloudflare (DNS-only, apontando para ${IP_DA_BORDA}).`];
  partes.push(
    www.ok
      ? `O www também (${www.acao}).`
      : `O www não deu (${www.erro}) — o principal já está feito.`,
  );
  partes.push("O certificado e o site entram no ar sozinhos em alguns minutos.");
  return { ok: true, mensagem: partes.join(" "), zona: zona.name };
}
