/* PÁGINA DE PLANOS — a porta de compra do MIRAI OS.
 *
 * Dono, 24/11/2026: *"todos os planos o cara só consiga usar qualquer coisa
 * depois que ele pagar"* + *"gere links de plano por plano pra colocar nos planos
 * da LP"*. Os cartões da LP e estes usam O MESMO link do Asaas (assinatura
 * recorrente mensal) — um caminho de cobrança só.
 *
 * É PÚBLICA de propósito: quem chega do anúncio precisa ver preço e comprar sem
 * ter conta. Depois de pagar, a pessoa entra com o MESMO e-mail do pagamento e o
 * acesso libera sozinho (o webhook liga o plano; a conferência é por e-mail).
 */
import Link from "next/link";
import { PLANOS_DO_OS, reais } from "@/lib/planos-do-os";

export const metadata = {
  title: "Planos — MIRAI OS",
  description: "Escolha o plano do MIRAI OS. Acesso a todas as ferramentas do sistema operacional de IA.",
};

export default function PlanosPage() {
  return (
    <main className="min-h-dvh bg-dash-bg px-5 py-14 text-dash-fg">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-12 text-center">
          <Link href="/" className="text-[13px] text-dash-muted hover:text-dash-fg">
            MIRAI OS
          </Link>
          <h1 className="mt-4 text-[30px] font-semibold leading-tight lg:text-[38px]">
            Escolha o seu plano
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-[14.5px] leading-relaxed text-dash-muted">
            Todos os planos abrem as mesmas ferramentas do OS — o que muda é o
            fôlego de uso: volume, projetos e agentes rodando junto. Sem taxa de
            adesão e sem fidelidade: cancela quando quiser.
          </p>
        </header>

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {PLANOS_DO_OS.map((p) => (
            <section
              key={p.id}
              className={`flex flex-col rounded-[20px] border p-6 transition-all ${
                p.destaque
                  ? "border-dash-brand/45 bg-dash-card shadow-[0_0_0_1px_rgba(255,117,31,0.08)]"
                  : "border-dash-hair/10 bg-dash-card"
              }`}
            >
              {p.destaque && (
                <span className="mb-3 self-start rounded-full bg-dash-brand/15 px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[.14em] text-dash-brand">
                  Mais escolhido
                </span>
              )}
              <h2 className="text-[19px] font-semibold">{p.nome}</h2>
              <p className="mt-3 flex items-baseline gap-1">
                <span className="public-sans text-[30px] font-semibold leading-none">
                  R$ {reais(p.valorCentavos)}
                </span>
                <span className="text-[12.5px] text-dash-muted">/mês</span>
              </p>
              <p className="mt-4 min-h-[52px] text-[13.5px] leading-relaxed text-dash-muted">
                {p.resumo}
              </p>
              <ul className="mt-4 flex flex-col gap-2 text-[13px] text-dash-fg/85">
                <li>· Todas as ferramentas do OS</li>
                <li>· A Arca, o Arquiteto e os agentes</li>
                <li>· Assinatura mensal no cartão, Pix ou boleto</li>
              </ul>
              <a
                href={p.link}
                target="_blank"
                rel="noopener noreferrer"
                className={`mt-6 inline-flex items-center justify-center rounded-full px-5 py-2.5 text-[13.5px] font-semibold transition-all ${
                  p.destaque
                    ? "bg-dash-brand text-white hover:brightness-110"
                    : "border border-dash-hair/15 text-dash-fg hover:border-dash-brand/50"
                }`}
              >
                Assinar {p.nome}
              </a>
            </section>
          ))}
        </div>

        <footer className="mt-12 text-center text-[12.5px] leading-relaxed text-dash-dim">
          Já assinou?{" "}
          <Link href="/login" className="text-dash-brand hover:underline">
            Entre com o mesmo e-mail do pagamento
          </Link>{" "}
          para liberar o acesso.
        </footer>
      </div>
    </main>
  );
}
