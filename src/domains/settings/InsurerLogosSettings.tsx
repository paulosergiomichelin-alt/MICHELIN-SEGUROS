import React, { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Upload, Loader2, Trash2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { SEGURADORAS } from '../../lib/seguradoras';
import { StorageService } from '../../services/StorageService';
import { dataApiClient } from '../../lib/dataApiClient';
import { ensureSeguradorasLogosLoaded, getAllSeguradoraLogos, setSeguradoraLogo } from '../../lib/seguradorasLogos';

export const InsurerLogosSettings: React.FC = () => {
  const [logos, setLogos] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    ensureSeguradorasLogosLoaded().then(() => {
      setLogos(getAllSeguradoraLogos());
      setLoading(false);
    });
  }, []);

  const handleUpload = async (id: string, file: File) => {
    setError(null);
    setUploadingId(id);
    try {
      const { url, path } = await StorageService.uploadFile(file, 'branding', `seguradora_${id}.webp`);
      await dataApiClient.update('seguradoras', id, { logoUrl: url, logoPath: path });
      setSeguradoraLogo(id, url);
      setLogos(prev => ({ ...prev, [id]: url }));
    } catch (e: any) {
      setError(e?.message || 'Falha ao enviar o logo. Tente novamente.');
    } finally {
      setUploadingId(null);
    }
  };

  const handleRemove = async (id: string) => {
    setError(null);
    setUploadingId(id);
    try {
      await dataApiClient.update('seguradoras', id, { logoUrl: null, logoPath: null });
      setSeguradoraLogo(id, null);
      setLogos(prev => { const n = { ...prev }; delete n[id]; return n; });
    } catch (e: any) {
      setError(e?.message || 'Falha ao remover o logo.');
    } finally {
      setUploadingId(null);
    }
  };

  if (loading) return <div className="text-slate-400 text-[11px] p-6">Carregando...</div>;

  return (
    <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
      <div className="flex items-center gap-3 border-l-4 border-gold-deep pl-4">
        <ImageIcon className="w-5 h-5 text-gold-deep" />
        <div>
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest">Logos das Seguradoras</h3>
          <p className="text-[10px] text-slate-400 mt-0.5">Envie o logo oficial de cada seguradora. Fica salvo no próprio sistema — usado em todas as telas (Clientes, Apólices, Dashboard).</p>
        </div>
      </div>

      {error && <p className="text-[10px] text-[#C0392B] font-medium">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {SEGURADORAS.map(s => {
          const logo = logos[s.id];
          const isUploading = uploadingId === s.id;
          return (
            <div key={s.id} className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="w-11 h-11 rounded-lg overflow-hidden shrink-0 bg-white flex items-center justify-center border border-slate-200">
                {logo ? (
                  <img src={logo} alt={s.nome} className="w-full h-full object-contain p-1" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-black text-white" style={{ backgroundColor: s.cor }}>
                    {s.nome.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-slate-800 truncate">{s.nome}</p>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    ref={el => { fileInputs.current[s.id] = el; }}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(s.id, f); if (e.target) e.target.value = ''; }}
                  />
                  <button
                    type="button"
                    disabled={isUploading}
                    onClick={() => fileInputs.current[s.id]?.click()}
                    className={cn(
                      'flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-widest transition-colors disabled:opacity-50',
                      'bg-white border border-slate-200 text-slate-600 hover:border-[#1B4D8F]/40 hover:text-[#1B4D8F]',
                    )}
                  >
                    {isUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                    {logo ? 'Trocar' : 'Enviar'}
                  </button>
                  {logo && (
                    <button
                      type="button"
                      disabled={isUploading}
                      onClick={() => handleRemove(s.id)}
                      className="p-1 text-slate-400 hover:text-[#C0392B] transition-colors disabled:opacity-50"
                      title="Remover logo"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
