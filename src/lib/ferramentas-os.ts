/**
 * FERRAMENTAS DO OS — o catálogo que se vê na hora de montar um plano.
 *
 * Por que existe: o plano de controle só conhece CAPACIDADE TÉCNICA
 * (`mirai.memory.search`, `mirai.arquiteto.construir`), e isso é linguagem de quem
 * programa. O dono pediu, em 18/11/2026, para montar plano "como no supermercado":
 * "eu vou adicionando as ferramentas que o OS tem e coloco o valor após".
 *
 * Este arquivo é a ponte: cada FERRAMENTA tem nome e descrição de gente e aponta
 * para as capacidades que ela liga de verdade. Quem salva é sempre a capacidade —
 * a ferramenta é a forma de mostrar e escolher.
 *
 * ⚠️ Capacidade nova no catálogo do plano de controle que não pertença a nenhuma
 * ferramenta daqui fica INVISÍVEL no construtor. `ferramentasAvulsas()` existe para
 * que isso apareça em vez de sumir em silêncio.
 */

export interface FerramentaOS {
  /** id estável da ferramenta (não é o id de capacidade) */
  id: string;
  nome: string;
  /** uma linha, no vocabulário de quem compra */
  descricao: string;
  area: string;
  /** o que o plano REALMENTE libera quando esta ferramenta entra */
  capacidades: string[];
  /** tela de gestão: aparece no plano, mas não liga capacidade técnica nenhuma */
  semCapacidade?: boolean;
}

/** A ordem em que os corredores fazem sentido — não é ordem alfabética. */
export const AREAS_FERRAMENTAS = [
  "Conversa",
  "Conhecimento",
  "Construção",
  "Operação",
  "Agentes",
  "Mensagens",
  "Negócio",
] as const;

export const FERRAMENTAS_OS: FerramentaOS[] = [
  {
    id: "chat",
    nome: "Conversa com a Mirai",
    descricao: "Converse e receba trabalho feito dentro do OS.",
    area: "Conversa",
    capacidades: ["ai.chat"],
  },
  {
    id: "reuniao",
    nome: "Reunião",
    descricao: "Grave, transcreva e consulte reuniões em um só lugar.",
    area: "Conversa",
    capacidades: ["mirai.voz.conversar"],
  },
  {
    id: "documentos",
    nome: "Documentos",
    descricao: "Abra, crie e edite documento ao lado da conversa.",
    area: "Conversa",
    capacidades: ["mirai.documento.editar"],
  },
  {
    id: "arca",
    nome: "A Arca",
    descricao: "Centralize documentos, notas e o conhecimento da equipe.",
    area: "Conhecimento",
    capacidades: ["mirai.memory.search", "mirai.memory.ingest"],
  },
  {
    id: "synapse",
    nome: "Synapse",
    descricao: "Ligue suas fontes e integrações e use de dentro da conversa.",
    area: "Conhecimento",
    capacidades: ["mirai.integration.consult"],
  },
  {
    id: "chaves",
    nome: "Chaves de API",
    descricao: "Gerencie chaves de acesso às integrações.",
    area: "Conhecimento",
    capacidades: [],
    semCapacidade: true,
  },
  {
    id: "projetos",
    nome: "Projetos",
    descricao: "Organize conversas e materiais por iniciativa.",
    area: "Construção",
    capacidades: ["mirai.project.create"],
  },
  {
    id: "arquiteto",
    nome: "Arquiteto",
    descricao: "Área de trabalho que constrói o projeto a partir da conversa.",
    area: "Construção",
    capacidades: [
      "mirai.arquiteto.construir",
      "mirai.code.generate",
      "mirai.service.deploy",
    ],
  },
  {
    id: "agendamentos",
    nome: "Agendamentos",
    descricao: "Tarefas rodando no horário que você marcar.",
    area: "Operação",
    capacidades: ["mirai.automation.execute"],
  },
  {
    id: "infra",
    nome: "Infraestrutura",
    descricao: "Veja o estado dos serviços e o que está no ar.",
    area: "Operação",
    capacidades: ["mirai.infra.status"],
  },
  {
    id: "backup",
    nome: "Backup",
    descricao: "Salve o estado do ambiente e recupere quando precisar.",
    area: "Operação",
    capacidades: ["mirai.backup.now"],
  },
  {
    id: "seguranca",
    nome: "Segurança",
    descricao: "Varre o ambiente e aponta o que está exposto.",
    area: "Operação",
    capacidades: ["mirai.security.scan"],
  },
  {
    id: "dados",
    nome: "Dados",
    descricao: "Pergunte ao banco em linguagem de gente.",
    area: "Operação",
    capacidades: ["mirai.database.query"],
  },
  {
    id: "agentes",
    nome: "Agentes",
    descricao: "Orquestre agentes para tocar trabalho em paralelo.",
    area: "Agentes",
    capacidades: ["mirai.agent.orchestrate"],
  },
  {
    id: "telegram",
    nome: "Telegram",
    descricao: "Receba e envie mensagem pelo Telegram do OS.",
    area: "Mensagens",
    capacidades: ["mirai.telegram.send"],
  },
  {
    id: "negocio",
    nome: "Análise de negócio",
    descricao: "Leia números e cenário do negócio com apoio da IA.",
    area: "Negócio",
    capacidades: ["mirai.business.analyze"],
  },
  {
    // Decisão do dono (19/11/2026): "coloca o saaso em todos os planos".
    // O CRM não é capacidade — é PRODUTO incluído em qualquer plano pago (o plano de controle
    // traz o espaço sozinho via `_garantir_produto_incluso`). Por isso entra sem capacidade:
    // o que o plano libera ao ligar esta ferramenta é o próprio produto Saaso.
    id: "crm",
    nome: "CRM de atendimento (Saaso)",
    descricao: "Inbox, funis, IA de atendimento e agenda — o CRM completo, em todo plano.",
    area: "Negócio",
    capacidades: [],
    semCapacidade: true,
  },
];

/** União das capacidades das ferramentas escolhidas (é o que vai para o plano). */
export function capacidadesDeFerramentas(ids: string[]): string[] {
  const escolhidas = new Set(ids);
  const caps = new Set<string>();
  for (const f of FERRAMENTAS_OS) {
    if (escolhidas.has(f.id)) f.capacidades.forEach((c) => caps.add(c));
  }
  return Array.from(caps).sort();
}

/** Quais ferramentas um plano já existente cobre (para editar o que já foi salvo). */
export function ferramentasDeCapacidades(capacidades: string[]): FerramentaOS[] {
  const caps = new Set(capacidades);
  return FERRAMENTAS_OS.filter((f) => f.capacidades.some((c) => caps.has(c)));
}

/** Ferramentas que ficam marcadas mesmo sem ligar capacidade (chaves de API). */
export function ferramentasDeGestao(capacidades: string[]): FerramentaOS[] {
  const caps = new Set(capacidades);
  return FERRAMENTAS_OS.filter(
    (f) => f.semCapacidade && f.capacidades.length === 0 && caps.size > 0,
  );
}

/** Capacidades do plano que NÃO pertencem a nenhuma ferramenta — não podem sumir. */
export function capacidadesAvulsas(capacidades: string[]): string[] {
  const cobertas = new Set(FERRAMENTAS_OS.flatMap((f) => f.capacidades));
  return capacidades.filter((c) => !cobertas.has(c));
}

export function ferramentaPorId(id: string): FerramentaOS | undefined {
  return FERRAMENTAS_OS.find((f) => f.id === id);
}
