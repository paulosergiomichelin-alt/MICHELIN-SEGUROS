import { verifyFirebaseToken } from './verifyFirebaseToken';

export async function requireAuth(req: any, res: any, next: any) {
  const header = req.headers.authorization as string | undefined;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token ausente' });
  try {
    const { uid, email } = await verifyFirebaseToken(token);
    req.userId = uid;
    req.userEmail = email;
    next();
  } catch (e: any) {
    return res.status(401).json({ error: 'Token inválido', details: e.message });
  }
}
