import { fsSet, fsQueryFull } from '../../lib/adminFirebase.js';
import { encrypt } from '../../lib/emailEncryption.js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/userinfo/v2/me';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ');

function generateId(): string {
  return `gmail_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url: string = req.url ?? '';

  // ── Init: redirect to Google OAuth2 ────────────────────────────────────────
  if (url.includes('/auth/gmail/init') || url.includes('/auth/gmail') && !url.includes('/callback')) {
    try {
      const { userId, returnUrl } = req.query ?? {};
      if (!userId) return res.status(400).json({ error: 'userId é obrigatório' });

      const clientId = process.env.GMAIL_CLIENT_ID;
      const redirectUri = process.env.GMAIL_REDIRECT_URI;
      if (!clientId || !redirectUri) {
        return res.status(500).json({ error: 'GMAIL_CLIENT_ID/REDIRECT_URI não configurados' });
      }

      const state = Buffer.from(
        JSON.stringify({ userId: String(userId), returnUrl: String(returnUrl ?? '/') }),
      ).toString('base64url');

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: SCOPES,
        access_type: 'offline',
        prompt: 'consent',
        state,
      });

      return res.redirect(`${GOOGLE_AUTH_URL}?${params}`);
    } catch (err: any) {
      console.error('[gmail/auth/init] error:', err);
      return res.status(500).json({ error: 'Erro ao iniciar OAuth2', detail: err?.message });
    }
  }

  // ── Callback: exchange code for tokens ──────────────────────────────────────
  if (url.includes('/callback')) {
    try {
      const { code, state, error: oauthError } = req.query ?? {};

      if (oauthError) {
        return res.status(400).json({ error: `OAuth2 error: ${oauthError}` });
      }

      if (!code || !state) {
        return res.status(400).json({ error: 'code e state são obrigatórios' });
      }

      const clientId = process.env.GMAIL_CLIENT_ID;
      const clientSecret = process.env.GMAIL_CLIENT_SECRET;
      const redirectUri = process.env.GMAIL_REDIRECT_URI;
      if (!clientId || !clientSecret || !redirectUri) {
        return res.status(500).json({ error: 'GMAIL_CLIENT_ID/SECRET/REDIRECT_URI não configurados' });
      }

      // Decode state
      let parsedState: { userId: string; returnUrl: string };
      try {
        parsedState = JSON.parse(Buffer.from(String(state), 'base64url').toString('utf8'));
      } catch {
        return res.status(400).json({ error: 'state inválido' });
      }

      const { userId, returnUrl } = parsedState;

      // Exchange code for tokens
      const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: String(code),
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenRes.ok) {
        const text = await tokenRes.text();
        console.error('[gmail/auth/callback] token exchange failed:', text);
        return res.status(500).json({ error: 'Falha na troca de tokens', detail: text });
      }

      const tokenData = await tokenRes.json() as any;
      const { access_token, refresh_token, expires_in } = tokenData;

      if (!access_token || !refresh_token) {
        return res.status(500).json({ error: 'Tokens inválidos na resposta' });
      }

      // Fetch user profile
      const profileRes = await fetch(GOOGLE_USERINFO_URL, {
        headers: { Authorization: `Bearer ${access_token}` },
      });

      if (!profileRes.ok) {
        return res.status(500).json({ error: 'Falha ao buscar perfil do usuário' });
      }

      const profile = await profileRes.json() as any;
      const email: string = profile.email;
      const displayName: string = profile.name ?? email;

      // Check if account already exists
      const existing = await fsQueryFull('email_accounts', [
        { field: 'userId', value: userId },
        { field: 'email', value: email },
      ]).catch(() => []);

      const accountId = existing[0]?.id ?? generateId();
      const now = Date.now();

      const accountData: Record<string, any> = {
        userId,
        email,
        displayName,
        provider: 'gmail',
        accessToken: encrypt(access_token),
        refreshToken: encrypt(refresh_token),
        tokenExpiry: now + (expires_in ?? 3600) * 1000,
        status: 'active',
        createdAt: existing[0]?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isDefault: existing.length === 0, // first account is default
        picture: profile.picture ?? '',
      };

      await fsSet('email_accounts', accountId, accountData);

      // Trigger initial sync in background
      import('../../lib/emailSync.js')
        .then(({ syncAccount }) => syncAccount(accountId))
        .catch(err => console.error('[gmail/auth/callback] initial sync error:', err));

      const separator = returnUrl.includes('?') ? '&' : '?';
      return res.redirect(`${returnUrl}${separator}emailConnected=gmail&accountId=${accountId}`);
    } catch (err: any) {
      console.error('[gmail/auth/callback] error:', err);
      return res.status(500).json({ error: 'Erro no callback OAuth2', detail: err?.message });
    }
  }

  return res.status(404).json({ error: 'Rota não encontrada' });
}
