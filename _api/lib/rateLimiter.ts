import rateLimit from 'express-rate-limit';

// Nenhuma rota tinha rate limiting nenhum (achado F-15 da auditoria) — combinado com
// rotas sem autenticação (F-01, já corrigido), um script simples conseguia disparar
// milhares de e-mails/consultas por minuto usando os canais e o orçamento da empresa.
// Mesmo com auth corrigida, um usuário autenticado comprometido (ou só descuidado, um
// loop com bug) ainda pode martelar um endpoint de envio ou de proxy de custo externo —
// por isso o rate limit continua valendo como segunda camada.
//
// Chaveado por usuário autenticado quando existe (req.userId, setado por requireAuth
// ANTES deste middleware em toda rota que o usa) — cai pra IP só nas rotas sem auth
// própria (CNPJ, hoje já atrás de requireAuth também). Isso evita que um usuário
// atrás de um NAT/proxy compartilhado seja limitado junto com outros da mesma rede.
function keyByUserOrIp(req: any): string {
  return req.userId ? `user:${req.userId}` : `ip:${req.ip}`;
}

// Envio de e-mail — o recurso mais caro/abusável (spam usando o canal oficial da
// empresa). 30 envios por usuário a cada 5 minutos é folgado pro uso humano normal
// (mesmo disparando um lote de respostas) e apertado o bastante pra travar um script.
export const emailSendLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByUserOrIp,
  message: { error: 'Muitos e-mails enviados em pouco tempo. Aguarde alguns minutos e tente novamente.' },
});

// Consultas externas com custo por chamada (BrasilAPI/CNPJ, proxy OpenRouter/IA) —
// mais generoso que o de envio, mas ainda limita um loop descontrolado de custo.
export const externalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByUserOrIp,
  message: { error: 'Muitas requisições em pouco tempo. Aguarde um momento e tente novamente.' },
});
