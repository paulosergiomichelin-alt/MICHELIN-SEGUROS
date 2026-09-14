import { fsGet, fsUpdate } from '../../lib/pgData.js';
import { encrypt } from '../../lib/emailEncryption.js';

const MS_AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const MS_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

const SCOPES = [
  'https://graph.microsoft.com/Mail.ReadWrite',
  'https://graph.microsoft.com/Mail.Send',
  'https://graph.microsoft.com/User.Read',
  'https://graph.microsoft.com/Calendars.ReadWrite',
  'offline_access',
].join(' ');

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url: string = req.url ?? '';

  if (url.includes('/calendar-init')) {
    try {
      const { accountId, returnUrl } = req.query ?? {};
      if (!accountId) return res.status(400).json({ error: 'accountId é obrigatório' });

      const account = await fsGet('email_accounts', String(accountId));
      if (!account) return res.status(404).json({ error: 'Conta não encontrada' });
      if (account.provider !== 'microsoft') return res.status(400).json({ error: 'Conta não é Microsoft' });

      const clientId = process.env.MICROSOFT_CLIENT_ID;
      const redirectUri = process.env.MICROSOFT_CALENDAR_REDIRECT_URI;
      if (!clientId || !redirectUri) {
        return res.status(500).json({ error: 'MICROSOFT_CLIENT_ID/MICROSOFT_CALENDAR_REDIRECT_URI não configurados' });
      }

      const state = Buffer.from(
        JSON.stringify({ accountId: String(accountId), returnUrl: String(returnUrl ?? '/agenda') }),
      ).toString('base64url');

      const params = new URLSearchParams({
        client_id: clientId, redirect_uri: redirectUri, response_type: 'code',
        scope: SCOPES, response_mode: 'query', state,
      });

      return res.redirect(`${MS_AUTH_URL}?${params}`);
    } catch (err: any) {
      console.error('[microsoft-calendar/init] error:', err);
      return res.status(500).json({ error: 'Erro ao iniciar reautorização', detail: err?.message });
    }
  }

  if (url.includes('/calendar-callback')) {
    try {
      const { code, state, error: oauthError, error_description } = req.query ?? {};
      if (oauthError) {
        console.error('[microsoft-calendar/callback] OAuth error:', oauthError, error_description);
        return res.status(400).json({ error: `OAuth2 error: ${oauthError}`, detail: error_description });
      }
      if (!code || !state) return res.status(400).json({ error: 'code e state são obrigatórios' });

      const clientId = process.env.MICROSOFT_CLIENT_ID;
      const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
      const redirectUri = process.env.MICROSOFT_CALENDAR_REDIRECT_URI;
      if (!clientId || !clientSecret || !redirectUri) {
        return res.status(500).json({ error: 'MICROSOFT_CLIENT_ID/SECRET/MICROSOFT_CALENDAR_REDIRECT_URI não configurados' });
      }

      let parsedState: { accountId: string; returnUrl: string };
      try {
        parsedState = JSON.parse(Buffer.from(String(state), 'base64url').toString('utf8'));
      } catch {
        return res.status(400).json({ error: 'state inválido' });
      }
      const { accountId, returnUrl } = parsedState;

      const tokenRes = await fetch(MS_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: String(code), client_id: clientId, client_secret: clientSecret,
          redirect_uri: redirectUri, grant_type: 'authorization_code', scope: SCOPES,
        }),
      });

      if (!tokenRes.ok) {
        const text = await tokenRes.text();
        console.error('[microsoft-calendar/callback] token exchange failed:', text);
        return res.status(500).json({ error: 'Falha na troca de tokens', detail: text });
      }

      const tokenData = await tokenRes.json() as any;
      const { access_token, refresh_token, expires_in } = tokenData;
      if (!access_token || !refresh_token) {
        return res.status(500).json({ error: 'Tokens inválidos na resposta' });
      }

      await fsUpdate('email_accounts', accountId, {
        accessToken: encrypt(access_token),
        refreshToken: encrypt(refresh_token),
        tokenExpiry: Date.now() + (expires_in ?? 3600) * 1000,
        calendarScopeGranted: true,
        updatedAt: new Date().toISOString(),
      });

      const separator = returnUrl.includes('?') ? '&' : '?';
      return res.redirect(`${returnUrl}${separator}calendarConnected=1&accountId=${accountId}`);
    } catch (err: any) {
      console.error('[microsoft-calendar/callback] error:', err);
      return res.status(500).json({ error: 'Erro no callback de reautorização', detail: err?.message });
    }
  }

  return res.status(404).json({ error: 'Rota não encontrada' });
}
