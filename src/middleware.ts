// 🛡️ Mirai OS Middleware — Edge Runtime Compatible
// No Node.js native modules or better-sqlite3 imports allowed
//
// ─── REGRA (30/09/2026): /api/* É FECHADO POR PADRÃO ───────────────
// Antes: a regra 3 mandava "tudo que não está na lista → passa". Então toda rota
// nova NASCIA aberta — e /api/chat, /api/tts, /api/stt (as que gastam chave do
// dono) ficaram acessíveis para qualquer um na internet. Medido: POST vazio
// devolvia 400/502 em vez de 401, e /api/chat lê GOOGLE/OPENROUTER/VERBOO keys.
// Agora só é público o que existe para ENTRAR (/api/auth). O resto exige sessão.
import { jwtVerify } from 'jose';
import { NextRequest, NextResponse } from 'next/server';
import { slugDoHost } from '@/lib/dominio-projetos';

const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback');

// ─── PUBLIC PATHS (no auth needed) ────────────────────────────────
const PUBLIC_PATHS = [
  '/api/auth', // entrar/sair: login, register, oauth — precisam ser públicas
  // PONTE CRM → MIRAI OS: o CRM chama isto server-to-server, SEM sessão de
  // navegador. A porta aqui é o SEGREDO compartilhado (`x-mirai-ponte` vs
  // `MIRAI_PONTE_SECRET`), conferido DENTRO da rota em tempo constante. Sem
  // esta linha, o middleware fecharia a rota antes do segredo — a ponte nunca
  // funcionaria. Só ESTA rota é aberta; `/api/integracoes` segue fechada.
  '/api/integracoes/ponte',
  // AGENDADOR (13/11/2026): o cron do host não tem sessão de usuário. Esta
  // rota se protege sozinha com `x-agendador-segredo` — abrir no middleware é
  // necessário só para o pulso passar; sem o segredo ela devolve 401.
  '/api/agendador/rodar',
  // FILA DA ÚLTIMA MILHA DO DOMÍNIO (dono, 09/10/2026): quem chama é o serviço da
  // BORDA (`mirai-publica-dominio`, systemd, root) — sem sessão de navegador. A
  // porta aqui é o SEGREDO compartilhado (`x-mirai-fila` vs `MIRAI_FILA_SECRET`),
  // conferido DENTRO de cada rota em tempo constante (ver `fila-do-dominio.ts`).
  // Sem o segredo, as rotas respondem 401 — "públicas" só no middleware.
  '/api/dominio',
  // CONSENTIMENTO DO CLOUDFLARE (dono, 09/10/2026 — o botão "Conectar com
  // Cloudflare"): o cliente sai do nosso site para autorizar e volta. Sem
  // sessão de navegador — quem autoriza é o BILHETE assinado (cookie httpOnly,
  // `cloudflare-oauth.ts`) e o token do domínio, conferidos DENTRO das rotas.
  '/api/oauth/cloudflare',
  // PONTE DAS INTEGRAÇÕES (dono, 09/10/2026): o SITE PUBLICADO (site estático
  // gerado pelo Arquiteto) chama isto para falar com o provedor usando a
  // credencial DA CONTA — ele NÃO tem cookie de sessão. A autorização é o TOKEN
  // assinado, escopado ao par (projeto, integração), conferido DENTRO da rota
  // (`ponte-token.ts`) — nunca a sessão. Sem token válido (nem sessão dona), a
  // rota responde 401. "Pública" só no middleware, para o pedido chegar à rota.
  '/api/ponte',
  // CONSENTIMENTO DO GITHUB (dono, 09/10/2026 — o botão "Conectar com GitHub"):
  // mesmo desenho do Cloudflare — o cliente sai do nosso site para autorizar e
  // volta. Sem sessão de navegador: quem autoriza é o BILHETE assinado (cookie
  // httpOnly, `github-oauth.ts`) e o token do domínio, conferidos DENTRO das rotas.
  '/api/oauth/github',
  // CONSENTIMENTO DO CANVA (dono, 19/10/2026 — "cada pessoa na própria conta"):
  // mesmo desenho do GitHub. O cliente sai do nosso site, autoriza no Canva e
  // volta; quem autoriza é o BILHETE assinado (cookie httpOnly, `canva-oauth.ts`)
  // conferido DENTRO da rota — nunca a sessão. Sem isto o callback toma 401 e a
  // conexão nunca se completa (medido 19/10/2026: volta respondia 401).
  '/api/oauth/canva',
  // CONVITE DE PASTA COMPARTILHADA (11/11/2026): quem recebeu o link não tem
  // conta. A credencial é o TOKEN na própria URL, e quem decide o que ele vê é
  // a ARCA (concessão por pasta) — a página só desenha o que ela devolver.
  // Sem esta linha o middleware mandaria o convidado para /login e o link
  // nunca funcionaria.
  '/convite',
  // O PEDIDO DE NOVO LINK da tela de convite (11/11/2026): quem está ali não tem
  // conta — o pedido chega à rota, que fala com a Arca usando o token do Core.
  // Sem esta linha o clique levava 401 e o botão parecia quebrado.
  '/api/convite',
  '/login',
  '/register',
  '/limite', // tela de teto do plano: precisa aparecer de qualquer jeito
  '/_next/static',
  '/_next/image',
  '/favicon.ico',
  '/manifest.json',
  '/sw.js',
  '/icons',
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

// ─── PROTECTED PATHS (need valid token) ───────────────────────────
// '/' = a presença (orb + conversa). É o MODO CONVERSA: entra-se por dentro,
// depois do painel — não é porta de rua.
const PROTECTED_PATHS = ['/dashboard', '/system', '/chat', '/admin', '/', '/projetos', '/arquiteto', '/explorar'];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATHS.some((p) =>
    p === '/' ? pathname === '/' : pathname.startsWith(p),
  );
}

// ─── SO O DONO (01/10/2026) ───────────────────────────────────────
// Medido em 01/10: QUALQUER conta logada lia /api/system, /api/pipeline,
// /api/config e o CRM do dono. Regra do dono, na letra: "cada pessoa tem a
// sua conta, e essa conta é só para ela" — organizacao por organizacao.
// Aqui fica a trava central: rota nova ja nasce fechada para nao-dono.
// O DONO TEM MAIS DE UMA IDENTIDADE (correção 14/10/2026). A lista vive aqui
// repetida DE PROPÓSITO: o middleware roda antes do runtime Node e não pode
// importar `lib/orgs.ts` (que carrega better-sqlite3). Mantenha as duas iguais.
// Efeito medido de ter só uma: entrando pela outra conta, o dono era tratado
// como não-dono — as rotas de admin fechavam e o chat parava de consultar a Arca.
const OWNER_EMAILS = [
  ...(process.env.MIRAI_OWNER_EMAIL || '').split(','),
  'marcospaulonascimentoguimaraes@gmail.com',
  'marcos@speach.studio',
]
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const OWNER_ONLY_API = [
  '/api/system',
  '/api/pipeline',
  '/api/config',
  '/api/admin',
  '/api/media-factory/channels',
  '/api/media-factory/videos',
];
const OWNER_ONLY_PAGES = ['/system', '/admin'];

function soDono(pathname: string): boolean {
  // webhook tem guarda propria (nao passa por sessao de usuario)
  if (pathname.startsWith('/api/media-factory/webhook')) return false;
  // O ACERVO é de QUEM ESTÁ LOGADO (medido 11/11/2026): com `/api/admin` na lista
  // acima, o cliente levava 403 antes de a rota rodar — o "acervo por pessoa"
  // existia no código e não existia no produto. A própria rota exige a sessão
  // (exigirConta) e resolve a org POR ELA; a leitura do dono em org alheia é
  // auditada em acervo-cross-read.log.
  if (pathname.startsWith('/api/admin/acervo')) return false;
  if (OWNER_ONLY_API.some((p) => pathname.startsWith(p))) return true;
  return OWNER_ONLY_PAGES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

// ─── REQUEST PATH NORMALISATION ───────────────────────────────────
function getPathname(request: NextRequest): string {
  return new URL(request.url).pathname;
}

// ─── TOKEN EXTRACTION ─────────────────────────────────────────────
function extractToken(request: NextRequest): string | null {
  // Try Authorization header first (Bearer token)
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  // Fall back to cookie
  const tokenCookie = request.cookies.get('token')?.value;
  return tokenCookie || null;
}

// ─── TOKEN VERIFICATION ───────────────────────────────────────────
async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as { userId: number; email: string; tenantId?: string };
  } catch {
    return null;
  }
}

// ─── BYTES DE ASSET DO ARQUITETO COM TOKEN ASSINADO (08/10/2026) ─────
// O preview do Arquiteto roda em `sandbox="allow-scripts"` SEM origem: o cookie
// de sessão (SameSite=Lax) NÃO viaja nas requisições de imagem que saem de dentro
// dele — sem esta porta, a imagem do projeto nunca apareceria na prévia.
//
// Aqui NÃO se abre o arquivo: só se deixa PASSAR quem traz um token assinado
// (`?t=`). Quem confere assinatura, validade e o triplo (projeto+caminho+dono) é
// a própria rota de bytes — sem token válido, byte nenhum é servido (404). Toda
// /api/* continua fechada por padrão.
const ROTA_BYTES_ASSET = /^\/api\/arquiteto\/projetos\/[^/]+\/assets\/.+/;

function ehBytesDeAssetAssinado(request: NextRequest): boolean {
  if (!ROTA_BYTES_ASSET.test(getPathname(request))) return false;
  const t = new URL(request.url).searchParams.get('t');
  return typeof t === 'string' && t.length >= 20;
}

// ─── MIDDLEWARE ───────────────────────────────────────────────────
export async function middleware(request: NextRequest) {
  const pathname = getPathname(request);
  const isApiRoute = pathname.startsWith('/api/');

  // 0. ENDEREÇO DE PROJETO (dono, 09/10/2026) ───────────────────────────────
  // `nome.miraitohope.com` NÃO é o app: é o SITE de um projeto publicado. Aqui
  // só se REESCREVE o caminho para `/d/<nome>…` — quem decide se aquele nome
  // existe, se está publicado e o que mostrar é a rota (Node, com banco). Sem
  // sessão, sem cookie: o site é público por natureza e quem só vê o site não
  // ganha alcance nenhum ao app (a rota não conhece sessão).
  // Endereço do PRÓPRIO app e hosts locais/IP seguem o caminho normal.
  // ATENÇÃO (bug corrigido, 09/10/2026): `/api/...` NÃO é reescrito. O site do
  // projeto precisa das rotas do app no MESMO domínio (é de lá que vêm os bytes
  // dos assets, com token assinado — a regra 1b). Sem esta condição, o pedido da
  // fonte/imagem virava `/d/<slug>/api/...` e o site publicado ficava sem imagem
  // e sem fonte, em silêncio.
  const projetoDe = slugDoHost(request.headers.get('host'));
  // AS ROTAS DE API DO PRÓPRIO APP (medido, 19/10/2026: TELA BRANCA).
  //
  // O `!isApiRoute` acima foi posto para o site HTML precisar das rotas do
  // Arquiteto (bytes de asset com token assinado) no mesmo domínio. O efeito
  // colateral só apareceu quando o projeto virou um APP DE SERVIDOR de verdade:
  // o Flowise publica `/api/v1/ping`, `/api/v1/settings` — e essas chamadas NÃO
  // eram reescritas para `/d/<slug>`, caíam na regra "`/api/*` fechado por
  // padrão" e tomavam **401**. O HTML e o JS carregavam (200), a API não: a
  // página abria e ficava BRANCA, sem um erro visível.
  //
  // A distinção certa não é "é API?", é "API DE QUEM?":
  //   • `/api/arquiteto/...` é do Arquiteto (assets assinados do site) → fica;
  //   • qualquer outra (`/api/v1/...`, a API do cliente) → vai para o app dele.
  const ehApiDoArquiteto = pathname.startsWith('/api/arquiteto/');
  if (projetoDe && (!isApiRoute || !ehApiDoArquiteto)) {
    const url = request.nextUrl.clone();
    url.pathname = `/d/${projetoDe}${pathname === '/' ? '' : pathname}`;
    return NextResponse.rewrite(url);
  }

  // 1. Public paths → allow through
  if (isPublicPath(pathname)) {
    // 1a. If user is on /login or /register AND has a valid token → redirect to dashboard
    if (pathname === '/login' || pathname === '/register') {
      const token = extractToken(request);
      if (token) {
        const payload = await verifyToken(token);
        if (payload) {
          return NextResponse.redirect(new URL('/dashboard/connect', request.url));
        }
      }
    }
    return NextResponse.next();
  }

  // 1b. BYTES de asset do Arquiteto com token assinado → passa (a rota confere).
  if (ehBytesDeAssetAssinado(request)) {
    return NextResponse.next();
  }

  // 2. Protected paths — E TODA rota de API que não seja pública (fechado por padrão)
  if (isProtectedPath(pathname) || isApiRoute) {
    const token = extractToken(request);
    if (!token) {
      return isApiRoute
        ? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        : NextResponse.redirect(new URL('/login', request.url));
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return isApiRoute
        ? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        : NextResponse.redirect(new URL('/login', request.url));
    }

    // Interno da plataforma: so o dono. Rota de API -> 403; pagina -> painel.
    if (soDono(pathname) && !OWNER_EMAILS.includes((payload.email || '').toLowerCase())) {
      return isApiRoute
        ? NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        : NextResponse.redirect(new URL('/dashboard', request.url));
    }

    // Token is valid — clone request with user info in headers for downstream handlers
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-user-id', String(payload.userId));
    requestHeaders.set('x-user-email', payload.email);
    if (payload.tenantId) {
      requestHeaders.set('x-tenant-id', payload.tenantId);
    }

    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  }

  // 3. O resto (páginas desconhecidas, assets) → passa; quem responde é o Next (404)
  return NextResponse.next();
}

// ─── CONFIG ───────────────────────────────────────────────────────
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|sw.js|manifest.json).*)'],
};
