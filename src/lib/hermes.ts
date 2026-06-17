export interface HermesSystem {
  name: string;
  status: "online" | "offline" | "error";
  lastActive: string;
  skills: string[];
}

export async function getHermesStatus(): Promise<HermesSystem | null> {
  try {
    const res = await fetch("/api/config");
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
