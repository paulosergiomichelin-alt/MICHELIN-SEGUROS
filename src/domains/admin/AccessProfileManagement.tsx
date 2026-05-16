import React, { useState, useEffect, useCallback } from 'react';
import { orderBy, where } from 'firebase/firestore';
import { DataService } from '../../services/DataService';
import { AccessProfile } from '../../types';
import {
  Shield, Plus, Trash2, Edit2, Copy, Search, X,
  CheckCircle2, XCircle, ShieldAlert, Loader2,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { AccessProfileForm } from './AccessProfileForm';

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
        className="relative w-full max-w-md bg-[#111214] rounded-3xl border border-white/10 p-8 shadow-2xl"
      >
        <div className="flex items-start gap-4 mb-6">
          <div className="w-10 h-10 rounded-2xl bg-red-500/10 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h3 className="text-base font-black text-white uppercase tracking-tight">Excluir Perfil</h3>
            <p className="text-[11px] text-white/40 mt-1">Esta ação não pode ser desfeita.</p>
          </div>
          <button onClick={onCancel} className="ml-auto text-white/30 hover:text-white/70 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {checking ? (
          <div className="flex items-center gap-2 text-white/40 text-xs py-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            Verificando usuários vinculados…
          </div>
        ) : linkedCount > 0 ? (
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 mb-6">
            <p className="text-[11px] text-red-400 font-bold leading-relaxed">
              Não é possível excluir o perfil <span className="text-white">{profile.name}</span> pois{' '}
              <span className="text-red-300 font-black">{linkedCount} usuário{linkedCount > 1 ? 's estão' : ' está'} vinculado{linkedCount > 1 ? 's' : ''}</span>{' '}
              a ele. Reatribua-{linkedCount > 1 ? 'os' : 'o'} a outro perfil antes de excluir.
            </p>
          </div>
        ) : (
          <div className="bg-white/5 rounded-2xl p-4 mb-6">
            <p className="text-[11px] text-white/60 leading-relaxed">
              Tem certeza que deseja excluir o perfil{' '}
              <span className="text-white font-bold">{profile.name}</span>?
              Nenhum usuário está vinculado a este perfil.
            </p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-2xl bg-white/5 text-white/60 text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all"
          >
            Cancelar
          </button>
          {!checking && linkedCount === 0 && (
            <button
              onClick={handleConfirm}
              disabled={deleting}
              className="flex-1 py-3 rounded-2xl bg-red-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-red-400 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Excluir
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
};

// ─── Status badge ─────────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ active: boolean }> = ({ active }) =>
  active ? (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-black uppercase tracking-widest">
      <CheckCircle2 className="w-3 h-3" /> Ativo
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-white/30 text-[9px] font-black uppercase tracking-widest">
      <XCircle className="w-3 h-3" /> Inativo
    </span>
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between bg-[#111214] p-6 rounded-3xl border border-gold-deep/20 shadow-sm">
        <div>
          <h2 className="text-xl font-black text-gold-deep flex items-center gap-2 font-display uppercase tracking-tight">
            <Shield className="w-6 h-6 text-gold-deep" />
            Perfis de Acesso
          </h2>
          <p className="text-[10px] text-white/30 uppercase tracking-widest font-black mt-1">
            Gestão granular por módulo e ação
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-5 py-2.5 bg-gold-deep text-black rounded-xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-gold-light transition-all shadow-lg shadow-gold-deep/20"
        >
          <Plus className="w-4 h-4" />
          Novo Perfil
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
        <input
          type="text"
          placeholder="Buscar perfil…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-11 pr-10 py-3 bg-[#111214] border border-white/5 rounded-2xl text-sm text-white placeholder-white/20 outline-none focus:border-gold-deep/30 focus:ring-2 focus:ring-gold-deep/10 transition-all"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-[#111214] rounded-3xl border border-white/5 overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_minmax(0,1.5fr)_100px_140px] gap-4 px-6 py-3 border-b border-white/5">
          <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">Nome</span>
          <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">Descrição</span>
          <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">Status</span>
          <span className="text-[9px] font-black text-white/30 uppercase tracking-widest text-right">Ações</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-white/30 text-sm">
            <Loader2 className="w-5 h-5 animate-spin" />
            Carregando…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-white/20">
            <Shield className="w-8 h-8" />
            <p className="text-sm font-bold">
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
                  'border-b border-white/[0.03] last:border-0',
                  'hover:bg-white/[0.02] transition-colors group',
                )}
              >
                {/* Nome */}
                <div className="min-w-0">
                  <p className="text-sm font-black text-white truncate">{p.name}</p>
                  <p className="text-[9px] text-white/30 font-bold uppercase tracking-widest mt-0.5">
                    {p.leadVisibility === 'all' ? 'Todos os leads' : 'Apenas próprios'}
                  </p>
                </div>

                {/* Descrição */}
                <p className="text-[11px] text-white/40 font-medium line-clamp-2 leading-relaxed min-w-0">
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
                    className="p-2 rounded-xl text-white/30 hover:text-gold-deep hover:bg-gold-deep/5 transition-all"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>

                  {/* Duplicar */}
                  <button
                    onClick={() => handleDuplicate(p)}
                    title="Duplicar"
                    className="p-2 rounded-xl text-white/30 hover:text-sky-400 hover:bg-sky-400/5 transition-all"
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
                        ? 'text-emerald-500/50 hover:text-white/30 hover:bg-white/5'
                        : 'text-white/20 hover:text-emerald-400 hover:bg-emerald-400/5',
                    )}
                  >
                    {p.isActive ? <XCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                  </button>

                  {/* Excluir */}
                  <button
                    onClick={() => setDeleteTarget(p)}
                    title="Excluir"
                    className="p-2 rounded-xl text-white/20 hover:text-red-400 hover:bg-red-400/5 transition-all"
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
  );
};
