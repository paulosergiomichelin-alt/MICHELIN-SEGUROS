import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClientes } from '../../contexts/ClienteRealtimeContext';
import { DataService } from '../../services/DataService';
import { ClienteService } from '../../services/ClienteService';
import { Cliente, UserProfile } from '../../types';
import { ClientesView } from './ClientesView';
import { ClienteForm } from './ClienteForm';
import { usePermissions } from '../../contexts/PermissionsContext';

export const ClientesPage: React.FC = () => {
  const navigate = useNavigate();
  const { clientes, loading, hasMore, loadMoreClientes } = useClientes();
  const { userProfile } = usePermissions();
  const [showForm, setShowForm] = useState(false);
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);

  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'gestor';

  useEffect(() => {
    const unsub = DataService.subscribeCollection('users', [], (data: any[]) => {
      setUsers(
        data.filter((u: UserProfile) =>
          u.organizationId === userProfile?.organizationId && u.userType === 'HUMAN',
        ),
      );
    });
    return unsub;
  }, [userProfile?.organizationId]);

  const handleNew = () => {
    setEditingCliente(null);
    setShowForm(true);
  };

  const handleEdit = (c: Cliente) => {
    setEditingCliente(c);
    setShowForm(true);
  };

  const handleSelect = (id: string) => {
    navigate('/clientes/' + id);
  };

  const handleSave = async (data: Omit<Cliente, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString();
    const orgId = userProfile?.organizationId;

    if (editingCliente) {
      await DataService.update('cliente', editingCliente.id, {
        ...data,
        organizationId: orgId,
        updatedAt: now,
      });
      await ClienteService.addHistorico(editingCliente.id, {
        clienteId: editingCliente.id,
        tipo: 'editado',
        descricao: 'Dados do cliente atualizados',
        usuarioId: userProfile?.uid,
        usuarioNome: userProfile?.name,
        organizationId: orgId,
      });
    } else {
      const clienteId = await DataService.create('cliente', {
        ...data,
        organizationId: orgId,
        createdAt: now,
        updatedAt: now,
      });
      await ClienteService.addHistorico(clienteId, {
        clienteId,
        tipo: 'criado',
        descricao: 'Cliente cadastrado manualmente',
        usuarioId: userProfile?.uid,
        usuarioNome: userProfile?.name,
        organizationId: orgId,
      });
    }
  };

  if (showForm) {
    return (
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6">
        <ClienteForm
          isOpen={true}
          inline={true}
          onClose={() => { setShowForm(false); setEditingCliente(null); }}
          onSave={handleSave}
          cliente={editingCliente}
          users={users}
          currentUser={userProfile}
          isAdmin={isAdmin}
        />
      </div>
    );
  }

  return (
    <ClientesView
      clientes={clientes}
      loading={loading}
      hasMore={hasMore}
      onLoadMore={loadMoreClientes}
      onNew={handleNew}
      onSelect={handleSelect}
      onEdit={handleEdit}
    />
  );
};
