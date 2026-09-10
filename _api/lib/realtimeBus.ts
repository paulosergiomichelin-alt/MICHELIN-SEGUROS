import { getIo } from './socketRegistry';

export async function emitDataChanged(entity: string, id: string, organizationId: string | null): Promise<void> {
  const io = getIo();
  if (!io) return; // servidor de dev sem socket ativo — não é erro fatal
  const room = organizationId ? `org:${organizationId}` : 'global';
  io.to(room).emit('data:changed', { entity, id, organizationId });
}
