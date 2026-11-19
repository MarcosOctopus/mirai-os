"use client";

/**
 * ÍCONES DAS FERRAMENTAS DO OS — um mapa só, usado pela janela de plano e pela aba Ferramentas.
 *
 * Por que existe separado: a mesma ferramenta aparece em dois lugares, e ícone duplicado é o jeito
 * mais fácil de as duas telas divergirem sem ninguém notar. Aqui os ícones são os MESMOS da navegação
 * (Shell.tsx) — a tela não inventa símbolo novo para coisa que já tem símbolo no produto.
 */

import type { ReactElement } from "react";

import {
  IconeAgentes,
  IconeBackup,
  IconeCadeado,
  IconeCamadas,
  IconeChat,
  IconeDisco,
  IconeDocumento,
  IconeEnviar,
  IconeGrafico,
  IconeInfra,
  IconeMicrofone,
  IconeProdutos,
  IconeRadar,
  IconeRaio,
  IconeRelogio,
  IconeRobo,
  IconeSynapse,
} from "@/components/dash/icons";

export const ICONE_FERRAMENTA: Record<string, (p: { className?: string }) => ReactElement> = {
  chat: IconeChat,
  reuniao: IconeMicrofone,
  documentos: IconeDocumento,
  arca: IconeCamadas,
  synapse: IconeSynapse,
  chaves: IconeCadeado,
  projetos: IconeProdutos,
  arquiteto: IconeRobo,
  agendamentos: IconeRelogio,
  infra: IconeInfra,
  backup: IconeBackup,
  seguranca: IconeRadar,
  dados: IconeDisco,
  agentes: IconeAgentes,
  telegram: IconeEnviar,
  negocio: IconeGrafico,
};

export function iconeDaFerramenta(id: string): (p: { className?: string }) => ReactElement {
  return ICONE_FERRAMENTA[id] || IconeRaio;
}

/** Carrinho não existe no kit de ícones — desenhado aqui, traço fino, mesma linguagem. */
export const IconeCarrinho = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    width="15"
    height="15"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M3 4h2l2.4 10.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.55L21 8H6" />
    <circle cx="10" cy="20" r="1.2" />
    <circle cx="18" cy="20" r="1.2" />
  </svg>
);
