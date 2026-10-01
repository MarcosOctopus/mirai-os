import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

// Quem é o build que está NO AR agora.
//
// Serve para o navegador perceber que ele está rodando uma versão velha: o
// JavaScript já carregado na aba/PWA NÃO troca sozinho quando eu publico algo
// novo — a tela continua com o código antigo até recarregar. Foi exatamente o
// que aconteceu com o menu (o dono abriu no celular e viu a versão quebrada,
// já corrigida no servidor).
//
// Fica fora de /api de propósito: não é dado do usuário, não precisa de sessão,
// e assim não passa pelo guarda de autenticação.
export const dynamic = "force-dynamic";

export async function GET() {
  let build = "desconhecido";
  try {
    build = fs.readFileSync(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim();
  } catch {
    // sem arquivo (ambiente de dev): segue como desconhecido, nunca quebra
  }

  return NextResponse.json(
    { build },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}
