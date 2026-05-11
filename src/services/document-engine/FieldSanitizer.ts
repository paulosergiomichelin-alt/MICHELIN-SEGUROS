/**
 * FieldSanitizer.ts
 * Cleans up extracted text by removing unwanted labels, headers, and social prefixes.
 */
export class FieldSanitizer {
  private static instance: FieldSanitizer;
  private constructor() {}

  public static getInstance(): FieldSanitizer {
    if (!this.instance) this.instance = new FieldSanitizer();
    return this.instance;
  }

  private static NAME_BLACKLIST = [
    'NOME SOCIAL',
    'NOME DO(A)',
    'SEGURADO(A)',
    'NOME DO SEGURADO',
    'SEGURADO',
    'IDENTIFICACAO',
    'FILIACAO',
    'PROPRIETARIO',
    'CONDUTOR',
    'PRINCIPAL',
    'E/OU',
    'CABECALHO',
    'DADOS DO',
    'BENEFICIARIO',
    'NAME AND SURNAME',
    'NOMBRE Y APELLIDOS',
    'FIRST DRIVER LICENSE',
    'PRIMEIRA HABILITACAO',
    'PRIMEIRA HABILITAÇÃO',
    'DATA DE VALIDADE',
    'ASSINADO DIGITALMENTE',
    'EXERCICIO',
    'FUNDO',
    'CARTEIRA NACIONAL DE HABILITACAO',
    'CARTEIRA NACIONAL DE HABILITAÇÃO',
    'NOME DO(A) SEGURADO',
    'DADOS DO(A)',
    'RAMO',
    'AUTOMÓVEL CASCO',
    'FILIAÇÃO',
    'CAT HAB',
    'ACC',
    'DOC IDENTIDADE',
    'ORG EMISSOR',
    'SENATRAN',
    'REPUBLICA FEDERATIVA',
    'REPÚBLICA FEDERATIVA',
    'Nº',
    'DADOS',
    'NAME',
    'SURNAME',
    'NOMBRE',
    'APELLIDOS',
    'FIRST DRIVER',
    'PRIMERA',
    'LICENCIA',
    'VALIDADE',
    'FILIACAO',
    'PERMISSAO',
    'OBSERVACOES',
    'CARTEIRA NACIONAL',
    'DRIVER LICENSE',
    'PERMISO DE CONDUCCIÓN',
    'FECHA DE EMISIÓN',
    'EMISSÃO',
    'NOME DO CONDUTOR',
    'VALOR(R$)',
    'FALECONOSCO',
    'CORRETORA',
    'CORRETOR',
    'VINCULO',
    'LOCAL',
    'EMISSOR'
  ];

  /**
   * Words that should NEVER be considered a valid value for any field.
   * If an extracted value IS one of these, it must be rejected.
   */
  private static REJECT_WORDS = [
    'LOCAL', 'CONDUTOR', 'VINCULO', 'CORRETOR', 'VALOR(R$)', 'FALECONOSCO',
    'CATEGORIA', 'OBSERVACOES', 'IDENTIDADE', 'SEGURADO', 'DOC', 'RENACH',
    'MODELO', 'PLACA', 'CHASSI', 'RENAVAM', 'CPF', 'CNPJ', 'NOME', 'SOCIAL',
    'ENDERECO', 'TELEFONE', 'SUSEP', 'DATA', 'EMISSAO', 'EMISSÃO', 'VALIDADE',
    'REGISTRO', 'IDENTIFICACAO', 'LOCALIDADE', 'SAO PAULO', 'BRASIL', 'AUTORIDADE',
    'LEMBRAMOS', 'AINDA', 'QUALQUER', 'ALTERACAO', 'CONFORME', 'RESOLUCAO', 'SUSEP',
    'WWW.', 'HTTP', 'COM.', 'BR', 'EMAIL', '@', 'WWW', 'HTTPS', 'WWW.SUSEP.GOV.BR',
    '(A)', '(O)', 'SR.', 'SRA.', 'Nº', 'LIMITE', 'IMPORTANCIA', 'PREMIO', 'PARCELA',
    'EMITIU', 'ESTA', 'APOLICE', 'CONFORME', 'CONTRATACAO', 'NOS TERMOS', 'VIGENCIA',
    'PARA', 'MAIS', 'INFORMACOES', 'ACESSE', 'PORTAL', 'SEGURADORA', 'CLIENTE',
    'AVENIDA', 'RUA', 'BAIRRO', 'CIDADE', 'ESTADO', 'CEP', 'TELEFONE', 'SAC', 'OUVIDORIA',
    'LOCALIDADE', 'LOGRADOURO', 'MUNICIPIO', 'UF', 'PLACA', 'CHASSI', 'RENAVAM', 'MARCA', 'MODELO'
  ];

  public isAddressIndicator(val: string): boolean {
    const uVal = val.toUpperCase().trim();
    const indicators = ['RUA', 'AVENIDA', 'AV.', 'TRAVESSA', 'LOTE', 'QUADRA', 'BAIRRO', 'LOGRADOURO', 'CEP', 'MUNICIPIO', 'CIDADE', 'LOCALIDADE'];
    return indicators.some(ind => uVal === ind || uVal.startsWith(ind + ' '));
  }

  public isRejectedValue(val: string): boolean {
    if (!val) return true;
    const uVal = val.toUpperCase().trim();
    if (uVal.length < 2) return true;
    
    // Exact match in reject dictionary
    if (FieldSanitizer.REJECT_WORDS.includes(uVal)) return true;

    // Phrase match: Juridical or disclaimer phrases
    const phrases = [
      'EMITIU ESTA', 'LEMBRAMOS AINDA', 'CONFORME RESOLUCAO', 'QUALQUER ALTERACAO',
      'PARA MAIS INFORMACOES', 'NOS TERMOS DA', 'SUSEP.GOV.BR', 'AVENIDA', 'SAO PAULO',
      'CNPJ DA SEGURADORA', 'DADOS DA CORRETORA', 'IMPORTANCIA SEGURADA', 'QUALQUER MOMENTO',
      'ESTA APOLICE', 'CONTRATACAO DESTE', 'PROCESSO SUSEP'
    ];

    if (phrases.some(p => uVal.includes(p))) return true;

    return false;
  }

  public sanitizeCNHRegion(value: string, region: string): string {
    if (!value) return '';
    let sanitized = value.toUpperCase().trim();
    
    // Remove bilingual and structural noise specific to CNH
    const regionNoise = [
      'NAME AND SURNAME', 'NOMBRE Y APELLIDOS', 'FIRST DRIVER LICENSE', 'PRIMERA LICENCIA',
      'CARTEIRA NACIONAL DE HABILITACAO', 'CARTEIRA NACIONAL DE HABILITAÇÃO', 'DOC IDENTIDADE', 'ORG EMISSOR', 'IDENTIDADE',
      'FILIACAO', 'FILIAÇÃO', 'PROPRIETARIO', 'NOME', 'CPF', 'NASCIMENTO', 'VALIDADE', 'REGISTRO',
      'CAT', 'HAB', 'SENATRAN', 'RENACH', 'ACC', 'DATA DE', 'IDENTIFICACAO', 'LOCAL',
      'NOME DO CONDUTOR', 'NOME DO(A) CONDUTOR', 'EMISSAO', 'EMISSÃO'
    ];

    for (const noise of regionNoise) {
       const regex = new RegExp(`\\b${noise}\\b|${noise}\\/|${noise}[:]`, 'gi');
       sanitized = sanitized.replace(regex, '');
    }

    sanitized = sanitized.replace(/[^A-ZÇÁÉÍÓÚÂÊÔÃÕ./ -]/g, ' ');
    return sanitized.replace(/\s+/g, ' ').trim();
  }

  public validateCPFChecksum(cpf: string): boolean {
    const clean = cpf.replace(/\D/g, '');
    if (clean.length !== 11) return false;
    if (/^(\d)\1+$/.test(clean)) return false;

    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(clean.charAt(i)) * (10 - i);
    let rev = 11 - (sum % 11);
    if (rev === 10 || rev === 11) rev = 0;
    if (rev !== parseInt(clean.charAt(9))) return false;

    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(clean.charAt(i)) * (11 - i);
    rev = 11 - (sum % 11);
    if (rev === 10 || rev === 11) rev = 0;
    if (rev !== parseInt(clean.charAt(10))) return false;

    return true;
  }

  public sanitizeCNHName(name: string): string {
    const raw = this.sanitizeCNHRegion(name, 'NOME');
    if (!raw) return '';

    // If result contains common noise words, return empty
    if (this.isRejectedValue(raw)) return '';

    // Advanced validation: must have at least 1 word
    const words = raw.split(' ').filter(w => w.length >= 2);
    if (words.length < 1) {
      return '';
    }

    // Purity check: Names shouldn't have numbers
    if (/\d/.test(raw)) return '';

    return raw;
  }

  public validate(value: string, pattern: RegExp): string {
    const match = value.match(pattern);
    return match ? match[0] : '';
  }

  public REGEX = {
    CPF: /^\d{3}\.\d{3}\.\d{3}-\d{2}$/,
    PLATE: /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/,
    CHASSIS: /^[A-HJ-NPR-Z0-9]{17}$/,
    DATE: /^\d{2}\/\d{2}\/\d{4}$/,
    RENAVAN: /^\d{9,11}$/,
    CATEGORIA: /^[A-E]{1,2}$|^ACC$/
  };

  public sanitizeName(name: string): string {
    if (!name) return '';
    
    let sanitized = name.toUpperCase().trim();

    // Remove specific blacklisted strings
    for (const token of FieldSanitizer.NAME_BLACKLIST) {
      // Use regex with word boundary or specific pattern
      const regex = new RegExp(`\\b${token}\\b|${token}[:]`, 'gi');
      sanitized = sanitized.replace(regex, '');
    }

    // Remove common prefixes used in insurance forms
    sanitized = sanitized.replace(/^\(A\) |^\(O\) /g, '');
    sanitized = sanitized.replace(/DA SEGURADORA|DO SEGURADO/g, '');
    
    // Clean symbols and extra spaces
    sanitized = sanitized.replace(/[^A-ZÇÁÉÍÓÚÂÊÔÃÕ\- ]/g, ' ');
    sanitized = sanitized.replace(/\s+/g, ' ').trim();

    // If result is too short, it was probably all labels
    if (sanitized.length < 3) return '';

    return sanitized;
  }

  public sanitizeCPF(cpf: string): string {
    if (!cpf) return '';
    const digits = cpf.replace(/\D/g, '');
    if (digits.length === 11) {
       return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    }
    return cpf.trim();
  }

  public sanitizeDate(dateStr: string): string {
    if (!dateStr) return '';
    // Basic regex check for DD/MM/YYYY
    const match = dateStr.match(/\d{2}\/\d{2}\/\d{4}/);
    return match ? match[0] : '';
  }
}
