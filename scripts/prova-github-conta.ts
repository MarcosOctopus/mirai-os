/**
 * PROVA da CONEXÃO ÚNICA DE GITHUB (dono, 13/10/2026).
 *
 * Roda contra o banco DE VERDADE (o mesmo caminho do app) e prova, um por um:
 *   1. antes de conectar, o GitHub NÃO aparece conectado;
 *   2. `guardarGithubDaConta` grava no cofre da CONTA, cifrado;
 *   3. o token guardado DECIFRA de volta (não é lixo cifrado);
 *   4. a tela lê "conectada" pela MESMA função que ela usa (estaLigada);
 *   5. projeto SEM token próprio passa a USAR o da conta (conexão única);
 *   6. projeto COM token próprio continua com o DELE (sem regressão);
 *   7. desconectar limpa os dois lados.
 *
 * Nada é inventado: cada passo lê o estado real e compara. No fim, o banco é
 * devolvido ao estado anterior (a prova não deixa resíduo).
 */
import "./carrega-env";

import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

import { guardarGithubDaConta, githubDaConta, esquecerGithubDaConta } from "../src/lib/github-conta";
import { getUserPlatformConfig } from "../src/lib/auth";
import { CATALOGO, estaLigada } from "../src/lib/integracoes/catalogo";
import { conexaoGithub, tokenGithub } from "../src/lib/arquiteto-projetos";
import { cifrar, decifrar } from "../src/lib/segredo-guardado";

const DB = path.join(process.cwd(), "data", "auth.db");
const DONO = 5;
const TOKEN_FALSO = "gho_FAKE_para_provar_o_caminho";

let ok = 0;
let falhou = 0;
function checa(nome: string, cond: boolean, detalhe = "") {
  if (cond) {
    ok++;
    console.log(`  ✔ ${nome}`);
  } else {
    falhou++;
    console.log(`  ✘ ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  }
}

const github = CATALOGO.find((i) => i.id === "github")!;

// ── Backup: a prova não pode deixar resíduo ────────────────────────────────
const carimbo = new Date().toISOString().replace(/[:.]/g, "-");
const backup = `${DB}.antes-prova-github-conta.${carimbo}`;
fs.copyFileSync(DB, backup);
console.log(`backup do banco: ${backup}\n`);

// escolhe um projeto do dono para a prova
const c0 = new Database(DB, { readonly: true });
const projetos = c0
  .prepare("SELECT id, github_token_cifrado FROM arquiteto_projetos WHERE user_id = ?")
  .all(DONO) as { id: string; github_token_cifrado: string | null }[];
const semToken = projetos.find((p) => !p.github_token_cifrado);
const comToken = projetos.find((p) => p.github_token_cifrado);
c0.close();

console.log(`projetos do dono: ${projetos.length} (sem token próprio: ${semToken ? 1 : 0}, com: ${comToken ? 1 : 0})\n`);

// ── 1. ANTES ───────────────────────────────────────────────────────────────
console.log("1) ANTES de conectar");
checa("o GitHub NÃO aparece conectado na tela", estaLigada(github, getUserPlatformConfig(DONO)) === false);
checa("o cofre da conta não tem github", githubDaConta(DONO) === null);
if (semToken) checa("projeto sem token próprio não tem token", tokenGithub(semToken.id) === null);

// ── 2. CONECTAR ────────────────────────────────────────────────────────────
console.log("\n2) CONECTANDO (o que o retorno do consentimento faz)");
guardarGithubDaConta(DONO, cifrar(TOKEN_FALSO), "marcospng");

const guardado = githubDaConta(DONO);
checa("o cofre da conta passou a ter github", guardado !== null);
checa("o login de quem conectou foi guardado", guardado?.login === "marcospng", `veio: ${guardado?.login}`);
checa("o token NÃO está em claro no cofre", guardado?.tokenCifrado !== TOKEN_FALSO);

// ── 3. DECIFRA ─────────────────────────────────────────────────────────────
console.log("\n3) O token guardado volta legível para o servidor");
checa("decifra de volta no token original", decifrar(guardado?.tokenCifrado) === TOKEN_FALSO, `veio: ${decifrar(guardado?.tokenCifrado)}`);

// ── 4. A TELA DIZ "CONECTADA" ──────────────────────────────────────────────
console.log("\n4) A TELA lê conectada (a mesma função que o cartão usa)");
checa("estaLigada(github) === true", estaLigada(github, getUserPlatformConfig(DONO)) === true);

// ── 5. VALE PARA TODOS OS PROJETOS ─────────────────────────────────────────
console.log("\n5) Vale para os projetos (conexão única)");
if (semToken) {
  checa("projeto sem token próprio passa a usar o da CONTA", tokenGithub(semToken.id) === guardado?.tokenCifrado);
  const st = conexaoGithub(semToken.id);
  checa("a tela do projeto diz 'conectado como marcospng'", st?.conectado === true && st?.login === "marcospng", JSON.stringify(st));
}

// ── 6. SEM REGRESSÃO NO QUE JÁ EXISTIA ─────────────────────────────────────
console.log("\n6) Quem já tinha token próprio continua com o DELE");
if (comToken) {
  checa("tokenGithub devolve o do projeto (não o da conta)", tokenGithub(comToken.id) === comToken.github_token_cifrado);
} else {
  // nenhum projeto com token próprio ainda: prova o outro lado — um projeto
  // com token próprio NÃO é sobrescrito pelo da conta.
  const c = new Database(DB);
  const alvo = semToken ? semToken.id : projetos[0].id;
  const proprio = cifrar("gho_TOKEN_DO_PROJETO");
  c.prepare("UPDATE arquiteto_projetos SET github_token_cifrado = ? WHERE id = ?").run(proprio, alvo);
  c.close();
  checa("com token próprio, ele MANDA sobre o da conta", tokenGithub(alvo) === proprio, `veio: ${tokenGithub(alvo)?.slice(0, 12)}…`);
  const c2 = new Database(DB);
  c2.prepare("UPDATE arquiteto_projetos SET github_token_cifrado = NULL WHERE id = ?").run(alvo);
  c2.close();
}

// ── 7. DESCONECTAR ─────────────────────────────────────────────────────────
console.log("\n7) DESCONECTANDO");
esquecerGithubDaConta(DONO);
checa("o GitHub volta a NÃO estar conectado", estaLigada(github, getUserPlatformConfig(DONO)) === false);
checa("githubDaConta volta a null", githubDaConta(DONO) === null);
if (semToken) checa("o projeto deixa de ter token", tokenGithub(semToken.id) === null);

// ── Restaura ───────────────────────────────────────────────────────────────
fs.copyFileSync(backup, DB);
console.log(`\nbanco restaurado do backup: ${backup}`);
console.log(`\nRESULTADO: ${ok} ok, ${falhou} falhou`);
process.exit(falhou === 0 ? 0 : 1);
