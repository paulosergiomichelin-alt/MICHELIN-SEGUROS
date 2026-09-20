import React, { useEffect, useRef, useState } from 'react';
import { Bold, Italic, Underline, Image as ImageIcon, Link as LinkIcon, Loader2 } from 'lucide-react';
import { cn } from '../../../../lib/utils';
import { StorageService } from '../../../../services/StorageService';

interface SignatureEditorProps {
  value: string;
  onChange: (html: string) => void;
}

const ToolbarButton: React.FC<{ title: string; onClick: () => void; children: React.ReactNode; disabled?: boolean }> = ({ title, onClick, children, disabled }) => (
  <button
    type="button"
    title={title}
    disabled={disabled}
    // onMouseDown (não onClick) + preventDefault: evita que o contentEditable perca a
    // seleção de texto antes do execCommand rodar — clicar em "Negrito" com uma palavra
    // selecionada só funciona se o foco/seleção não mudar no meio do caminho.
    onMouseDown={e => { e.preventDefault(); onClick(); }}
    className="p-1.5 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:pointer-events-none"
  >
    {children}
  </button>
);

export const SignatureEditor: React.FC<SignatureEditorProps> = ({ value, onChange }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  // Só reescreve o innerHTML quando `value` muda "por fora" (troca de conta,
  // carregamento inicial) — depois de uma edição local, onInput já ecoou pro pai
  // exatamente esse mesmo HTML, então a checagem abaixo bate igual e pula a
  // reescrita, evitando que o cursor pule pro início a cada tecla digitada
  // (contentEditable não é um input controlado de verdade).
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== (value || '')) {
      editorRef.current.innerHTML = value || '';
    }
  }, [value]);

  const handleInput = () => onChange(editorRef.current?.innerHTML ?? '');

  const exec = (cmd: string, arg?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, arg);
    handleInput();
  };

  const handleImageButtonClick = () => fileInputRef.current?.click();

  const handleImageSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      const { url } = await StorageService.uploadFile(file, 'branding', `assinatura_${Date.now()}_${file.name}`);
      exec('insertImage', url);
    } catch (err: any) {
      setError(err.message || 'Falha ao enviar imagem.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleInsertLink = () => {
    const url = window.prompt('URL do link:');
    if (url) exec('createLink', url);
  };

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden focus-within:border-[#1B4D8F]/60 focus-within:ring-2 focus-within:ring-[#1B4D8F]/15 transition-all">
      <div className="flex items-center gap-0.5 px-1.5 py-1.5 border-b border-slate-100 bg-slate-50">
        <ToolbarButton title="Negrito" onClick={() => exec('bold')}><Bold className="w-3.5 h-3.5" /></ToolbarButton>
        <ToolbarButton title="Itálico" onClick={() => exec('italic')}><Italic className="w-3.5 h-3.5" /></ToolbarButton>
        <ToolbarButton title="Sublinhado" onClick={() => exec('underline')}><Underline className="w-3.5 h-3.5" /></ToolbarButton>
        <div className="w-px h-4 bg-slate-200 mx-1" />
        <ToolbarButton title="Inserir link" onClick={handleInsertLink}><LinkIcon className="w-3.5 h-3.5" /></ToolbarButton>
        <ToolbarButton title="Inserir imagem" onClick={handleImageButtonClick} disabled={uploading}>
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
        </ToolbarButton>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelected} />
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        data-placeholder="Digite sua assinatura aqui..."
        className={cn(
          'min-h-[160px] max-h-[360px] overflow-y-auto p-3 text-slate-700 text-sm leading-relaxed outline-none',
          'empty:before:content-[attr(data-placeholder)] empty:before:text-slate-300',
          '[&_img]:max-w-full',
        )}
        style={{ wordBreak: 'break-word' }}
      />
      {error && <p className="text-[11px] text-[#C0392B] px-3 pb-2">{error}</p>}
    </div>
  );
};
