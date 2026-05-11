export interface GuardContext {
  leadStatus: string;
  lead?: any;
  nextStep?: string;
  overridden?: boolean;
  lastUserMessage?: string;
}

export class ExecutionGuard {
  public static readonly INVALID_PATTERNS = [
    "algo mais",
    "como posso ajudar",
    "já estou anotando",
    "certo",
    "ok",
    "entendido",
    "estou à disposição",
    "posso ajudar em algo",
    "qualquer dúvida"
  ];

  /**
   * Valida se a resposta é passiva ou curta demais
   */
  public static isInvalidResponse(response: string): boolean {
    const text = response.toLowerCase();
    const matchesPattern = this.INVALID_PATTERNS.some(p => text.includes(p));
    const isTooShort = response.trim().length < 15;
    
    return matchesPattern || isTooShort;
  }

  /**
   * Detecta o contexto da mensagem do usuário
   */
  public static detectContext(message: string): "greeting" | "intent_quote" | "unknown" {
    if (!message) return "unknown";
    const text = message.toLowerCase();
    
    // Greeting patterns - simple and inclusive
    if (text.match(/^(oi|olá|ola|bom dia|boa tarde|boa noite|tudo bem|como vai|opa|ei|hey|hello|hi)/i) || 
        (text.length < 15 && text.match(/oi|olá|bom dia|boa tarde|boa noite/i))) {
      return "greeting";
    }

    // Intent patterns
    if (text.match(/cotação|cotacao|seguro|preço|preco|valor|quanto fica|carro|veiculo|auto|moto/i)) {
      return "intent_quote";
    }

    return "unknown";
  }

  /**
   * Valida se a resposta da IA menciona as keywords esperadas para o passo
   */
  public static missesStepKeywords(response: string, nextStep: string): boolean {
    const lowerResponse = response.toLowerCase();
    const stepKeywords: Record<string, string[]> = {
      coletar_nome: ["nome", "chamo", "quem fala"],
      solicitar_cnh: ["cnh", "habilitação", "documento seu", "foto"],
      solicitar_crv: ["documento do veiculo", "crv", "crlv", "documento do carro", "foto"],
      coletar_placa: ["placa", "letra", "número"]
    };

    const keywords = stepKeywords[nextStep] || [];
    if (keywords.length === 0) return false;
    
    return !keywords.some(k => lowerResponse.includes(k)) && response.length < 50;
  }
}
