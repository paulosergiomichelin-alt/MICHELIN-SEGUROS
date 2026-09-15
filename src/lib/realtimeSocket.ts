import { io, Socket } from 'socket.io-client';

let _socket: Socket | null = null;

export function getRealtimeSocket(organizationId: string): Socket {
  if (_socket) return _socket;
  // Vercel não faz proxy de upgrade WebSocket para URLs HTTP externas — usar
  // polling apenas (mesmo workaround já usado em EmailContext/WhatsAppInboxPage).
  _socket = io('/', { path: '/socket.io', transports: ['polling'] });
  _socket.on('connect', () => _socket!.emit('join:org', organizationId));
  return _socket;
}
