import React, { useState, useEffect, useCallback } from 'react';
import { Download, Printer, MessageCircle, Mail, X, FileText, Loader2 } from 'lucide-react';
import type { NfseDocument, Empresa } from '../../../types';
import { getDanfseBlob } from './DanfseGenerator';
import { formatCurrency } from '../utils/nfse-utils';

interface DanfsePreviewProps {
  nfse: NfseDocument;
  empresa: Empresa;
  onClose?: () => void;
}

export function DanfsePreview({ nfse, empresa, onClose }: DanfsePreviewProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  const buildData = useCallback(() => ({
    empresa: {
      razaoSocial:       empresa.nomeRazaoSocial,
      nomeFantasia:      empresa.nomeFantasia,
      cnpj:              empresa.cnpj,
      inscricaoMunicipal: empresa.fiscalSettings?.inscricaoMunicipal,
      endereco: empresa.fiscalSettings?.enderecoFiscal
        ? `${empresa.fiscalSettings.enderecoFiscal.logradouro}, ${empresa.fiscalSettings.enderecoFiscal.numero} — ${empresa.fiscalSettings.enderecoFiscal.cidade}/${empresa.fiscalSettings.enderecoFiscal.estado}`
        : undefined,
      telefone:  empresa.telefone,
      email:     empresa.emailCorporativo,
      logoUrl:   empresa.logoUrl,
    },
    nota: nfse,
  }), [nfse, empresa]);

  useEffect(() => {
    let url: string;
    setLoading(true);
    setError(null);

    getDanfseBlob(buildData())
      .then(blob => {
        url = URL.createObjectURL(blob);
        setBlobUrl(url);
      })
      .catch(e => setError(e?.message ?? 'Erro ao gerar DANF-Se'))
      .finally(() => setLoading(false));

    return () => { if (url) URL.revokeObjectURL(url); };
  }, [buildData]);

  const handleDownload = async () => {
    const { downloadDanfse } = await import('./DanfseGenerator');
    await downloadDanfse(buildData());
  };

  const handlePrint = () => {
    if (blobUrl) {
      const iframe = document.querySelector<HTMLIFrameElement>('#danfse-iframe');
      iframe?.contentWindow?.print();
    }
  };

  const handleWhatsApp = async () => {
    const blob = await getDanfseBlob(buildData());
    const file = new File([blob], `NFS-e_${nfse.numeroNota ?? nfse.id}.pdf`, { type: 'application/pdf' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: `NFS-e ${nfse.numeroNota}`, text: `Segue a NFS-e ${nfse.numeroNota} — ${formatCurrency(nfse.valorServico)}` });
    } else {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = file.name;
      link.click();
    }
  };

  const handleEmail = () => {
    const subject = encodeURIComponent(`NFS-e ${nfse.numeroNota ?? ''} — ${empresa.nomeRazaoSocial}`);
    const body = encodeURIComponent(`Prezado(a) ${nfse.clienteNome},\n\nSegue em anexo a Nota Fiscal de Serviços Eletrônica n° ${nfse.numeroNota ?? ''} no valor de ${formatCurrency(nfse.valorServico)}.\n\nAtenciosamente,\n${empresa.nomeRazaoSocial}`);
    window.open(`mailto:${nfse.clienteEmail ?? ''}?subject=${subject}&body=${body}`);
  };

  return (
    <div className="flex flex-col h-full bg-[#050505]">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] bg-[#0E0F11] shrink-0">
        <div className="flex items-center gap-2 flex-1">
          <div className="w-7 h-7 rounded-lg bg-[#D4A854]/[0.08] border border-[#D4A854]/15 flex items-center justify-center">
            <FileText className="w-3.5 h-3.5 text-[#D4A854]" />
          </div>
          <div>
            <p className="text-[12px] font-black text-white">
              NFS-e {nfse.numeroNota ?? 'Rascunho'}
            </p>
            <p className="text-[10px] text-[#8E8E93]/50">{nfse.clienteNome} · {formatCurrency(nfse.valorServico)}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button onClick={handleDownload} title="Download PDF"
            className="h-8 px-3 rounded-lg border border-white/[0.08] bg-white/[0.03] text-[10px] font-semibold text-[#8E8E93]/80 hover:border-[#D4A854]/30 hover:text-[#D4A854] transition-all flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Download</span>
          </button>
          <button onClick={handlePrint} title="Imprimir"
            className="h-8 px-3 rounded-lg border border-white/[0.08] bg-white/[0.03] text-[10px] font-semibold text-[#8E8E93]/80 hover:border-blue-400/30 hover:text-blue-400 transition-all flex items-center gap-1.5">
            <Printer className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Imprimir</span>
          </button>
          <button onClick={handleWhatsApp} title="Compartilhar via WhatsApp"
            className="h-8 px-3 rounded-lg border border-green-500/20 bg-green-500/[0.04] text-[10px] font-semibold text-green-400/70 hover:border-green-500/40 hover:text-green-400 transition-all flex items-center gap-1.5">
            <MessageCircle className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">WhatsApp</span>
          </button>
          <button onClick={handleEmail} title="Enviar por e-mail"
            className="h-8 px-3 rounded-lg border border-blue-500/20 bg-blue-500/[0.04] text-[10px] font-semibold text-blue-400/70 hover:border-blue-500/40 hover:text-blue-400 transition-all flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">E-mail</span>
          </button>
          {onClose && (
            <button onClick={onClose}
              className="h-8 w-8 rounded-lg border border-white/[0.08] bg-white/[0.03] flex items-center justify-center text-[#8E8E93]/60 hover:text-white hover:bg-white/[0.06] transition-all">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Preview */}
      <div className="flex-1 overflow-hidden bg-[#111]">
        {loading && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Loader2 className="w-6 h-6 text-[#D4A854] animate-spin" />
            <p className="text-[12px] text-[#8E8E93]/60">Gerando DANF-Se...</p>
          </div>
        )}
        {error && !loading && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <FileText className="w-8 h-8 text-red-400/40" />
            <p className="text-[12px] text-red-400">{error}</p>
          </div>
        )}
        {blobUrl && !loading && !error && (
          <iframe
            id="danfse-iframe"
            src={blobUrl}
            className="w-full h-full border-0"
            title="DANF-Se Preview"
          />
        )}
      </div>
    </div>
  );
}
