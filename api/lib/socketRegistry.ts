// Singleton que mantém a instância do Socket.IO acessível em toda a aplicação.
// Evita importação circular entre server.ts e os handlers do webhook.

type EmitTarget = { emit: (event: string, data: any) => void };
type IoLike = {
  to: (room: string) => EmitTarget;
  emit: (event: string, data: any) => void;
};

let _io: IoLike | null = null;

export function setIo(io: IoLike): void {
  _io = io;
}

export function emitToSession(sessionId: string, event: string, data: any): void {
  _io?.to(`session:${sessionId}`).emit(event, data);
}

export function emitGlobal(event: string, data: any): void {
  _io?.emit(event, data);
}
