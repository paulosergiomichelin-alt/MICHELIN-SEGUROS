import { io, Socket } from 'socket.io-client';

let _socket: Socket | null = null;

export function getRealtimeSocket(organizationId: string): Socket {
  if (_socket) return _socket;
  _socket = io('/', { path: '/socket.io' }); // mesma infra já usada pelo WhatsApp
  _socket.on('connect', () => _socket!.emit('join:org', organizationId));
  return _socket;
}
