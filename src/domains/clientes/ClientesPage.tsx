import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClientes } from '../../contexts/ClienteRealtimeContext';
import { DataService } from '../../services/DataService';
import { ClienteService } from '../../services/ClienteService';
import { Cliente } from '../../types';
import { ClientesView } from './ClientesView';
import { ClienteForm } from './ClienteForm';
import { usePermissions } from '../../contexts/PermissionsContext';

export const ClientesPage: React.FC = () => {
  const navigate = useNavigate();
  const { clientes, loading, hasMore, loadMoreClientes } = useClientes();
  const { userProfile } = usePermissions();
  const [showForm, setShowForm] = useState(false);
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);

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

  return (
    <>
      <ClientesView
        clientes={clientes}
        loading={loading}
        hasMore={hasMore}
        onLoadMore={loadMoreClientes}
        onNew={handleNew}
        onSelect={handleSelect}
        onEdit={handleEdit}
      />
      <ClienteForm
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        onSave={handleSave}
        cliente={editingCliente}
      />
    </>
  );
};
