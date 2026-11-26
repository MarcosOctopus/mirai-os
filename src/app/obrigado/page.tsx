/* OBRIGADO — para onde o Asaas devolve quem pagou (callback.successUrl do link).
 *
 * Dono, 24/11/2026. A promessa desta tela tem de ser EXATA, porque é aqui que a
 * pessoa pode se perder: quem paga pelo link da LP ainda NÃO tem conta. O acesso
 * é liberado pelo e-mail do pagamento — então o pedido é "crie a conta com este
 * mesmo e-mail", e nada de "seu acesso já está liberado" (mentira que gera
 * chamado no dia seguinte).
 *
 * Dono, 25/11/2026: "muito feio essa de obrigado". Refazer no PADRÃO: fundo
 * escuro com luz contida, tudo enquadrado, painel de fumaça, texto com inicial
 * maiúscula e sem travessão.
 *
 * Dono, 26/11/2026: os QUATRO links de pagamento são os mesmos para as duas
 * línguas, então quem compra na página inglesa cai aqui também. A tela passa a
 * responder em inglês quando o pedido vem com `?lang=en` ou quando o navegador
 * pede inglês — sem duplicar página.
 */
import Link from "next/link";
import { headers } from "next/headers";

export const metadata = {
  title: "Pagamento confirmado · Payment confirmed — MIRAI OS",
  description: "Confirme o e-mail do pagamento para o seu plano ligar.",
};

const FONTE = "var(--fonte-poppins), Poppins, system-ui, sans-serif";

// Painel de fumaça: o vidro do login (src/lib/vidro.ts) é branco translúcido porque
// fica sobre FOTO; sobre fundo escuro ele embacia e vira leite. Aqui a lâmina é escura,
// com aresta de luz no topo e sombra funda embaixo.
const PAINEL = {
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.058) 0%, rgba(255,255,255,0.022) 46%, rgba(255,255,255,0.032) 100%)",
  backdropFilter: "blur(18px) saturate(125%)",
  WebkitBackdropFilter: "blur(18px) saturate(125%)",
  boxShadow:
    "inset 0 1px 0 rgba(255,255,255,0.10), inset 0 0 0 1px rgba(255,255,255,0.045), 0 30px 80px rgba(0,0,0,0.55)",
} as const;

const EMAIL = "contato@miraitohope.com";

const TEXTO = {
  pt: {
    selo: "Pagamento confirmado",
    titulo: "Falta um passo para o seu plano ligar",
    resumo:
      "Sua conta é liberada pelo e-mail que você usou no pagamento. Crie a conta ou entre com ele e o plano entra junto.",
    passos: [
      {
        n: "1",
        titulo: "Use o mesmo e-mail do pagamento",
        texto: "É por ele que a gente reconhece o seu plano.",
      },
      {
        n: "2",
        titulo: "Crie a conta ou entre na sua",
        texto: "Se já tem conta, basta entrar por ela.",
      },
      {
        n: "3",
        titulo: "O plano liga sozinho",
        texto: "Sem falar com ninguém, sem esperar aprovação.",
      },
    ],
    criar: "Criar minha conta",
    entrar: "Já tenho conta",
    antesContato: "Pagou com outro e-mail?",
    contato: "Fale com a gente",
    depoisContato: "e ligamos o plano no seu cadastro.",
    assunto: "Plano%20pago%20com%20outro%20e-mail",
    rodape: "MIRAI OS · o seu sistema operacional cognitivo",
  },
  en: {
    selo: "Payment confirmed",
    titulo: "One step left and your plan switches on",
    resumo:
      "Your account is released by the email you used at checkout. Create the account or sign in with it and the plan comes along.",
    passos: [
      {
        n: "1",
        titulo: "Use the same email you paid with",
        texto: "That is how we match your plan to you.",
      },
      {
        n: "2",
        titulo: "Create your account or sign in",
        texto: "If you already have one, just sign in.",
      },
      {
        n: "3",
        titulo: "The plan switches on by itself",
        texto: "No waiting for approval, no need to talk to anyone.",
      },
    ],
    criar: "Create my account",
    entrar: "I already have an account",
    antesContato: "Paid with another email?",
    contato: "Talk to us",
    depoisContato: "and we will link the plan to your account.",
    assunto: "Plan%20paid%20with%20another%20email",
    rodape: "MIRAI OS · your cognitive operating system",
  },
} as const;

export default async function ObrigadoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const pedido = typeof params.lang === "string" ? params.lang.toLowerCase() : "";
  const cabecalhos = await headers();
  const idiomaNavegador = (cabecalhos.get("accept-language") || "").toLowerCase();
  const en = pedido.startsWith("en") || (!pedido && idiomaNavegador.startsWith("en"));
  const t = en ? TEXTO.en : TEXTO.pt;

  return (
    <main
      lang={en ? "en" : "pt-BR"}
      className="relative grid min-h-[100dvh] place-items-center overflow-hidden bg-dash-bg px-5 py-12 text-dash-fg"
      style={{ fontFamily: FONTE }}
    >
      {/* luz contida: dois focos baixos, nada de fundo chapado */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(760px 420px at 50% -8%, rgba(255,117,31,0.16), transparent 70%), radial-gradient(680px 480px at 82% 112%, rgba(255,143,77,0.08), transparent 72%)",
        }}
      />
      {/* malha fina, só para dar matéria ao escuro */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage:
            "radial-gradient(ellipse 70% 60% at 50% 40%, #000 40%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 70% 60% at 50% 40%, #000 40%, transparent 100%)",
        }}
      />

      <section className="relative w-full max-w-[520px]">
        <div className="rounded-[22px] px-6 py-8 sm:px-9 sm:py-10" style={PAINEL}>
          {/* selo: anel de luz + check */}
          <div className="relative mx-auto grid h-[68px] w-[68px] place-items-center">
            <span
              aria-hidden
              className="absolute inset-0 rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgba(255,117,31,0.34) 0%, rgba(255,117,31,0.07) 52%, transparent 70%)",
                filter: "blur(10px)",
              }}
            />
            <span className="relative grid h-[52px] w-[52px] place-items-center rounded-full border border-dash-brand/40 bg-dash-brand/[0.12]">
              <svg
                viewBox="0 0 24 24"
                className="h-[23px] w-[23px] text-dash-brand"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
              </svg>
            </span>
          </div>

          <p className="mt-6 text-center text-[10.5px] font-semibold uppercase tracking-[0.22em] text-dash-brand">
            {t.selo}
          </p>
          <h1 className="mt-2.5 text-center text-[26px] font-semibold leading-[1.2] sm:text-[30px]">
            {t.titulo}
          </h1>
          <p className="mx-auto mt-3.5 max-w-[42ch] text-center text-[13.5px] leading-relaxed text-dash-muted">
            {t.resumo}
          </p>

          <ol className="mt-8 space-y-3.5">
            {t.passos.map((p) => (
              <li key={p.n} className="flex items-start gap-3.5">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-dash-hair/[0.18] bg-dash-hair/[0.07] text-[11.5px] font-semibold text-dash-brand">
                  {p.n}
                </span>
                <div>
                  <p className="text-[13.5px] font-semibold leading-snug text-dash-fg">
                    {p.titulo}
                  </p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-dash-muted/85">
                    {p.texto}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-9 flex flex-col gap-2.5 sm:flex-row">
            <Link
              href="/register"
              className="inline-flex flex-1 items-center justify-center rounded-[11px] bg-dash-brand px-6 py-3 text-[13.5px] font-semibold text-white transition-all hover:bg-dash-brandHi"
            >
              {t.criar}
            </Link>
            <Link
              href="/login"
              className="inline-flex flex-1 items-center justify-center rounded-[11px] border border-dash-hair/[0.24] bg-dash-hair/[0.07] px-6 py-3 text-[13.5px] font-semibold text-dash-fg transition-all hover:bg-dash-hair/[0.12]"
            >
              {t.entrar}
            </Link>
          </div>

          <p className="mt-7 text-center text-[12px] leading-relaxed text-dash-muted/75">
            {t.antesContato}{" "}
            <a
              href={`mailto:${EMAIL}?subject=${t.assunto}`}
              className="font-medium text-dash-fg/85 underline decoration-dash-hair/30 underline-offset-2 transition hover:text-dash-brand"
            >
              {t.contato}
            </a>{" "}
            {t.depoisContato}
          </p>
        </div>

        <p className="mt-6 text-center text-[11px] tracking-[0.08em] text-dash-dim">
          {t.rodape}
        </p>
      </section>
    </main>
  );
}