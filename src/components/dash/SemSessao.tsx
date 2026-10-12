"use client";

// A SESSÃO VENCIDA — uma tela só, usada por TODAS as portas (dono, 11/10/2026).
//
// POR QUE ISTO EXISTE: cada porta tratava o 401 do seu jeito. O Arquiteto dizia
// "sem os arquivos do projeto" (mentira — era a sessão). O chat escrito dizia
// "Não consegui falar com a Mirai agora (401). Tenta de novo." — mandava tentar de
// novo o que NUNCA ia funcionar, e sem caminho de volta. A causa era sempre a
// MESMA: o token venceu. Agora a causa tem UM lugar e UMA tela.
//
// 401 = sessão vencida  → esta tela (entrar de novo).
// 403 = conta sem acesso → NÃO é sessão: quem responde é o servidor, com o motivo.
// Confundir os dois fazia quem só estava deslogado ler "não está liberado para
// esta conta" — e quem estava sem permissão ser empurrado para o login sem motivo.

import Link from "next/link";
import { IconeCadeado } from "@/components/dash/icons";

/** A resposta é de SESSÃO VENCIDA (401)? Nunca confundir com 403 (sem acesso). */
export function ehSessaoVencida(r: { status: number }): boolean {
  return r.status === 401;
}

/** Tela de ESTADO (sem caixa, como as outras): logo, frase e o botão direto. */
export default function SessaoVencida({
  oQue = "Seu trabalho está salvo e nada foi perdido.",
}: {
  oQue?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-dash-raise text-dash-muted">
        <IconeCadeado className="h-6 w-6" />
      </span>
      <h2 className="mt-6 max-w-[560px] text-[22px] leading-tight text-dash-fg">Sua sessão expirou.</h2>
      <p className="mt-3 max-w-[540px] text-[14px] leading-[1.7] text-dash-muted">
        É só entrar de novo para continuar de onde parou — {oQue}
      </p>
      <Link
        href="/login"
        className="mt-8 inline-flex items-center gap-2 rounded-[10px] bg-dash-brand px-5 py-2.5 text-[12px] font-semibold text-white transition hover:bg-dash-brandHi"
      >
        Entrar de novo
      </Link>
    </div>
  );
}
