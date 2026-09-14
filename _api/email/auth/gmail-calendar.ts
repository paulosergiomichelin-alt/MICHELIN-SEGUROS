import { fsGet, fsUpdate } from '../../lib/pgData.js';
import { encrypt } from '../../lib/emailEncryption.js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

// União do escopo de e-mail já concedido + calendário — o Google reemite um refresh_token
// novo cobrindo os dois quando os dois são pedidos juntos com prompt=consent.
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/calendar',
].join(' ');

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url: string = req.url ?? '';

  // ── Init: redireciona pro consentimento do Google, pedindo o escopo de calendário ──
  if (url.includes('/calendar-init')) {
    try {
      const { accountId, returnUrl } = req.query ?? {};
      if (!accountId) return res.status(400).json({ error: 'accountId é obrigatório' });

      const account = await fsGet('email_accounts', String(accountId));
      if (!account) return res.status(404).json({ error: 'Conta não encontrada' });
      if (account.provider !== 'gmail') return res.status(400).json({ error: 'Conta não é Gmail' });

      const clientId = process.env.GMAIL_CLIENT_ID;
      const redirectUri = process.env.GMAIL_CALENDAR_REDIRECT_URI;
      if (!clientId || !redirectUri) {
        return res.status(500).json({ error: 'GMAIL_CLIENT_ID/GMAIL_CALENDAR_REDIRECT_URI não configurados' });
      }

      const state = Buffer.from(
        JSON.stringify({ accountId: String(accountId), returnUrl: String(returnUrl ?? '/agenda') }),
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
      console.error('[gmail-calendar/init] error:', err);
      return res.status(500).json({ error: 'Erro ao iniciar reautorização', detail: err?.message });
    }
  }

  // ── Callback: troca o code por tokens novos (cobrindo e-mail + calendário) ─────────
  if (url.includes('/calendar-callback')) {
    try {
      const { code, state, error: oauthError } = req.query ?? {};
      if (oauthError) return res.status(400).json({ error: `OAuth2 error: ${oauthError}` });
      if (!code || !state) return res.status(400).json({ error: 'code e state são obrigatórios' });

      const clientId = process.env.GMAIL_CLIENT_ID;
      const clientSecret = process.env.GMAIL_CLIENT_SECRET;
      const redirectUri = process.env.GMAIL_CALENDAR_REDIRECT_URI;
      if (!clientId || !clientSecret || !redirectUri) {
        return res.status(500).json({ error: 'GMAIL_CLIENT_ID/SECRET/GMAIL_CALENDAR_REDIRECT_URI não configurados' });
      }

      let parsedState: { accountId: string; returnUrl: string };
      try {
        parsedState = JSON.parse(Buffer.from(String(state), 'base64url').toString('utf8'));
      } catch {
        return res.status(400).json({ error: 'state inválido' });
      }
      const { accountId, returnUrl } = parsedState;

      const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: String(code), client_id: clientId, client_secret: clientSecret,
          redirect_uri: redirectUri, grant_type: 'authorization_code',
        }),
      });

      if (!tokenRes.ok) {
        const text = await tokenRes.text();
        console.error('[gmail-calendar/callback] token exchange failed:', text);
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
      console.error('[gmail-calendar/callback] error:', err);
      return res.status(500).json({ error: 'Erro no callback de reautorização', detail: err?.message });
    }
  }

  return res.status(404).json({ error: 'Rota não encontrada' });
}
