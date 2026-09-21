import { io, Socket } from 'socket.io-client';
import { auth } from './firebase';

let _socket: Socket | null = null;

export function getRealtimeSocket(organizationId: string): Socket {
  if (_socket) return _socket;
  // Vercel não faz proxy de upgrade WebSocket para URLs HTTP externas — usar
  // polling apenas (mesmo workaround já usado em EmailContext).
  //
  // `auth` como função (não objeto) é chamado a cada tentativa de conexão —
  // inclusive nas reconexões automáticas do socket.io, que sem isso mandariam
  // um ID token expirado depois de ~1h de sessão aberta. O servidor rejeita
  // a conexão sem token válido (server.ts, io.use) e resolve a organização a
  // partir do próprio token, nunca do parâmetro abaixo (achado F-02: antes,
  // qualquer socket entrava em `org:<id>` só emitindo o evento com o id que
  // quisesse, sem nenhuma verificação).
  _socket = io('/', {
    path: '/socket.io',
    transports: ['polling'],
    auth: (cb) => {
      const user = auth.currentUser;
      if (!user) { cb({}); return; }
      user.getIdToken().then(token => cb({ token })).catch(() => cb({}));
    },
  });
  _socket.on('connect', () => _socket!.emit('join:org', organizationId));
  return _socket;
}
