/* Ícones do padrão Dash (stroke 1.6, 24x24, herdam currentColor).
   Feitos à mão — sem dependência externa, sem os SVGs de template. */

type Props = { className?: string };

const base = "h-[17px] w-[17px] shrink-0";

function Svg({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? base}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export const IconePainel = ({ className }: Props) => (
  <Svg className={className}>
    <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" />
  </Svg>
);

export const IconeAgentes = ({ className }: Props) => (
  <Svg className={className}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 20c0-3 2.5-5.2 5.5-5.2s5.5 2.2 5.5 5.2" />
    <path d="M17 8.5h4M19 6.5v4" />
  </Svg>
);

export const IconeProdutos = ({ className }: Props) => (
  <Svg className={className}>
    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
    <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
  </Svg>
);

export const IconePlanos = ({ className }: Props) => (
  <Svg className={className}>
    <path d="M12 3l8 4-8 4-8-4 8-4z" />
    <path d="M4 12l8 4 8-4M4 16l8 4 8-4" />
  </Svg>
);

export const IconeUsuarios = ({ className }: Props) => (
  <Svg className={className}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 20c0-3 2.5-5.2 5.5-5.2s5.5 2.2 5.5 5.2" />
    <path d="M16 5.2a3 3 0 010 5.6M17.5 14.6c2.3.5 3.9 2.4 3.9 5.4" />
  </Svg>
);

/** A "carinha" de quem não tem foto — o avatar cinza de toda lista de gente.
 *  Aqui é cheia (e não de traço) de propósito: é o desenho que todo mundo
 *  reconhece na hora como "sem foto". Usada no detalhe da skill sem autor. */
export const IconeSemFoto = ({ className }: Props) => (
  <svg viewBox="0 0 40 40" className={className} aria-hidden>
    <circle cx="20" cy="20" r="20" fill="#3b3f46" />
    <circle cx="20" cy="14" r="5.9" fill="#8d929b" />
    <path d="M9.9 32.4c1.1-5.5 5.2-8.5 10.1-8.5s9 3 10.1 8.5z" fill="#8d929b" />
  </svg>
);

export const IconeInfra = ({ className }: Props) => (
  <Svg className={className}>
    <rect x="3" y="4" width="18" height="6" rx="2" />
    <rect x="3" y="14" width="18" height="6" rx="2" />
    <path d="M7 7h.01M7 17h.01" />
  </Svg>
);

export const IconePlug = ({ className }: Props) => (
  <Svg className={className}>
    <path d="M9 3v5M15 3v5" />
    <path d="M6 8h12v3a6 6 0 01-6 6 6 6 0 01-6-6V8z" />
    <path d="M12 17v4" />
  </Svg>
);

export const IconeChat = ({ className }: Props) => (
  <Svg className={className}>
    <path d="M20 15a3 3 0 01-3 3H8l-4 3V6a3 3 0 013-3h10a3 3 0 013 3v9z" />
    <path d="M8 9h8M8 13h5" />
  </Svg>
);

/* O "+" do botão Novo: traço grosso de propósito — é comando, não ornamento. */
export const IconeMais = ({ className }: Props) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.8}
    strokeLinecap="round"
    className={className ?? base}
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconeOrb = ({ className }: Props) => (
  <Svg className={className}>
    <circle cx="12" cy="12" r="4" />
    <ellipse cx="12" cy="12" rx="9.5" ry="4" />
    <ellipse cx="12" cy="12" rx="9.5" ry="4" transform="rotate(60 12 12)" />
    <ellipse cx="12" cy="12" rx="9.5" ry="4" transform="rotate(-60 12 12)" />
  </Svg>
);

export const IconeOrganizacoes = ({ className }: Props) => (
  <Svg className={className}>
    <path d="M4 21V6a2 2 0 012-2h7a2 2 0 012 2v15" />
    <path d="M15 11h3a2 2 0 012 2v8M8 8h3M8 12h3M8 16h3M3 21h18" />
  </Svg>
);

export const IconeSistema = ({ className }: Props) => (
  <Svg className={className}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2 2 2 0 11-4 0 1.7 1.7 0 00-2.9-1.2l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.7 1.7 0 003 15a2 2 0 010-4 1.7 1.7 0 001.2-2.9l-.1-.1a2 2 0 112.8-2.8l.1.1A1.7 1.7 0 009 4.1a2 2 0 014 0 1.7 1.7 0 002.9 1.2l.1-.1a2 2 0 112.8 2.8l-.1.1A1.7 1.7 0 0021 11a2 2 0 010 4z" />
  </Svg>
);

export const IconeBackup = ({ className }: Props) => (
  <Svg className={className}>
    <path d="M21 12a9 9 0 11-3-6.7M21 4v5h-5" />
  </Svg>
);

export const IconeSino = ({ className }: Props) => (
  <Svg className={className}>
    <path d="M18 8a6 6 0 10-12 0c0 6-2 7-2 7h16s-2-1-2-7" />
    <path d="M10.5 20a2 2 0 003 0" />
  </Svg>
);

export const IconeBusca = ({ className }: Props) => (
  <Svg className={className}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4 4" />
  </Svg>
);

export const IconeFiltro = ({ className }: Props) => (
  <Svg className={className}>
    <path d="M4 6h16M7 12h10M10 18h4" />
  </Svg>
);

export const IconeSeta = ({ className }: Props) => (
  <Svg className={className}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);

export const IconeMenu = ({ className }: Props) => (
  <Svg className={className}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);

export const IconeFechar = ({ className }: Props) => (
  <Svg className={className}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

export const IconeCheck = ({ className }: Props) => (
  <Svg className={className}>
    <path d="M20 6L9 17l-5-5" />
  </Svg>
);

export const IconeAlerta = ({ className }: Props) => (
  <Svg className={className}>
    <path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
    <path d="M12 9v4M12 17h.01" />
  </Svg>
);

export const IconeDisco = ({ className }: Props) => (
  <Svg className={className}>
    <ellipse cx="12" cy="6" rx="8" ry="3" />
    <path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
    <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
  </Svg>
);

export const IconeRobo = ({ className }: Props) => (
  <Svg className={className}>
    <rect x="4" y="8" width="16" height="12" rx="3" />
    <path d="M12 4v4M9 14h.01M15 14h.01M9.5 17.5h5" />
  </Svg>
);

export const IconeGrafico = ({ className }: Props) => (
  <Svg className={className}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </Svg>
);

export const IconeRelogio = ({ className }: Props) => (
  <Svg className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.5 2" />
  </Svg>
);

export const IconeCadeado = ({ className }: Props) => (
  <Svg className={className}>
    <rect x="4" y="10" width="16" height="11" rx="2.5" />
    <path d="M8 10V7.5a4 4 0 018 0V10" />
  </Svg>
);

/* ── Canais (traço só, sem cor própria: herdam currentColor) ────────── */

export const IconeNuvem = ({ className }: Props) => (
  <Svg className={className}>
    <path d="M7 18h9.5a3.5 3.5 0 000-7 5.5 5.5 0 00-10.6-1.4A3.8 3.8 0 007 18z" />
  </Svg>
);

export const IconePlay = ({ className }: Props) => (
  <Svg className={className}>
    <rect x="3" y="6" width="18" height="13" rx="3.5" />
    <path d="M11 10.2l3.5 2.3-3.5 2.3v-4.6z" />
  </Svg>
);

export const IconeClipe = ({ className }: Props) => (
  <Svg className={className}>
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </Svg>
);

export const IconeDocumento = ({ className }: Props) => (
  <Svg className={className}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </Svg>
);

export const IconeImagem = ({ className }: Props) => (
  <Svg className={className}>
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="M4 17l4.5-4.2 3.5 3 3-2.6L20 17" />
  </Svg>
);

export const IconeMusica = ({ className }: Props) => (
  <Svg className={className}>
    <path d="M9 18V6.5l9-2V16" />
    <circle cx="6.5" cy="18" r="2.5" />
    <circle cx="15.5" cy="16" r="2.5" />
  </Svg>
);

/* Microfone: corpo + arco de captação + haste. Traço só, herda currentColor
   (o estado de escuta muda a COR pelo CSS do botão, não pelo ícone). */
export const IconeMicrofone = ({ className }: Props) => (
  <Svg className={className}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0" />
    <path d="M12 18v3M9 21h6" />
  </Svg>
);

export const IconeEnviar = ({ className }: Props) => (
  <Svg className={className}>
    <path d="M21 3L3 10.5l6.5 2.2L12 20l3.5-6.5L21 3z" />
  </Svg>
);

/* Seta para CIMA — o botão de ENVIAR redondo do compositor do Arquiteto
   (padrão Figma/GPT imitado só na ESTRUTURA). Traço só, herda currentColor. */
export const IconeSetaCima = ({ className }: Props) => (
  <Svg className={className}>
    <path d="M12 19V5M6.5 10.5L12 5l5.5 5.5" />
  </Svg>
);

export const IconeCamera = ({ className }: Props) => (
  <Svg className={className}>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="3.6" />
    <path d="M16.8 7.2h.01" />
  </Svg>
);

export const IconeFilme = ({ className }: Props) => (
  <Svg className={className}>
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <path d="M8 4v16M16 4v16M3 12h18" />
  </Svg>
);

/* ── Bancada /arquiteto: dispositivos, modos e painéis ──────────────────
   Traço só, herdam currentColor; o estado ativo/inativo muda a COR pelo CSS
   do botão, nunca pelo ícone. Sem emoji, sem cor fixa. */

/* Monitor — preset de largura "Desktop" (largura total). */
export const IconeMonitor = ({ className }: Props) => (
  <Svg className={className}>
    <rect x="2.5" y="4" width="19" height="13" rx="2" />
    <path d="M8.5 21h7M12 17v4" />
  </Svg>
);

/* Tablet — preset de largura "Tablet". */
export const IconeTablet = ({ className }: Props) => (
  <Svg className={className}>
    <rect x="5" y="2.5" width="14" height="19" rx="2.5" />
    <path d="M11 18.3h2" />
  </Svg>
);

/* Celular — preset de largura "Celular" (mobile). */
export const IconeCelular = ({ className }: Props) => (
  <Svg className={className}>
    <rect x="7" y="2" width="10" height="20" rx="2.6" />
    <path d="M10.6 18.4h2.8" />
  </Svg>
);

/* Dispositivos — modo "Responsivo": monitor + celular lado a lado. */
export const IconeDispositivos = ({ className }: Props) => (
  <Svg className={className}>
    <rect x="2" y="4.5" width="13.5" height="9.5" rx="1.8" />
    <path d="M5.5 18h6.5M8.75 14v4" />
    <rect x="16.5" y="9" width="5.5" height="11" rx="1.6" />
    <path d="M18.6 17.6h1.3" />
  </Svg>
);

/* Código — modo "Código": o glifo </>. */
export const IconeCodigo = ({ className }: Props) => (
  <Svg className={className}>
    <path d="M9 8.5L4.5 12 9 15.5" />
    <path d="M15 8.5L19.5 12 15 15.5" />
    <path d="M13.4 6l-2.8 12" />
  </Svg>
);

/* Camadas — painel de camadas da prévia (lê o DOM pela ponte). */
export const IconeCamadas = ({ className }: Props) => (
  <Svg className={className}>
    <path d="M12 3l9 5-9 5-9-5 9-5z" />
    <path d="M3 13l9 5 9-5" />
  </Svg>
);

/* Tokens de design — gota (cor/estilo do projeto). */
export const IconeTokens = ({ className }: Props) => (
  <Svg className={className}>
    <path d="M12 3.2c3.4 3.9 6.2 7.2 6.2 10.6a6.2 6.2 0 01-12.4 0c0-3.4 2.8-6.7 6.2-10.6z" />
  </Svg>
);

/* Blocos — biblioteca de blocos prontos (grade de blocos). */
export const IconeBlocos = ({ className }: Props) => (
  <Svg className={className}>
    <rect x="3" y="3" width="7.5" height="7.5" rx="1.8" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.8" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.8" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.8" />
  </Svg>
);

/* Skills — capacidade/faísca (skills do ecossistema). */
export const IconeSkills = ({ className }: Props) => (
  <Svg className={className}>
    <path d="M11 3.2l1.8 5.1 5.1 1.8-5.1 1.8L11 17l-1.8-5.1L4.1 10.1l5.1-1.8L11 3.2z" />
    <path d="M18 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2z" />
  </Svg>
);

/* Synapse — dois nós ligados por um elo: a ideia de conexão entre pontas (a
   casa das integrações E das skills). Mesmo traço dos demais (herda currentColor). */
export const IconeSynapse = ({ className }: Props) => (
  <Svg className={className}>
    <circle cx="5.4" cy="12" r="2.6" />
    <circle cx="18.6" cy="12" r="2.6" />
    <path d="M8.6 12h2.2M13.2 12h2.2" />
  </Svg>
);

/* Caret — seta fina para baixo: a pílula de MODO do chat (padrão Figma) mostra
   o modo atual e este caret diz que a pílula abre. Traço só, herda currentColor. */
export const IconeCaret = ({ className }: Props) => (
  <Svg className={className}>
    <path d="M6 9.5l6 6 6-6" />
  </Svg>
);
