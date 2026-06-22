import { createSign } from 'node:crypto';

const PROJECT_ID  = 'gen-lang-client-0929974546';
const DATABASE_ID = 'ai-studio-e7cf89ac-d4c5-4bef-9fa5-57e4ac67170c';
const FS_BASE     = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}`;
const TOKEN_URL   = 'https://oauth2.googleapis.com/token';

let _token       = '';
let _tokenExpiry = 0;

async function getToken(): Promise<string> {
  if (_token && Date.now() < _tokenExpiry) return _token;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT env var não definida');
  const sa = JSON.parse(raw);

  const now    = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claims = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    sub: sa.client_email,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
  })).toString('base64url');

  const sigInput = `${header}.${claims}`;
  const signer   = createSign('RSA-SHA256');
  signer.update(sigInput);
  const sig = signer.sign(sa.private_key, 'base64url');

  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), 8000);
  const res = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  `${sigInput}.${sig}`,
    }),
    signal: ctrl.signal,
  }).finally(() => clearTimeout(timeoutId));
  if (!res.ok) throw new Error(`OAuth2 falhou: ${await res.text()}`);

  const { access_token, expires_in } = await res.json() as any;
  _token       = access_token;
  _tokenExpiry = Date.now() + (expires_in - 120) * 1000;
  return _token;
}

function toValue(v: any): any {
  if (v === null || v === undefined)  return { nullValue: null };
  if (typeof v === 'boolean')         return { booleanValue: v };
  if (typeof v === 'string')          return { stringValue: v };
  if (typeof v === 'number')          return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'object')          return { mapValue: { fields: toFields(v) } };
  return { stringValue: String(v) };
}

function toFields(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = toValue(v);
  return out;
}

export async function fsGet(collection: string, id: string): Promise<Record<string, any> | null> {
  const token = await getToken();
  const res = await fetch(`${FS_BASE}/documents/${collection}/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`fsGet ${collection}/${id}: ${await res.text()}`);
  const doc: any = await res.json();
  if (!doc.fields) return null;
  return fromFirestoreFields(doc.fields);
}

export async function fsSet(collection: string, id: string, data: Record<string, any>) {
  const token = await getToken();
  const res   = await fetch(`${FS_BASE}/documents/${collection}/${id}`, {
    method:  'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ fields: toFields(data) }),
  });
  if (!res.ok) throw new Error(`fsSet ${collection}/${id}: ${await res.text()}`);
}

export async function fsUpdate(collection: string, id: string, data: Record<string, any>) {
  const token = await getToken();
  const mask  = Object.keys(data)
    .map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join('&');
  const res = await fetch(`${FS_BASE}/documents/${collection}/${id}?${mask}`, {
    method:  'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ fields: toFields(data) }),
  });
  if (!res.ok) throw new Error(`fsUpdate ${collection}/${id}: ${await res.text()}`);
}

export async function fsDelete(collection: string, id: string): Promise<void> {
  const token = await getToken();
  const res = await fetch(`${FS_BASE}/documents/${collection}/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`fsDelete ${collection}/${id}: ${await res.text()}`);
  }
}

function fromFirestoreValue(v: any): any {
  if (v.nullValue !== undefined) return null;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.mapValue) return fromFirestoreFields(v.mapValue.fields ?? {});
  if (v.arrayValue) return (v.arrayValue.values ?? []).map(fromFirestoreValue);
  return null;
}

function fromFirestoreFields(fields: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = fromFirestoreValue(v);
  return out;
}

function buildStructuredQuery(
  collection: string,
  filters: Array<{ field: string; value: string }>,
  limitN: number,
) {
  const mkFilter = (f: { field: string; value: string }) => ({
    fieldFilter: {
      field: { fieldPath: f.field },
      op:    'EQUAL',
      value: { stringValue: f.value },
    },
  });
  const where = filters.length === 1
    ? mkFilter(filters[0])
    : { compositeFilter: { op: 'AND', filters: filters.map(mkFilter) } };
  return { structuredQuery: { from: [{ collectionId: collection }], where, limit: limitN } };
}

export async function fsQuery(
  collection: string,
  filters: Array<{ field: string; value: string }>,
): Promise<Array<{ id: string }>> {
  const token = await getToken();
  const res = await fetch(`${FS_BASE}/documents:runQuery`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(buildStructuredQuery(collection, filters, 1)),
  });
  if (!res.ok) throw new Error(`fsQuery ${collection}: ${await res.text()}`);
  const rows = await res.json() as any[];
  return rows
    .filter((r: any) => r.document?.name)
    .map((r: any) => ({ id: r.document.name.split('/').pop() as string }));
}

export async function fsQueryFull(
  collection: string,
  filters: Array<{ field: string; value: string }>,
  limitN = 500,
): Promise<Array<Record<string, any> & { id: string }>> {
  const token = await getToken();
  const res = await fetch(`${FS_BASE}/documents:runQuery`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(buildStructuredQuery(collection, filters, limitN)),
  });
  if (!res.ok) throw new Error(`fsQueryFull ${collection}: ${await res.text()}`);
  const rows = await res.json() as any[];
  return rows
    .filter((r: any) => r.document?.name)
    .map((r: any) => ({
      id: r.document.name.split('/').pop() as string,
      ...fromFirestoreFields(r.document.fields ?? {}),
    }));
}
