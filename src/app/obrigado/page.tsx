/* OBRIGADO — para onde o Asaas devolve quem pagou (callback.successUrl do link).
 *
 * Dono, 24/11/2026. A promessa desta tela tem de ser EXATA, porque é aqui que a
 * pessoa pode se perder: quem paga pelo link da LP ainda NÃO tem conta. O acesso
 * é liberado pelo e-mail do pagamento — então o pedido é "crie a conta com este
 * mesmo e-mail", e nada de "seu acesso já está liberado" (mentira que gera
 * chamado no dia seguinte).
 */
import Link from "next/link";

export const metadata = { title: "Pagamento recebido — MIRAI OS" };

export default function ObrigadoPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-dash-bg px-5 text-dash-fg">
      <div className="w-full max-w-xl rounded-[22px] border border-dash-hair/10 bg-dash-card p-9 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-dash-brand/15 text-[22px]">
          ✓
        </span>
        <h1 className="mt-6 text-[24px] font-semibold">Pagamento recebido</h1>
        <p className="mt-4 text-[14.5px] leading-relaxed text-dash-muted">
          Agora crie (ou entre na) sua conta usando{" "}
          <strong className="text-dash-fg">o mesmo e-mail que você usou no pagamento</strong>.
          É por ele que o seu plano é liberado — em segundos, sem precisar de
          ninguém.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/register"
            className="inline-flex items-center justify-center rounded-full bg-dash-brand px-6 py-2.5 text-[13.5px] font-semibold text-white transition-all hover:brightness-110"
          >
            Criar minha conta
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-full border border-dash-hair/15 px-6 py-2.5 text-[13.5px] font-semibold text-dash-fg transition-all hover:border-dash-brand/50"
          >
            Já tenho conta
          </Link>
        </div>
        <p className="mt-6 text-[12.5px] text-dash-dim">
          Usou outro e-mail na conta? Escreva para nós que a gente liga o plano
          no seu cadastro.
        </p>
      </div>
    </main>
  );
}
