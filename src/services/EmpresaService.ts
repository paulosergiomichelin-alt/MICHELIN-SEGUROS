import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  getDocs,
  onSnapshot,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { createUserWithEmailAndPassword, updateProfile, getAuth, fetchSignInMethodsForEmail } from 'firebase/auth';
import { initializeApp, deleteApp } from 'firebase/app';
import { db, storage } from '../lib/firebase';
import { generateId } from '../lib/utils';
import type { Empresa, EmpresaMetricas, PlanSaas, StatusEmpresa } from '../types';
import firebaseConfig from '../../firebase-applet-config.json';

// ---------------------------------------------------------------------------
// Plan limits lookup
// ---------------------------------------------------------------------------

const PLAN_LIMITS: Record<PlanSaas, { limiteUsuarios: number; limiteLeadsMes: number; limiteStorageMb: number }> = {
  basico: { limiteUsuarios: 5, limiteLeadsMes: 100, limiteStorageMb: 500 },
  profissional: { limiteUsuarios: 25, limiteLeadsMes: 1000, limiteStorageMb: 5120 },
  enterprise: { limiteUsuarios: 999, limiteLeadsMes: 999999, limiteStorageMb: 102400 },
};

// ---------------------------------------------------------------------------
// CNPJ validation — real mod-11 algorithm
// ---------------------------------------------------------------------------

function validateCnpj(cnpj: string): boolean {
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return false;
  // Reject sequences of identical digits
  if (/^(\d)\1+$/.test(digits)) return false;

  const calcDigit = (slice: string, weights: number[]): number => {
    const sum = slice
      .split('')
      .reduce((acc, d, i) => acc + parseInt(d, 10) * weights[i], 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  const d1 = calcDigit(digits.slice(0, 12), w1);
  if (d1 !== parseInt(digits[12], 10)) return false;

  const d2 = calcDigit(digits.slice(0, 13), w2);
  if (d2 !== parseInt(digits[13], 10)) return false;

  return true;
}

// ---------------------------------------------------------------------------
// Slug utilities
// ---------------------------------------------------------------------------

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')   // keep only alphanumeric, spaces, hyphens
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 90);
}

async function gerarSlugUnico(nome: string): Promise<string> {
  const base = slugify(nome);
  const empresasRef = collection(db, 'empresas');

  // Try the base slug first, then append random suffixes
  const candidates = [base, ...Array.from({ length: 10 }, (_, i) => `${base}-${generateId(4 + i)}`)] ;

  for (const candidate of candidates) {
    const q = query(empresasRef, where('slug', '==', candidate));
    const snap = await getDocs(q);
    if (snap.empty) return candidate;
  }

  // Fallback: slug + full random id (guaranteed unique enough)
  return `${base}-${generateId(12)}`;
}

// ---------------------------------------------------------------------------
// EmpresaService
// ---------------------------------------------------------------------------

export const EmpresaService = {
  validateCnpj,

  /**
   * Full onboarding flow:
   * 1. Create Firebase Auth user
   * 2. Generate empresa ID
   * 3. Write users/{uid} doc
   * 4. Write empresas/{empresaId} doc
   */
  async onboarding(data: {
    nomeRazaoSocial: string;
    nomeFantasia?: string;
    cnpj: string;
    emailCorporativo: string;
    telefone?: string;
    ownerNome: string;
    ownerEmail: string;
    ownerTelefone?: string;
    ownerSenha: string;
    planoSaas: PlanSaas;
    timezone: string;
    idioma: string;
  }): Promise<{ empresa: Empresa; uid: string }> {
    if (!validateCnpj(data.cnpj)) {
      throw new Error('CNPJ inválido');
    }

    // Step 0 — Pre-check: abort immediately if the email is already in Firebase Auth.
    // This prevents creating an orphaned Auth user when the Firestore write would fail.
    const { firestoreDatabaseId: _ignored, ...standardConfig } = firebaseConfig as typeof firebaseConfig & { firestoreDatabaseId?: string };
    const checkApp  = initializeApp(standardConfig, `email-check-${Date.now()}`);
    const checkAuth = getAuth(checkApp);
    try {
      const methods = await fetchSignInMethodsForEmail(checkAuth, data.ownerEmail);
      if (methods.length > 0) {
        throw new Error('EMAIL_ALREADY_REGISTERED');
      }
    } finally {
      await deleteApp(checkApp);
    }

    // Step 1 — Create Firebase Auth user using a secondary app so the current
    // admin session is NOT replaced by the newly created account.
    const secondaryApp = initializeApp(standardConfig, `onboarding-${Date.now()}`);
    const secondaryAuth = getAuth(secondaryApp);
    let uid: string;
    try {
      const credential = await createUserWithEmailAndPassword(secondaryAuth, data.ownerEmail, data.ownerSenha);
      uid = credential.user.uid;
      await updateProfile(credential.user, { displayName: data.ownerNome });
    } finally {
      await deleteApp(secondaryApp);
    }

    // Step 2 — Generate empresa ID
    const empresaId = generateId(20);

    // Step 3 — Generate slug
    const slug = await gerarSlugUnico(data.nomeRazaoSocial);

    // Step 4 — Compute plan limits & trial expiry
    const limits = PLAN_LIMITS[data.planoSaas];
    const now = new Date();
    const trialExpiraEm = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();

    const empresa: Empresa = {
      id: empresaId,
      nomeRazaoSocial: data.nomeRazaoSocial,
      nomeFantasia: data.nomeFantasia,
      cnpj: data.cnpj.replace(/\D/g, ''),
      emailCorporativo: data.emailCorporativo,
      telefone: data.telefone,
      slug,
      logoUrl: undefined,
      planoSaas: data.planoSaas,
      limiteUsuarios: limits.limiteUsuarios,
      limiteLeadsMes: limits.limiteLeadsMes,
      limiteStorageMb: limits.limiteStorageMb,
      status: 'trial',
      trialExpiraEm,
      timezone: data.timezone,
      idioma: data.idioma,
      ownerUserId: uid,
      organizationId: empresaId,
      criadoEm: now.toISOString(),
      atualizadoEm: now.toISOString(),
    };

    // Step 5 — Write user doc
    const userDoc = {
      uid,
      email: data.ownerEmail,
      name: data.ownerNome,
      phone: data.ownerTelefone ?? null,
      role: 'admin',
      userType: 'HUMAN',
      permissions: {
        canReadAllLeads: true,
        canWriteAllLeads: true,
        canDelete: true,
        canAccessSettings: true,
        canManageUsers: true,
      },
      status: 'active',
      onboardingCompleted: true,
      organizationId: empresaId,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    // merge: true preserves existing fields (e.g. superadmin) on re-registration
    await setDoc(doc(db, 'users', uid), userDoc, { merge: true });

    // Step 6 — Write empresa doc
    await setDoc(doc(db, 'empresas', empresaId), empresa, { merge: true });

    return { empresa, uid };
  },

  async getEmpresa(id: string): Promise<Empresa | null> {
    const snap = await getDoc(doc(db, 'empresas', id));
    if (!snap.exists()) return null;
    return snap.data() as Empresa;
  },

  async updateEmpresa(id: string, data: Partial<Empresa>): Promise<void> {
    const updateData = {
      ...data,
      atualizadoEm: new Date().toISOString(),
    };
    // Remove undefined values to avoid Firestore errors
    Object.keys(updateData).forEach((k) => {
      if ((updateData as Record<string, unknown>)[k] === undefined) {
        delete (updateData as Record<string, unknown>)[k];
      }
    });
    await updateDoc(doc(db, 'empresas', id), updateData);
  },

  async uploadLogo(empresaId: string, file: File): Promise<string> {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      throw new Error('Formato inválido. Use PNG, JPG ou WebP.');
    }
    if (file.size > 2 * 1024 * 1024) {
      throw new Error('Arquivo muito grande. Máximo 2 MB.');
    }

    const ext = file.name.split('.').pop() ?? 'png';
    const path = `empresas/${empresaId}/logo/${Date.now()}_logo.${ext}`;
    const storageRef = ref(storage, path);

    await uploadBytes(storageRef, file, { contentType: file.type });
    const url = await getDownloadURL(storageRef);

    // Persist URL in empresa doc
    await updateDoc(doc(db, 'empresas', empresaId), {
      logoUrl: url,
      atualizadoEm: new Date().toISOString(),
    });

    return url;
  },

  async listEmpresas(): Promise<Empresa[]> {
    const snap = await getDocs(collection(db, 'empresas'));
    return snap.docs.map((d) => d.data() as Empresa);
  },

  async getMetricas(empresaId: string): Promise<EmpresaMetricas> {
    const empresa = await this.getEmpresa(empresaId);
    if (!empresa) throw new Error('Empresa não encontrada');

    // Count users in this org
    const usersSnap = await getDocs(
      query(collection(db, 'users'), where('organizationId', '==', empresaId))
    );
    const totalUsuarios = usersSnap.size;

    // Count leads this calendar month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const leadsSnap = await getDocs(
      query(
        collection(db, 'leads'),
        where('organizationId', '==', empresaId),
        where('createdAt', '>=', startOfMonth.toISOString())
      )
    );
    const totalLeadsMes = leadsSnap.size;

    let diasRestantesTrial: number | undefined;
    if (empresa.status === 'trial' && empresa.trialExpiraEm) {
      const diff = new Date(empresa.trialExpiraEm).getTime() - Date.now();
      diasRestantesTrial = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    }

    return {
      totalUsuarios,
      totalLeadsMes,
      limiteUsuarios: empresa.limiteUsuarios,
      limiteLeadsMes: empresa.limiteLeadsMes,
      limiteStorageMb: empresa.limiteStorageMb,
      planoSaas: empresa.planoSaas,
      status: empresa.status,
      trialExpiraEm: empresa.trialExpiraEm,
      diasRestantesTrial,
    };
  },

  subscribeEmpresa(id: string, callback: (e: Empresa | null) => void): () => void {
    return onSnapshot(doc(db, 'empresas', id), (snap) => {
      callback(snap.exists() ? (snap.data() as Empresa) : null);
    });
  },

  async setStatus(id: string, status: StatusEmpresa): Promise<void> {
    await updateDoc(doc(db, 'empresas', id), {
      status,
      atualizadoEm: new Date().toISOString(),
    });
  },
};
