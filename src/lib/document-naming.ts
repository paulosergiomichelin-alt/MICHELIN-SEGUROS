// Nome de exibição padronizado pra qualquer anexo importado no sistema (CNH/CRLV/Apólice
// no lead, documentos do cliente, anexos de apólice) — "Tipo - Nome da pessoa", com a
// seguradora embutida no tipo quando é uma apólice. Ex.: "CNH - Paulo Sergio Michelin",
// "Apólice Bradesco - Paulo Sergio Michelin".

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  cnh: 'CNH',
  crv: 'CRLV',
  crlv: 'CRLV',
  policy: 'Apólice',
  apolice: 'Apólice',
  rg: 'RG',
  cpf: 'CPF',
  rc: 'RC',
  carta_verde: 'Carta Verde',
  carteirinha: 'Carteirinha',
  boleto: 'Boleto',
  cotacao: 'Cotação',
  outros: 'Outros',
};

export function documentTypeLabel(tipo?: string): string {
  if (!tipo) return 'Documento';
  return DOCUMENT_TYPE_LABELS[tipo.toLowerCase()] ?? tipo.toUpperCase();
}

const POLICY_TYPES = new Set(['policy', 'apolice']);

export function buildDocumentDisplayName(tipo: string, nomePessoa?: string, seguradora?: string): string {
  let label = documentTypeLabel(tipo);
  if (seguradora && POLICY_TYPES.has(tipo?.toLowerCase())) {
    label = `${label} ${seguradora}`.trim();
  }
  const nome = (nomePessoa || '').trim();
  return nome ? `${label} - ${nome}` : label;
}
