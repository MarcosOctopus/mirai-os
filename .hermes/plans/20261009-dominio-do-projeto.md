# Configurações do projeto + domínio automático (MIRAI OS / Arquiteto)

Dono, 09/10/2026 — a partir do Figma Make ("olha que interessante essa conexão automática com
domínio. essa parte de upar fonte e as integrações que ele usa embaixo. quero algo assim").
Escolha dele no clarify: **Configurações do projeto + domínio automático**.

## O que já existe (auditado, não suposto)
- Publicar/despublicar de verdade: `POST|DELETE /api/arquiteto/projetos/[id]/publicar` → link
  `/p/<token>` com token imprevisível; despublicar mata o link na hora. Render público já existe
  (`src/app/p/[token]/page.tsx` + `montarPrevia` + assets assinados num iframe `sandbox`).
- Projeto tem `titulo`; **não** tem endereço legível (sem slug/subdomínio).
- Assets = imagens (magic bytes no servidor). Fontes: só token de família — **sem upload**.
- Integrações: da CONTA (catálogo 21), não do projeto. Tela de Configurações do projeto: **não existe**.
- Borda: `*.miraitohope.com` **já resolve** → 173.208.147.91 (DNS-only, wildcard). Host nginx tem o
  `mirai-core.conf` como `default_server` (pega subdomínio desconhecido). `app.miraitohope.com` entra
  pelo túnel Cloudflare DENTRO do container do agente (`app → localhost:3333`).
- Host alcança o app: `http://172.20.6.2:3333/login` → **200** ✓ (medido).

## Fases
1. ✅ **Endereço (slug) no banco + API + publicar** — coluna aditiva `slug` (único, `lower()`),
   reservados nossos (`app`, `saaso`, `id`, `arca`…), validação, sugestão a partir do título.
   Publicar devolve o endereço; o link `/p/<token>` continua funcionando (retrocompatível).
   PROVADO: "Atlântico Sul 2026" → `atlantico-sul-2026`; `dark-matter` recusado; `prova-caixa` no ar.
2. ✅ **O app atender pelo nome** — middleware reescreve `<nome>.miraitohope.com/<caminho>` para
   `/d/<host>/<caminho>` e a rota Node resolve o PUBLICADO por slug (despublicado = 404).
3. ✅ **Vhost na borda** — `projetos-miraitohope.conf` (`server_name *.miraitohope.com` → app);
   backup `pre-projetos-nginx-20261008_221049`, `nginx -t` OK, reload OK. Vizinhos remedidos.
4. ✅ **Conectar um domínio** (domínio próprio do cliente) — coluna `dominio` (única), rota
   `/api/arquiteto/projetos/[id]/dominio`, conferência de DNS AO VIVO por DoH (`aguardando` /
   `apontando` / `sem-resposta`) e o bloco na tela com o registro A exato a criar. PROVADO: conecta,
   recusa IP/subdomínio nosso/lixo, normaliza `https://Com-Esquema.com/x`, o site responde pelo
   domínio (200) e desconectar mata (404).
   FALTA (ação do dono/cliente): o DNS do cliente apontar para `173.208.147.91`; quando apontar,
   criar o vhost do domínio + certbot (skill `dominio-no-servidor`).
5. ✅ **Tela de Configurações do projeto** — botão na barra, abas Geral/Domínios/Fontes/Integrações;
   Domínios funcional (endereço, estado, publicar, copiar, abrir, conectar domínio). Fontes e
   Integrações **dizem a verdade** (ainda não existem) em vez de fingir.

## Fora do escopo desta rodada (decidido com o dono)
- Upar fonte (woff2) ✅ FEITO nesta rodada (aba Fontes) e integrações por projeto — as integrações vêm depois, na ordem dele.

## Rodada 2 (dono, 09/10/2026) — depois do domínio
6. ✅ **Botões só-ícone** — Baixar / escolher / riscar (28×28, `title` + `aria-label` mantidos; escolher
   e riscar continuam se desligando entre si). Provado no navegador, 0 erros.
7. ✅ **FONTES (subir WOFF2/WOFF)** — mesmo caminho dos assets do projeto:
   - tipo por MAGIC BYTES (`wOF2`/`wOFF`); TTF/OTF recusados com recado claro;
   - serviço com `Content-Type: font/woff2` + `Access-Control-Allow-Origin: *` +
     `Cross-Origin-Resource-Policy: cross-origin` (sem CORS a fonte não aparece — falha muda);
   - `@font-face` do projeto reescrito para a URL ASSINADA na prévia e no site publicado; token
     `fonte` passa a apontar para a família;
   - aba **Fontes** nas Configurações: subir, listar (família + tamanho), copiar o `@font-face`, tirar.
   PROVADO: WOFF2 real de 22 KB → `font/woff2` + ACAO `*` → `document.fonts.check` true (mesma e
   outra origem) → título do site de prova renderizando na fonte da marca.
8. ✅ **BUG corrigido no caminho**: a regra do domínio reescrevia `/api/...` → o site publicado
   ficaria SEM imagem e SEM fonte, em silêncio. `if (projetoDe && !isApiRoute)`. Provado: a fonte
   serve no domínio do projeto (200 + CORS) e o app segue 200.
9. ⏳ **Integrações por projeto (GitHub primeiro)** — a última da fila dele.
- "npm registry" do Figma: **não copiar** (o projeto é HTML/CSS/JS puro; não há dependência de npm).

## Prova exigida em cada fase
- Fase 1: banco mostra o slug; dois projetos não colidem; reservado é recusado com recado claro.
- Fase 2: `curl https://<slug>.miraitohope.com/` → 200 com o conteúdo do projeto; despublicado → 404;
  vizinhos (app/arca/id/saaso) continuam 200 antes e depois do reload.
- Fase 5: clicar "Configurações" no projeto mostra endereço + estado reais; navegador real, 0 erros.
