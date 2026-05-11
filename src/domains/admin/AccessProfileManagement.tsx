import React, { useState, useEffect } from 'react';
import { orderBy } from 'firebase/firestore';
import { DataService } from '../../services/DataService';
import { AccessProfile, Permissions, UserRole } from '../../types';
import { 
  Shield, 
  Plus, 
  Trash2, 
  Edit2, 
  Save, 
  X, 
  Check, 
  LayoutDashboard, 
  Users, 
  Settings, 
  FileText, 
  PlusCircle, 
  AlertTriangle,
  Lock,
  ShieldCheck,
  ShieldAlert,
  RefreshCcw
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { auth as firebaseAuth } from '../../lib/firebase';

const DEFAULT_PERMISSIONS: Permissions = {
  canReadAllLeads: false,
  canWriteAllLeads: false,
  canDelete: false,
  canAccessSettings: false,
  canManageUsers: false
};

const PERMISSION_DEFINITIONS = [
  { id: 'canReadAllLeads', label: 'Ver Todos os Leads', desc: 'Permite visualizar todos os clientes da base', group: 'Comercial', icon: Users },
  { id: 'canWriteAllLeads', label: 'Gerir Leads', desc: 'Permite criar e editar informações de leads', group: 'Comercial', icon: FileText },
  { id: 'canDelete', label: 'Poder de Exclusão', desc: 'Permite apagar registros do sistema (⚠️ Crítico)', group: 'Segurança', icon: Trash2 },
  { id: 'canAccessSettings', label: 'Configurações de IA', desc: 'Acesso ao Agente e parâmetros do sistema', group: 'Administrativo', icon: Settings },
  { id: 'canManageUsers', label: 'Gestão de Equipe', desc: 'Criar, editar e revogar acessos de usuários', group: 'Administrativo', icon: ShieldCheck },
];

export const AccessProfileManagement: React.FC = () => {
  const [profiles, setProfiles] = useState<AccessProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingProfile, setEditingProfile] = useState<AccessProfile | null>(null);
  
  // Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [permissions, setPermissions] = useState<Permissions>(DEFAULT_PERMISSIONS);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchProfiles = async () => {
      try {
        const docs = await DataService.list('access_profile', [orderBy('createdAt', 'desc')]);
        setProfiles(docs);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching profiles:", error);
        setLoading(false);
      }
    };

    fetchProfiles();
  }, [showModal]); // Refresh when modal closes (after save/delete)

  const handleOpenModal = (profile?: AccessProfile) => {
    if (profile) {
      setEditingProfile(profile);
      setName(profile.name);
      setDescription(profile.description);
      // Merge with default to handle schema evolution
      setPermissions({
        ...DEFAULT_PERMISSIONS,
        ...profile.permissions
      });
    } else {
      setEditingProfile(null);
      setName('');
      setDescription('');
      setPermissions(DEFAULT_PERMISSIONS);
    }
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      if (editingProfile) {
        await DataService.update('access_profile', editingProfile.id, {
          name,
          description,
          permissions
        });
      } else {
        await DataService.create('access_profile', {
          name,
          description,
          permissions
        });
      }
      setShowModal(false);
    } catch (error) {
      console.error("Error saving profile:", error);
      alert("Erro ao salvar perfil de acesso.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Tem certeza que deseja excluir este perfil? Usuários vinculados a ele podem perder acesso.")) return;
    try {
      await DataService.delete('access_profile', id);
    } catch (error) {
      console.error("Error deleting profile:", error);
    }
  };

  const selectAll = () => {
    setPermissions({
      canReadAllLeads: true,
      canWriteAllLeads: true,
      canDelete: true,
      canAccessSettings: true,
      canManageUsers: true
    });
  };

  const removeAll = () => {
    setPermissions(DEFAULT_PERMISSIONS);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-brand-dark p-6 rounded-3xl border border-gold-deep/20 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-gold-deep flex items-center gap-2 font-display uppercase tracking-tight">
            <Shield className="w-6 h-6 text-gold-deep" />
            Evolução de Perfis de Acesso
          </h2>
          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black mt-1">Gestão granular por módulo e ação</p>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 px-6 py-2 bg-gold-deep text-brand-black rounded-xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-gold-light transition-all shadow-lg shadow-gold-deep/20"
        >
          <PlusCircle className="w-4 h-4" />
          Novo Perfil
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {profiles.map((p) => (
          <div key={p.id} className="bg-brand-dark p-6 rounded-[2.5rem] border border-gold-deep/10 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
               <Shield className="w-16 h-16 text-gold-deep rotate-12" />
            </div>

            <div className="relative z-10">
              <h3 className="text-lg font-black text-white uppercase tracking-tight">{p.name}</h3>
              <p className="text-[10px] text-slate-400 font-bold mt-1 h-8 line-clamp-2">{p.description || 'Sem descrição.'}</p>
              
              <div className="mt-6 space-y-2">
                <p className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3">Permissões Ativas:</p>
                <div className="flex flex-wrap gap-1.5">
                  {PERMISSION_DEFINITIONS.map(pDef => (p.permissions[pDef.id as keyof Permissions]) && (
                    <span key={pDef.id} className="px-2.5 py-1 bg-gold-deep/5 text-gold-deep rounded-full text-[8px] font-black uppercase tracking-widest border border-gold-deep/10">
                      {pDef.label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-end gap-2 text-white">
                <button 
                  onClick={() => handleOpenModal(p)}
                  className="p-2 text-slate-400 hover:text-gold-deep hover:bg-gold-deep/5 rounded-xl transition-all"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => handleDelete(p.id)}
                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50/5 rounded-xl transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isSaving && setShowModal(false)}
              className="absolute inset-0 bg-brand-black/90 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-4xl bg-brand-dark rounded-[3rem] shadow-2xl overflow-hidden border border-gold-deep/20"
            >
              <div className="p-8 max-h-[90vh] overflow-y-auto no-scrollbar">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-2xl font-black text-white uppercase tracking-tight">
                      {editingProfile ? 'Evolução de Perfil' : 'Construir Novo Perfil'}
                    </h3>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Configuração Profissional de Permissões</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      type="button"
                      onClick={selectAll}
                      className="px-3 py-1.5 bg-gold-deep/10 text-gold-deep rounded-lg text-[8px] font-black uppercase tracking-widest hover:bg-gold-deep/20 transition-all"
                    >
                      Selecionar Tudo
                    </button>
                    <button 
                      type="button"
                      onClick={removeAll}
                      className="px-3 py-1.5 bg-red-500/10 text-red-500 rounded-lg text-[8px] font-black uppercase tracking-widest hover:bg-red-500/20 transition-all"
                    >
                      Remover Tudo
                    </button>
                    <button 
                      onClick={() => setShowModal(false)}
                      className="p-2 text-slate-500 hover:text-red-500 transition-colors"
                    >
                      <X className="w-6 h-6" />
                    </button>
                  </div>
                </div>

                <form onSubmit={handleSave} className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                    <div className="md:col-span-1 space-y-6">
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Nome do Perfil</label>
                        <input 
                          type="text" 
                          required
                          value={name || ''}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Ex: Consultor Sênior"
                          className="w-full px-4 py-3 bg-brand-black border border-white/5 rounded-2xl focus:ring-4 focus:ring-gold-deep/5 focus:border-gold-deep/30 outline-none transition-all font-bold text-sm text-white"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Descrição</label>
                        <textarea 
                          value={description || ''}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="Objetivo deste cargo..."
                          className="w-full px-4 py-3 bg-brand-black border border-white/5 rounded-2xl focus:ring-4 focus:ring-gold-deep/5 focus:border-gold-deep/30 outline-none transition-all font-bold text-sm h-32 resize-none text-white"
                        />
                      </div>
                      
                      <div className="p-4 bg-brand-black/50 rounded-2xl border border-white/5 space-y-1">
                         <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
                           <Shield className="w-3 h-3 text-gold-deep" /> Resumo do Perfil
                         </p>
                         <div className="space-y-1">
                            <p className="text-[8px] text-slate-400 font-bold uppercase">Nome: <span className="text-white">{name || '---'}</span></p>
                            <p className="text-[8px] text-slate-400 font-bold uppercase">Ativo: <span className="text-emerald-500">SIM</span></p>
                         </div>
                      </div>
                    </div>

                    <div className="md:col-span-3">
                      {/* Unified Permissions Checklist */}
                      <div className="space-y-8">
                        {Array.from(new Set(PERMISSION_DEFINITIONS.map(m => m.group))).map(group => (
                          <div key={group} className="space-y-4">
                            <h4 className="text-[10px] font-black text-gold-deep uppercase tracking-[0.3em] pl-2 border-l-2 border-gold-deep/20">
                              {group}
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {PERMISSION_DEFINITIONS.filter(p => p.group === group).map((pDef) => (
                                <div key={pDef.id} className="p-5 bg-brand-black rounded-[2rem] border border-white/5 flex items-center justify-between group hover:border-gold-deep/30 transition-all">
                                  <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center text-gold-deep group-hover:bg-gold-deep group-hover:text-brand-black transition-all">
                                      <pDef.icon className="w-5 h-5" />
                                    </div>
                                    <div>
                                      <p className="text-[10px] font-black text-white uppercase tracking-widest">{pDef.label}</p>
                                      <p className="text-[8px] text-slate-500 font-bold uppercase mt-0.5">{pDef.desc}</p>
                                    </div>
                                  </div>
                                  
                                  <button
                                    type="button"
                                    onClick={() => setPermissions(prev => ({ ...prev, [pDef.id]: !prev[pDef.id as keyof Permissions] }))}
                                    className={cn(
                                      "w-12 h-6 rounded-full transition-all relative flex items-center px-1 border",
                                      permissions[pDef.id as keyof Permissions] ? "bg-gold-deep border-gold-deep" : "bg-slate-900 border-slate-800"
                                    )}
                                  >
                                    <div className={cn(
                                      "w-4 h-4 bg-white rounded-full transition-all shadow-md",
                                      permissions[pDef.id as keyof Permissions] ? "translate-x-6" : "translate-x-0"
                                    )} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-4 pt-6 border-t border-white/5">
                    <button 
                      type="button"
                      onClick={() => setShowModal(false)}
                      className="flex-1 py-4 bg-slate-800 text-slate-400 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-700 transition-all border border-white/5"
                    >
                      Descartar Alterações
                    </button>
                    <button 
                      type="submit"
                      disabled={isSaving}
                      className="flex-[2] py-4 bg-gold-deep text-brand-black rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-gold-light transition-all shadow-2xl shadow-gold-deep/20 flex items-center justify-center gap-3"
                    >
                      {isSaving ? <RefreshCcw className="animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                      {editingProfile ? 'Confirmar Evolução de Perfil' : 'Ativar Novo Perfil Estratégico'}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
