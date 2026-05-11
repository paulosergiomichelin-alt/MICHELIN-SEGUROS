import { auth } from './firebase';
import { logger } from '../services/LoggerService';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined | null;
    email: string | undefined | null;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | undefined | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const isQuotaError = errorMessage.toLowerCase().includes('quota exceeded') || 
                      errorMessage.toLowerCase().includes('quota limit exceeded');

  const errInfo: FirestoreErrorInfo = {
    error: isQuotaError 
      ? 'Limite de cota do banco de dados excedido. Os dados podem não carregar corretamente até o reset diário.' 
      : errorMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };

  logger.error('FIRESTORE_ERROR', `Error in ${operationType} on ${path}`, { 
    error: isQuotaError ? 'Database Quota Exceeded' : errInfo.error,
    isQuotaError,
    operation: operationType,
    path,
    auth: errInfo.authInfo
  });

  throw new Error(JSON.stringify(errInfo));
}
