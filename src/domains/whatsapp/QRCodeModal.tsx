import React, { useState, useEffect, useCallback } from 'react';
import { X, Loader2, CheckCircle2, RefreshCw, Smartphone } from 'lucide-react';
import { WhatsAppSession } from '../../types';
import { EvolutionService } from '../../services/EvolutionService';
import { DataService } from '../../services/DataService';
import { orderBy, limit, where } from 'firebase/firestore';

interface QRCodeModalProps {
  sessionName: string;
  onClose: () => void;
  onConnected: () => void;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({ sessionName, onClose, onConnected }) => {
  const [qrBase64, setQrBase64] = useState<string>('');
  const [loadingQr, setLoadingQr] = useState(true);
  const [status, setStatus] = useState<'qr' | 'connecting' | 'open' | 'error'>('qr');
  const [countdown, setCountdown] = useState(60);

  const fetchQR = useCallback(async () => {
    setLoadingQr(true);
    const data = await EvolutionService.getQRCode(sessionName);
    if (data?.base64) {
      setQrBase64(data.base64);
      setCountdown(60);
    } else {
      setStatus('error');
    }
    setLoadingQr(false);
  }, [sessionName]);

  // Subscribe to session status in Firestore — updates come from the webhook
  useEffect(() => {
    const unsub = DataService.subscribeCollection(
      'whatsapp_sessions',
      [limit(1)],
      (docs: any[]) => {
        const session = docs.find(d => d.sessionName === sessionName || d.id === sessionName) as WhatsAppSession | undefined;
        if (!session) return;

        if (session.qrBase64 && session.status === 'qr') {
          setQrBase64(session.qrBase64);
          setCountdown(60);
          setStatus('qr');
        }
        if (session.status === 'connecting') setStatus('connecting');
        if (session.status === 'open') {
          setStatus('open');
          setTimeout(() => { onConnected(); onClose(); }, 1500);
        }
      },
    );
    return unsub;
  }, [sessionName, onConnected, onClose]);

  // Initial QR fetch
  useEffect(() => { fetchQR(); }, [fetchQR]);

  // Countdown timer — auto-refresh when QR expires
  useEffect(() => {
    if (status !== 'qr') return;
    const id = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { fetchQR(); return 60; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [status, fetchQR]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-brand-black border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <Smartphone className="w-4 h-4 text-emerald-400" />
            <span className="text-[11px] font-black text-white uppercase tracking-widest">Conectar WhatsApp</span>
          </div>
          <button onClick={onClose} className="p-1.5 text-white/30 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 flex flex-col items-center gap-5">
          {status === 'open' ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <CheckCircle2 className="w-16 h-16 text-emerald-400" />
              <p className="text-[13px] font-bold text-emerald-400">WhatsApp conectado!</p>
            </div>
          ) : status === 'connecting' ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 className="w-12 h-12 text-gold-deep animate-spin" />
              <p className="text-[11px] text-white/60">Autenticando...</p>
            </div>
          ) : status === 'error' ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <p className="text-[11px] text-red-400">Não foi possível gerar o QR Code.</p>
              <button onClick={fetchQR} className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-[10px] font-black uppercase text-white/60 hover:text-white transition-colors">
                <RefreshCw className="w-3.5 h-3.5" /> Tentar novamente
              </button>
            </div>
          ) : (
            <>
              {/* QR Code */}
              <div className="relative w-56 h-56 flex items-center justify-center bg-white rounded-xl overflow-hidden">
                {loadingQr ? (
                  <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
                ) : qrBase64 ? (
                  <img src={qrBase64} alt="QR Code WhatsApp" className="w-full h-full object-contain" />
                ) : (
                  <p className="text-[10px] text-gray-400 text-center px-4">QR Code não disponível</p>
                )}
                {/* Countdown overlay */}
                {!loadingQr && countdown <= 10 && (
                  <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                    <span className="text-2xl font-black text-red-500">{countdown}s</span>
                  </div>
                )}
              </div>

              {/* Instructions */}
              <div className="space-y-2 text-center">
                <p className="text-[11px] text-white/70">
                  Abra o WhatsApp no celular e escaneie o QR Code
                </p>
                <div className="text-[9px] text-white/30 space-y-0.5">
                  <p>WhatsApp → Menu (⋮) → Dispositivos conectados → Conectar dispositivo</p>
                </div>
              </div>

              {/* Timer */}
              <div className="flex items-center gap-2">
                <div className="h-1 w-32 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 rounded-full transition-all duration-1000"
                    style={{ width: `${(countdown / 60) * 100}%` }}
                  />
                </div>
                <span className="text-[9px] text-white/30 tabular-nums">{countdown}s</span>
              </div>

              <button
                onClick={fetchQR}
                disabled={loadingQr}
                className="flex items-center gap-1.5 text-[9px] text-white/30 hover:text-white/60 transition-colors disabled:opacity-40"
              >
                <RefreshCw className="w-3 h-3" /> Atualizar QR
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
