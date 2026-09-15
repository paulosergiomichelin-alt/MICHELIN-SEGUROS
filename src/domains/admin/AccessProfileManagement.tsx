import React, { useState, useEffect, useCallback } from 'react';
import { orderBy, where } from '../../lib/queryConstraints';
import { DataService } from '../../services/DataService';
import { AccessProfile } from '../../types';
import {
  Shield, Plus, Trash2, Edit2, Copy, Search, X,
  CheckCircle2, XCircle, ShieldAlert, Loader2,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { AccessProfileForm } from './AccessProfileForm';
import { Button, Badge, PageHeader } from '../../components/ui';

// ─── Delete confirm dialog ────────────────────────────────────────────────────

interface DeleteDialogProps {
  profile: AccessProfile;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

const DeleteDialog: React.FC<DeleteDialogProps> = ({ profile, onConfirm, onCancel }) => {
  const [checking, setChecking] = useState(true);
  const [linkedCount, setLinkedCount] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    DataService.list('users', [where('profileId', '==', profile.id)])
      .then(users => setLinkedCount(users.length))
      .catch(() => setLinkedCount(0))
      .finally(() => setChecking(false));
  }, [profile.id]);

  const handleConfirm = async () => {
    setDeleting(true);
    await onConfirm();
    setDeleting(false);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onCancel}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        className="relative w-full max-w-md bg-white rounded-3xl border border-slate-200 p-8 shadow-2xl"
      >
        <div className="flex items-start gap-4 mb-6">
          <div className="w-10 h-10 rounded-2xl bg-[#FDE4E4] flex items-center justify-center shrink-0">
            <ShieldAlert className="w-5 h-5 text-[#C0392B]" />
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">Excluir Perfil</h3>
            <p className="text-[11px] text-slate-500 mt-1">Esta ação não pode ser desfeita.</p>
          </div>
          <button onClick={onCancel} className="ml-auto text-slate-300 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {checking ? (
          <div className="flex items-center gap-2 text-slate-500 text-xs py-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            Verificando usuários vinculados…
          </div>
        ) : linkedCount > 0 ? (
          <div className="bg-[#FDE4E4] border border-[#C0392B]/20 rounded-2xl p-4 mb-6">
            <p className="text-[11px] text-[#C0392B] font-bold leading-relaxed">
              Não é possível excluir o perfil <span className="text-slate-800">{profile.name}</span> pois{' '}
              <span className="text-[#C0392B] font-black">{linkedCount} usuário{linkedCount > 1 ? 's estão' : ' está'} vinculado{linkedCount > 1 ? 's' : ''}</span>{' '}
              a ele. Reatribua-{linkedCount > 1 ? 'os' : 'o'} a outro perfil antes de excluir.
            </p>
          </div>
        ) : (
          <div className="bg-slate-50 rounded-2xl p-4 mb-6">
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Tem certeza que deseja excluir o perfil{' '}
              <span className="text-slate-800 font-bold">{profile.name}</span>?
              Nenhum usuário está vinculado a este perfil.
            </p>
          </div>
        )}

        <div className="flex gap-3">
          <Button variant="secondary" onClick={onCancel} className="flex-1">
            Cancelar
          </Button>
          {!checking && linkedCount === 0 && (
            <Button
              variant="danger"
              onClick={handleConfirm}
              disabled={deleting}
              loading={deleting}
              icon={Trash2}
              className="flex-1"
            >
              Excluir
            </Button>
          )}
        </div>
      </motion.div>
    </div>
  );
};

// ─── Status badge ─────────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ active: boolean }> = ({ active }) =>
  active ? (
    <Badge variant="success">
      <CheckCircle2 className="w-3 h-3 mr-1" /> Ativo
    </Badge>
  ) : (
    <Badge variant="neutral">
      <XCircle className="w-3 h-3 mr-1" /> Inativo
    </Badge>
  );

// ─── Main component ───────────────────────────────────────────────────────────

type ViewMode = 'list' | 'form';

export const AccessProfileManagement: React.FC = () => {
  const [profiles, setProfiles]         = useState<AccessProfile[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [view, setView]                 = useState<ViewMode>('list');
  const [editingProfile, setEditingProfile] = useState<AccessProfile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AccessProfile | null>(null);

  const fetchProfiles = useCallback(async () => {
    try {
      const docs = await DataService.list('access_profile', [orderBy('createdAt', 'desc')]);
      setProfiles(docs);
    } catch (err) {
      console.error('Error fetching profiles:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProfiles(); }, [fetchProfiles]);

  const openNew    = () => { setEditingProfile(null); setView('form'); };
  const openEdit   = (p: AccessProfile) => { setEditingProfile(p); setView('form'); };
  const handleBack = () => { setView('list'); setEditingProfile(null); fetchProfiles(); };

  const handleDuplicate = async (p: AccessProfile) => {
    const clone: Omit<AccessProfile, 'id'> = {
      name:             `Cópia de ${p.name}`,
      description:      p.description,
      isActive:         false,
      leadVisibility:   p.leadVisibility,
      permissions:      { ...p.permissions },
      menuPermissions:  p.menuPermissions?.map(m => ({ ...m })) ?? [],
      fieldPermissions: p.fieldPermissions?.map(f => ({ ...f })) ?? [],
      createdAt:        new Date().toISOString(),
      updatedAt:        new Date().toISOString(),
    };
    try {
      const id = await DataService.create('access_profile', clone);
      const created = await DataService.get('access_profile', id);
      setEditingProfile(created);
      setView('form');
    } catch (err) {
      console.error('Error duplicating profile:', err);
    }
  };

  const handleToggleActive = async (p: AccessProfile) => {
    try {
      await DataService.update('access_profile', p.id, { isActive: !p.isActive, updatedAt: new Date().toISOString() });
      setProfiles(prev => prev.map(x => x.id === p.id ? { ...x, isActive: !x.isActive } : x));
    } catch (err) {
      console.error('Error toggling profile:', err);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await DataService.delete('access_profile', deleteTarget.id);
      setProfiles(prev => prev.filter(x => x.id !== deleteTarget.id));
    } finally {
      setDeleteTarget(null);
    }
  };

  // ── Form view ──────────────────────────────────────────────
  if (view === 'form') {
    return (
      <AccessProfileForm
        profile={editingProfile}
        onSave={handleBack}
        onCancel={handleBack}
      />
    );
  }

  // ── List view ──────────────────────────────────────────────
  const filtered = profiles.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.description ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-full bg-slate-50">
      <div className="p-4 md:p-6 space-y-5">
        {/* Header */}
        <PageHeader
          icon={Shield}
          title="Perfis de Acesso"
          subtitle="Gestão granular por módulo e ação"
          actions={
            <Button variant="primary" icon={Plus} onClick={openNew}>
              Novo Perfil
            </Button>
          }
        />

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar perfil…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-11 pr-10 py-3 bg-white border border-slate-200 rounded-2xl text-sm text-slate-800 placeholder-slate-300 outline-none focus:border-[#1B4D8F]/60 focus:ring-2 focus:ring-[#1B4D8F]/15 transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Table */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_minmax(0,1.5fr)_100px_140px] gap-4 px-6 py-3 border-b border-slate-100 bg-slate-50">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Nome</span>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Descrição</span>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Status</span>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Ações</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-slate-400 text-sm">
              <Loader2 className="w-5 h-5 animate-spin" />
              Carregando…
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-slate-300">
              <Shield className="w-8 h-8" />
              <p className="text-sm font-bold text-slate-400">
                {search ? 'Nenhum perfil encontrado' : 'Nenhum perfil cadastrado'}
              </p>
              {!search && (
                <button
                  onClick={openNew}
                  className="text-gold-deep text-xs font-black uppercase tracking-widest hover:underline"
                >
                  Criar primeiro perfil
                </button>
              )}
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {filtered.map((p, idx) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ delay: idx * 0.03 }}
                  className={cn(
                    'grid grid-cols-[1fr_minmax(0,1.5fr)_100px_140px] gap-4 px-6 py-4 items-center',
                    'border-b border-slate-100 last:border-0',
                    'hover:bg-slate-50 transition-colors group',
                  )}
                >
                  {/* Nome */}
                  <div className="min-w-0">
                    <p className="text-sm font-black text-slate-800 truncate">{p.name}</p>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                      {p.leadVisibility === 'all' ? 'Todos os leads' : 'Apenas próprios'}
                    </p>
                  </div>

                  {/* Descrição */}
                  <p className="text-[11px] text-slate-500 font-medium line-clamp-2 leading-relaxed min-w-0">
                    {p.description || '—'}
                  </p>

                  {/* Status */}
                  <div>
                    <StatusBadge active={p.isActive ?? true} />
                  </div>

                  {/* Ações */}
                  <div className="flex items-center justify-end gap-1">
                    {/* Editar */}
                    <button
                      onClick={() => openEdit(p)}
                      title="Editar"
                      className="p-2 rounded-xl text-slate-400 hover:text-[#1B4D8F] hover:bg-[#1B4D8F]/5 transition-all"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>

                    {/* Duplicar */}
                    <button
                      onClick={() => handleDuplicate(p)}
                      title="Duplicar"
                      className="p-2 rounded-xl text-slate-400 hover:text-[#1B4D8F] hover:bg-[#1B4D8F]/5 transition-all"
                    >
                      <Copy className="w-4 h-4" />
                    </button>

                    {/* Ativar / Desativar */}
                    <button
                      onClick={() => handleToggleActive(p)}
                      title={p.isActive ? 'Desativar' : 'Ativar'}
                      className={cn(
                        'p-2 rounded-xl transition-all',
                        p.isActive
                          ? 'text-[#1F8A4C]/60 hover:text-slate-400 hover:bg-slate-100'
                          : 'text-slate-300 hover:text-[#1F8A4C] hover:bg-[#E4F5EA]',
                      )}
                    >
                      {p.isActive ? <XCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                    </button>

                    {/* Excluir */}
                    <button
                      onClick={() => setDeleteTarget(p)}
                      title="Excluir"
                      className="p-2 rounded-xl text-slate-300 hover:text-[#C0392B] hover:bg-[#FDE4E4] transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* Delete dialog */}
        <AnimatePresence>
          {deleteTarget && (
            <DeleteDialog
              profile={deleteTarget}
              onConfirm={handleDelete}
              onCancel={() => setDeleteTarget(null)}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
