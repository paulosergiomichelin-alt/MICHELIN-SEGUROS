import { MetaAPI } from '../lib/metaApi.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const phoneNumberId = process.env.META_PHONE_NUMBER_ID ?? process.env.WHATSAPP_PHONE_NUMBER_ID ?? '';
  const wabaId = process.env.META_WABA_ID ?? '';
  const verifyToken = process.env.META_VERIFY_TOKEN ?? process.env.WHATSAPP_VERIFY_TOKEN ?? '';
  const tokenPresent = !!(process.env.META_ACCESS_TOKEN);

  const report: any = {
    config: {
      phoneNumberId: phoneNumberId || null,
      wabaId: wabaId || null,
      verifyToken: verifyToken ? '***' + verifyToken.slice(-4) : null,
      tokenPresent,
    },
    token: { valid: false },
    phoneNumber: null,
    waba: null,
    webhook: {
      verifyTokenSet: !!verifyToken,
      url: `${req.protocol}://${req.get('host')}/api/webhook/whatsapp`,
    },
    timestamp: new Date().toISOString(),
  };

  // Test token
  try {
    const tokenCheck = await MetaAPI.validateToken();
    report.token = tokenCheck;
  } catch (err: any) {
    report.token = { valid: false, error: err.message };
  }

  // Test phone number info
  if (phoneNumberId) {
    try {
      const info = await MetaAPI.getPhoneNumberInfo();
      report.phoneNumber = {
        id: info.id,
        displayNumber: info.display_phone_number,
        verifiedName: info.verified_name,
        qualityRating: info.quality_rating,
        throughput: info.throughput,
      };
    } catch (err: any) {
      report.phoneNumber = { error: err.message };
    }
  }

  // Test WABA
  if (wabaId) {
    try {
      const waba = await MetaAPI.getProfile(wabaId);
      report.waba = {
        id: waba.id,
        name: waba.name,
        currency: waba.currency,
        messageTemplateNamespace: waba.message_template_namespace,
      };
    } catch (err: any) {
      report.waba = { error: err.message };
    }
  }

  const allOk = report.token.valid && !!report.phoneNumber?.displayNumber;
  return res.status(200).json({ ok: allOk, ...report });
}
