import React, { useState, useCallback } from 'react';
import {
  ChevronLeft, Save, Loader2, Lock, Shield, Eye,
  LayoutGrid, Users, Bot, ShieldAlert,
  Cog, ChevronDown, ChevronUp, Check,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AccessProfile, FieldPermission, LeadVisibility, MenuPermission } from '../../types';
import { DataService } from '../../services/DataService';
import { cn } from '../../lib/utils';

// ─── Constantes ─────────────────────────────────────────────────────────────

const MENU_ITEMS = [
  { key: 'pipeline',  label: 'Pipeline',      icon: LayoutGrid,    hasEdit: false, hasDelete: false },
  { key: 'leads',     label: 'Leads',         icon: Users,         hasEdit: true,  hasDelete: true  },
  { key: 'agent',     label: 'Agente de IA',  icon: Bot,           hasEdit: true,  hasDelete: false },
  { key: 'users',     label: 'Equipe',        icon: ShieldAlert,   hasEdit: true,  hasDelete: true  },
  { key: 'settings',  label: 'Configurações', icon: Cog,           hasEdit: true,  hasDelete: false },
] as const;

type MenuKey = typeof MENU_ITEMS[number]['key'];

const FIELD_DEFINITIONS = [
  {
    entity: 'lead',
    label: 'Lead',
    menuItemKey: 'leads' as MenuKey,
    fields: [
      { key: 'lead.phone',    label: 'Telefone',         sensitive: true  },
      { key: 'lead.phone2',   label: 'Telefone 2',       sensitive: true  },
      { key: 'lead.email',    label: 'E-mail',           sensitive: true  },
      { key: 'lead.cpf',      label: 'CPF',              sensitive: true  },
      { key: 'lead.rg',       label: 'RG',               sensitive: true  },
      { key: 'lead.address',  label: 'Endereço',         sensitive: false },
      { key: 'lead.notes',    label: 'Observações',      sensitive: false },
      { key: 'lead.score',    label: 'Score IA',         sensitive: false },
    ],
  },
];

// ─── Tipos locais ────────────────────────────────────────────────────────────

type MenuPermsMap = Record<string, { canView: boolean; canEdit: boolean; canDelete: boolean }>;
type FieldPermsMap = Record<string, { canView: boolean; canEdit: boolean }>;

const DEFAULT_MENU: MenuPermsMap = Object.fromEntries(
  MENU_ITEMS.map(i => [i.key, { canView: false, canEdit: false, canDelete: false }])
);

const DEFAULT_FIELDS: FieldPermsMap = Object.fromEntries(
  FIELD_DEFINITIONS.flatMap(e => e.fields.map(f => [f.key, { canView: true, canEdit: true }]))
);

// ─── Helpers ────────────────────────────────────────────────────────────────

function toMenuPermsMap(profile: AccessProfile | null): MenuPermsMap {
  const map = structuredClone(DEFAULT_MENU);
  if (!profile?.menuPermissions) return map;
  for (const p of profile.menuPermissions) {
    if (map[p.menuItemKey] !== undefined)
      map[p.menuItemKey] = { canView: p.canView, canEdit: p.canEdit, canDelete: p.canDelete };
  }
  return map;
}

function toFieldPermsMap(profile: AccessProfile | null): FieldPermsMap {
  const map = structuredClone(DEFAULT_FIELDS);
  if (!profile?.fieldPermissions) return map;
  for (const p of profile.fieldPermissions) {
    if (map[p.fieldKey] !== undefined)
      map[p.fieldKey] = { canView: p.canView, canEdit: p.canEdit };
  }
  return map;
}

/** Computa os 5 booleanos legados a partir das novas permissões de menu. */
function computeLegacyPermissions(mp: MenuPermsMap) {
  const readItems: string[] = ['pipeline', 'leads'];
  return {
    canReadAllLeads:   readItems.some(k => mp[k]?.canView),
    canWriteAllLeads:  mp['leads']?.canEdit ?? false,
    canDelete:         Object.values(mp).some(p => p.canDelete),
    canAccessSettings: mp['agent']?.canView || mp['settings']?.canView || false,
    canManageUsers:    mp['users']?.canView ?? false,
  };
}

// ─── Sub-componentes ─────────────────────────────────────────────────────────

const Checkbox = ({
  checked, disabled, onChange,
}: { checked: boolean; disabled?: boolean; onChange?: () => void }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onChange}
    className={cn(
      'w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0',
      disabled
        ? 'border-slate-200 bg-transparent cursor-not-allowed'
        : checked
          ? 'border-gold-deep bg-gold-deep hover:brightness-110 cursor-pointer'
          : 'border-slate-300 bg-transparent hover:border-gold-deep/50 cursor-pointer',
    )}
  >
    {!disabled && checked && <Check className="w-3 h-3 text-black" />}
  </button>
);

const Dash = () => (
  <div className="w-5 h-5 flex items-center justify-center">
    <div className="w-3 h-px bg-slate-200 rounded" />
  </div>
);

const SectionHeader = ({ label }: { label: string }) => (
  <p className="text-[8.5px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
);

// ─── Componente principal ────────────────────────────────────────────────────

interface Props {
  profile: AccessProfile | null;
  onSave: () => void;
  onCancel: () => void;
}

export const AccessProfileForm: React.FC<Props> = ({ profile, onSave, onCancel }) => {
  const [name, setName]               = useState(profile?.name        ?? '');
  const [description, setDescription] = useState(profile?.description ?? '');
  const [isActive, setIsActive]       = useState(profile?.isActive    ?? true);
  const [leadVis, setLeadVis]         = useState<LeadVisibility>(profile?.leadVisibility ?? 'own');
  const [menuPerms, setMenuPerms]     = useState<MenuPermsMap>(() => toMenuPermsMap(profile));
  const [fieldPerms, setFieldPerms]   = useState<FieldPermsMap>(() => toFieldPermsMap(profile));
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ lead: true });
  const [isSaving, setIsSaving]       = useState(false);
  const [errors, setErrors]           = useState<Record<string, string>>({});

  // ── Menu helpers ──────────────────────────────────────────
  const setMenuPerm = useCallback((key: string, field: 'canView' | 'canEdit' | 'canDelete', value: boolean) => {
    setMenuPerms(prev => {
      let next = { ...prev[key], [field]: value };
      if (field === 'canView' && !value)  next = { canView: false, canEdit: false, canDelete: false };
      if ((field === 'canEdit' || field === 'canDelete') && value) next.canView = true;
      return { ...prev, [key]: next };
    });
  }, []);

  const selectAll = () =>
    setMenuPerms(Object.fromEntries(MENU_ITEMS.map(i => [
      i.key, { canView: true, canEdit: i.hasEdit, canDelete: i.hasDelete },
    ])));

  const clearAll = () => setMenuPerms(structuredClone(DEFAULT_MENU));

  const allVisible = MENU_ITEMS.every(i => menuPerms[i.key]?.canView);

  // ── Field helpers ─────────────────────────────────────────
  const setFieldPerm = useCallback((key: string, field: 'canView' | 'canEdit', value: boolean) => {
    setFieldPerms(prev => {
      let next = { ...prev[key], [field]: value };
      if (field === 'canView'  && !value) next.canEdit = false;
      if (field === 'canEdit'  && value)  next.canView = true;
      return { ...prev, [key]: next };
    });
  }, []);

  // ── Save ──────────────────────────────────────────────────
  const handleSave = async () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Nome é obrigatório';
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setIsSaving(true);
    try {
      const menuPermissionsArr: MenuPermission[] = MENU_ITEMS.map(item => ({
        menuItemKey: item.key,
        canView:   menuPerms[item.key].canView,
        canEdit:   menuPerms[item.key].canEdit,
        canDelete: menuPerms[item.key].canDelete,
      }));

      const fieldPermissionsArr: FieldPermission[] = FIELD_DEFINITIONS.flatMap(e =>
        e.fields
          .filter(f => {
            const p = fieldPerms[f.key];
            return !(p?.canView && p?.canEdit); // só armazena restrições
          })
          .map(f => ({
            menuItemKey: e.menuItemKey,
            fieldKey:    f.key,
            canView:     fieldPerms[f.key]?.canView ?? true,
            canEdit:     fieldPerms[f.key]?.canEdit ?? true,
          }))
      );

      const data = {
        name:             name.trim(),
        description:      description.trim(),
        isActive,
        leadVisibility:   leadVis,
        permissions:      computeLegacyPermissions(menuPerms),
        menuPermissions:  menuPermissionsArr,
        fieldPermissions: fieldPermissionsArr,
        updatedAt:        new Date().toISOString(),
      };

      if (profile) {
        await DataService.update('access_profile', profile.id, data);
      } else {
        await DataService.create('access_profile', { ...data, createdAt: new Date().toISOString() });
      }
      onSave();
    } catch (err) {
      console.error('[ACCESS_PROFILE_FORM] Save failed:', err);
      setErrors({ global: 'Erro ao salvar. Tente novamente.' });
    } finally {
      setIsSaving(false);
    }
  };

  // ─────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50">

      {/* ── Cabeçalho ── */}
      <header className="shrink-0 px-5 py-3 bg-white border-b border-slate-200 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onCancel}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-800 transition-all shrink-0">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <h1 className="text-[11px] font-black text-slate-900 uppercase tracking-widest truncate">
              {profile ? 'Editar Perfil de Acesso' : 'Novo Perfil de Acesso'}
            </h1>
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
              {profile ? profile.name : 'Configurando permissões de acesso'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {errors.global && <p className="text-[8px] text-[#C0392B] font-bold">{errors.global}</p>}
          <button onClick={onCancel} disabled={isSaving}
            className="px-3 py-1.5 rounded-lg text-[8.5px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-800 border border-slate-200 hover:border-slate-300 transition-all">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={isSaving}
            className="px-4 py-1.5 rounded-lg text-[8.5px] font-black uppercase tracking-widest bg-[#1B4D8F] text-white hover:bg-[#153E73] transition-all flex items-center gap-1.5 shadow-sm shadow-[#1B4D8F]/20 disabled:opacity-60">
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {isSaving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </header>

      {/* ── Corpo ── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5">

        {/* ══ 1. Informações Gerais ═══════════════════════════════════ */}
        <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Shield className="w-3.5 h-3.5 text-gold-deep" />
            <h2 className="text-[10px] font-black text-slate-800 uppercase tracking-[0.2em]">Informações Gerais</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <SectionHeader label="Nome do Perfil *" />
              <input
                value={name}
                onChange={e => { setName(e.target.value); setErrors(p => { const n={...p}; delete n.name; return n; }); }}
                placeholder="Ex: Vendedor Júnior"
                className={cn(
                  'w-full bg-white border rounded-xl px-3 py-2.5 text-[11px] font-bold text-slate-800 placeholder-slate-300 outline-none transition-all',
                  errors.name ? 'border-[#C0392B]/50' : 'border-slate-200 focus:border-[#1B4D8F]/60 focus:ring-2 focus:ring-[#1B4D8F]/15',
                )}
              />
              {errors.name && <p className="text-[8px] text-[#C0392B] font-bold">{errors.name}</p>}
            </div>
            <div className="space-y-1.5">
              <SectionHeader label="Descrição" />
              <input
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Responsável pelo atendimento inicial..."
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-[11px] font-bold text-slate-800 placeholder-slate-300 outline-none focus:border-[#1B4D8F]/60 focus:ring-2 focus:ring-[#1B4D8F]/15 transition-all"
              />
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-xl">
            <div>
              <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Status</p>
              <p className="text-[8px] text-slate-400 font-bold mt-0.5">
                {isActive ? 'Ativo — usuários podem ser atribuídos a este perfil' : 'Inativo — sem novos acessos'}
              </p>
            </div>
            <button type="button" onClick={() => setIsActive(v => !v)}
              className={cn('w-11 h-6 rounded-full transition-all relative border',
                isActive ? 'bg-[#1F8A4C] border-[#1F8A4C]' : 'bg-slate-200 border-slate-200')}>
              <div className={cn('absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all',
                isActive ? 'left-[22px]' : 'left-0.5')} />
            </button>
          </div>
        </section>

        {/* ══ 2. Visibilidade de Leads ════════════════════════════════ */}
        <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Eye className="w-3.5 h-3.5 text-gold-deep" />
            <h2 className="text-[10px] font-black text-slate-800 uppercase tracking-[0.2em]">Visibilidade de Leads</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {([
              {
                value: 'own' as const,
                title: 'Apenas os seus leads',
                desc:  'O usuário vê somente leads onde é responsável. Ideal para vendedores independentes.',
              },
              {
                value: 'all' as const,
                title: 'Todos os leads da equipe',
                desc:  'O usuário vê todos os leads da organização. Ideal para gestores e supervisores.',
              },
            ] as const).map(opt => (
              <button key={opt.value} type="button" onClick={() => setLeadVis(opt.value)}
                className={cn('p-4 rounded-xl border-2 text-left transition-all',
                  leadVis === opt.value
                    ? 'border-gold-deep bg-gold-deep/5'
                    : 'border-slate-200 bg-slate-50 hover:border-slate-300')}
              >
                <div className="flex items-start gap-3">
                  <div className={cn('w-4 h-4 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center transition-all',
                    leadVis === opt.value ? 'border-gold-deep' : 'border-slate-300')}>
                    {leadVis === opt.value && <div className="w-2 h-2 rounded-full bg-gold-deep" />}
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-800 uppercase tracking-tight">{opt.title}</p>
                    <p className="text-[8px] text-slate-500 font-bold mt-1 leading-relaxed">{opt.desc}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* ══ 3. Permissões de Menu ═══════════════════════════════════ */}
        <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <LayoutGrid className="w-3.5 h-3.5 text-gold-deep" />
              <h2 className="text-[10px] font-black text-slate-800 uppercase tracking-[0.2em]">Permissões de Menu</h2>
            </div>
            <button type="button" onClick={allVisible ? clearAll : selectAll}
              className="px-2.5 py-1 bg-gold-deep/10 text-gold-deep rounded-lg text-[8px] font-black uppercase tracking-widest hover:bg-gold-deep/20 transition-all">
              {allVisible ? 'Desmarcar tudo' : 'Marcar todos'}
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="grid grid-cols-[1fr_80px_80px_80px] bg-slate-50 border-b border-slate-200 px-4 py-2.5">
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Item de Menu</p>
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest text-center">Visualizar</p>
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest text-center">Editar</p>
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest text-center">Excluir</p>
            </div>

            {MENU_ITEMS.map((item, idx) => {
              const perms = menuPerms[item.key];
              const Icon  = item.icon;
              return (
                <div key={item.key}
                  className={cn(
                    'grid grid-cols-[1fr_80px_80px_80px] px-4 py-3 items-center transition-colors',
                    idx % 2 === 0 ? 'bg-transparent' : 'bg-slate-50/60',
                    'hover:bg-slate-50',
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={cn('w-6 h-6 rounded-lg flex items-center justify-center transition-colors',
                      perms.canView ? 'bg-gold-deep/10 text-gold-deep' : 'bg-slate-100 text-slate-300')}>
                      <Icon className="w-3 h-3" />
                    </div>
                    <span className={cn('text-[10px] font-bold uppercase tracking-tight transition-colors',
                      perms.canView ? 'text-slate-800' : 'text-slate-300')}>{item.label}</span>
                  </div>
                  <div className="flex justify-center">
                    <Checkbox checked={perms.canView}
                      onChange={() => setMenuPerm(item.key, 'canView', !perms.canView)} />
                  </div>
                  <div className="flex justify-center">
                    {item.hasEdit
                      ? <Checkbox checked={perms.canEdit} disabled={!perms.canView}
                          onChange={() => setMenuPerm(item.key, 'canEdit', !perms.canEdit)} />
                      : <Dash />}
                  </div>
                  <div className="flex justify-center">
                    {item.hasDelete
                      ? <Checkbox checked={perms.canDelete} disabled={!perms.canView}
                          onChange={() => setMenuPerm(item.key, 'canDelete', !perms.canDelete)} />
                      : <Dash />}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ══ 4. Permissões por Campo ═════════════════════════════════ */}
        <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Lock className="w-3.5 h-3.5 text-gold-deep" />
            <h2 className="text-[10px] font-black text-slate-800 uppercase tracking-[0.2em]">Permissões por Campo</h2>
          </div>
          <p className="text-[8.5px] text-slate-400 font-bold leading-relaxed">
            Campos sem restrição têm acesso total por padrão. Configure apenas os campos que devem ser restritos.
          </p>

          {FIELD_DEFINITIONS.map(entityDef => {
            const menuVisible  = menuPerms[entityDef.menuItemKey]?.canView;
            const menuEditable = menuPerms[entityDef.menuItemKey]?.canEdit;
            const isOpen = openSections[entityDef.entity] ?? true;

            return (
              <div key={entityDef.entity} className="border border-slate-200 rounded-xl overflow-hidden">
                <button type="button"
                  onClick={() => setOpenSections(p => ({ ...p, [entityDef.entity]: !isOpen }))}
                  className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors">
                  <p className="text-[10px] font-black text-slate-800 uppercase tracking-widest">{entityDef.label}</p>
                  {isOpen
                    ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                    : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      {!menuVisible && (
                        <div className="mx-4 my-3 p-3 bg-[#FFF3DC] border border-[#B8860B]/20 rounded-xl flex items-start gap-2">
                          <Lock className="w-3 h-3 text-[#B8860B] shrink-0 mt-0.5" />
                          <p className="text-[8px] text-[#B8860B] font-bold leading-relaxed">
                            Ative o acesso ao menu <span className="font-black">{entityDef.label}</span> para configurar permissões de campo.
                          </p>
                        </div>
                      )}

                      <div className="grid grid-cols-[1fr_80px_80px] px-4 py-2 bg-slate-50 border-b border-slate-100">
                        <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest">Campo</p>
                        <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest text-center">Visualizar</p>
                        <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest text-center">Editar</p>
                      </div>

                      {entityDef.fields.map((field, idx) => {
                        const fp = fieldPerms[field.key];
                        const blocked = !menuVisible;
                        return (
                          <div key={field.key}
                            className={cn(
                              'grid grid-cols-[1fr_80px_80px] px-4 py-2.5 items-center',
                              idx % 2 === 0 ? 'bg-transparent' : 'bg-slate-50/60',
                              blocked ? 'opacity-30 pointer-events-none' : 'hover:bg-slate-50',
                            )}>
                            <div className="flex items-center gap-2">
                              <span className={cn('text-[10px] font-bold',
                                (fp?.canView ?? true) ? 'text-slate-600' : 'text-slate-300')}>
                                {field.label}
                              </span>
                              {field.sensitive && (
                                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-[#FDE4E4] border border-[#C0392B]/20 rounded text-[7px] font-black text-[#C0392B] uppercase tracking-widest">
                                  <Lock className="w-2 h-2" /> Sensível
                                </span>
                              )}
                            </div>
                            <div className="flex justify-center">
                              <Checkbox checked={fp?.canView ?? true} disabled={blocked}
                                onChange={() => setFieldPerm(field.key, 'canView', !(fp?.canView ?? true))} />
                            </div>
                            <div className="flex justify-center">
                              <Checkbox
                                checked={fp?.canEdit ?? true}
                                disabled={blocked || !menuEditable || !(fp?.canView ?? true)}
                                onChange={() => setFieldPerm(field.key, 'canEdit', !(fp?.canEdit ?? true))}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </section>

        <div className="h-8" />
      </div>
    </div>
  );
};
