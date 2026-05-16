import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Copy,
  Download,
  RefreshCw,
  Check,
  BookOpen,
  FileText
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { DocumentationService } from '../../services/DocumentationService';

interface SystemDocumentationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SystemDocumentationModal: React.FC<SystemDocumentationModalProps> = ({
  isOpen,
  onClose
}) => {
  const [doc, setDoc] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchDoc = async () => {
    setLoading(true);
    try {
      const content = await DocumentationService.generateDocumentation();
      setDoc(content);
    } catch (error) {
      console.error('Erro ao gerar documentação:', error);
      setDoc('# Erro ao gerar documentação\n\nNão foi possível carregar as informações do sistema.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => { fetchDoc(); }, 0);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleCopy = () => {
    navigator.clipboard.writeText(doc);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([doc], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `michelin_doc_${new Date().toISOString().split('T')[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          id="doc-modal-overlay"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={(e) => (e.target as HTMLElement).id === 'doc-modal-overlay' && onClose()}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            className="bg-[#0B0B0D] border border-white/5 rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gold-deep/10 rounded-xl border border-gold-deep/20">
                  <BookOpen className="w-5 h-5 text-gold-deep" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-white uppercase tracking-widest">Documentação do Sistema</h2>
                  <p className="text-[9px] text-white/30 font-bold uppercase tracking-[0.2em]">Arquitetura · Pipeline de Vendas · Auditoria</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/5 rounded-xl transition-colors text-white/40 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Toolbar */}
            <div className="px-6 py-3 border-b border-white/5 flex items-center gap-2 flex-shrink-0">
              <button
                onClick={handleCopy}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  copied
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-white/5 text-white/50 hover:text-white hover:bg-white/10 border border-white/5'
                }`}
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copiado!' : 'Copiar'}
              </button>

              <button
                onClick={handleDownload}
                className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white/50 hover:text-white border border-white/5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                Baixar .md
              </button>

              <div className="flex-1" />

              <button
                onClick={fetchDoc}
                disabled={loading}
                className="flex items-center gap-2 px-3 py-1.5 bg-gold-deep/10 hover:bg-gold-deep/20 text-gold-deep border border-gold-deep/20 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                Atualizar
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-full gap-4 py-20">
                  <div className="w-10 h-10 border-2 border-gold-deep/30 border-t-gold-deep rounded-full animate-spin" />
                  <p className="text-white/30 text-xs font-bold uppercase tracking-widest animate-pulse">Gerando documentação...</p>
                </div>
              ) : (
                <div className="bg-[#050505] rounded-2xl border border-white/5 p-8">
                  <div className="prose prose-invert prose-sm max-w-none
                    prose-headings:text-white prose-headings:font-black prose-headings:uppercase prose-headings:tracking-widest
                    prose-h1:text-base prose-h1:text-gold-deep prose-h1:border-b prose-h1:border-gold-deep/20 prose-h1:pb-3 prose-h1:mb-6
                    prose-h2:text-[11px] prose-h2:text-gold-deep/80 prose-h2:mt-8 prose-h2:mb-3
                    prose-h3:text-[10px] prose-h3:text-white/60 prose-h3:mt-5 prose-h3:mb-2
                    prose-p:text-white/60 prose-p:text-xs prose-p:leading-relaxed
                    prose-li:text-white/60 prose-li:text-xs
                    prose-strong:text-white prose-strong:font-black
                    prose-code:text-gold-deep/80 prose-code:bg-gold-deep/5 prose-code:rounded prose-code:px-1 prose-code:text-[10px]
                    prose-pre:bg-[#0B0B0D] prose-pre:border prose-pre:border-white/5 prose-pre:rounded-xl prose-pre:text-[10px] prose-pre:leading-relaxed
                    prose-table:text-xs prose-table:border-collapse
                    prose-th:text-[9px] prose-th:font-black prose-th:uppercase prose-th:tracking-widest prose-th:text-white/40 prose-th:border prose-th:border-white/5 prose-th:px-3 prose-th:py-2 prose-th:bg-white/5
                    prose-td:text-white/60 prose-td:border prose-td:border-white/5 prose-td:px-3 prose-td:py-2
                    prose-blockquote:border-l-gold-deep prose-blockquote:text-white/50 prose-blockquote:bg-gold-deep/5 prose-blockquote:rounded-r-xl prose-blockquote:px-4 prose-blockquote:py-2
                    prose-hr:border-white/5
                    prose-a:text-gold-deep
                  ">
                    <ReactMarkdown>{doc}</ReactMarkdown>
                  </div>

                  <div className="mt-10 pt-4 border-t border-white/5 flex items-center justify-between text-[9px] text-white/20 font-mono">
                    <div className="flex items-center gap-1.5">
                      <FileText className="w-3 h-3" />
                      SYSTEM_MANIFEST_VERIFIED
                    </div>
                    <div>GENERATED_AT: {new Date().toISOString()}</div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
