/**
 * PADRÃO DE E-MAIL DO ECOSSISTEMA (Mirai/Arca).
 *
 * POR QUE UM PADRÃO: e-mail é a única superfície do produto que aparece fora da
 * tela — sem padrão, cada aviso vira um HTML diferente e a marca some. Aqui está
 * o molde único: tabela de 600px, fundo claro (e-mail escuro quebra em Gmail
 * antigo e em Outlook), barra de marca no topo, Poppins com Arial de reserva (a
 * fonte do site não é a da caixa de entrada), UM botão de ação e um rodapé que
 * diz de onde veio e por que chegou.
 *
 * REFERÊNCIA VIVA: a newsletter do Mapa Paper já roda assim em produção
 * (`/opt/data/mapa-paper/newsletter/enviar_newsletter_lote.py`) — este arquivo é a
 * mesma gramática, com a marca do Mirai (#FF751F).
 *
 * REGRA: todo e-mail sai com HTML **e** texto puro. Sem o texto puro, metade dos
 * clientes (e qualquer leitor de tela) fica sem nada.
 */

export const MARCA = {
  cor: "#FF751F", // --dash-brand (255 117 31)
  corForte: "#E6580C", // --dash-brand (tema claro)
  texto: "#111111",
  textoSuave: "#5B5F66",
  fundo: "#FFFFFF",
  fundoSuave: "#F6F7F8",
  linha: "#E6E8EB",
  fonte: "'Poppins',Arial,Helvetica,sans-serif",
} as const;

export type EmailPadrao = {
  /** micro-linha acima do título (ex.: "A ARCA · PASTA COMPARTILHADA") */
  sobretitulo?: string;
  titulo: string;
  /** parágrafos; `destaque` sai maior, para o dado principal (nome da pasta) */
  paragrafos: string[];
  destaque?: string;
  /** o ÚNICO botão. Sem botão, o e-mail não tem gesto. */
  botao?: { rotulo: string; url: string };
  /** segunda saída, em texto (ex.: colar o link no navegador) */
  linkCru?: string;
  rodape: string;
};

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function emailPadrao(e: EmailPadrao): { html: string; texto: string } {
  const paragrafosHtml = e.paragrafos
    .map(
      (p) =>
        `<p style="margin:0 0 14px 0;font-family:${MARCA.fonte};font-size:14.5px;line-height:1.6;color:${MARCA.textoSuave};">${esc(p)}</p>`,
    )
    .join("");

  const destaqueHtml = e.destaque
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px 0;">
        <tr>
          <td style="background-color:${MARCA.fundoSuave};border-left:3px solid ${MARCA.cor};padding:10px 12px;font-family:${MARCA.fonte};font-size:15px;font-weight:700;color:${MARCA.texto};">${esc(e.destaque)}</td>
        </tr>
      </table>`
    : "";

  const botaoHtml = e.botao
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px 0;">
        <tr>
          <td style="background-color:${MARCA.cor};border-radius:10px;">
            <a href="${esc(e.botao.url)}" style="display:inline-block;padding:13px 26px;font-family:${MARCA.fonte};font-size:14px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:10px;">${esc(e.botao.rotulo)}</a>
          </td>
        </tr>
      </table>`
    : "";

  const linkCruHtml = e.linkCru
    ? `<p style="margin:0 0 18px 0;font-family:${MARCA.fonte};font-size:11.5px;line-height:1.5;color:${MARCA.textoSuave};word-break:break-all;">
        se o botão não abrir, cole este endereço no navegador:<br /><span style="color:${MARCA.corForte};">${esc(e.linkCru)}</span>
      </p>`
    : "";

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="color-scheme" content="light" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${esc(e.titulo)}</title>
</head>
<body style="margin:0;padding:0;background-color:${MARCA.fundo};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${MARCA.fundo};">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:${MARCA.fundo};border-collapse:collapse;">
        <tr><td style="height:6px;background-color:${MARCA.cor};font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr>
          <td style="padding:26px 4px 8px 4px;font-family:${MARCA.fonte};font-size:16px;font-weight:800;letter-spacing:1px;color:${MARCA.texto};">
            MIRAI<span style="color:${MARCA.cor};">.</span>
          </td>
        </tr>
        ${
          e.sobretitulo
            ? `<tr><td style="padding:0 4px 6px 4px;font-family:${MARCA.fonte};font-size:9.5px;letter-spacing:2px;text-transform:uppercase;color:${MARCA.textoSuave};">${esc(e.sobretitulo)}</td></tr>`
            : ""
        }
        <tr>
          <td style="padding:0 4px 16px 4px;font-family:${MARCA.fonte};font-size:22px;line-height:1.25;font-weight:800;color:${MARCA.texto};">${esc(e.titulo)}</td>
        </tr>
        <tr><td style="height:1px;background-color:${MARCA.linha};font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr>
          <td style="padding:18px 4px 4px 4px;">
            ${paragrafosHtml}
            ${destaqueHtml}
            ${botaoHtml}
            ${linkCruHtml}
          </td>
        </tr>
        <tr><td style="height:1px;background-color:${MARCA.linha};font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr>
          <td style="padding:14px 4px 26px 4px;font-family:${MARCA.fonte};font-size:11.5px;line-height:1.6;color:${MARCA.textoSuave};">
            ${esc(e.rodape)}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const texto = [
    e.sobretitulo ? e.sobretitulo.toUpperCase() : "",
    e.titulo,
    "",
    ...e.paragrafos,
    e.destaque ? `\n${e.destaque}` : "",
    e.botao ? `\n${e.botao.rotulo}: ${e.botao.url}` : "",
    e.linkCru ? `\nlink direto: ${e.linkCru}` : "",
    "",
    "—",
    e.rodape,
  ]
    .filter((l) => l !== "")
    .join("\n");

  return { html, texto };
}
