import { DocumentNormalizationService } from './DocumentNormalizationService';
import { SEGURADORAS } from '../../lib/seguradoras';

// Aliases/variantes que não aparecem literalmente no `nome` da SEGURADORAS
// (ex: nome fantasia antigo, forma abreviada comum em apólices).
const EXTRA_KEYWORDS: Record<string, string[]> = {
  yelum: ['LIBERTY SEGUROS', 'LIBERTY MUTUAL'], // Yelum é a ex-Liberty
  porto: ['PORTO SEG', 'COMPANHIA DE SEGUROS GERAIS'],
  azul: ['AZUL COMPANHIA', 'PORTO AZUL'],
  tokio: ['TOKIO MARINE SEGURADORA'],
  bradesco: ['BRADESCO AUTO', 'BRADESCO SEGUROS S A'],
};

function stripAccentsUpper(s: string): string {
  return s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// [id, nome, keywords[]] — construído a partir da lista canônica de
// seguradoras (lib/seguradoras.ts) pra nunca ficar desatualizado quando uma
// nova seguradora for cadastrada ali. Inclui também a variante sem espaço
// (ex: "BRADESCOSEGUROS") pra casar com o domínio no rodapé das páginas,
// ex: "bradescoseguros.com.br" — muito mais confiável que o nome do
// segurado numa apólice ruim de ler.
const INSURER_KEYWORDS: Array<{ id: string; nome: string; keywords: string[] }> = SEGURADORAS.map(s => {
  const nomeUpper = stripAccentsUpper(s.nome);
  return {
    id: s.id,
    nome: s.nome,
    keywords: [nomeUpper, nomeUpper.replace(/\s+/g, ''), ...(EXTRA_KEYWORDS[s.id] ?? [])],
  };
});

export class InsurerDetectorService {
  /** Retorna o nome da seguradora (ex: "Bradesco Seguros") ou "unknown". */
  static detect(text: string): string {
    const normalizedText = DocumentNormalizationService.normalize(text);

    for (const { nome, keywords } of INSURER_KEYWORDS) {
      if (keywords.some(keyword => normalizedText.includes(keyword))) {
        return nome;
      }
    }

    return 'unknown';
  }
}
