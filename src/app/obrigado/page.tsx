/* OBRIGADO — para onde o Asaas devolve quem pagou (callback.successUrl do link).
 *
 * Dono, 24/11/2026. A promessa desta tela tem de ser EXATA, porque é aqui que a
 * pessoa pode se perder: quem paga pelo link da LP ainda NÃO tem conta. O acesso
 * é liberado pelo e-mail do pagamento — então o pedido é "crie a conta com este
 * mesmo e-mail", e nada de "seu acesso já está liberado" (mentira que gera
 * chamado no dia seguinte).
 *
 * Dono, 25/11/2026: "muito feio essa de obrigado". Refazer no PADRÃO: fundo
 * escuro com luz contida, tudo enquadrado, card de vidro do próprio sistema
 * (src/lib/vidro.ts), texto com inicial maiúscula e sem travessão.
 */
import Link from "next/link";
import { VIDRO } from "@/lib/vidro";

export const metadata = { title: "Pagamento confirmado — MIRAI OS" };

const FONTE = "var(--fonte-poppins), Poppins, system-ui, sans-serif";

const PASSOS = [
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
];

export default function ObrigadoPage() {
  return (
    <main
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

      <section className="relative w-full max-w-[560px]">
        <div
          className="rounded-[24px] border border-dash-hair/[0.13] px-6 py-9 sm:px-10 sm:py-11"
          style={VIDRO}
        >
          {/* selo: anel de luz + check */}
          <div className="relative mx-auto grid h-[74px] w-[74px] place-items-center">
            <span
              aria-hidden
              className="absolute inset-0 rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgba(255,117,31,0.55) 0%, rgba(255,117,31,0.10) 58%, transparent 72%)",
                filter: "blur(6px)",
              }}
            />
            <span className="relative grid h-[58px] w-[58px] place-items-center rounded-full border border-dash-brand/45 bg-dash-brand/15">
              <svg
                viewBox="0 0 24 24"
                className="h-[26px] w-[26px] text-dash-brand"
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
            Pagamento confirmado
          </p>
          <h1 className="mt-2.5 text-center text-[26px] font-semibold leading-[1.2] sm:text-[30px]">
            Falta um passo para o seu plano ligar
          </h1>
          <p className="mx-auto mt-3.5 max-w-[42ch] text-center text-[13.5px] leading-relaxed text-dash-muted">
            Sua conta é liberada pelo e-mail que você usou no pagamento. Crie a
            conta ou entre com ele e o plano entra junto.
          </p>

          <ol className="mt-8 space-y-3.5">
            {PASSOS.map((p) => (
              <li key={p.n} className="flex items-start gap-3.5">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-dash-hair/[0.18] bg-dash-hair/[0.07] text-[11.5px] font-semibold text-dash-brand">
                  {p.n}
                </span>
                <div>
                  <p className="text-[13.5px] font-semibold leading-snug text-dash-fg">
                    {p.titulo}
                  </p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-dash-dim">
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
              Criar minha conta
            </Link>
            <Link
              href="/login"
              className="inline-flex flex-1 items-center justify-center rounded-[11px] border border-dash-hair/[0.20] bg-dash-hair/[0.06] px-6 py-3 text-[13.5px] font-semibold text-dash-fg transition-all hover:bg-dash-hair/[0.12]"
            >
              Já tenho conta
            </Link>
          </div>

          <p className="mt-7 text-center text-[12px] leading-relaxed text-dash-dim">
            Pagou com outro e-mail?{" "}
            <a
              href="mailto:contato@miraitohope.com?subject=Plano%20pago%20com%20outro%20e-mail"
              className="font-medium text-dash-fg/85 underline decoration-dash-hair/30 underline-offset-2 transition hover:text-dash-brand"
            >
              Fale com a gente
            </a>{" "}
            e ligamos o plano no seu cadastro.
          </p>
        </div>

        <p className="mt-6 text-center text-[11px] text-dash-dim/80">
          MIRAI OS · o seu sistema operacional cognitivo
        </p>
      </section>
    </main>
  );
}