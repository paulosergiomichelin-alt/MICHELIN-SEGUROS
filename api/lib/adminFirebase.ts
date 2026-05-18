import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

const PROJECT_ID   = 'gen-lang-client-0929974546';
const DATABASE_ID  = 'ai-studio-e7cf89ac-d4c5-4bef-9fa5-57e4ac67170c';

let _db: Firestore | null = null;

export function getAdminDb(): Firestore {
  if (_db) return _db;

  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT env var não definida');
    initializeApp({ credential: cert(JSON.parse(raw)), projectId: PROJECT_ID });
  }

  _db = getFirestore(DATABASE_ID);
  return _db;
}
