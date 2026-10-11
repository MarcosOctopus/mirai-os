// 🛡️ Auth Core — JWT, DB, OAuth helpers
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import path from "path";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "dev-fallback-change-me"
);

const DB_PATH = path.join(process.cwd(), "data", "auth.db");

// ─── DB ───────────────────────────────────────────────────────────
function getDb() {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      avatar_url TEXT,
      google_id TEXT,
      tenant_id TEXT UNIQUE,
      platform_config TEXT DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  return db;
}

export function db() {
  return getDb();
}

// ─── USER QUERIES ────────────────────────────────────────────────
export function getUserByEmail(email: string) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;
  db.close();
  return row || null;
}

export function getUserByGoogleId(googleId: string) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM users WHERE google_id = ?").get(googleId) as any;
  db.close();
  return row || null;
}

export function getUserById(id: number) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as any;
  db.close();
  return row || null;
}

export function createUser(name: string, email: string, passwordHash: string, googleId?: string, avatarUrl?: string) {
  const db = getDb();
  const now = new Date().toISOString();
  const tenantId = `mirai_usr_${Date.now()}`;
  const info = db.prepare(`
    INSERT INTO users (name, email, password_hash, google_id, avatar_url, tenant_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, email, passwordHash, googleId || null, avatarUrl || null, tenantId, now, now);
  db.close();
  return { id: info.lastInsertRowid, name, email, tenantId };
}

export function updateUserPlatformConfig(userId: number, platformConfig: Record<string, any>) {
  const db = getDb();
  const existing = db.prepare("SELECT platform_config FROM users WHERE id = ?").get(userId) as any;
  const current = existing ? JSON.parse(existing.platform_config || "{}") : {};
  const merged = { ...current, ...platformConfig };
  db.prepare("UPDATE users SET platform_config = ?, updated_at = ? WHERE id = ?")
    .run(JSON.stringify(merged), new Date().toISOString(), userId);
  db.close();
  return merged;
}

export function getUserPlatformConfig(userId: number) {
  const db = getDb();
  const row = db.prepare("SELECT platform_config FROM users WHERE id = ?").get(userId) as any;
  db.close();
  return row ? JSON.parse(row.platform_config || "{}") : {};
}

// ─── JWT ──────────────────────────────────────────────────────────
// PRAZO (dono, 11/10/2026): era 7 dias FIXOS, sem renovação — quem usa todo dia
// era deslogado uma vez por semana, e sem entender por quê (a tela dizia "sem os
// arquivos do projeto"). Agora são 30 dias E o prazo é RENOVADO a cada uso (ver
// /api/auth/me): sessão deslizante, quem trabalha não é deslogado no meio.
export const DIAS_DE_SESSAO = 30;

export async function signToken(payload: { userId: number; email: string; tenantId?: string }) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${DIAS_DE_SESSAO}d`)
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as { userId: number; email: string; tenantId?: string };
  } catch {
    return null;
  }
}

// ─── PASSWORD ─────────────────────────────────────────────────────
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ─── MEDIA FACTORY MCP CLIENT ────────────────────────────────────
const MF_MCP_URL = process.env.MF_MCP_URL || "http://127.0.0.1:3345";

export async function mcpCall(tool: string, args: Record<string, any>) {
  try {
    const res = await fetch(`${MF_MCP_URL}/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool, args }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`MCP ${tool}: ${res.status}`);
    return await res.json();
  } catch (err: any) {
    console.error(`MCP call failed [${tool}]:`, err.message);
    return null;
  }
}

export async function vaultStore(service: string, key: string, userId?: number | string) {
  return mcpCall("vault_store", { service, key, user_id: userId });
}

export async function vaultRetrieve(service: string, userId?: number | string) {
  return mcpCall("vault_retrieve", { service, user_id: userId });
}
