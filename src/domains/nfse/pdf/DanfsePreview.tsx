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
    <div className="flex flex-col h-full bg-slate-50">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 bg-white shrink-0">
        <div className="flex items-center gap-2 flex-1">
          <div className="w-7 h-7 rounded-lg bg-gold-deep/10 border border-gold-deep/25 flex items-center justify-center">
            <FileText className="w-3.5 h-3.5 text-gold-deep" />
          </div>
          <div>
            <p className="text-[12px] font-black text-slate-900">
              NFS-e {nfse.numeroNota ?? 'Rascunho'}
            </p>
            <p className="text-[10px] text-slate-500">{nfse.clienteNome} · {formatCurrency(nfse.valorServico)}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button onClick={handleDownload} title="Download PDF"
            className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-[10px] font-semibold text-slate-600 hover:border-gold-deep/40 hover:text-gold-deep transition-all flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Download</span>
          </button>
          <button onClick={handlePrint} title="Imprimir"
            className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-[10px] font-semibold text-slate-600 hover:border-[#1B4D8F]/40 hover:text-[#1B4D8F] transition-all flex items-center gap-1.5">
            <Printer className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Imprimir</span>
          </button>
          <button onClick={handleWhatsApp} title="Compartilhar via WhatsApp"
            className="h-8 px-3 rounded-lg border border-[#1F8A4C]/20 bg-[#E4F5EA] text-[10px] font-semibold text-[#1F8A4C] hover:border-[#1F8A4C]/40 transition-all flex items-center gap-1.5">
            <MessageCircle className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">WhatsApp</span>
          </button>
          <button onClick={handleEmail} title="Enviar por e-mail"
            className="h-8 px-3 rounded-lg border border-[#1B4D8F]/20 bg-[#EAF1F9] text-[10px] font-semibold text-[#1B4D8F] hover:border-[#1B4D8F]/40 transition-all flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">E-mail</span>
          </button>
          {onClose && (
            <button onClick={onClose}
              className="h-8 w-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Preview — conteúdo do documento (PDF) permanece inalterado */}
      <div className="flex-1 overflow-hidden bg-slate-200">
        {loading && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Loader2 className="w-6 h-6 text-gold-deep animate-spin" />
            <p className="text-[12px] text-slate-500">Gerando DANF-Se...</p>
          </div>
        )}
        {error && !loading && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <FileText className="w-8 h-8 text-[#C0392B]/40" />
            <p className="text-[12px] text-[#C0392B]">{error}</p>
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
