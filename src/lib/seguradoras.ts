export interface SeguradoraInfo {
  id: string;
  nome: string;
  cor: string;
  logo?: string;
  ativa: boolean;
}

const clr = (domain: string) => `https://logo.clearbit.com/${domain}`;

export const SEGURADORAS: SeguradoraInfo[] = [
  { id: 'porto',    nome: 'Porto Seguro',    cor: '#0052A5', logo: clr('portoseguro.com.br'),       ativa: true },
  { id: 'allianz',  nome: 'Allianz',         cor: '#003781', logo: clr('allianz.com.br'),            ativa: true },
  { id: 'zurich',   nome: 'Zurich',          cor: '#1B1464', logo: clr('zurich.com.br'),             ativa: true },
  { id: 'tokio',    nome: 'Tokio Marine',    cor: '#003087', logo: clr('tokiomarine.com.br'),        ativa: true },
  { id: 'bradesco', nome: 'Bradesco Seguros',cor: '#CC0022', logo: clr('bradescoeseguros.com.br'),   ativa: true },
  { id: 'mapfre',   nome: 'Mapfre',          cor: '#E30613', logo: clr('mapfre.com.br'),             ativa: true },
  { id: 'hdi',      nome: 'HDI',             cor: '#E87722', logo: clr('hdiseguros.com.br'),         ativa: true },
  { id: 'azul',     nome: 'Azul Seguros',    cor: '#0091CF', logo: clr('azulseguros.com.br'),        ativa: true },
  { id: 'suhai',    nome: 'Suhai Seguros',   cor: '#00963F', logo: clr('suhai.com.br'),              ativa: true },
  { id: 'aliro',    nome: 'Aliro Seguros',   cor: '#7033A7', logo: clr('aliro.com.br'),              ativa: true },
  { id: 'msig',     nome: 'MSIG',            cor: '#003A70', logo: clr('msig.com.br'),               ativa: true },
  { id: 'yelum',    nome: 'Yelum Seguros',   cor: '#FF3300', logo: clr('yelum.com.br'),              ativa: true },
];

export const SEGURADORAS_MAP = Object.fromEntries(SEGURADORAS.map(s => [s.id, s]));

export function getSeguradora(id: string): SeguradoraInfo | null {
  return SEGURADORAS_MAP[id] ?? null;
}
