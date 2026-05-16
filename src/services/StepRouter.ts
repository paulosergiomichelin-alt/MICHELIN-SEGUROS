import { Lead, AgentConfig, LeadStep, SalesBlockKey } from '../types';

export interface StepContext {
  objective: string;
  salesBlock: string;
  fallbackMessage: string;
  step: LeadStep;
}

const STEP_OBJECTIVES: Record<LeadStep, string> = {
  NOVO_LEAD:
    'Faça a saudação inicial adaptando ao estilo da mensagem do cliente. Capture o nome de forma natural sem parecer um formulário.',
  COLETAR_NOME:
    'Solicite apenas o nome completo. Nada mais nesta mensagem. Seja leve e amigável.',
  IDENTIFICAR_INTENCAO:
    'Identifique se é renovação ou seguro novo. Faça apenas essa pergunta.',
  SOLICITAR_CNH:
    'Peça a foto da CNH de forma amigável. Se o cliente hesitar ou perguntar por quê, explique brevemente que é para buscar o melhor preço.',
  SOLICITAR_CRLV:
    'Peça o documento do veículo (CRLV). Antes de pedir, confirme brevemente que já recebeu a CNH.',
  SOLICITAR_APOLICE:
    'Peça a apólice anterior. Explique que ajuda a negociar melhor o valor com as seguradoras.',
  AGUARDANDO_COTACAO:
    'Informe que está calculando nas seguradoras parceiras. Crie expectativa positiva sem prometer prazo exato.',
  APRESENTAR_PROPOSTA:
    'Apresente a cotação de forma clara e objetiva. Destaque o custo-benefício da melhor opção sem listar todas.',
  NEGOCIACAO:
    'O cliente respondeu à proposta. Ouça, acolha a objeção e reposicione valor conforme necessário. Não ceda ao preço antes de defender o produto.',
  FECHAMENTO:
    'O cliente aceitou ou está muito próximo. Confirme com entusiasmo e oriente sobre os próximos passos de forma simples.',
  REENGAJAMENTO:
    'O cliente ficou inativo por algum tempo. Retome de forma leve e sem pressão, como quem apenas quer saber se ainda pode ajudar.',
  OCR_FALHOU:
    'O documento não foi lido corretamente. Peça nova foto de forma gentil e dê dicas práticas para uma boa captura (luz, foco, documento aberto).',
};

const STEP_FALLBACKS: Record<LeadStep, string> = {
  NOVO_LEAD: 'Olá! Tudo bem? Vou te ajudar a cotar seu seguro 👌 Pode me dizer seu nome?',
  COLETAR_NOME: 'Perfeito 👍 pode me informar seu nome completo?',
  IDENTIFICAR_INTENCAO: 'Seu seguro é uma renovação ou seria um seguro novo?',
  SOLICITAR_CNH: 'Para buscar o melhor preço, me manda a foto da sua CNH 📸',
  SOLICITAR_CRLV: 'Ótimo! Agora me envia o documento do veículo (CRLV) 🚗',
  SOLICITAR_APOLICE: 'Consegue me mandar uma foto da sua última apólice? Ajuda a negociar melhor 😊',
  AGUARDANDO_COTACAO: 'Perfeito! Já estou calculando nas seguradoras parceiras 👍',
  APRESENTAR_PROPOSTA: 'Veja as opções que encontrei para você! Qual mais te agradou?',
  NEGOCIACAO: 'Entendo! Me conta o que ficou de dúvida que resolvo pra você.',
  FECHAMENTO: 'Excelente escolha! ✅ Vou encaminhar para finalização. Receberá a apólice em breve!',
  REENGAJAMENTO: 'Oi! Ainda estou aqui caso precise retomar sua cotação 😊',
  OCR_FALHOU: 'Não consegui ler o documento. Pode tirar outra foto com mais luz e o documento bem aberto?',
};

const STEP_TO_SALES_BLOCKS: Record<LeadStep, SalesBlockKey[]> = {
  NOVO_LEAD: ['quebra_de_gelo', 'primeiro_atendimento'],
  COLETAR_NOME: ['primeiro_atendimento'],
  IDENTIFICAR_INTENCAO: ['primeiro_atendimento', 'reducao_atrito'],
  SOLICITAR_CNH: ['reducao_atrito'],
  SOLICITAR_CRLV: ['reducao_atrito'],
  SOLICITAR_APOLICE: ['reducao_atrito'],
  AGUARDANDO_COTACAO: [],
  APRESENTAR_PROPOSTA: ['gatilhos_mentais', 'fechamento'],
  NEGOCIACAO: ['objecoes', 'gatilhos_mentais', 'venda_por_cenario'],
  FECHAMENTO: ['fechamento'],
  REENGAJAMENTO: ['urgencia_suave', 'gatilhos_mentais'],
  OCR_FALHOU: ['reducao_atrito'],
};

function resolveStep(lead: Lead): LeadStep {
  if (lead.documentStatus === 'erro_extracao') return 'OCR_FALHOU';
  if (!lead.name || lead.name.match(/^\d+$/)) return 'COLETAR_NOME';
  if (lead.status === 'Novo Lead' && !lead.isRenewal && lead.isRenewal !== false) return 'IDENTIFICAR_INTENCAO';

  const hasCnh = !!lead.documents?.cnh || (!!lead.cpf && !!lead.name);
  const hasCrv = !!(lead.documents as any)?.crv || !!lead.plate;

  if (!hasCnh) return 'SOLICITAR_CNH';
  if (!hasCrv) return 'SOLICITAR_CRLV';

  if (lead.isRenewal && !lead.documents?.policy) return 'SOLICITAR_APOLICE';

  if (lead.status === 'Em Cotação') return 'AGUARDANDO_COTACAO';
  if (lead.status === 'Proposta Enviada') return 'APRESENTAR_PROPOSTA';
  if (lead.status === 'Negociação') return 'NEGOCIACAO';
  if (lead.status === 'Fechado') return 'FECHAMENTO';

  const sinceHours = lead.stuckSince
    ? (Date.now() - new Date(lead.stuckSince).getTime()) / 3_600_000
    : 0;
  if (sinceHours > (lead as any)._maxInactivity || 0) return 'REENGAJAMENTO';

  return 'NOVO_LEAD';
}

function buildSalesBlock(step: LeadStep, salesBlocks?: AgentConfig['salesBlocks']): string {
  if (!salesBlocks) return '';
  const keys = STEP_TO_SALES_BLOCKS[step] ?? [];
  return keys
    .map(k => salesBlocks[k])
    .filter(Boolean)
    .join('\n\n');
}

export function getStepContext(lead: Lead, agentConfig: AgentConfig): StepContext {
  const step = resolveStep(lead);
  return {
    step,
    objective: STEP_OBJECTIVES[step],
    salesBlock: buildSalesBlock(step, agentConfig.salesBlocks),
    fallbackMessage: STEP_FALLBACKS[step],
  };
}
