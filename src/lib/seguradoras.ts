export interface SeguradoraInfo {
  id: string;
  nome: string;
  cor: string;
  ativa: boolean;
}

export const SEGURADORAS: SeguradoraInfo[] = [
  { id: 'porto',    nome: 'Porto Seguro',    cor: '#0052A5', ativa: true },
  { id: 'allianz',  nome: 'Allianz',         cor: '#003781', ativa: true },
  { id: 'zurich',   nome: 'Zurich',          cor: '#1B1464', ativa: true },
  { id: 'tokio',    nome: 'Tokio Marine',    cor: '#003087', ativa: true },
  { id: 'bradesco', nome: 'Bradesco Seguros',cor: '#CC0022', ativa: true },
  { id: 'mapfre',   nome: 'Mapfre',          cor: '#E30613', ativa: true },
  { id: 'hdi',      nome: 'HDI',             cor: '#E87722', ativa: true },
  { id: 'azul',     nome: 'Azul Seguros',    cor: '#0091CF', ativa: true },
  { id: 'suhai',    nome: 'Suhai Seguros',   cor: '#00963F', ativa: true },
  { id: 'aliro',    nome: 'Aliro Seguros',   cor: '#7033A7', ativa: true },
  { id: 'msig',     nome: 'MSIG',            cor: '#003A70', ativa: true },
  { id: 'yelum',    nome: 'Yelum Seguros',   cor: '#FF3300', ativa: true },
];

export const SEGURADORAS_MAP = Object.fromEntries(SEGURADORAS.map(s => [s.id, s]));

export function getSeguradora(id: string): SeguradoraInfo | null {
  return SEGURADORAS_MAP[id] ?? null;
}
