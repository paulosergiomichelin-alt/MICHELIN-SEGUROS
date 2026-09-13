import React, { useState, useRef, useEffect } from 'react';
import {
  Mail, Trash2, Archive, Reply, ReplyAll, Forward, Users2, MailPlus,
  FolderInput, ChevronDown, Tag, Gavel, Flag, Search, BookUser, Filter,
  Volume2, PackagePlus, RefreshCw, MailOpen,
} from 'lucide-react';
import { cn } from '../../../../lib/utils';
import { useEmail } from '../../../../contexts/EmailContext';

// ─── Building blocks ────────────────────────────────────────────────────────

const RibbonDivider: React.FC = () => <div className="w-px h-14 self-center bg-white/8 mx-2.5 shrink-0" />;

const RibbonGroup: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex flex-col items-center px-3 py-1.5 shrink-0">
    <div className="flex items-end gap-2 flex-1">{children}</div>
    <span className="text-[9.5px] text-white/25 uppercase tracking-wide mt-1.5 whitespace-nowrap">{label}</span>
  </div>
);

const RibbonButtonBig: React.FC<{
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  primary?: boolean;
}> = ({ icon, label, onClick, disabled, primary }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={disabled ? `${label} (em breve)` : label}
    className={cn(
      'flex flex-col items-center justify-center gap-1.5 px-3 py-2 rounded-lg transition-colors min-w-[88px] h-[70px] shrink-0',
      disabled
        ? 'text-white/15 cursor-not-allowed'
        : primary
          ? 'text-gold-deep hover:bg-gold-deep/10 border border-gold-deep/20'
          : 'text-white/60 hover:text-white/90 hover:bg-white/5',
    )}
  >
    {icon}
    <span className="text-[10px] leading-tight text-center px-1">{label}</span>
  </button>
);

const RibbonButtonSmall: React.FC<{
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
}> = ({ icon, label, onClick, disabled, active }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={disabled ? `${label} (em breve)` : label}
    className={cn(
      'flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors text-[11px] whitespace-nowrap',
      disabled
        ? 'text-white/15 cursor-not-allowed'
        : active
          ? 'text-gold-deep bg-gold-deep/10'
          : 'text-white/55 hover:text-white/90 hover:bg-white/5',
    )}
  >
    {icon}
    <span>{label}</span>
  </button>
);

const RibbonButtonSmallStack: React.FC<{
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}> = ({ icon, label, onClick, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={disabled ? `${label} (em breve)` : label}
    className={cn(
      'flex flex-col items-center justify-center gap-1 px-2.5 py-1.5 rounded-md transition-colors min-w-[68px] shrink-0',
      disabled ? 'text-white/15 cursor-not-allowed' : 'text-white/55 hover:text-white/90 hover:bg-white/5',
    )}
  >
    {icon}
    <span className="text-[9.5px] leading-tight text-center px-0.5">{label}</span>
  </button>
);

// ─── Dropdown de "Mover" ────────────────────────────────────────────────────

const MoveDropdown: React.FC<{ disabled: boolean; onMove: (action: string) => void }> = ({ disabled, onMove }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const options = [
    { action: 'archive', label: 'Arquivo' },
    { action: 'trash', label: 'Lixeira' },
    { action: 'spam', label: 'Lixo Eletrônico' },
    { action: 'restore', label: 'Caixa de Entrada' },
  ];

  return (
    <div className="relative" ref={ref}>
      <RibbonButtonSmallStack
        icon={<FolderInput className="w-4 h-4" />}
        label="Mover ▾"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
      />
      {open && !disabled && (
        <div className="absolute left-0 top-full mt-1 w-44 bg-[#1e1e1e] border border-white/10 rounded-xl shadow-2xl z-30 overflow-hidden py-1">
          {options.map(o => (
            <button
              key={o.action}
              onClick={() => { onMove(o.action); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-xs text-white/60 hover:bg-white/5 hover:text-white/90 transition-colors"
            >
              Mover para: {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── EmailRibbon ────────────────────────────────────────────────────────────

export const EmailRibbon: React.FC = () => {
  const { state, openComposer, doAction, triggerSync, search, clearSearch } = useEmail();
  const { selectedMessage, syncing } = state;
  const [searchValue, setSearchValue] = useState('');
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasSelection = Boolean(selectedMessage);

  const handleAction = (action: string) => {
    if (!selectedMessage) return;
    doAction(selectedMessage.id, action);
  };

  const handleSearchChange = (v: string) => {
    setSearchValue(v);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!v.trim()) { clearSearch(); return; }
    searchDebounceRef.current = setTimeout(() => search(v), 400);
  };

  return (
    <div className="shrink-0 w-full border-b border-white/5 bg-[#141414]">
      <div className="flex flex-wrap items-stretch px-3 py-1">
        {/* Novo */}
        <RibbonGroup label="Novo">
          <RibbonButtonBig
            icon={<Mail className="w-5 h-5" />}
            label="Novo E-mail"
            primary
            onClick={() => openComposer('new')}
          />
        </RibbonGroup>

        <RibbonDivider />

        {/* Excluir */}
        <RibbonGroup label="Excluir">
          <RibbonButtonBig
            icon={<Trash2 className="w-5 h-5" />}
            label="Excluir"
            disabled={!hasSelection}
            onClick={() => handleAction('trash')}
          />
          <RibbonButtonBig
            icon={<Archive className="w-5 h-5" />}
            label="Arquivar"
            disabled={!hasSelection}
            onClick={() => handleAction('archive')}
          />
        </RibbonGroup>

        <RibbonDivider />

        {/* Responder */}
        <RibbonGroup label="Responder">
          <RibbonButtonBig
            icon={<Reply className="w-5 h-5" />}
            label="Responder"
            disabled={!hasSelection}
            onClick={() => selectedMessage && openComposer('reply', selectedMessage)}
          />
          <RibbonButtonBig
            icon={<ReplyAll className="w-5 h-5" />}
            label="Responder a Todos"
            disabled={!hasSelection}
            onClick={() => selectedMessage && openComposer('replyAll', selectedMessage)}
          />
          <RibbonButtonBig
            icon={<Forward className="w-5 h-5" />}
            label="Encaminhar"
            disabled={!hasSelection}
            onClick={() => selectedMessage && openComposer('forward', selectedMessage)}
          />
        </RibbonGroup>

        <RibbonDivider />

        {/* Etapas Rápidas — sem funcionalidade correspondente ainda */}
        <RibbonGroup label="Etapas Rápidas">
          <div className="flex flex-col gap-1.5">
            <RibbonButtonSmall icon={<Users2 className="w-3.5 h-3.5" />} label="Para o Gerente" disabled />
            <RibbonButtonSmall icon={<MailPlus className="w-3.5 h-3.5" />} label="E-mail de Equipe" disabled />
          </div>
        </RibbonGroup>

        <RibbonDivider />

        {/* Mover */}
        <RibbonGroup label="Mover">
          <MoveDropdown disabled={!hasSelection} onMove={handleAction} />
          <RibbonButtonSmallStack icon={<Gavel className="w-4 h-4" />} label="Regras ▾" disabled />
        </RibbonGroup>

        <RibbonDivider />

        {/* Marcas */}
        <RibbonGroup label="Marcas">
          <RibbonButtonSmallStack icon={<Tag className="w-4 h-4" />} label="Categorizar ▾" disabled />
          <RibbonButtonSmallStack
            icon={selectedMessage?.isRead ? <MailOpen className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
            label={selectedMessage?.isRead ? 'Não Lido' : 'Lido'}
            disabled={!hasSelection}
            onClick={() => handleAction(selectedMessage?.isRead ? 'unread' : 'read')}
          />
          <RibbonButtonSmallStack icon={<Flag className="w-4 h-4" />} label="Acompanhamento ▾" disabled />
        </RibbonGroup>

        <RibbonDivider />

        {/* Localizar */}
        <RibbonGroup label="Localizar">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 w-44">
              <Search className="w-3.5 h-3.5 text-white/30 shrink-0" />
              <input
                value={searchValue}
                onChange={e => handleSearchChange(e.target.value)}
                placeholder="Pesquisar E-mail"
                className="bg-transparent text-[11px] text-white/70 placeholder:text-white/25 outline-none w-full"
              />
            </div>
            <RibbonButtonSmallStack icon={<BookUser className="w-4 h-4" />} label="Catálogo de Endereços" disabled />
            <RibbonButtonSmallStack icon={<Filter className="w-4 h-4" />} label="Filtrar E-mail ▾" disabled />
          </div>
        </RibbonGroup>

        <RibbonDivider />

        {/* Fala */}
        <RibbonGroup label="Fala">
          <RibbonButtonBig icon={<Volume2 className="w-5 h-5" />} label="Ler em Voz Alta" disabled />
        </RibbonGroup>

        <RibbonDivider />

        {/* Suplementos */}
        <RibbonGroup label="Suplementos">
          <RibbonButtonBig icon={<PackagePlus className="w-5 h-5" />} label="Obter Suplementos" disabled />
        </RibbonGroup>

        <RibbonDivider />

        {/* Sincronizar — não existe no Outlook (é Enviar/Receber), mantido pela função real do CRM */}
        <RibbonGroup label="Enviar/Receber">
          <RibbonButtonBig
            icon={<RefreshCw className={cn('w-5 h-5', syncing && 'animate-spin')} />}
            label={syncing ? 'Sincronizando...' : 'Sincronizar'}
            disabled={syncing}
            onClick={() => triggerSync()}
          />
        </RibbonGroup>
      </div>
    </div>
  );
};
