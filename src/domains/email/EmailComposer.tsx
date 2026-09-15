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
import { EmailService, CachedEmail, EmailAddress, fileToAttachmentPayload } from '../../services/EmailService';
import { Button } from '../../components/ui';

// ─── Email Chip ───────────────────────────────────────────────────────────────

const EmailChip: React.FC<{ address: EmailAddress; onRemove: () => void }> = ({ address, onRemove }) => (
  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#1B4D8F]/8 text-[#1B4D8F] text-xs border border-[#1B4D8F]/20">
    {address.name ? `${address.name} <${address.email}>` : address.email}
    <button
      onClick={onRemove}
      className="hover:text-slate-900 transition-colors ml-0.5"
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
    <div className="flex items-start gap-2 px-4 py-2 border-b border-slate-100 min-h-[40px]">
      <span className="text-slate-500 text-sm shrink-0 mt-1 w-8">{label}</span>
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
          className="flex-1 min-w-[120px] bg-transparent text-slate-800 text-sm outline-none placeholder:text-slate-300"
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
        ? 'bg-[#1B4D8F]/10 text-[#1B4D8F]'
        : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100',
    )}
  >
    {children}
  </button>
);

// ─── EmailComposer ────────────────────────────────────────────────────────────

export const EmailComposer: React.FC = () => {
  const { state, closeComposer } = useEmail();
  const { composerOpen, composerMode, composerReplyTo, selectedAccountId, accounts, settings } = state;

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

    const sig = settings?.signature?.trim() ?? '';
    const sigHtml = sig
      ? `<div style="border-top:1px solid #e2e8f0;margin-top:12px;padding-top:10px;color:#64748b;font-size:13px;">${sig}</div>`
      : '';

    if (composerMode === 'new') {
      setTo([]);
      setCc([]);
      setBcc([]);
      setSubject('');
      setShowCc(false);
      setShowBcc(false);
      setAttachments([]);
      setDraftId(null);
      if (editorRef.current) {
        editorRef.current.innerHTML = sigHtml ? `<p><br></p>${sigHtml}` : '';
        // Move cursor to the top
        const range = document.createRange();
        const sel = window.getSelection();
        range.setStart(editorRef.current, 0);
        range.collapse(true);
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
      return;
    }

    const msg = composerReplyTo;
    if (!msg) return;

    if (composerMode === 'reply') {
      setTo([msg.from ?? { email: '' }]);
      setSubject(msg.subject.startsWith('Re:') ? msg.subject : `Re: ${msg.subject}`);
    } else if (composerMode === 'replyAll') {
      const myEmail = accounts.find(ac => ac.id === selectedAccountId)?.email;
      const seen = new Set<string>();
      const replyAllTo = [msg.from ?? { email: '' }, ...(msg.to ?? []), ...(msg.cc ?? [])]
        .filter(a => a.email && a.email !== myEmail)
        .filter(a => (seen.has(a.email) ? false : (seen.add(a.email), true)));
      setTo(replyAllTo);
      setSubject(msg.subject.startsWith('Re:') ? msg.subject : `Re: ${msg.subject}`);
    } else if (composerMode === 'forward') {
      setTo([]);
      setSubject(msg.subject.startsWith('Fwd:') ? msg.subject : `Fwd: ${msg.subject}`);
    }

    // Insert quoted content with signature above
    if (editorRef.current && (composerMode === 'reply' || composerMode === 'replyAll' || composerMode === 'forward')) {
      const originalFrom = msg.from?.name
        ? `${msg.from.name} &lt;${msg.from.email}&gt;`
        : (msg.from?.email ?? '');
      const originalDate = new Date(msg.date).toLocaleString('pt-BR');
      const quote = msg.bodyHtml || `<p>${msg.snippet}</p>`;
      editorRef.current.innerHTML = `
        <p><br></p>
        ${sigHtml}
        <div style="border-left: 2px solid #1B4D8F; padding-left: 12px; margin-left: 4px; color: #64748b; margin-top: 12px;">
          <p style="font-size: 12px; margin-bottom: 4px;">
            ─── Original ─── Em ${originalDate}, ${originalFrom} escreveu:
          </p>
          ${quote}
        </div>
      `;
    }
  }, [composerOpen, composerMode, composerReplyTo, selectedAccountId, accounts, settings?.signature]);

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
      const attachmentPayloads = attachments.length > 0
        ? await Promise.all(attachments.map(fileToAttachmentPayload))
        : undefined;
      await EmailService.sendEmail({
        accountId: selectedAccountId,
        to,
        cc: cc.length > 0 ? cc : undefined,
        bcc: bcc.length > 0 ? bcc : undefined,
        subject,
        bodyHtml,
        attachments: attachmentPayloads,
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
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      className="flex flex-col h-full w-full bg-white border-l border-slate-200 overflow-hidden"
    >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 shrink-0">
            <h2 className="text-slate-800 text-sm font-semibold">
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
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Fields */}
          <div className="shrink-0">
            <EmailField label="Para" addresses={to} onChange={setTo} />

            {/* CC/BCC toggles */}
            <div className="flex items-center px-4 py-1 border-b border-slate-100 gap-3">
              {!showCc && (
                <button
                  type="button"
                  onClick={() => setShowCc(true)}
                  className="text-slate-400 text-xs hover:text-slate-700 transition-colors"
                >
                  + CC
                </button>
              )}
              {!showBcc && (
                <button
                  type="button"
                  onClick={() => setShowBcc(true)}
                  className="text-slate-400 text-xs hover:text-slate-700 transition-colors"
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
            <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-100">
              <span className="text-slate-500 text-sm shrink-0 w-8">Ass.</span>
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Assunto"
                className="flex-1 bg-transparent text-slate-800 text-sm outline-none placeholder:text-slate-300"
              />
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-slate-100 flex-wrap">
              <ToolbarBtn onClick={() => execCmd('bold')} title="Negrito (Ctrl+B)">
                <Bold className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => execCmd('italic')} title="Itálico (Ctrl+I)">
                <Italic className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => execCmd('underline')} title="Sublinhado (Ctrl+U)">
                <Underline className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <div className="w-px h-4 bg-slate-200 mx-1" />
              <ToolbarBtn onClick={() => execCmd('insertUnorderedList')} title="Lista com marcadores">
                <List className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => execCmd('insertOrderedList')} title="Lista numerada">
                <span className="text-xs font-mono">1.</span>
              </ToolbarBtn>
              <div className="w-px h-4 bg-slate-200 mx-1" />
              <ToolbarBtn onClick={() => setLinkDialogOpen(true)} title="Inserir link">
                <Link className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <div className="w-px h-4 bg-slate-200 mx-1" />
              <ToolbarBtn onClick={() => execCmd('justifyLeft')} title="Alinhar à esquerda">
                <AlignLeft className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => execCmd('justifyCenter')} title="Centralizar">
                <AlignCenter className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => execCmd('justifyRight')} title="Alinhar à direita">
                <AlignRight className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <div className="w-px h-4 bg-slate-200 mx-1" />
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
                className="shrink-0 flex items-center gap-2 px-4 py-2 bg-slate-50 border-b border-slate-200"
              >
                <span className="text-slate-500 text-xs">URL:</span>
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
                  className="flex-1 bg-white border border-slate-200 rounded px-2 py-1 text-slate-800 text-sm outline-none focus:border-[#1B4D8F]/50"
                />
                <button
                  type="button"
                  onClick={insertLink}
                  className="px-3 py-1 bg-[#1B4D8F] hover:bg-[#153E73] text-white text-xs rounded transition-colors"
                >
                  OK
                </button>
                <button
                  type="button"
                  onClick={() => setLinkDialogOpen(false)}
                  className="text-slate-400 hover:text-slate-700 transition-colors"
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
              'flex-1 overflow-y-auto px-5 py-4 text-slate-800 text-sm leading-relaxed outline-none min-h-0',
              'empty:before:content-[attr(data-placeholder)] empty:before:text-slate-300',
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
            <div className="shrink-0 px-4 py-2 border-t border-slate-100 flex flex-wrap gap-2">
              {attachments.map((file, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600"
                >
                  <FileText className="w-3 h-3" />
                  <span className="max-w-[160px] truncate">{file.name}</span>
                  <span className="text-slate-400">({formatBytes(file.size)})</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(i)}
                    className="text-slate-400 hover:text-slate-700 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="shrink-0 px-4 py-2 bg-[#FDE4E4] border-t border-[#C0392B]/20 text-[#C0392B] text-xs">
              {error}
            </div>
          )}

          {/* Footer */}
          <div className="shrink-0 flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
            <div className="flex items-center gap-2">
              {/* Send button */}
              <Button
                type="button"
                variant="primary"
                size="sm"
                icon={Send}
                loading={sending}
                disabled={success}
                onClick={handleSend}
                className={success ? 'bg-[#1F8A4C] hover:bg-[#1F8A4C]' : undefined}
              >
                {success ? 'Enviado!' : 'Enviar'}
              </Button>

              {/* Save draft */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={FileText}
                loading={savingDraft}
                onClick={() => handleSaveDraft(false)}
              >
                Salvar rascunho
              </Button>

              {/* Attach file */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={Paperclip}
                onClick={() => fileInputRef.current?.click()}
              >
                Anexar
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            <Button type="button" variant="ghost" size="sm" onClick={closeComposer}>
              Descartar
            </Button>
          </div>
    </motion.div>
  );
};
