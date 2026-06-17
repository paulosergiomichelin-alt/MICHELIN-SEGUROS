import { fsGet, fsSet } from '../lib/adminFirebase.js';

interface EmailSettings {
  userId: string;
  signature?: string;
  displayName?: string;
  defaultAccountId?: string;
  notifications?: {
    enabled: boolean;
    sound?: boolean;
    desktop?: boolean;
  };
  theme?: 'light' | 'dark' | 'system';
  previewPane?: 'right' | 'bottom' | 'none';
  emailsPerPage?: number;
}

const DEFAULT_SETTINGS: Omit<EmailSettings, 'userId'> = {
  signature: '',
  displayName: '',
  defaultAccountId: '',
  notifications: {
    enabled: true,
    sound: false,
    desktop: true,
  },
  theme: 'system',
  previewPane: 'right',
  emailsPerPage: 50,
};

export default async function handler(req: any, res: any) {
  try {
    // ── GET /api/email/settings?userId= ────────────────────────────────────
    if (req.method === 'GET') {
      const { userId } = req.query ?? {};
      if (!userId) return res.status(400).json({ error: 'userId é obrigatório' });

      const settings = await fsGet('email_settings', String(userId));

      return res.status(200).json({
        settings: settings ?? { userId: String(userId), ...DEFAULT_SETTINGS },
      });
    }

    // ── PUT /api/email/settings ─────────────────────────────────────────────
    if (req.method === 'PUT') {
      const body = req.body ?? {};
      const { userId, signature, displayName, defaultAccountId, notifications, theme, previewPane, emailsPerPage } = body;

      if (!userId) return res.status(400).json({ error: 'userId é obrigatório' });

      // Load existing to merge
      const existing = (await fsGet('email_settings', String(userId))) ?? {
        ...DEFAULT_SETTINGS,
        userId: String(userId),
      };

      const updated: EmailSettings = {
        ...existing,
        userId: String(userId),
      };

      if (signature !== undefined) updated.signature = String(signature);
      if (displayName !== undefined) updated.displayName = String(displayName);
      if (defaultAccountId !== undefined) updated.defaultAccountId = String(defaultAccountId);
      if (notifications !== undefined) {
        updated.notifications = {
          enabled: Boolean(notifications.enabled ?? existing.notifications?.enabled ?? true),
          sound: Boolean(notifications.sound ?? existing.notifications?.sound ?? false),
          desktop: Boolean(notifications.desktop ?? existing.notifications?.desktop ?? true),
        };
      }
      if (theme !== undefined) updated.theme = theme;
      if (previewPane !== undefined) updated.previewPane = previewPane;
      if (emailsPerPage !== undefined) updated.emailsPerPage = Number(emailsPerPage);

      await fsSet('email_settings', String(userId), updated as Record<string, any>);

      return res.status(200).json({ success: true, settings: updated });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('[email/settings] error:', err);
    return res.status(500).json({ error: 'Erro interno', detail: err?.message });
  }
}
