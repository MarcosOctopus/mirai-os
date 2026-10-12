"use client"

// Cadastro próprio do MIRAI OS — os DOIS caminhos.
//
// Decisão do dono (07/out/2026): "quero um criar conta sem google tbm po. tem
// que ter os dois". Então esta porta oferece conta com e-mail/senha E Google.
// NÃO oferece "Entrar com Conta Mirai" — esta é a porta da própria conta; o
// login Mirai é o adicional dos outros produtos do ecossistema.
//
// A API já existia e estava completa (/api/auth/register: valida, cria o
// usuário e assina o cookie de sessão). O que faltava era esta tela: /register
// era um stub que devolvia para /login — por isso "Criar conta" não levava a
// cadastro nenhum.
//
// Visual: o MESMO vidro do login (src/lib/vidro.ts) e as mesmas classes de
// campo/botão — as duas telas de entrada não podem parecer de produtos
// diferentes.
import { useState, FormEvent } from "react"
import { useRouter } from "next/navigation"

import { VIDRO } from "@/lib/vidro"
import { REDES } from "@/lib/redes"

const FONTE = "var(--fonte-poppins), Poppins, system-ui, sans-serif"

export default function RegisterPage() {
  const router = useRouter()
  const [nome, setNome] = useState("")
  const [email, setEmail] = useState("")
  const [senha, setSenha] = useState("")
  const [erro, setErro] = useState("")
  const [carregando, setCarregando] = useState(false)

  async function criar(e: FormEvent) {
    e.preventDefault()
    setErro("")
    setCarregando(true)
    try {
      const r = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nome, email, password: senha }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => null)
        // A API responde em inglês; a tela fala português.
        const cru = d?.error || d?.message || ""
        const traduzido =
          cru === "Email already in use"
            ? "Este e-mail já tem conta. Faça login."
            : cru === "Password must be at least 6 characters"
              ? "A senha precisa ter pelo menos 6 caracteres."
              : cru === "Invalid email address"
                ? "E-mail inválido."
                : cru || "Não foi possível criar a conta"
        throw new Error(traduzido)
      }
      // O cookie já vem assinado pela API; basta entrar no app.
      router.push("/dashboard")
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Ocorreu um erro inesperado")
    } finally {
      setCarregando(false)
    }
  }

  const botaoSocial =
    "flex w-full items-center justify-center gap-3 rounded-[10px] border border-dash-hair/[0.24] bg-dash-hair/[0.10] px-4 py-3 text-[13px] font-semibold text-dash-fg transition hover:bg-dash-hair/[0.18]"
  const campo =
    "w-full rounded-[10px] border border-dash-hair/[0.20] bg-dash-scrim/20 px-4 py-3 text-[13.5px] text-dash-fg outline-none transition placeholder:text-dash-fg/60 focus:border-dash-brand/70"

  return (
    <main
      className="relative flex min-h-[100dvh] flex-col"
      style={{
        fontFamily: FONTE,
        backgroundImage: "url('/login-capa.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="relative grid flex-1 grid-cols-1 lg:grid-cols-[1fr_minmax(380px,480px)]">
        {/* ── ESQUERDA: só a frase e as redes — mais nada escrito ──── */}
        <section className="order-2 flex flex-col justify-center px-7 py-10 sm:px-10 lg:order-1 lg:px-14">
          <h1 className="max-w-[18ch] text-[34px] font-light leading-[1.15] text-dash-fg sm:text-[46px]">
            Sua <span className="font-bold">parceira</span> na sua viagem para o futuro
          </h1>

          <div className="mt-10 flex items-center gap-3">
            {REDES.map((r) => (
              <span
                key={r.nome}
                title={r.nome}
                aria-label={r.nome}
                className="grid h-10 w-10 place-items-center rounded-full border border-dash-hair/[0.22] bg-dash-scrim/25 text-dash-fg/85 backdrop-blur-md"
              >
                <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden="true">
                  <path d={r.d} />
                </svg>
              </span>
            ))}
          </div>
        </section>

        {/* ── DIREITA: a caixa do formulário, de cima até embaixo ──── */}
        <section
          className="order-1 flex flex-col justify-center border-dash-hair/[0.18] px-7 py-10 sm:px-10 lg:order-2 lg:border-l"
          style={VIDRO}
        >
          <img
            src="/logo-mirai.png"
            alt="MIRAI"
            className="logo-tema h-[32px] w-auto max-w-none shrink-0 self-start object-contain"
          />

          <div className="mt-9">
            <h2 className="text-[22px] font-semibold text-dash-fg">Criar conta</h2>
            <p className="mt-1.5 text-[12.5px] text-dash-fg/70">
              Já tem conta?{" "}
              <a href="/login" className="font-semibold text-dash-brand hover:text-dash-brandHi">
                Entrar
              </a>
            </p>
          </div>

          <form onSubmit={criar} className="mt-6 flex flex-col gap-4">
            <input
              type="text"
              placeholder="Seu nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
              className={campo}
            />
            <input
              type="email"
              placeholder="E-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={campo}
            />
            <input
              type="password"
              placeholder="Senha (mínimo 6 caracteres)"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
              minLength={6}
              className={campo}
            />

            {erro && <p className="text-[12.5px] text-dash-bad">{erro}</p>}

            <button
              type="submit"
              disabled={carregando}
              className="mt-1 w-full rounded-[10px] bg-dash-brand px-4 py-3.5 text-[13.5px] font-semibold text-white transition hover:bg-dash-brandHi disabled:opacity-60"
            >
              {carregando ? "Criando..." : "Criar conta"}
            </button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-dash-hair/[0.22]" />
            <span className="text-[11px] uppercase tracking-[0.16em] text-dash-fg/55">ou</span>
            <span className="h-px flex-1 bg-dash-hair/[0.22]" />
          </div>

          <div className="flex flex-col gap-3">
            <a href="/api/auth/google" className={botaoSocial}>
              <svg viewBox="0 0 24 24" className="h-[22px] w-[22px] shrink-0" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Criar com Google
            </a>
          </div>
        </section>
      </div>
    </main>
  )
}
