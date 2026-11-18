/* Catálogo DECLARATIVO das integrações do MIRAI OS.
 *
 * Regra da spec (docs/INTEGRACOES-SPEC.md): adicionar/remover uma integração é
 * editar ESTE arquivo — nunca a tela. A tela só lê daqui; o popup de API key
 * monta os campos a partir de `campos`; o "Minhas integrações" e o seletor do
 * chat usam o mesmo `estaLigada()`.
 *
 * Logos: arquivo oficial em /public/integracoes/<id>.svg — o slug do arquivo é
 * EXATAMENTE o `id`. Nada de emoji, nada de ícone improvisado. Quando o arquivo
 * ainda não existe, a tela cai num fallback discreto (a inicial), nunca quebra.
 *
 * Módulo puro (sem hooks, sem "use client"): serve para a tela E para o chat.
 */

export type CategoriaIntegracao = "mirai" | "mensagens" | "essenciais" | "apis" | "media";

export type TipoCampo = "senha" | "texto";

/** Campo do popup de API key. */
export type CampoIntegracao = {
  chave: string;
  rotulo: string;
  tipo: TipoCampo;
  /** dica curta abaixo do campo (onde achar a chave). */
  dica?: string;
  /** default: true. Se false, o campo é opcional. */
  obrigatorio?: boolean;
};

export type Integracao = {
  /** slug exato — mesmo nome do arquivo de logo e, em regra, chave no platform_config. */
  id: string;
  nome: string;
  empresa: string;
  subtitulo: string;
  /** UMA linha honesta do que a integração É, para o cartão (08/10/2026). Sai do
   *  próprio `subtitulo` — não promete nada que a integração não faça. Quando
   *  ausente, o cartão simplesmente não mostra linha (nada é inventado). */
  explicacao?: string;
  tipo: "mcp" | "api";
  categoria: CategoriaIntegracao;
  /** "/integracoes/openai.svg" */
  logo: string;
  /** Cor de FUNDO da área de imagem do card: a cor DOMINANTE do próprio logo,
   *  extraída do arquivo em /public/integracoes (pixels opacos, descartando
   *  branco/quase-branco, preto/quase-preto e cinza sem saturação). Quando o
   *  logo não tem cor real (ele é preto/branco/cinza), cai em COR_PADRAO_CARD.
   *  Tons claros demais para a logo branca ler foram escurecidos até ~3:1. */
  cor?: string;
  /** tipo mcp: onde a integração é feita (abre em nova aba). Sem site = ainda sem destino. */
  site?: string;
  /** tipo api: campos do popup. */
  campos?: CampoIntegracao[];
  /** api via OAuth (Drive/YouTube): o clique abre esta rota, não o popup. */
  oauthPath?: string;
  /** chave real no platform_config quando difere do id (ex.: drive -> google_drive). */
  chaveConfig?: string;
  /** aparece na lista lateral de destaques. */
  destaque?: boolean;
  /** Conexão que NÃO acontece nesta tela. O GitHub, por exemplo, se conecta
   *  DENTRO de um projeto — o OAuth dele exige dizer de qual projeto é
   *  (`/api/oauth/github/iniciar?projeto=<id>`). Quando este campo existe, o
   *  botão do popup leva a `caminho` e a linha explicativa usa `como`; sem ele
   *  o cartão abriria uma autorização que não sabe de qual projeto é. */
  conectaEm?: { caminho: string; como: string };
};

export const CATEGORIAS: { id: CategoriaIntegracao | "todas"; rotulo: string }[] = [
  { id: "todas", rotulo: "Todas" },
  { id: "mirai", rotulo: "Mirai" },
  { id: "mensagens", rotulo: "Mensagens" },
  { id: "essenciais", rotulo: "Essenciais" },
  { id: "apis", rotulo: "APIs" },
  { id: "media", rotulo: "Media" },
];

/** Laranja da marca — fundo padrão da área de imagem quando o logo não tem cor. */
export const COR_PADRAO_CARD = "#ff751f";

const CAMPOS_CHAVE: CampoIntegracao[] = [
  { chave: "key", rotulo: "API key", tipo: "senha", dica: "cole a chave da conta" },
];

export const CATALOGO: Integracao[] = [
  /* ── Mirai (produtos ligados por MCP) ──────────────────────────────── */
  {
    id: "saaso",
    nome: "CRM Saaso",
    empresa: "Mirai",
    subtitulo: "CRM multi-whitelabel no WhatsApp — dado pela credencial da organização",
    explicacao: "CRM no WhatsApp da sua conta.",
    tipo: "mcp",
    categoria: "mirai",
    logo: "/logo-mirai-marca.png",
    /* dominante do logo = o próprio laranja da marca; escurecido p/ 3:1 */
    cor: "#f16e1d",
    site: "https://saaso.miraitohope.com",
    destaque: true,
  },
  {
    id: "arca",
    nome: "Arca",
    empresa: "Mirai",
    subtitulo: "Seu acervo, suas notas e seus arquivos — na organização desta conta",
    explicacao: "A memória da sua organização.",
    /* tipo "api", NUNCA "mcp": card de MCP é só um link para o site do
       fornecedor. Aqui a conexão é de CONTA: um clique cunha o token da
       organização do e-mail da SESSÃO (POST /api/integracoes/arca/conectar) e
       guarda no cofre desta pessoa.
       (dono, 17/11/2026: "sem segundo login e sem erro na cara do cliente".) */
    tipo: "api",
    categoria: "mirai",
    logo: "/integracoes/arca.svg",
    /* laranja da marca escurecido — a logo de traço branca lê a 3:1 sobre ele */
    cor: "#f16e1d",
    /* O caminho que CONECTA (é POST, chamado pelo painel da própria tela — não
       abre aba). `chaveConfig` é a mesma chave onde o token é gravado no cofre,
       e é o que faz o cartão ler "conectada". */
    oauthPath: "/api/integracoes/arca/conectar",
    chaveConfig: "arca",
    destaque: true,
  },
  {
    id: "media-factory",
    nome: "Conteúdo",
    empresa: "Mirai",
    subtitulo: "Produção de conteúdo e publicação — roda dentro do MIRAI OS",
    explicacao: "Produção de conteúdo da sua conta.",
    tipo: "mcp",
    categoria: "mirai",
    logo: "/logo-mirai-marca.png",
    cor: "#f16e1d",
  },

  /* ── Essenciais ────────────────────────────────────────────────────── */
  {
    id: "drive",
    nome: "Google Drive",
    empresa: "Google",
    subtitulo: "Ler o seu Drive e organizar tudo no acervo da Arca",
    explicacao: "Arquivos e pastas do Google, catalogados pela Mirai.",
    tipo: "api",
    categoria: "essenciais",
    logo: "/integracoes/drive.svg",
    cor: "#4285f4",
    // 18/11/2026: era `/api/auth/drive` (escopo `drive.file`, só enxerga o que o próprio app criou,
    // e era o cliente que devolvia `redirect_uri_mismatch`). Agora é o fluxo PRÓPRIO do acervo:
    // leitura de verdade (`drive.readonly`) e refresh token cifrado no cofre DESTA pessoa.
    oauthPath: "/api/oauth/gdrive/iniciar",
    // Mesma chave que /api/oauth/gdrive/volta grava: é ela que faz a conexão aparecer nos DOIS
    // lugares (Synapse e Arca → Fontes) sem nenhuma sincronização extra.
    chaveConfig: "google_drive",
    destaque: true,
  },
  {
    id: "gmail",
    nome: "Google Email",
    empresa: "Google",
    subtitulo: "Ler e enviar email em seu nome (Gmail)",
    explicacao: "Sua caixa de entrada, lida pela Mirai.",
    tipo: "api",
    categoria: "essenciais",
    logo: "/integracoes/google.svg",
    cor: "#ea4335",
    // OAuth de INTEGRAÇÃO (gmail.readonly + gmail.send), não o login do app:
    // /api/auth/google só prova identidade e não dá acesso à caixa.
    oauthPath: "/api/oauth/google/iniciar",
    // Mesma chave que /api/oauth/google/volta grava no cofre da pessoa.
    chaveConfig: "google_email",
    destaque: true,
  },
  {
    id: "youtube",
    nome: "YouTube",
    empresa: "Google",
    subtitulo: "Canal do YouTube: publicação e leitura de vídeos",
    explicacao: "Seu canal do YouTube.",
    tipo: "api",
    categoria: "essenciais",
    logo: "/integracoes/youtube.svg",
    cor: "#ff0000",
    oauthPath: "/api/auth/youtube",
  },
  {
    id: "github",
    nome: "GitHub",
    empresa: "GitHub",
    subtitulo: "Seus repositórios — conecta uma vez e vale para todos os seus projetos",
    explicacao: "Repositórios do seu GitHub.",
    tipo: "api",
    categoria: "essenciais",
    logo: "/integracoes/github.svg",
    /* preto da marca (#24292f): a logo branca lê a 15:1 sobre ele */
    cor: "#24292f",
    /* CONEXÃO ÚNICA DA CONTA (dono, 13/10/2026): *"liberar dentro de integrações
       só pro cara entrar com auth do git dele e já ficar integrado pra tudo"*.
       O clique abre o consentimento do GitHub; na volta o token vai para o cofre
       DESTA conta e vale para todos os projetos dela. `chaveConfig: "github"` é
       o que faz a tela ler "conectada" — a mesma chave onde o token é gravado. */
    oauthPath: "/api/oauth/github/iniciar",
    chaveConfig: "github",
    destaque: true,
  },
  /* ── Mensagens ─────────────────────────────────────────────────────── */
  {
    id: "telegram",
    nome: "Telegram",
    empresa: "Telegram",
    subtitulo: "Seu bot no Telegram — token do @BotFather, na credencial desta conta",
    explicacao: "Seu bot no Telegram.",
    tipo: "api",
    categoria: "mensagens",
    logo: "/integracoes/telegram.svg",
    /* dominante #26a5e4 escurecido (fator .959) p/ a logo branca ler a 3:1 */
    cor: "#249edb",
    campos: [
      { chave: "token", rotulo: "Token do bot", tipo: "senha", dica: "fale com o @BotFather" },
    ],
    destaque: true,
  },
  {
    id: "whatsapp",
    nome: "WhatsApp",
    empresa: "Meta",
    subtitulo: "Seu WhatsApp — número e credencial da instância, só desta conta",
    explicacao: "Seu número de WhatsApp.",
    tipo: "api",
    categoria: "mensagens",
    logo: "/integracoes/whatsapp.svg",
    /* verde da marca #25d366 escurecido (fator .855) p/ a logo branca ler a 3:1 */
    cor: "#20b458",
    campos: [
      { chave: "numero", rotulo: "Número", tipo: "texto", dica: "com DDI e DDD, só dígitos" },
      {
        chave: "token",
        rotulo: "Credencial da instância",
        tipo: "senha",
        dica: "o que o CRM da sua conta gera para conectar o número",
      },
    ],
    destaque: true,
  },
  {
    id: "instagram",
    nome: "Instagram",
    empresa: "Meta",
    subtitulo: "Conta do Instagram — publicações e métricas do perfil",
    explicacao: "Sua conta do Instagram.",
    tipo: "api",
    categoria: "essenciais",
    logo: "/integracoes/instagram.svg",
    cor: "#ff0069",
    campos: [
      { chave: "token", rotulo: "Token de acesso", tipo: "senha", dica: "token de longa duração da conta" },
    ],
  },

  /* ── APIs (provedores) ─────────────────────────────────────────────── */
  {
    id: "verboo",
    nome: "Verboo",
    empresa: "Verboo",
    subtitulo: "Modelos de linguagem — o principal do chat da Mirai",
    explicacao: "Modelos de linguagem do chat.",
    tipo: "api",
    categoria: "apis",
    logo: "/integracoes/verboo.png",
    cor: "#ad34fe",
    campos: CAMPOS_CHAVE,
  },
  {
    id: "openai",
    nome: "OpenAI",
    empresa: "OpenAI",
    subtitulo: "Modelos de linguagem e geração de imagem",
    explicacao: "Modelos da OpenAI, texto e imagem.",
    tipo: "api",
    categoria: "apis",
    logo: "/integracoes/openai.svg",
    cor: COR_PADRAO_CARD, // logo preto/branco: sem cor -> laranja da marca
    campos: CAMPOS_CHAVE,
    destaque: true,
  },
  {
    id: "google",
    nome: "Google Gemini",
    empresa: "Google",
    subtitulo: "Modelos Gemini — reserva do chat e visão",
    explicacao: "Modelos Gemini, chat e visão.",
    tipo: "api",
    categoria: "apis",
    logo: "/integracoes/google.svg",
    cor: "#8e75b2",
    campos: CAMPOS_CHAVE,
  },
  {
    id: "openrouter",
    nome: "OpenRouter",
    empresa: "OpenRouter",
    subtitulo: "Roteador de modelos — acesso a Claude e outros",
    explicacao: "Vários modelos, um roteador.",
    tipo: "api",
    categoria: "apis",
    logo: "/integracoes/openrouter.svg",
    cor: COR_PADRAO_CARD, // logo cinza-slate: sem cor -> laranja da marca
    campos: CAMPOS_CHAVE,
  },
  {
    id: "groq",
    nome: "Groq",
    empresa: "Groq",
    subtitulo: "Inferência rápida de modelos abertos",
    explicacao: "Modelos abertos, resposta rápida.",
    tipo: "api",
    categoria: "apis",
    logo: "/integracoes/groq.svg",
    cor: "#f43e01",
    campos: CAMPOS_CHAVE,
  },
  {
    id: "elevenlabs",
    nome: "ElevenLabs",
    empresa: "ElevenLabs",
    subtitulo: "Síntese de voz de alta qualidade",
    explicacao: "Voz sintetizada de alta qualidade.",
    tipo: "api",
    categoria: "apis",
    logo: "/integracoes/elevenlabs.svg",
    cor: COR_PADRAO_CARD, // logo branco: sem cor -> laranja da marca
    campos: CAMPOS_CHAVE,
  },
  {
    id: "picovoice",
    nome: "Picovoice",
    empresa: "Picovoice",
    subtitulo: "Wake word e voz no navegador (Hey Mirai)",
    explicacao: "Palavra de ativação \"Hey Mirai\".",
    tipo: "api",
    categoria: "apis",
    logo: "/integracoes/picovoice.png",
    cor: "#377dff",
    campos: [
      { chave: "key", rotulo: "AccessKey", tipo: "senha", dica: "chave do console Picovoice" },
    ],
  },

  /* ── Media ─────────────────────────────────────────────────────────── */
  {
    id: "canva",
    nome: "Canva",
    empresa: "Canva",
    subtitulo: "Design e templates por MCP",
    explicacao: "Design e templates, por MCP.",
    tipo: "mcp",
    categoria: "media",
    logo: "/integracoes/canva.svg",
    /* dominante #08bace escurecido (fator .884) p/ a logo branca ler a 3:1 */
    cor: "#07a4b6",
    site: "https://www.canva.com",
    destaque: true,
  },
  {
    id: "figma",
    nome: "Figma",
    empresa: "Figma",
    subtitulo: "Design de interface por MCP",
    explicacao: "Design de interface, por MCP.",
    tipo: "mcp",
    categoria: "media",
    logo: "/integracoes/figma.svg",
    cor: "#f24e1e",
    site: "https://www.figma.com",
  },
  {
    id: "higgsfield",
    nome: "Higgsfield",
    empresa: "Higgsfield",
    subtitulo: "Geração de imagem e vídeo",
    explicacao: "Geração de imagem e vídeo.",
    tipo: "api",
    categoria: "media",
    logo: "/integracoes/higgsfield.svg",
    /* dominante #b9d949 (amarelo-esverdeado) escurecido (fator .729) p/ 3:1 */
    cor: "#879e35",
    campos: [
      { chave: "key", rotulo: "API key", tipo: "senha" },
      { chave: "secret", rotulo: "Secret", tipo: "senha", obrigatorio: false },
    ],
    destaque: true,
  },
  {
    id: "suno",
    nome: "Suno",
    empresa: "Suno",
    subtitulo: "Geração de música e trilha",
    explicacao: "Música e trilha sonora.",
    tipo: "api",
    categoria: "media",
    logo: "/integracoes/suno.svg",
    cor: COR_PADRAO_CARD, // logo branco: sem cor -> laranja da marca
    campos: CAMPOS_CHAVE,
  },
  {
    id: "magnific",
    nome: "Magnific",
    empresa: "Magnific",
    subtitulo: "Upscale e refino de imagem",
    explicacao: "Amplia e refina imagens.",
    tipo: "api",
    categoria: "media",
    logo: "/integracoes/magnific.svg",
    cor: COR_PADRAO_CARD, // logo branco: sem cor -> laranja da marca
    campos: CAMPOS_CHAVE,
  },
  {
    id: "kling",
    nome: "Kling",
    empresa: "Kling",
    subtitulo: "Geração de vídeo",
    explicacao: "Geração de vídeo.",
    tipo: "api",
    categoria: "media",
    logo: "/integracoes/kling.png",
    cor: COR_PADRAO_CARD, // logo branco/cinza: sem cor -> laranja da marca
    campos: [
      { chave: "access_key", rotulo: "Access key", tipo: "senha" },
      { chave: "secret_key", rotulo: "Secret key", tipo: "senha", obrigatorio: false },
    ],
  },
];

/* ── Leitura de estado (uma regra só, usada pela tela e pelo chat) ────── */

function entrada(
  config: Record<string, unknown> | null | undefined,
  chave: string,
): Record<string, unknown> | null {
  const v = (config ?? {})[chave];
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

/** A integração está ligada para esta conta? Nunca estima: só olha o que existe. */
export function estaLigada(
  integracao: Integracao,
  config: Record<string, unknown> | null | undefined,
): boolean {
  const chave = integracao.chaveConfig ?? integracao.id;
  const v = entrada(config, chave);
  /* MULTI-CONTA DE EMAIL (13/11/2026): o Gmail passou a gravar uma LISTA
     (`google_emails`) — uma entrada por caixa conectada. O cofre antigo
     (`google_email`, objeto único) continua valendo para quem conectou antes.
     Sem este ramo, quem conecta pelo fluxo novo vê o cartão "não conectada"
     com o token gravado: a tela mentindo contra o banco. */
  if (!v && chave === "google_email") {
    const lista = (config ?? {}).google_emails;
    return (
      Array.isArray(lista) &&
      lista.some((x) => x && typeof (x as Record<string, unknown>).blob === "string" && (x as Record<string, unknown>).blob)
    );
  }
  if (!v) return false;
  // YouTube só conta como ligado quando o canal foi lido (mesma regra do painel).
  if (chave === "youtube") return Boolean(v.channel) || Boolean(v.access_token);
  return true;
}

/** Quando a credencial foi gravada (ISO) ou null. */
export function quandoLigou(
  integracao: Integracao,
  config: Record<string, unknown> | null | undefined,
): string | null {
  const chave = integracao.chaveConfig ?? integracao.id;
  const v = entrada(config, chave);
  if (!v && chave === "google_email") {
    // Mesma razão do `estaLigada`: a data da primeira caixa conectada.
    const lista = (config ?? {}).google_emails;
    if (Array.isArray(lista)) {
      for (const item of lista) {
        const c = item as Record<string, unknown>;
        if (typeof c?.connected_at === "string" && c.connected_at) return c.connected_at;
      }
    }
    return null;
  }
  const quando = v?.connected_at;
  return typeof quando === "string" ? quando : null;
}

/** Todas as integrações ligadas por esta conta (qualquer tipo). */
export function ligadasDaConta(
  config: Record<string, unknown> | null | undefined,
): Integracao[] {
  return CATALOGO.filter((i) => estaLigada(i, config));
}

/**
 * SELETOR DO CHAT: devolve só as APIs ligadas por esta conta.
 * MCP nunca entra aqui (não é chamada direta); integração sem credencial também não.
 * O chat importa daqui — não reimplementa a regra.
 */
export function apisLigadasDaConta(
  config: Record<string, unknown> | null | undefined,
): Integracao[] {
  return CATALOGO.filter((i) => i.tipo === "api" && estaLigada(i, config));
}
