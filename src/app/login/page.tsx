"use client"

// Tela de entrada do MIRAI OS.
// Referência (Digixcel): foto ocupando a tela, cartão de formulário translúcido
// no meio, e dois caminhos de entrada. Aqui são os dois do ecossistema:
// Google e Conta Mirai (identidade única). Sem formulário de senha.
import { useState } from "react"

export default function LoginPage() {
  const [saindo, setSaindo] = useState<"" | "google" | "mirai">("")

  const botao =
    "flex w-full items-center justify-center gap-3 rounded-[12px] px-5 py-3.5 text-[14px] font-semibold transition disabled:opacity-60"

  return (
    <main
      className="relative flex min-h-[100dvh] items-center justify-center px-4 py-8"
      style={{
        backgroundImage: "url('/login-capa.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {/* véu escuro para o cartão ficar legível sobre a foto */}
      <div className="absolute inset-0 bg-black/55" aria-hidden="true" />

      <div className="relative w-full max-w-[420px] rounded-[24px] border border-white/[0.12] bg-[#121416]/70 p-8 shadow-2xl backdrop-blur-xl sm:p-10">
        <div className="mb-8 flex flex-col items-center">
          <img src="/logo-mirai.png" alt="MIRAI" className="h-[34px] w-auto" />
          <p className="mt-4 text-center text-[13px] leading-relaxed text-white/60">
            Entre para abrir o seu painel, seus produtos e os seus agentes.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <a
            href="/api/auth/google"
            onClick={() => setSaindo("google")}
            aria-disabled={saindo !== ""}
            className={`${botao} border border-white/[0.14] bg-white/[0.06] text-white hover:bg-white/[0.12] ${
              saindo === "google" ? "opacity-60" : ""
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            {saindo === "google" ? "Abrindo o Google..." : "Entrar com Google"}
          </a>

          <a
            href="/api/auth/mirai/start?next=%2Fdashboard"
            onClick={() => setSaindo("mirai")}
            aria-disabled={saindo !== ""}
            className={`${botao} bg-dash-brand text-white hover:bg-dash-brandHi ${
              saindo === "mirai" ? "opacity-60" : ""
            }`}
          >
            <img src="/logo-mirai-marca.png" alt="" className="h-5 w-5 shrink-0" />
            {saindo === "mirai" ? "Abrindo a Conta Mirai..." : "Entrar com Mirai"}
          </a>
        </div>

        <p className="mt-8 text-center text-[11.5px] leading-[1.6] text-white/40">
          Ao entrar, você concorda com os termos de uso e a política de privacidade.
        </p>
      </div>
    </main>
  )
}
