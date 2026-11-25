"use client";

import { useEffect, useState } from "react";

/**
 * O endereço público que a pessoa está usando AGORA, para ensinar na tela
 * ("Homepage URL", "callback"). Sai de window.location.origin, então funciona
 * igual em produção, no Stage e num domínio novo sem precisar editar texto.
 *
 * O valor inicial é o padrão de produção de propósito: renderiza igual no
 * servidor e na primeira passada do cliente (sem erro de hidratação) e o
 * useEffect corrige para o domínio real logo depois de montar.
 */
export function useOrigemPublica(padrao = "https://app.miraiassistant.com"): string {
  const [origem, setOrigem] = useState(padrao);
  useEffect(() => {
    try {
      const o = window.location.origin;
      if (o && o.startsWith("http")) setOrigem(o);
    } catch {
      /* nada: fica o padrão */
    }
  }, []);
  return origem;
}