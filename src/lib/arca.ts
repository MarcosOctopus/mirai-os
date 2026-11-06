/// <reference types="react/experimental" />

import { arcaConfigurada, headersDaArca } from "@/lib/arca-cliente";

const ARCA_URL = "https://arca.miraitohope.com";

export interface ArcaDoc {
  id: number;
  titulo: string;
  tipo: string;
  source: string;
  resumo: string;
  tags: string;
  created_at: string;
}

export interface ArcaMemory {
  id: string;
  content: string;
  categories: string;
  created_at: string;
}

export interface ArcaResponse {
  query: string;
  documents: ArcaDoc[];
  memories: ArcaMemory[];
  decisions: any[];
  total: number;
}

export async function searchArca(query: string): Promise<ArcaResponse> {
  if (!arcaConfigurada()) throw new Error("Arca sem credencial neste ambiente");
  const res = await fetch(`${ARCA_URL}/context?q=${encodeURIComponent(query)}`, {
    headers: headersDaArca(),
  });
  if (!res.ok) throw new Error(`Arca error: ${res.status}`);
  return res.json();
}

export async function getViaApi(path: string): Promise<any> {
  if (!arcaConfigurada()) throw new Error("Arca sem credencial neste ambiente");
  const res = await fetch(`${ARCA_URL}${path}`, { headers: headersDaArca() });
  if (!res.ok) throw new Error(`Arca error: ${res.status}`);
  return res.json();
}

export interface ExecutiveBriefing {
  date: string;
  stats: Record<string, number>;
  recent_activity: string[];
  highlights: string[];
}

export async function getBriefing(): Promise<ExecutiveBriefing | null> {
  try {
    if (!arcaConfigurada()) return null;
    const res = await fetch(`${ARCA_URL}/executive-brief`, {
      headers: headersDaArca(),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
