"use client";

// Chat do painel — conversa por ESCRITO, no padrão Dash.
//
// Esta página só monta a CASCA (Shell) e o corpo do chat. O corpo inteiro vive
// em `ChatEscrito`, para ser o MESMO chat na tela inicial `/` (onde ele ocupa a
// tela toda ao lado do menu). Um componente, dois lugares — a lógica de sessões,
// anexos e streaming não se duplica.
import { useEffect, useState } from "react";
import Shell from "@/components/dash/Shell";
import ChatEscrito from "@/components/dash/ChatEscrito";
import SessaoVencida from "@/components/dash/SemSessao";

type User = { id: string; name: string; email: string; ehDono?: boolean };

export default function ChatPage() {
  const [user, setUser] = useState<User | null>(null);
  const [semSessao, setSemSessao] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => {
        // 401 = sessão vencida (dono, 11/10/2026): antes era engolido e o chat
        // abria como se nada tivesse acontecido.
        if (r.status === 401) setSemSessao(true);
        return r.ok ? r.json() : null;
      })
      .then((d) => d?.user && setUser(d.user as User))
      .catch(() => {});
  }, []);

  return (
    <Shell titulo="Chat" usuario={user}>
      {semSessao ? (
        <div className="grid h-full w-full place-items-center">
          <SessaoVencida oQue="sua conversa continua aqui." />
        </div>
      ) : (
        <ChatEscrito />
      )}
    </Shell>
  );
}
