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
      const timer = setTimeout(() => {
        fetchDoc();
      }, 0);
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
    a.download = `michelin_crm_documentation_${new Date().toISOString().split('T')[0]}.txt`;
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
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={(e) => (e.target as HTMLElement).id === 'doc-modal-overlay' && onClose()}
        >
          <motion.div
            id="doc-modal-container"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden border border-gray-100"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                  <BookOpen size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 leading-tight">Documentação Técnica</h2>
                  <p className="text-xs text-gray-500 font-medium tracking-wide uppercase">Visão Geral e Arquitetura do Sistema</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500"
                id="doc-modal-close"
              >
                <X size={20} />
              </button>
            </div>

            {/* Toolbar */}
            <div className="px-6 py-3 border-b border-gray-100 flex flex-wrap items-center gap-3 bg-white">
              <button
                onClick={handleCopy}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  copied ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                id="doc-copy-btn"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Copiado!' : 'Copiar Tudo'}
              </button>

              <button
                onClick={handleDownload}
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-all"
                id="doc-download-btn"
              >
                <Download size={16} />
                Baixar .txt
              </button>

              <div className="flex-1" />

              <button
                onClick={fetchDoc}
                disabled={loading}
                className="flex items-center gap-2 px-3 py-1.5 text-blue-600 hover:bg-blue-50 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                id="doc-refresh-btn"
              >
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                Atualizar
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-8 bg-gray-50/30">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-full gap-4 py-20">
                  <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-gray-500 font-medium animate-pulse">Gerando documentação técnica...</p>
                </div>
              ) : (
                <div className="max-w-4xl mx-auto bg-white p-10 rounded-xl border border-gray-100 shadow-sm transition-all hover:shadow-md">
                  <div id="doc-markdown-content" className="prose prose-blue prose-sm max-w-none text-gray-700">
                    <ReactMarkdown>{doc}</ReactMarkdown>
                  </div>
                  
                  {/* Footer Info */}
                  <div className="mt-12 pt-6 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400 font-mono tracking-tighter">
                    <div className="flex items-center gap-1">
                      <FileText size={10} />
                      SYSTEM_MANIFEST_VERIFIED
                    </div>
                    <div>
                      GENERATED_AT: {new Date().toISOString()}
                    </div>
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
