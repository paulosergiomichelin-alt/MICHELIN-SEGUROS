import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  KeyboardEvent,
} from 'react';
import {
  X,
  Send,
  Paperclip,
  Bold,
  Italic,
  Underline,
  List,
  Link,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Minus,
  FileText,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import { useEmail } from '../../contexts/EmailContext';
import { EmailService, CachedEmail, EmailAddress } from '../../services/EmailService';

// ─── Email Chip ───────────────────────────────────────────────────────────────

const EmailChip: React.FC<{ address: EmailAddress; onRemove: () => void }> = ({ address, onRemove }) => (
  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-xs border border-blue-500/30">
    {address.name ? `${address.name} <${address.email}>` : address.email}
    <button
      onClick={onRemove}
      className="hover:text-white transition-colors ml-0.5"
      type="button"
    >
      <X className="w-3 h-3" />
    </button>
  </span>
);

// ─── Email Field with chips ───────────────────────────────────────────────────

interface EmailFieldProps {
  label: string;
  addresses: EmailAddress[];
  onChange: (addresses: EmailAddress[]) => void;
}

const EmailField: React.FC<EmailFieldProps> = ({ label, addresses, onChange }) => {
  const [inputValue, setInputValue] = useState('');

  const addEmail = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    // Parse "Name <email>" or plain email
    const match = trimmed.match(/^(.+?)\s*<([^>]+)>$/);
    let addr: EmailAddress;
    if (match) {
      addr = { name: match[1].trim(), email: match[2].trim() };
    } else {
      addr = { email: trimmed };
    }
    if (!addr.email.includes('@')) return;
    if (addresses.some(a => a.email === addr.email)) return;
    onChange([...addresses, addr]);
    setInputValue('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addEmail(inputValue);
    } else if (e.key === 'Backspace' && !inputValue && addresses.length > 0) {
      onChange(addresses.slice(0, -1));
    }
  };

  return (
    <div className="flex items-start gap-2 px-4 py-2 border-b border-white/5 min-h-[40px]">
      <span className="text-white/40 text-sm shrink-0 mt-1 w-8">{label}</span>
      <div className="flex flex-wrap gap-1 flex-1 items-center">
        {addresses.map((addr, i) => (
          <EmailChip
            key={i}
            address={addr}
            onRemove={() => onChange(addresses.filter((_, idx) => idx !== i))}
          />
        ))}
        <input
          type="text"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => addEmail(inputValue)}
          placeholder={addresses.length === 0 ? 'Adicionar endereço...' : ''}
          className="flex-1 min-w-[120px] bg-transparent text-white/80 text-sm outline-none placeholder:text-white/20"
        />
      </div>
    </div>
  );
};

// ─── Toolbar Button ───────────────────────────────────────────────────────────

const ToolbarBtn: React.FC<{
  onClick: () => void;
  title: string;
  active?: boolean;
  children: React.ReactNode;
}> = ({ onClick, title, active, children }) => (
  <button
    type="button"
    title={title}
    onMouseDown={e => { e.preventDefault(); onClick(); }}
    className={cn(
      'p-1.5 rounded transition-colors',
      active
        ? 'bg-blue-500/30 text-blue-300'
        : 'text-white/50 hover:text-white/90 hover:bg-white/10',
    )}
  >
    {children}
  </button>
);

// ─── EmailComposer ────────────────────────────────────────────────────────────

export const EmailComposer: React.FC = () => {
  const { state, closeComposer } = useEmail();
  const { composerOpen, composerMode, composerReplyTo, selectedAccountId, accounts } = state;

  const [to, setTo] = useState<EmailAddress[]>([]);
  const [cc, setCc] = useState<EmailAddress[]>([]);
  const [bcc, setBcc] = useState<EmailAddress[]>([]);
  const [subject, setSubject] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autosaveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Pre-fill for reply/forward ────────────────────────────────────────────
  useEffect(() => {
    if (!composerOpen) return;

    if (composerMode === 'new') {
      setTo([]);
      setCc([]);
      setBcc([]);
      setSubject('');
      setShowCc(false);
      setShowBcc(false);
      setAttachments([]);
      setDraftId(null);
      if (editorRef.current) editorRef.current.innerHTML = '';
      return;
    }

    const msg = composerReplyTo;
    if (!msg) return;

    if (composerMode === 'reply') {
      setTo([msg.from]);
      setSubject(msg.subject.startsWith('Re:') ? msg.subject : `Re: ${msg.subject}`);
    } else if (composerMode === 'replyAll') {
      setTo([msg.from, ...(msg.cc ?? []).filter(a => a.email !== accounts.find(ac => ac.id === selectedAccountId)?.email)]);
      setSubject(msg.subject.startsWith('Re:') ? msg.subject : `Re: ${msg.subject}`);
    } else if (composerMode === 'forward') {
      setTo([]);
      setSubject(msg.subject.startsWith('Fwd:') ? msg.subject : `Fwd: ${msg.subject}`);
    }

    // Insert quoted content
    if (editorRef.current && (composerMode === 'reply' || composerMode === 'replyAll' || composerMode === 'forward')) {
      const originalFrom = msg.from.name
        ? `${msg.from.name} &lt;${msg.from.email}&gt;`
        : msg.from.email;
      const originalDate = new Date(msg.date).toLocaleString('pt-BR');
      const quote = msg.bodyHtml || `<p>${msg.snippet}</p>`;
      editorRef.current.innerHTML = `
        <p><br></p>
        <div style="border-left: 2px solid #3b82f6; padding-left: 12px; margin-left: 4px; color: rgba(255,255,255,0.5);">
          <p style="font-size: 12px; margin-bottom: 4px;">
            ─── Original ─── Em ${originalDate}, ${originalFrom} escreveu:
          </p>
          ${quote}
        </div>
      `;
    }
  }, [composerOpen, composerMode, composerReplyTo, selectedAccountId, accounts]);

  // ── Autosave ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!composerOpen) {
      if (autosaveRef.current) clearInterval(autosaveRef.current);
      return;
    }

    autosaveRef.current = setInterval(() => {
      handleSaveDraft(true);
    }, 30000);

    return () => {
      if (autosaveRef.current) clearInterval(autosaveRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composerOpen, to, cc, bcc, subject, draftId]);

  // ── Editor commands ───────────────────────────────────────────────────────
  const execCmd = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
  };

  const insertLink = () => {
    if (linkUrl) {
      execCmd('createLink', linkUrl);
      setLinkUrl('');
      setLinkDialogOpen(false);
    }
  };

  // ── Send ─────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!selectedAccountId || to.length === 0) {
      setError('Adicione pelo menos um destinatário.');
      return;
    }
    const bodyHtml = editorRef.current?.innerHTML || '';
    if (!subject.trim() && !bodyHtml.trim()) {
      setError('Assunto e corpo do e-mail estão vazios.');
      return;
    }

    setSending(true);
    setError(null);
    try {
      await EmailService.sendEmail({
        accountId: selectedAccountId,
        to,
        cc: cc.length > 0 ? cc : undefined,
        bcc: bcc.length > 0 ? bcc : undefined,
        subject,
        bodyHtml,
        replyToMessageId: composerReplyTo?.id,
        threadId: composerReplyTo?.threadId,
      });
      setSuccess(true);
      setTimeout(() => {
        closeComposer();
        setSuccess(false);
      }, 800);
    } catch {
      setError('Falha ao enviar e-mail. Tente novamente.');
    } finally {
      setSending(false);
    }
  };

  // ── Save Draft ────────────────────────────────────────────────────────────
  const handleSaveDraft = async (silent = false) => {
    if (!selectedAccountId) return;
    const bodyHtml = editorRef.current?.innerHTML || '';
    if (!bodyHtml.trim() && !subject.trim() && to.length === 0) return;

    if (!silent) setSavingDraft(true);
    try {
      const result = await EmailService.saveDraft({
        accountId: selectedAccountId,
        draftId: draftId ?? undefined,
        to,
        cc,
        bcc,
        subject,
        bodyHtml,
      });
      if (result.draftId) setDraftId(result.draftId);
    } catch {
      // non-critical
    } finally {
      if (!silent) setSavingDraft(false);
    }
  };

  // ── Attachments ───────────────────────────────────────────────────────────
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setAttachments(prev => [...prev, ...files]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (!composerOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={e => { if (e.target === e.currentTarget) closeComposer(); }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="w-[80vw] h-[85vh] max-w-4xl bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-white/8 bg-[#161616] shrink-0">
            <h2 className="text-white/80 text-sm font-semibold">
              {composerMode === 'new'
                ? 'Nova Mensagem'
                : composerMode === 'reply'
                ? 'Responder'
                : composerMode === 'replyAll'
                ? 'Responder a Todos'
                : 'Encaminhar'}
            </h2>
            <button
              onClick={closeComposer}
              className="p-1.5 rounded-lg text-white/40 hover:text-white/90 hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Fields */}
          <div className="shrink-0">
            <EmailField label="Para" addresses={to} onChange={setTo} />

            {/* CC/BCC toggles */}
            <div className="flex items-center px-4 py-1 border-b border-white/5 gap-3">
              {!showCc && (
                <button
                  type="button"
                  onClick={() => setShowCc(true)}
                  className="text-white/30 text-xs hover:text-white/60 transition-colors"
                >
                  + CC
                </button>
              )}
              {!showBcc && (
                <button
                  type="button"
                  onClick={() => setShowBcc(true)}
                  className="text-white/30 text-xs hover:text-white/60 transition-colors"
                >
                  + CCO
                </button>
              )}
            </div>

            {showCc && (
              <EmailField label="CC" addresses={cc} onChange={setCc} />
            )}
            {showBcc && (
              <EmailField label="CCO" addresses={bcc} onChange={setBcc} />
            )}

            {/* Subject */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5">
              <span className="text-white/40 text-sm shrink-0 w-8">Ass.</span>
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Assunto"
                className="flex-1 bg-transparent text-white/80 text-sm outline-none placeholder:text-white/20"
              />
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-white/5 flex-wrap">
              <ToolbarBtn onClick={() => execCmd('bold')} title="Negrito (Ctrl+B)">
                <Bold className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => execCmd('italic')} title="Itálico (Ctrl+I)">
                <Italic className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => execCmd('underline')} title="Sublinhado (Ctrl+U)">
                <Underline className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <div className="w-px h-4 bg-white/10 mx-1" />
              <ToolbarBtn onClick={() => execCmd('insertUnorderedList')} title="Lista com marcadores">
                <List className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => execCmd('insertOrderedList')} title="Lista numerada">
                <span className="text-xs font-mono">1.</span>
              </ToolbarBtn>
              <div className="w-px h-4 bg-white/10 mx-1" />
              <ToolbarBtn onClick={() => setLinkDialogOpen(true)} title="Inserir link">
                <Link className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <div className="w-px h-4 bg-white/10 mx-1" />
              <ToolbarBtn onClick={() => execCmd('justifyLeft')} title="Alinhar à esquerda">
                <AlignLeft className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => execCmd('justifyCenter')} title="Centralizar">
                <AlignCenter className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => execCmd('justifyRight')} title="Alinhar à direita">
                <AlignRight className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <div className="w-px h-4 bg-white/10 mx-1" />
              <ToolbarBtn onClick={() => execCmd('removeFormat')} title="Remover formatação">
                <Minus className="w-3.5 h-3.5" />
              </ToolbarBtn>
            </div>
          </div>

          {/* Link dialog */}
          <AnimatePresence>
            {linkDialogOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="shrink-0 flex items-center gap-2 px-4 py-2 bg-[#0f0f0f] border-b border-white/10"
              >
                <span className="text-white/50 text-xs">URL:</span>
                <input
                  autoFocus
                  type="url"
                  value={linkUrl}
                  onChange={e => setLinkUrl(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') insertLink();
                    if (e.key === 'Escape') setLinkDialogOpen(false);
                  }}
                  placeholder="https://..."
                  className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-white/80 text-sm outline-none"
                />
                <button
                  type="button"
                  onClick={insertLink}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded transition-colors"
                >
                  OK
                </button>
                <button
                  type="button"
                  onClick={() => setLinkDialogOpen(false)}
                  className="text-white/40 hover:text-white/80 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Editor */}
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            data-placeholder="Escreva sua mensagem..."
            className={cn(
              'flex-1 overflow-y-auto px-5 py-4 text-white/80 text-sm leading-relaxed outline-none min-h-0',
              'empty:before:content-[attr(data-placeholder)] empty:before:text-white/20',
            )}
            style={{ wordBreak: 'break-word' }}
            onKeyDown={e => {
              // Handle keyboard shortcuts
              if (e.ctrlKey || e.metaKey) {
                if (e.key === 'Enter') { e.preventDefault(); handleSend(); }
              }
            }}
          />

          {/* Attachments list */}
          {attachments.length > 0 && (
            <div className="shrink-0 px-4 py-2 border-t border-white/5 flex flex-wrap gap-2">
              {attachments.map((file, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/5 border border-white/8 text-xs text-white/60"
                >
                  <FileText className="w-3 h-3" />
                  <span className="max-w-[160px] truncate">{file.name}</span>
                  <span className="text-white/30">({formatBytes(file.size)})</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(i)}
                    className="text-white/30 hover:text-white/70 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="shrink-0 px-4 py-2 bg-red-900/20 border-t border-red-500/20 text-red-400 text-xs">
              {error}
            </div>
          )}

          {/* Footer */}
          <div className="shrink-0 flex items-center justify-between px-4 py-3 border-t border-white/8 bg-[#161616]">
            <div className="flex items-center gap-2">
              {/* Send button */}
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || success}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                  success
                    ? 'bg-emerald-600 text-white'
                    : 'bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                {sending ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {success ? 'Enviado!' : 'Enviar'}
              </button>

              {/* Save draft */}
              <button
                type="button"
                onClick={() => handleSaveDraft(false)}
                disabled={savingDraft}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-white/50 hover:text-white/80 hover:bg-white/5 transition-all disabled:opacity-50"
              >
                {savingDraft ? (
                  <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                ) : (
                  <FileText className="w-3.5 h-3.5" />
                )}
                Salvar rascunho
              </button>

              {/* Attach file */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-white/50 hover:text-white/80 hover:bg-white/5 transition-all"
              >
                <Paperclip className="w-3.5 h-3.5" />
                Anexar
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            <button
              type="button"
              onClick={closeComposer}
              className="px-3 py-2 rounded-lg text-sm text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
