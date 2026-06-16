import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Loader2, CheckCircle2, RefreshCw, Smartphone, Clock, AlertTriangle } from 'lucide-react';
import { EvolutionService } from '../../services/EvolutionService';
import { useWhatsApp } from '../../contexts/WhatsAppContext';

interface QRCodeModalProps {
  sessionName: string;
  onClose: () => void;
  onConnected: () => void;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({ sessionName, onClose, onConnected }) => {
  const { sessions } = useWhatsApp();
  const session = sessions.find(s => s.sessionName === sessionName || s.id === sessionName);

  const [qrBase64, setQrBase64] = useState<string>(session?.qrBase64 ?? '');
  const [fetchingQr, setFetchingQr] = useState(false);
  const [serviceError, setServiceError] = useState(false);
  const [status, setStatus] = useState<'qr' | 'connecting' | 'open'>('qr');
  const [countdown, setCountdown] = useState(60);
  const connectedRef = useRef(false);
  const failCountRef = useRef(0);

  // Track session changes from WhatsApp context (real-time via Firestore ← webhook)
  useEffect(() => {
    if (!session) return;

    if (session.qrBase64 && session.status === 'qr') {
      setQrBase64(session.qrBase64);
      setCountdown(60);
      setStatus('qr');
      setServiceError(false);
      failCountRef.current = 0;
    }
    if (session.status === 'connecting') setStatus('connecting');
    if (session.status === 'open' && !connectedRef.current) {
      connectedRef.current = true;
      setStatus('open');
      setTimeout(() => { onConnected(); onClose(); }, 1500);
    }
  }, [session?.status, session?.qrBase64]);

  // Manual QR fetch (backup when webhook doesn't arrive)
  const fetchQR = useCallback(async () => {
    if (fetchingQr) return;
    setFetchingQr(true);
    const data = await EvolutionService.getQRCode(sessionName) as any;
    if (data?.status === 'open' && !connectedRef.current) {
      connectedRef.current = true;
      setStatus('open');
      setTimeout(() => { onConnected(); onClose(); }, 1500);
    } else if (data?.base64) {
      setQrBase64(data.base64);
      setCountdown(60);
      setServiceError(false);
      failCountRef.current = 0;
    } else {
      failCountRef.current += 1;
      // After 3 consecutive failures show service error hint
      if (failCountRef.current >= 3) setServiceError(true);
    }
    setFetchingQr(false);
  }, [sessionName, fetchingQr, onConnected, onClose]);

  // Poll connection state every 5s once QR is visible (covers no-webhook dev environments)
  useEffect(() => {
    if (!qrBase64 || status !== 'qr') return;
    const id = setInterval(async () => {
      if (connectedRef.current) return;
      const data = await EvolutionService.getQRCode(sessionName) as any;
      if (data?.status === 'open' && !connectedRef.current) {
        connectedRef.current = true;
        setStatus('open');
        setTimeout(() => { onConnected(); onClose(); }, 1500);
      }
    }, 5000);
    return () => clearInterval(id);
  }, [qrBase64, status, sessionName, onConnected, onClose]);

  // Auto-fetch on open + poll every 15s while no QR (slower — avoids hammering)
  useEffect(() => {
    if (status === 'open') return;
    fetchQR();
    const id = setInterval(() => {
      if (!qrBase64) fetchQR();
    }, 15000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Countdown — auto-refresh when QR expires
  useEffect(() => {
    if (status !== 'qr' || !qrBase64) return;
    const id = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { fetchQR(); return 60; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [status, qrBase64, fetchQR]);

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
          ) : (
            <>
              {/* QR Code area */}
              <div className="relative w-56 h-56 flex items-center justify-center bg-white rounded-xl overflow-hidden">
                {fetchingQr ? (
                  <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
                ) : qrBase64 ? (
                  <img src={qrBase64} alt="QR Code WhatsApp" className="w-full h-full object-contain" />
                ) : serviceError ? (
                  <div className="flex flex-col items-center gap-2 px-4 text-center">
                    <AlertTriangle className="w-6 h-6 text-amber-400" />
                    <p className="text-[10px] text-amber-600 font-semibold">Serviço indisponível</p>
                    <p className="text-[9px] text-gray-500">Evolution API não está gerando QR.<br/>Reinicie o serviço e tente novamente.</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 px-4 text-center">
                    <Clock className="w-6 h-6 text-gray-300 animate-pulse" />
                    <p className="text-[10px] text-gray-500 font-semibold">Aguardando QR Code...</p>
                    <p className="text-[9px] text-gray-400">Buscando via API e webhook</p>
                  </div>
                )}
                {/* Countdown overlay when near expiry */}
                {qrBase64 && !fetchingQr && countdown <= 10 && (
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

              {/* Timer — only when QR is visible */}
              {qrBase64 && (
                <div className="flex items-center gap-2">
                  <div className="h-1 w-32 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-400 rounded-full transition-all duration-1000"
                      style={{ width: `${(countdown / 60) * 100}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-white/30 tabular-nums">{countdown}s</span>
                </div>
              )}

              <button
                onClick={fetchQR}
                disabled={fetchingQr}
                className="flex items-center gap-1.5 text-[9px] text-white/30 hover:text-white/60 transition-colors disabled:opacity-40"
              >
                <RefreshCw className={`w-3 h-3 ${fetchingQr ? 'animate-spin' : ''}`} /> Atualizar QR
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
