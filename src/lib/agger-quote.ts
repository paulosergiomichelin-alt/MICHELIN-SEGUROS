import { Lead } from '../types';

export const AGGER_LOGIN_URL = 'https://aggilizador.com.br/login';
export const AGGER_HASH_KEY = 'michelin_lead';

const CREDS_KEY = 'michelin_agger_credentials';

export interface AggerCredentials {
  email: string;
  password: string;
}

export function getAggerCredentials(): AggerCredentials {
  try {
    const raw = localStorage.getItem(CREDS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.email && parsed?.password) return parsed;
    }
  } catch {}
  return {
    email: 'michelinseguros@hotmail.com',
    password: 'Bw8ygomm@agger',
  };
}

export function setAggerCredentials(creds: AggerCredentials): void {
  try {
    localStorage.setItem(CREDS_KEY, JSON.stringify(creds));
  } catch {}
}

export interface AggerLeadPayload {
  v: 2;
  source: 'michelin-crm';
  ts: number;
  credentials?: AggerCredentials;
  lead: {
    name: string;
    cpf: string;
    birthDate?: string;
    civilStatus?: string;
    email?: string;
    phone?: string;
    phone2?: string;
    rg?: string;

    plate: string;
    chassis?: string;
    renavam?: string;
    brandModel?: string;

    zipCodeOvernight?: string;
    addressOvernight?: string;
    numberOvernight?: string;
    isDifferentResidenceZip?: boolean;
    zipCodeResidence?: string;
    addressResidence?: string;
    numberResidence?: string;

    fiduciaryAlienation?: boolean;
    financialInstitution?: string;

    serviceUsage?: boolean;
    youngDriverHousehold?: boolean;

    isOwnerDriver?: boolean;
    ownerName?: string;
    ownerCpfCnpj?: string;

    hasInsurance?: boolean;
    insurer?: string;
    insuranceExpiry?: string;
  };
}

function utf8ToBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function buildAggerPayload(lead: Lead): AggerLeadPayload {
  return {
    v: 2,
    source: 'michelin-crm',
    ts: Date.now(),
    credentials: getAggerCredentials(),
    lead: {
      name: lead.name,
      cpf: lead.cpf,
      birthDate: lead.birthDate,
      civilStatus: lead.civilStatus,
      email: lead.email,
      phone: lead.phone,
      phone2: lead.phone2,
      rg: lead.rg,

      plate: lead.plate,
      chassis: lead.chassis || lead.chassi,
      renavam: lead.renavam,
      brandModel: lead.brandModel,

      zipCodeOvernight: lead.zipCodeOvernight,
      addressOvernight: lead.addressOvernight,
      numberOvernight: lead.numberOvernight,
      isDifferentResidenceZip: lead.isDifferentResidenceZip,
      zipCodeResidence: lead.zipCodeResidence,
      addressResidence: lead.addressResidence,
      numberResidence: lead.numberResidence,

      fiduciaryAlienation: lead.fiduciaryAlienation,
      financialInstitution: lead.financialInstitution,

      serviceUsage: lead.serviceUsage,
      youngDriverHousehold: lead.youngDriverHousehold,

      isOwnerDriver: lead.isOwnerDriver,
      ownerName: lead.ownerName,
      ownerCpfCnpj: lead.ownerCpfCnpj,

      hasInsurance: lead.hasInsurance,
      insurer: lead.insurer,
      insuranceExpiry: lead.insuranceExpiry,
    },
  };
}

export function buildAggerQuoteUrl(lead: Lead): string {
  const payload = buildAggerPayload(lead);
  const encoded = utf8ToBase64Url(JSON.stringify(payload));
  return `${AGGER_LOGIN_URL}#${AGGER_HASH_KEY}=${encoded}`;
}
