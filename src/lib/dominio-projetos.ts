// 🧭 ENDEREÇO DE PROJETO — a regra de "que host é de um projeto", pura e sem
// node/npm de propósito: este arquivo é importado pelo MIDDLEWARE (Edge Runtime)
// e pelo servidor. O middleware NÃO pode importar `arquiteto-projetos.ts` (esse
// carrega better-sqlite3) — então o NOME mora aqui e o banco só diz QUAL projeto.
//
// Dono, 09/10/2026, olhando o Figma Make: "olha que interessante essa conexão
// automática com domínio. quero algo assim". O link `/p/<token>` continua sendo
// o segredo; isto aqui é o ENDEREÇO: `slug.miraitohope.com`.

/** O domínio raiz onde os projetos ganham endereço. Uma vez só, para todos. */
export const DOMINIO_PROJETOS = "miraitohope.com";

/**
 * Hosts que são do APP (ou de um serviço nosso) e NUNCA de um projeto. Se um
 * projeto pudesse tomar um destes nomes, ele derrubaria um serviço de verdade —
 * por isso a lista é explícita e o slug também é validado contra ela.
 */
export const HOSTS_DO_APP = new Set([
  "miraitohope.com",
  "www.miraitohope.com",
  "app.miraitohope.com",
  // Domínio canônico (25/11/2026): app.miraiassistant.com passou a ser o nome
  // oficial e o .com.br é o nativo do Brasil. Sem estas linhas o middleware lê
  // "app" como SLUG DE PROJETO e reescreve para /d/app (404).
  "miraiassistant.com",
  "www.miraiassistant.com",
  "app.miraiassistant.com",
  "miraiassistant.com.br",
  "www.miraiassistant.com.br",
  "app.miraiassistant.com.br",
  "arca.miraitohope.com",
  "id.miraitohope.com",
  "mediafactory.miraitohope.com",
  "dashboard.miraitohope.com",
  "criador.miraitohope.com",
  "saaso.miraitohope.com",
  "mapa-paper.miraitohope.com",
  "observador.miraitohope.com",
  // Mirai 2 (VM isolada) — mesma aplicação, outra borda. Sem esta linha o
  // middleware trata "mirai-os" como SLUG DE PROJETO, reescreve para
  // /d/mirai-os e devolve 404. Medido 05/11/2026.
  "mirai-os.miraitohope.com",
  // Stage (82.25.91.140) — a cópia de teste. Mesma armadilha da linha acima:
  // sem estas linhas o middleware lê "stage" como slug de projeto, reescreve para
  // /d/stage e devolve 500 ("Cannot open database..."). Medido 12/11/2026.
  "stage.miraitohope.com",
  "api-stage.miraitohope.com",
]);

/** Host sem porta, minúsculo. Nunca lança. */
export function soHost(host: string | null | undefined): string {
  return String(host || "")
    .toLowerCase()
    .split(",")[0]
    .split(":")[0]
    .trim();
}

/**
 * O host é um endereço automático de projeto? Devolve o SLUG, senão `null`.
 * Só UM nível (`prova.miraitohope.com`), nunca `a.b.miraitohope.com`, e nunca um
 * host do app. Host local/IP não é projeto (é teste de dentro da máquina).
 */
export function slugDoHost(host: string | null | undefined): string | null {
  const h = soHost(host);
  if (!h) return null;
  if (HOSTS_DO_APP.has(h)) return null;
  if (h === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes("localhost")) return null;
  const sufixo = `.${DOMINIO_PROJETOS}`;
  if (!h.endsWith(sufixo)) return null;
  const resto = h.slice(0, -sufixo.length);
  if (!resto || resto.includes(".")) return null;
  return resto;
}

/** O endereço completo de um projeto com este slug. */
export function enderecoDoSlug(slug: string): string {
  return `${slug}.${DOMINIO_PROJETOS}`;
}

/** O IP da borda (a VPS que serve os projetos). É para cá que o DNS de um
 *  domínio próprio precisa apontar — a verificação compara com este valor. */
export const IP_DA_BORDA = "173.208.147.91";

/** Domínio próprio: baixa a caixa, tira esquema, caminho, porta e barra final. */
export function normalizarDominio(bruto: string): string {
  return String(bruto || "")
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/[:/].*$/, "")
    .replace(/\.+$/, "");
}

/**
 * Um domínio próprio pode ser conectado? `""` quando sim, senão o recado.
 * Regras: sem esquema/caminho/porta, não é IP, formato de domínio de verdade e
 * não é subdomínio nosso (esses têm endereço automático e são nossos).
 */
export function motivoDominioInvalido(bruto: string): string {
  const d = normalizarDominio(bruto);
  if (!d) return "Escreva o domínio (ex.: minhaloja.com.br).";
  if (/^\d+\.\d+\.\d+\.\d+$/.test(d)) return "Isso é um endereço de IP, não um domínio.";
  if (d.length > 200) return "Domínio longo demais.";
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d))
    return "Domínio inválido — use só letras, números, hífen e ponto (ex.: minhaloja.com.br).";
  if (d === DOMINIO_PROJETOS || d.endsWith(`.${DOMINIO_PROJETOS}`))
    return `Subdomínio de ${DOMINIO_PROJETOS} já tem endereço automático — não precisa conectar.`;
  return "";
}

export type Apontamento = { estado: "apontando" | "aguardando" | "sem-resposta"; ips: string[] };

/**
 * O DNS do domínio já aponta para a borda? Consulta DNS-over-HTTPS (não existe
 * `dig` no container) e compara com `IP_DA_BORDA`. Nunca lança: falha de rede
 * devolve `sem-resposta` — a tela diz o que sabe, não inventa.
 */
export async function conferirApontamento(dominio: string): Promise<Apontamento> {
  const d = normalizarDominio(dominio);
  if (!d) return { estado: "sem-resposta", ips: [] };
  try {
    const r = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(d)}&type=A`, {
      headers: { accept: "application/dns-json" },
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) return { estado: "sem-resposta", ips: [] };
    const j = (await r.json()) as { Answer?: { type?: number; data?: string }[] };
    const ips = (j.Answer ?? [])
      .filter((a) => a.type === 1 && typeof a.data === "string")
      .map((a) => String(a.data));
    return { estado: ips.includes(IP_DA_BORDA) ? "apontando" : "aguardando", ips };
  } catch {
    return { estado: "sem-resposta", ips: [] };
  }
}
