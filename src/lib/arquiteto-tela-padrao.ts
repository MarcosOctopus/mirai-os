/**
 * A TELA PADRÃO — o que aparece no lugar de um projeto que não tem página.
 *
 * POR QUE EXISTE (dono, 16/10/2026): *"vamos preparar uma tela padrão com algo de
 * modelo de visualização pra ficar no espaço no lugar de um erro ou página
 * aleatória."*
 *
 * O problema era real e medido: um repositório IMPORTADO (flowise, justy) não tem
 * `index.html`, e a prévia caía no PRIMEIRO arquivo da lista — a miniatura do
 * projeto virava um pedaço de JSON (`.changeset/config.json`). Nada pior que um
 * espaço que parece defeito.
 *
 * Esta tela não é um erro: ela DIZ o que o projeto é. Sem página, mas com
 * identidade — nome, quanto código tem, e com o que ele é feito. É um retrato do
 * projeto, não uma desculpa.
 *
 * PURO: só monta string. Nada de rede, nada de Node — roda no servidor e no
 * cliente igual (a página pública usa a mesma).
 */

export type RetratoDoProjeto = {
  titulo: string;
  arquivos: number;
  /** A stack detectada a partir dos arquivos ("Node", "pnpm", "TypeScript"…). */
  marcas: string[];
  /** É um projeto trazido de fora (git/servidor) ou construído aqui? */
  deFora?: boolean;
  /** Link do repositório, quando houver. */
  repositorio?: string | null;
  /**
   * O que FALTA para o projeto virar app (ex.: "ainda não foi publicado").
   *
   * POR QUE EXISTE (dono, 19/10/2026): a prévia de um projeto de SERVIDOR não
   * publicado mostrava "Aplicação subindo…" — e não havia nada subindo. Quem
   * olhava esperava, e o app nunca aparecia. Tela que promete trabalho que não
   * existe é pior que tela vazia: ela esconde o próximo passo.
   */
  aviso?: string;
  /** O endereço onde ele vai ficar, quando já se sabe. */
  endereco?: string | null;
};

/** Escapa o que vai para dentro do HTML (o título vem do repositório). */
function esc(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Detecta a stack pelos arquivos do projeto — é o que dá CARA à tela.
 * Casa por nome de arquivo, que é o sinal mais estável (versão de dependência
 * muda; a presença de `pnpm-lock.yaml` não).
 */
export function marcasDoProjeto(arquivos: { nome: string }[]): string[] {
  const tem = (n: string) => arquivos.some((a) => a.nome.toLowerCase() === n.toLowerCase());
  const termina = (s: string) => arquivos.some((a) => a.nome.toLowerCase().endsWith(s));
  const m: string[] = [];

  if (tem("pnpm-lock.yaml") || tem("pnpm-workspace.yaml")) m.push("pnpm");
  else if (tem("yarn.lock")) m.push("yarn");
  else if (tem("package-lock.json")) m.push("npm");
  if (tem("package.json")) m.push("Node");

  if (termina(".ts") || termina(".tsx")) m.push("TypeScript");
  if (tem("tsconfig.json")) m.push("TypeScript");
  if (termina(".py") || tem("requirements.txt") || tem("pyproject.toml")) m.push("Python");
  if (tem("go.mod")) m.push("Go");
  if (tem("Cargo.toml")) m.push("Rust");
  if (tem("composer.json")) m.push("PHP");
  if (tem("Gemfile")) m.push("Ruby");
  if (tem("Dockerfile") || tem("docker-compose.yml")) m.push("Docker");
  if (tem("next.config.js") || tem("next.config.mjs") || tem("next.config.ts")) m.push("Next.js");
  if (tem("vite.config.ts") || tem("vite.config.js")) m.push("Vite");
  if (tem("turbo.json")) m.push("Turbo");

  // Sem repetir, e no máximo 5 — a tela é um retrato, não um inventário.
  return [...new Set(m)].slice(0, 5);
}

/**
 * O HTML da tela padrão. Fundo escuro como o resto do app; nada de vermelho de
 * erro. Um "retrato" do projeto: nome, tamanho e stack.
 */
export function telaPadrao(p: RetratoDoProjeto): string {
  const marcas = p.marcas.length
    ? p.marcas.map((x) => `<span class="m">${esc(x)}</span>`).join("")
    : `<span class="m">código</span>`;

  const repo = p.repositorio
    ? `<a class="repo" href="${esc(p.repositorio)}" target="_blank" rel="noopener">${esc(
        p.repositorio.replace(/^https?:\/\/(www\.)?/, ""),
      )}</a>`
    : "";

  const linha = p.deFora
    ? "trazido de um repositório"
    : "criado aqui no Arquiteto";

  // O aviso é um CAMINHO, não um erro: diz o que falta e para onde vai.
  const aviso = p.aviso
    ? `<p class="aviso">${esc(p.aviso)}${
        p.endereco
          ? ` <span class="end">${esc(p.endereco)}</span>`
          : ""
      }</p>`
    : "";

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.titulo)}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    background: #07070c;
    color: #d8d8e4;
    font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    display: grid; place-items: center; padding: 24px;
    /* Duas luzes baixas: dá profundidade sem competir com o conteúdo. */
    background-image:
      radial-gradient(900px 480px at 50% -10%, rgba(96,120,255,.10), transparent 70%),
      radial-gradient(700px 420px at 50% 115%, rgba(0,200,190,.06), transparent 70%);
  }
  /* Grade fina: o "espaço" nunca é um vazio morto. */
  body::before {
    content: ""; position: fixed; inset: 0; pointer-events: none; opacity: .5;
    background-image:
      linear-gradient(rgba(255,255,255,.022) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,.022) 1px, transparent 1px);
    background-size: 34px 34px;
    mask-image: radial-gradient(circle at 50% 45%, #000 30%, transparent 78%);
    -webkit-mask-image: radial-gradient(circle at 50% 45%, #000 30%, transparent 78%);
  }
  .caixa {
    position: relative; width: min(560px, 100%); text-align: center;
    padding: 34px 30px 30px; border-radius: 18px;
    background: linear-gradient(180deg, rgba(20,20,32,.72), rgba(12,12,20,.62));
    border: 1px solid rgba(255,255,255,.075);
    box-shadow: 0 24px 70px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.045);
    backdrop-filter: blur(3px);
  }
  /* O núcleo: um ponto vivo, não um ícone de alerta. */
  .nucleo {
    width: 62px; height: 62px; margin: 0 auto 18px; border-radius: 50%;
    background: radial-gradient(circle at 50% 50%, #9fb4ff 0%, #4f6bff 42%, rgba(79,107,255,0) 72%);
    box-shadow: 0 0 34px rgba(79,107,255,.42);
    animation: pulsar 3.4s ease-in-out infinite;
  }
  @keyframes pulsar { 0%,100% { transform: scale(1); opacity: .9 } 50% { transform: scale(1.07); opacity: 1 } }
  h1 { margin: 0 0 6px; font-size: 19px; font-weight: 650; letter-spacing: .2px; color: #f2f2f8; }
  .tipo { margin: 0 0 20px; font-size: 13.5px; color: #8b8ba3; }
  .tipo b { color: #a9b6ff; font-weight: 600; }
  .marcas { display: flex; flex-wrap: wrap; gap: 7px; justify-content: center; margin-bottom: 20px; }
  .m {
    font-size: 11.5px; letter-spacing: .4px; text-transform: uppercase;
    padding: 4px 10px; border-radius: 999px; color: #b9c2e6;
    background: rgba(120,140,255,.10); border: 1px solid rgba(120,140,255,.20);
  }
  .rodape {
    display: flex; gap: 10px; justify-content: center; align-items: center;
    padding-top: 16px; border-top: 1px solid rgba(255,255,255,.06);
    font-size: 12.5px; color: #6f6f88;
  }
  .rodape b { color: #cfd4e8; font-weight: 600; }
  /* O aviso: presença calma, não alarme. Diz o que falta, sem vermelho. */
  .aviso {
    margin: 16px auto 0; padding: 10px 14px; max-width: 420px;
    border-radius: 10px; font-size: 13.5px; color: #cfd4e6;
    background: rgba(96,120,255,.10);
    border: 1px solid rgba(120,145,255,.22);
  }
  .aviso .end { display: block; margin-top: 4px; color: #9fb4ff; font-weight: 600; }
  .repo { color: #8fa2ff; text-decoration: none; }
  .repo:hover { text-decoration: underline; }
  @media (prefers-reduced-motion: reduce) { .nucleo { animation: none } }
</style></head>
<body>
  <div class="caixa">
    <div class="nucleo" aria-hidden="true"></div>
    <h1>${esc(p.titulo)}</h1>
    <p class="tipo">Este projeto é <b>código</b> — não tem uma página para mostrar. ${esc(linha)}.</p>
    <div class="marcas">${marcas}</div>
    ${aviso}
    <div class="rodape">
      <span><b>${p.arquivos.toLocaleString("pt-BR")}</b> arquivos</span>
      ${repo ? `<span>·</span>${repo}` : ""}
    </div>
  </div>
</body></html>`;
}
