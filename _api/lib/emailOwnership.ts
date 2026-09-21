import { fsGet } from './pgData.js';

// Erro tipado pra handlers distinguirem "não encontrado" (404) de "encontrado,
// mas pertence a outro usuário" (403) sem duplicar essa lógica em cada arquivo.
export class OwnershipError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

// Toda rota de e-mail/calendário é keyed por accountId vindo do cliente — sem
// isso, qualquer usuário autenticado (ou, antes desta correção, até anônimo)
// conseguia ler/escrever a caixa de entrada de outro usuário só sabendo o id.
export async function loadOwnedEmailAccount(
  accountId: string,
  userId: string,
): Promise<Record<string, any>> {
  const account = await fsGet('email_accounts', accountId);
  if (!account) throw new OwnershipError(`Conta de e-mail ${accountId} não encontrada`, 404);
  if (account.userId !== userId) {
    throw new OwnershipError('Conta de e-mail não pertence ao usuário autenticado', 403);
  }
  return account;
}

// Retorna true (e já respondeu) se o erro era de posse/existência da conta —
// handler chama isso no catch antes de cair no 500 genérico.
export function handleOwnershipError(err: any, res: any): boolean {
  if (err instanceof OwnershipError) {
    res.status(err.statusCode).json({ error: err.message });
    return true;
  }
  return false;
}
