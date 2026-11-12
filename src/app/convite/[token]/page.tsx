/**
 * CONVITE — a porta de quem recebeu uma pasta compartilhada.
 *
 * O link carrega o token do convidado. A ARCA é quem decide o que ele vê:
 * este arquivo não filtra nada, só mostra o que a Arca devolver. Se o token
 * for revogado, a Arca responde 401/403 e a página diz isso — sem vazar nada.
 *
 * Sem conta, sem login: o token É a credencial, e ele só alcança a pasta
 * concedida (e o que está dentro dela).
 *
 * PADRÃO DASH (11/11/2026): a tela vive FORA da casca (é pública), então ela
 * declara a fonte do padrão na raiz e usa os tokens `dash-*`. E a tela de link
 * morto é tela de ESTADO: marca, frase e botão direto no fundo, SEM caixa —
 * cartão com borda aqui é o que o dono chama de cara de IA.
 */

import type { Metadata } from "next";
import { PedirDeNovo } from "./PedirDeNovo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "pasta compartilhada · A Arca",
  robots: { index: false, follow: false },
};

const ARCA = process.env.ARCA_API_URL || "http://127.0.0.1:8080";
const FONTE = "var(--fonte-poppins), Poppins, system-ui, sans-serif";

type Nota = { path: string; nome: string; titulo?: string };
type No = {
  path: string;
  nome: string;
  total_notas?: number;
  notas?: Nota[];
  subpastas?: No[];
};

async function pedir(token: string, rota: string) {
  try {
    const r = await fetch(`${ARCA}${rota}`, {
      headers: { "X-Arca-Token": token },
      cache: "no-store",
    });
    const d = await r.json().catch(() => ({}));
    return { status: r.status, dados: d as Record<string, unknown> };
  } catch {
    return { status: 0, dados: {} as Record<string, unknown> };
  }
}

/** A marca da casa — o que ele reconhece. Nunca texto nosso no lugar dela. */
function Marca({ altura = 22 }: { altura?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo-mirai.png"
      alt="Mirai"
      style={{ height: altura }}
      className="w-auto max-w-none object-contain"
    />
  );
}

/** As notas de um nó, com as subpastas abaixo — mesmo desenho em todo nível. */
function Ramo({ no, token, nivel }: { no: No; token: string; nivel: number }) {
  return (
    <>
      {nivel > 0 && (
        <p
          className="mt-3 mb-1 flex items-center gap-2 text-[11px] uppercase tracking-[0.08em] text-dash-dim"
          style={{ paddingLeft: nivel * 12 }}
        >
          {no.nome}
        </p>
      )}
      {(no.notas || []).map((n) => (
        <a
          key={n.path}
          href={`/convite/${token}?nota=${encodeURIComponent(n.path)}`}
          className="block truncate rounded-[10px] px-3 py-2 text-[13px] text-dash-muted transition hover:bg-dash-scrim/25 hover:text-dash-fg"
          style={{ marginLeft: nivel * 12 }}
          title={n.path}
        >
          {n.titulo || n.nome}
        </a>
      ))}
      {(no.subpastas || []).map((s) => (
        <Ramo key={s.path} no={s} token={token} nivel={nivel + 1} />
      ))}
    </>
  );
}

export default async function Convite({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ nota?: string }>;
}) {
  const { token } = await params;
  const { nota } = await searchParams;

  const arvore = await pedir(token, "/vault/arvore?com_notas=true");
  const morto = arvore.status === 401 || arvore.status === 403;

  // ── TELA DE ESTADO: sem caixa, direto no fundo ─────────────────────────
  if (morto) {
    return (
      <main
        style={{ fontFamily: FONTE }}
        className="flex min-h-dvh flex-col items-center justify-center bg-dash-bg px-6 text-center text-dash-fg"
      >
        <Marca />
        <h1 className="mt-7 text-[19px] font-semibold leading-snug">este link não vale mais</h1>
        <p className="mt-2.5 max-w-[44ch] text-[13px] leading-relaxed text-dash-muted">
          o acesso foi removido ou o link foi trocado. peça um novo link a quem compartilhou a pasta.
        </p>
        {/* O gesto que faltava: pedir outro link sem sair da tela. */}
        <PedirDeNovo token={token} />
        <a
          href="/login"
          className="mt-3 inline-flex items-center text-[12px] font-medium text-dash-muted transition hover:text-dash-fg"
        >
          ou entrar no Mirai OS
        </a>
      </main>
    );
  }

  if (arvore.status !== 200) {
    return (
      <main
        style={{ fontFamily: FONTE }}
        className="flex min-h-dvh flex-col items-center justify-center bg-dash-bg px-6 text-center text-dash-fg"
      >
        <Marca />
        <h1 className="mt-7 text-[19px] font-semibold leading-snug">não consegui abrir agora</h1>
        <p className="mt-2.5 max-w-[44ch] text-[13px] leading-relaxed text-dash-muted">
          tente de novo em instantes. se continuar, peça um novo link a quem compartilhou.
        </p>
      </main>
    );
  }

  const conteudo = nota ? await pedir(token, `/vault/nota?path=${encodeURIComponent(nota)}`) : null;
  // A ARCA devolve o texto da nota em `corpo` (medido: "corpo", não "conteudo").
  const texto =
    conteudo && conteudo.status === 200
      ? String((conteudo.dados as { corpo?: string }).corpo ?? "")
      : "";
  const tituloDaNota = String((conteudo?.dados as { titulo?: string })?.titulo || "");

  return (
    <main style={{ fontFamily: FONTE }} className="min-h-dvh bg-dash-bg text-dash-fg">
      <div className="mx-auto w-full max-w-[1180px] px-5 py-7 sm:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-dash-hair/[0.10] pb-5">
          <div className="flex items-center gap-3">
            <Marca />
            <span className="text-[12px] text-dash-muted">pasta compartilhada com você</span>
          </div>
          <span className="rounded-full bg-dash-raise px-4 py-[7px] text-[12px] text-dash-muted">
            vista por link · sem conta
          </span>
        </header>

        <div className="mt-6 grid gap-5 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
          <nav className="rounded-[24px] border border-dash-hair/[0.10] bg-dash-card p-3">
            <Ramo no={arvore.dados.arvore as No} token={token} nivel={0} />
          </nav>

          <section className="min-w-0 rounded-[24px] border border-dash-hair/[0.10] bg-dash-card p-6">
            {!nota && (
              <p className="text-[13px] leading-relaxed text-dash-muted">
                escolha uma nota à esquerda. você vê só o que está nesta pasta.
              </p>
            )}
            {nota && conteudo?.status === 200 && (
              <>
                <p className="mb-1 truncate text-[15px] font-semibold text-dash-fg" title={nota}>
                  {tituloDaNota || nota}
                </p>
                <p className="mb-4 truncate text-[11px] uppercase tracking-[0.08em] text-dash-dim">
                  {nota}
                </p>
                {texto ? (
                  <div className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-dash-fg/90">
                    {texto}
                  </div>
                ) : (
                  <p className="text-[13px] text-dash-muted">esta nota está vazia.</p>
                )}
              </>
            )}
            {nota && conteudo?.status !== 200 && (
              <p className="text-[13px] text-dash-muted">esta nota não está disponível para você.</p>
            )}
          </section>
        </div>

        <p className="mt-7 text-[11px] text-dash-dim">acesso por link · só esta pasta</p>
      </div>
    </main>
  );
}
