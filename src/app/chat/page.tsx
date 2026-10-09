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

type User = { id: string; name: string; email: string; ehDono?: boolean };

export default function ChatPage() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.user && setUser(d.user as User))
      .catch(() => {});
  }, []);

  return (
    <Shell titulo="Chat" usuario={user}>
      <ChatEscrito />
    </Shell>
  );
}
