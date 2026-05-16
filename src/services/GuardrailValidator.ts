import { LeadStep } from '../types';
import { logger } from './LoggerService';

export interface ValidationResult {
  valid: boolean;
  message: string;
  issues: string[];
  reprocessed: boolean;
}

type ReprocessFn = (instruction: string) => Promise<string>;

const FORBIDDEN_PHRASES = [
  /processando/i,
  /analisando/i,
  /verificando/i,
  /aguarde um momento/i,
  /estou processando/i,
  /sou (uma? )?i\.?a\.?/i,
  /sou (um )?(rob[oô]|assistente virtual)/i,
  /como i\.?a\.?/i,
  /como (sistema|bot)/i,
];

const MAX_CHARS = 400;
const MAX_REPROCESSES = 2;

function countQuestions(text: string): number {
  return (text.match(/\?/g) || []).length;
}

function hasMultipleQuestions(text: string): boolean {
  return countQuestions(text) > 1;
}

function isTooLong(text: string): boolean {
  return text.length > MAX_CHARS;
}

function hasForbiddenPhrase(text: string): { found: boolean; phrase: string } {
  for (const re of FORBIDDEN_PHRASES) {
    if (re.test(text)) return { found: true, phrase: re.source };
  }
  return { found: false, phrase: '' };
}

export async function validate(
  response: string,
  _step: LeadStep,
  fallbackMessage: string,
  reprocess?: ReprocessFn
): Promise<ValidationResult> {
  let current = response;
  const allIssues: string[] = [];
  let reprocessCount = 0;
  let didReprocess = false;

  for (let attempt = 0; attempt <= MAX_REPROCESSES; attempt++) {
    const issues: string[] = [];

    if (hasMultipleQuestions(current)) {
      issues.push('Mais de uma pergunta detectada');
    }

    if (isTooLong(current)) {
      issues.push(`Texto muito longo: ${current.length} caracteres (máx ${MAX_CHARS})`);
    }

    const forbidden = hasForbiddenPhrase(current);
    if (forbidden.found) {
      issues.push(`Frase proibida detectada: "${forbidden.phrase}"`);
    }

    if (issues.length === 0) {
      return {
        valid: true,
        message: current,
        issues: allIssues,
        reprocessed: didReprocess,
      };
    }

    allIssues.push(...issues);
    logger.warn('GUARDRAIL', `Tentativa ${attempt + 1}: ${issues.join(' | ')}`, { response: current });

    if (attempt < MAX_REPROCESSES && reprocess) {
      didReprocess = true;
      reprocessCount++;

      const instructions: string[] = [];
      if (hasMultipleQuestions(current)) instructions.push('reescreva com apenas UMA pergunta');
      if (isTooLong(current)) instructions.push('resuma em no máximo 3 linhas curtas');
      if (hasForbiddenPhrase(current).found) instructions.push('remova qualquer referência a processamento, IA ou robô');

      try {
        current = await reprocess(instructions.join('; '));
      } catch (err) {
        logger.error('GUARDRAIL', 'Reprocessamento falhou', err);
        break;
      }
    } else {
      break;
    }
  }

  logger.warn('GUARDRAIL', `Usando fallback após ${reprocessCount} reprocessamentos`, { fallbackMessage });

  return {
    valid: false,
    message: fallbackMessage,
    issues: allIssues,
    reprocessed: didReprocess,
  };
}
