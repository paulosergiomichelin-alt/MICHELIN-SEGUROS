import { auth } from './firebase';
import type { QueryConstraint } from './queryConstraints';

async function authHeader(): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Usuário não autenticado');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function handle(res: Response) {
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`API /api/data respondeu ${res.status}: ${await res.text()}`);
  return res.json();
}

export const dataApiClient = {
  async get(entity: string, id: string) {
    const res = await fetch(`/api/data/${entity}/${id}`, { headers: await authHeader() });
    return handle(res);
  },
  async query(entity: string, constraints: QueryConstraint[] = []) {
    const res = await fetch(`/api/data/${entity}/query`, {
      method: 'POST', headers: await authHeader(), body: JSON.stringify({ constraints }),
    });
    return handle(res);
  },
  async create(entity: string, data: any) {
    const res = await fetch(`/api/data/${entity}`, {
      method: 'POST', headers: await authHeader(), body: JSON.stringify(data),
    });
    return handle(res);
  },
  async update(entity: string, id: string, data: any) {
    const res = await fetch(`/api/data/${entity}/${id}`, {
      method: 'PATCH', headers: await authHeader(), body: JSON.stringify(data),
    });
    return handle(res);
  },
  async save(entity: string, id: string, data: any) {
    const res = await fetch(`/api/data/${entity}/${id}`, {
      method: 'PUT', headers: await authHeader(), body: JSON.stringify(data),
    });
    return handle(res);
  },
  async remove(entity: string, id: string) {
    const res = await fetch(`/api/data/${entity}/${id}`, { method: 'DELETE', headers: await authHeader() });
    return handle(res);
  },
};
