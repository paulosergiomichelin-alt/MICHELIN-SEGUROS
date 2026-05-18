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
    scope: 'https://www.googleapis.com/auth/datastore',
  })).toString('base64url');

  const sigInput = `${header}.${claims}`;
  const signer   = createSign('RSA-SHA256');
  signer.update(sigInput);
  const sig = signer.sign(sa.private_key, 'base64url');

  const res = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  `${sigInput}.${sig}`,
    }),
  });
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

export async function fsQuery(
  collection: string,
  filters: Array<{ field: string; value: string }>,
): Promise<Array<{ id: string }>> {
  const token = await getToken();

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

  const res = await fetch(`${FS_BASE}/documents:runQuery`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      structuredQuery: { from: [{ collectionId: collection }], where, limit: 1 },
    }),
  });
  if (!res.ok) throw new Error(`fsQuery ${collection}: ${await res.text()}`);

  const rows = await res.json() as any[];
  return rows
    .filter((r: any) => r.document?.name)
    .map((r: any) => ({ id: r.document.name.split('/').pop() as string }));
}
