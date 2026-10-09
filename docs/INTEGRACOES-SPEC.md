# Especificação — Aba Integrações (catálogo visual)

> Congelada em 05/10/2026 para permitir trabalho em paralelo. Se mudar, muda para todos.
> Referência visual: o dashboard do template ArtDash (`/opt/data/cache/scratch/artdash/src/App.tsx`).
> **Adaptar a estrutura, não copiar o conteúdo** — o conteúdo é nosso.

## Rota

Substitui a tela atual: **`/dashboard/connect`** (`src/app/dashboard/connect/page.tsx`).
Mantém a rota (links existentes não podem quebrar). Usa a casca `Shell` e o kit `dash`.

## Estrutura: duas colunas, 60% / 40%

### Coluna larga (de cima para baixo)

**1. Banner de promoções** — área no topo, formato do banner do template (título grande +
dois botões). Vazio por enquanto, mas com conteúdo real: array `PROMOCOES` no arquivo, cada
uma com `titulo`, `texto`, `botaoPrimario`, `botaoSecundario`. Sem promoção ativa, o banner
mostra a marca e um convite (nunca um buraco vazio).

**2. Uso de tokens** — o card "Your Balance" do template, adaptado:
- número grande = **total de tokens** somados (nunca zero)
- por baixo, quebra por **provedor e modelo** (ex.: Verboo · deepseek-v4.1-flash — 1.2M)
- fonte: `GET /api/integracoes/tokens` (ver adiante). Se a rota ainda não responder, o card
  mostra "sem medição ainda" — **e não um número inventado**.

**3. Integrações** — a grade do "Live Auctions", com os **chips de categoria** no topo:
`Todas` · `Mirai` · `Essenciais` · `APIs` · `Media`. Cada card: logo da empresa, nome,
subtítulo curto, e selo de estado (conectada / não conectada).

**4. Minhas integrações** — a tabela do "Recent History", com colunas:
`logo` · `nome` · `tipo` (MCP ou API) · `estado` (ativa / inativa) · `desde` · `ação`.
Linha vazia → mensagem orientando a escolher uma integração acima.

### Coluna estreita

**5. Destaques** — mantém o formato do "Top Creator" (avatar à esquerda, nome, botão à
direita). É o que o Marcos pediu para deixar "da mesma forma por enquanto". Conteúdo:
integrações recomendadas, com botão "Conectar".

## O clique (comportamento)

- **tipo = `mcp`** → abre o site da integração em nova aba, direto para fazer a integração.
- **tipo = `api`** → abre **popup** (modal) com os campos daquela API. Salva e liga.
  O modal segue o padrão Dash: vidro/cartão, raio 24, botão laranja, ícones de traço.

**Reusa o que já existe** para guardar credencial: `POST /api/auth/connect` grava em
`platform_config` (é assim que Higgsfield, Suno, Telegram, Magnific, Instagram e Kling já
funcionam hoje). **Não criar um segundo lugar de guardar chave.**

## Catálogo declarativo

`src/lib/integracoes/catalogo.ts` — adicionar integração é editar este arquivo, nunca a tela.

```ts
export type Integracao = {
  id: string                 // "openai"
  nome: string               // "OpenAI"
  empresa: string            // "OpenAI"
  subtitulo: string          // "Modelos de linguagem"
  tipo: "mcp" | "api"
  categoria: "mirai" | "essenciais" | "apis" | "media"
  logo: string               // "/integracoes/openai.svg"
  site?: string              // para tipo mcp
  campos?: { chave: string; rotulo: string; tipo: "senha" | "texto" }[]  // para tipo api
}
```

### Conteúdo inicial (o que já existe hoje de verdade)

- **Mirai**: CRM Saaso (MCP), Arca (MCP), Media Factory (MCP)
- **Essenciais**: Google Drive (API), YouTube (API), Telegram (API), Instagram (API)
- **APIs**: Verboo, OpenAI, Google Gemini, OpenRouter, Groq, ElevenLabs, Picovoice
- **Media**: Canva (MCP), Figma (MCP), Higgsfield (API), Suno (API), Magnific (API), Kling (API)

## Convenção de logo (frozen — usado por duas frentes)

Arquivo em `public/integracoes/<slug>.svg` (ou `.png` quando só existir bitmap),
com o **slug exato** do `id` da integração. Fundo transparente, altura consistente
(quadrado 256×256 é o alvo). Arquivos oficiais de marca de cada empresa — nada de
ícone improvisado ou emoji.

## Uso de tokens (medição real)

- Ler `usage` das respostas de cada provedor (Verboo, OpenRouter, Google, Groq, OpenAI)
  no ponto onde o chat chama a API (`src/app/api/chat/route.ts` e o TTS/STT se aplicável).
- Guardar por chamada: `provedor`, `modelo`, `tokens_entrada`, `tokens_saida`, `quando`.
- Somar por período e expor em `GET /api/integracoes/tokens`.
- **Sem inventar número.** Sem dado ainda = "sem medição ainda".
- Guardar `provedor` e `modelo` separados agora é o que permite virar **dinheiro** depois
  sem reconstrução (pedido do Marcos: token agora, reais depois).

## Padrão visual (inegociável)

Casca `Shell` existente · Poppins · acento `#ff751f` · card `#161719` sobre fundo `#121416`
· borda `#25292c` · raio 24px card / 10px botão · **ícones de traço, nunca emoji**.
Tokens válidos: `bg/side/card/raise/line/muted/brand/ok/warn/bad` (**não existe `surface`**).
Scroll fino laranja (já está no `globals.css` — não mexer).

## Não fazer

- Não criar tela nova: é a mesma `/dashboard/connect`.
- Não quebrar o que já funciona (chaves já salvas em `platform_config`, OAuth do Drive/YouTube).
- Não rodar `npm run build` nem reiniciar o servidor — o deploy é da Mirai.
