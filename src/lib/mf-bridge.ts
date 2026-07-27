import Database from "better-sqlite3";
import path from "path";

const MF_DB_PATH = "/opt/data/media-factory/data/media-factory.sqlite";
const MF_MCP_URL = "http://127.0.0.1:16346";

// ─── MF DB Access ─────────────────────────────────────────
export function getMfDb() {
  const db = new Database(MF_DB_PATH);
  db.pragma("journal_mode = WAL");
  return db;
}

// ─── Tenant Registration ──────────────────────────────────
export async function ensureMfUser(
  name: string,
  email: string
): Promise<{ mfUser: any; tenant: any }> {
  const db = getMfDb();
  try {
    let mfUser = db
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(email) as any;

    if (!mfUser) {
      const now = new Date().toISOString();
      const info = db
        .prepare(
          "INSERT INTO users (name, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
        )
        .run(name, email, "bridged:" + Date.now(), now, now);
      mfUser = db
        .prepare("SELECT * FROM users WHERE id = ?")
        .get(info.lastInsertRowid) as any;

      const tenantSlug = "tenant-" + mfUser.id;
      const tenantInfo = db
        .prepare(
          "INSERT INTO tenants (name, slug, display_name, plan, status, max_users, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .run(
          name + "'s Workspace",
          tenantSlug,
          name,
          "free",
          "active",
          5,
          now,
          now
        );
      const tenant = db
        .prepare("SELECT * FROM tenants WHERE id = ?")
        .get(tenantInfo.lastInsertRowid) as any;

      db.prepare(
        "INSERT INTO tenant_members (tenant_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)"
      ).run(tenant.id, mfUser.id, "owner", now);

      db.close();
      return { mfUser, tenant };
    }

    const member = db
      .prepare("SELECT * FROM tenant_members WHERE user_id = ?")
      .get(mfUser.id) as any;
    let tenant = null;
    if (member) {
      tenant = db
        .prepare("SELECT * FROM tenants WHERE id = ?")
        .get(member.tenant_id) as any;
    }
    db.close();
    return { mfUser, tenant };
  } catch (err) {
    db.close();
    throw err;
  }
}

// ─── Vault Sync ────────────────────────────────────────────
export async function syncToVault(
  mfUserId: number,
  platform: string,
  config: Record<string, any>
) {
  const keys = Object.entries(config).filter(([k, v]) =>
    k.includes("key") || k.includes("token") || k.includes("secret")
  );

  const results: any[] = [];
  for (const [key, value] of keys) {
    try {
      const res = await fetch(
        `${MF_MCP_URL}/call/media_factory.vault_store`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-User-ID": String(mfUserId),
          },
          body: JSON.stringify({
            arguments: {
              name: `${platform}_${key}`,
              value: String(value),
              category: "api_key",
            },
          }),
          signal: AbortSignal.timeout(5000),
        }
      );
      const data = res.ok ? null : await res.text();
      results.push({
        key,
        status: res.ok ? "stored" : "error",
        error: data,
      });
    } catch (err: any) {
      results.push({ key, status: "error", error: err.message });
    }
  }
  return results;
}

// ─── MCP Call with Tenant Context ──────────────────────────
export async function mcpCallWithTenant(
  tool: string,
  args: Record<string, any>,
  mfUserId: number,
  tenantId: number
) {
  // Tools in AVAILABLE_TOOLS use "media_factory." prefix
  const fullTool = tool.includes(".") ? tool : `media_factory.${tool}`;
  const res = await fetch(`${MF_MCP_URL}/call/${fullTool}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-User-ID": String(mfUserId),
      "X-Tenant-ID": String(tenantId),
    },
    body: JSON.stringify({ arguments: args }),
    signal: AbortSignal.timeout(180000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`MCP ${fullTool}: ${res.status} - ${err}`);
  }
  return await res.json();
}

// ─── Pipeline ──────────────────────────────────────────────
export async function triggerPipeline(
  channel: string,
  mfUserId: number,
  tenantId: number,
  options?: { date?: string; skipUpload?: boolean; skipApproval?: boolean }
) {
  return mcpCallWithTenant(
    "media_factory.tenant_run_pipeline",
    {
      channel,
      date: options?.date || new Date().toISOString().split("T")[0],
      skip_upload: options?.skipUpload ?? false,
      skip_approval: options?.skipApproval ?? false,
    },
    mfUserId,
    tenantId
  );
}

export async function runGlobalPipeline(
  channel: string,
  options?: { date?: string; skipUpload?: boolean; skipApproval?: boolean }
) {
  const res = await fetch(
    `${MF_MCP_URL}/call/media_factory.run_pipeline`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        arguments: {
          channel,
          date: options?.date || new Date().toISOString().split("T")[0],
          skip_upload: options?.skipUpload ?? false,
          skip_approval: options?.skipApproval ?? false,
        },
      }),
      signal: AbortSignal.timeout(180000),
    }
  );
  if (!res.ok) throw new Error(`Pipeline: ${res.status}`);
  return await res.json();
}
