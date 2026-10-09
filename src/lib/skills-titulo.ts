/*
 * SKILLS — NOME HUMANO e DESCRIÇÃO LIMPA (pedido do dono, 08/10/2026).
 *
 *   "os cards, assim como a descrição ... todos os títulos bem formatados, não
 *    aquele tipo de título estranho ... quero um app profissional."
 *   Ajuste do dono: "give a name according to the explanation of what she does"
 *   — o nome sai do QUE A SKILL FAZ (a descrição real), não de um title-case cego.
 *
 * O problema: as skills do ecossistema têm como nome um SLUG (`mirai-os-app`,
 * `geo-aeo-optimization`, `apple-notes`) — no cartão isso parece rascunho.
 *
 * O QUE ESTE ARQUIVO FAZ (só EXIBIÇÃO):
 *   • `nomeDaSkill(nome, descricao)` devolve um NOME de gente para o cartão.
 *   • `descricaoLimpa(desc)` ajeita a descrição para leitura.
 * O `nome` guardado NÃO muda: a busca, a API e o `usar como base` continuam
 * casando o valor original (skills-temas.ts inclui TAMBÉM o nome humano no
 * texto de busca — assim "apple-notes" E "Apple Notes" acham a mesma skill).
 *
 * COMO O NOME É DERIVADO (nesta ordem; nada é inventado):
 *   1. NOMES      — tabela CURADA (slug -> nome). Eu li a DESCRIÇÃO real de cada
 *                   skill e escrevi um nome fiel ao que ela FAZ, no idioma do
 *                   original (ex.: `franky` -> "Franky (full-stack mega-agent)";
 *                   `mirai-os-app` -> "Mirai OS (shell, chat e orb)"). Só entra
 *                   aqui o que a descrição sustenta — nada de capacidade nova.
 *   2. JÁ HUMANO  — nome com espaço, parêntese ou maiúscula ("Get Shit Done
 *                   (GSD)", "Resumo de reunião") volta INTACTO.
 *   3. SLUG       — para os slugs que JÁ são um nome fiel em palavras (o próprio
 *                   dono deu "apple-notes" -> "Apple Notes" como aceitável),
 *                   parte em `-`/`_`, capitaliza cada palavra, mantém SIGLAS em
 *                   caixa alta (GEO, AEO, SEO, CRM, MCP, API, UI, UX, CLI,
 *                   OAuth, OS, SaaS, LGPD, ASCII, LLM, ESP32...) e minúsculas os
 *                   conectores do meio (`de`, `do`, `no`, `and`, `to`).
 *
 * HONESTIDADE: não traduz, não acrescenta acento e não inventa. `decisao-tipada`
 * vira "Decisao Tipada" (sem cedilha) — é o que o slug realmente diz.
 */

/** Siglas e grafias de caixa fixa — por PALAVRA (etapa 3, o slug comum). */
const SIGLAS: Record<string, string> = {
  geo: "GEO",
  aeo: "AEO",
  seo: "SEO",
  crm: "CRM",
  mcp: "MCP",
  api: "API",
  ui: "UI",
  ux: "UX",
  cli: "CLI",
  oauth: "OAuth",
  os: "OS",
  http: "HTTP",
  https: "HTTPS",
  saas: "SaaS",
  lgpd: "LGPD",
  ascii: "ASCII",
  llm: "LLM",
  llms: "LLMs",
  vllm: "vLLM",
  gpu: "GPU",
  url: "URL",
  json: "JSON",
  html: "HTML",
  sql: "SQL",
  oidc: "OIDC",
  jwt: "JWT",
  sdk: "SDK",
  vps: "VPS",
  ota: "OTA",
  s3: "S3",
  esp32: "ESP32",
  ml: "ML",
  qa: "QA",
  sso: "SSO",
  dns: "DNS",
  ai: "AI",
  gif: "GIF",
  pdf: "PDF",
  docx: "DOCX",
  xlsx: "XLSX",
  pwa: "PWA",
  dom: "DOM",
  ocr: "OCR",
  sdlc: "SDLC",
  pr: "PR",
  github: "GitHub",
  nextjs: "Next.js",
  youtube: "YouTube",
  powerpoint: "PowerPoint",
  comfyui: "ComfyUI",
  touchdesigner: "TouchDesigner",
  opencode: "OpenCode",
  openhue: "OpenHue",
  arxiv: "arXiv",
};

/**
 * NOMES CURADOS (slug -> nome exibido), derivados da DESCRIÇÃO REAL de cada
 * skill (lida do frontmatter). É a superfície de curadoria: acrescentar um nome
 * aqui é o único lugar a mexer quando uma skill nova precisar de nome melhor.
 */
const NOMES: Record<string, string> = {
  /* ── skills da CONTA, com descrição PT-BR ── */
  "mirai-os-app": "Mirai OS (shell, chat e orb)",

  /* ── ecossistema: marca que o slug esconde ── */
  imessage: "iMessage (messages/SMS)",
  findmy: "Find My (devices and AirTags)",
  comfyui: "ComfyUI (image, video and audio)",
  opencode: "OpenCode (delegate coding)",
  openhue: "OpenHue (Philips Hue lights)",
  codex: "Codex (delegate coding)",
  franky: "Franky (full-stack mega-agent)",
  "llama-cpp": "llama.cpp (local GGUF inference)",
  "huggingface-hub": "Hugging Face Hub (models and datasets)",
  "touchdesigner-mcp": "TouchDesigner MCP (real-time visuals)",
  p5js: "p5.js (generative sketches)",

  /* ── ecossistema: slug de uma palavra só, que nada diz sozinho ── */
  godmode: "GODMODE (LLM jailbreak)",
  obliteratus: "OBLITERATUS (remove LLM refusals)",
  heartmula: "HeartMuLa (Suno-style song generation)",
  songsee: "Songsee (audio spectrograms)",
  xurl: "X/Twitter (via xurl CLI)",
  himalaya: "Himalaya (IMAP/SMTP email)",
  yuanbao: "Yuanbao (groups)",
  blogwatcher: "Blogwatcher (blogs and RSS)",
  polymarket: "Polymarket (markets and prices)",
  dogfood: "Dogfood (exploratory QA of web apps)",
  spike: "Spike (throwaway experiments)",
  plan: "Plan (markdown plan, no execution)",
  sketch: "Sketch (throwaway HTML mockups)",
  pretext: "Pretext (browser typography demos)",
  "computer-use": "Computer Use (drive the desktop)",
  humanizer: "Humanizer (strip AI-isms)",

  /* ── ecossistema: junções que a descrição desfaz ── */
  "design-md": "Design MD (DESIGN.md token spec)",
  "saaso-uilocal-proof": "Saaso UI Local Proof (visual UI proof)",

  /* ── dois pares de siglas vizinhas que o dono lê com barra ── */
  "geo-aeo-optimization": "GEO/AEO Optimization",
  "seo-geo-nextjs": "SEO/GEO Next.js",

  /* ── arquiteto-craft: a BIBLIOTECA DO ARQUITETO (08/10/2026) ──
     Nomes escritos a partir do QUE a skill FAZ (a descrição real de cada
     SKILL.md), no idioma do original — é o nome que aparece no card e na busca. */
  "arquiteto-padrao-de-construcao": "Padrão do Arquiteto (app do zero)",
  "arquiteto-design-de-interface": "Design de Interface",
  "arquiteto-frontend-senior": "Front-end Sênior",
  "arquiteto-backend-e-dados": "Back-end e Dados",
  "arquiteto-bibliotecas-confiaveis": "Bibliotecas Confiáveis",
};

/** Conectores que, no MEIO do título, ficam minúsculos (português + inglês). */
const CONECTORES = new Set([
  "de", "da", "do", "das", "dos", "e", "em", "no", "na", "nos", "nas",
  "para", "por", "com", "and", "of", "to", "the", "in", "on", "for",
]);

/**
 * Título derivado SÓ do slug (etapa 3). Nunca traduz, nunca inventa, nunca
 * acrescenta caractere que não esteja no próprio nome. Só EXIBIÇÃO.
 */
export function tituloDaSkill(nome: string): string {
  const bruto = (nome || "").trim();
  if (!bruto) return "";

  const chave = bruto.toLowerCase();
  if (NOMES[chave]) return NOMES[chave];

  // Nome já escrito à mão (espaço, parêntese ou maiúscula): não mexe.
  if (/\s/.test(bruto) || /[()]/.test(bruto) || /[A-ZÀ-Ý]/.test(bruto)) return bruto;

  const tokens = bruto.split(/[-_]+/).filter(Boolean);
  return tokens
    .map((t, i) => {
      const k = t.toLowerCase();
      if (SIGLAS[k]) return SIGLAS[k];
      if (i > 0 && CONECTORES.has(k)) return k;
      return k.charAt(0).toUpperCase() + k.slice(1);
    })
    .join(" ");
}

/**
 * NOME humano de uma skill para o cartão/detalhe. A descrição entra como
 * contexto (o nome curado foi escrito a partir DELA); a assinatura é explícita
 * para deixar claro que o nome depende do que a skill FAZ, não só do slug.
 */
export function nomeDaSkill(nome: string, _descricao?: string | null): string {
  const bruto = (nome || "").trim();
  if (!bruto) return "";
  const chave = bruto.toLowerCase();
  return NOMES[chave] ?? tituloDaSkill(bruto);
}

/**
 * Descrição limpa para exibição: espaços colapsados e pontuação-final de ruído
 * removida. NÃO reescreve o sentido e NÃO inventa texto — uma descrição
 * ausente continua ausente (`null`), e a tela segue dizendo isso.
 */
export function descricaoLimpa(descricao: string | null | undefined): string | null {
  if (descricao == null) return null;
  const t = descricao.replace(/\s+/g, " ").trim();
  if (!t) return null;
  // remove sujeira no fim (espaços, dois-pontos, ponto-e-vírgula, travessões),
  // preservando o ponto final de verdade (.).
  return t.replace(/[\s:;,–—-]+$/, "").trim() || t;
}
