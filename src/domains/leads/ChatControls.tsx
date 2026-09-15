import React from 'react';
import { 
  Users, 
  Paperclip, 
  RefreshCcw, 
  Sparkles, 
  Send,
  Mic,
  Square,
  Trash2
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { AgentConfig } from '../../types';

interface ChatControlsProps {
  isSimulatingLead: boolean;
  setIsSimulatingLead: (val: boolean) => void;
  isTestMode: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  agentConfig: AgentConfig;
  handleAISuggestion: () => void;
  isAILoading: boolean;
  newMessage: string;
  setNewMessage: (val: string) => void;
  handleSendMessage: () => void;
}

export const ChatControls = React.memo(({
  isSimulatingLead,
  setIsSimulatingLead,
  isTestMode,
  fileInputRef,
  handleFileUpload,
  agentConfig,
  handleAISuggestion,
  isAILoading,
  newMessage,
  setNewMessage,
  handleSendMessage
}: ChatControlsProps) => {
  const [isRecording, setIsRecording] = React.useState(false);
  const [recordDuration, setRecordDuration] = React.useState(0);
  const timerRef = React.useRef<NodeJS.Timeout | null>(null);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const audioChunksRef = React.useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        
        // Convert blob to base64 for simulation or sending
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64Audio = reader.result as string;
          if (isSimulatingLead) {
             // If simulating customer, set as special input
             setNewMessage(`[AUDIO_MESSAGE]${base64Audio}`);
          } else {
             // For user sending, maybe we should also handle it
             setNewMessage(`[AUDIO_MESSAGE]${base64Audio}`);
          }
          
          // Trigger send if recording was stopped normally and not discarded
          if (audioChunksRef.current.length > 0) {
             setTimeout(() => {
                const sendBtn = document.getElementById('chat-send-btn');
                sendBtn?.click();
             }, 100);
          }
        };

        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordDuration(0);
      timerRef.current = setInterval(() => {
        setRecordDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Não foi possível acessar o microfone. Verifique as permissões do navegador.");
    }
  };

  const stopRecording = (shouldSend = true) => {
    if (timerRef.current) clearInterval(timerRef.current);
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      if (!shouldSend) {
        audioChunksRef.current = []; // Clear chunks if discarding
      }
      mediaRecorderRef.current.stop();
    }
    
    setIsRecording(false);
    setRecordDuration(0);
  };

  const formatDuration = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="p-3 md:p-4 bg-white/95 backdrop-blur-md flex flex-col gap-3 shrink-0 border-t border-slate-200 z-[40]">
      <div className="flex items-center gap-2 px-2">
        {isTestMode && (
          <div className="flex items-center gap-2 mb-1 p-1 bg-[#FFF3DC] rounded-lg border border-[#B8860B]/25">
            <span className="text-[10px] font-black text-[#B8860B] uppercase tracking-widest px-2">Modo Simulação</span>
            <button
              onClick={() => setIsSimulatingLead(!isSimulatingLead)}
              className={cn(
                "flex items-center gap-2 px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-widest transition-all",
                isSimulatingLead
                  ? "bg-[#B8860B] text-white shadow-sm"
                  : "bg-white text-slate-400 hover:text-[#B8860B] border border-[#B8860B]/25"
              )}
            >
              <Users className="w-3 h-3" />
              {isSimulatingLead ? "Simulando Cliente" : "Simular Cliente"}
            </button>
            <div className="text-[9px] text-[#B8860B]/70 font-medium italic">
              {isSimulatingLead ? "Suas mensagens aparecerão como se fossem do Lead" : "Suas mensagens aparecerão como Corretor"}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 md:gap-4">
        <input 
          type="file" 
          ref={fileInputRef}
          onChange={handleFileUpload}
          className="hidden" 
          accept="image/*,.pdf"
        />
        <button 
          onClick={() => fileInputRef.current?.click()}
          className="w-12 h-12 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center hover:bg-gold-deep/10 hover:text-gold-deep transition-all border border-slate-200"
          title="Anexar Arquivo (CNH, CRV, Apólice)"
        >
          <Paperclip className="w-5 h-5" />
        </button>

        {/* AI Suggestion Button removed as per user request */}
        {isRecording ? (
          <div className="flex-1 flex items-center gap-4 bg-[#E4F5EA] border border-[#1F8A4C]/20 rounded-2xl px-4 py-2 animate-in fade-in slide-in-from-bottom-2">
            <div className="w-2 h-2 rounded-full bg-[#C0392B] animate-pulse" />
            <span className="text-sm font-bold text-[#1F8A4C] font-mono">{formatDuration(recordDuration)}</span>
            <span className="text-xs text-[#1F8A4C] font-medium">Gravando áudio...</span>
            <div className="flex-1" />
            <button
              onClick={() => stopRecording(false)}
              className="p-2 text-[#C0392B] hover:bg-[#FDE4E4] rounded-full transition-all"
            >
              <Trash2 className="w-5 h-5" />
            </button>
            <button
              onClick={() => stopRecording(true)}
              className="w-10 h-10 bg-[#1F8A4C] text-white rounded-full flex items-center justify-center shadow-lg hover:bg-[#186f3e] transition-all"
            >
              <Square className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 relative">
              <input 
                type="text" 
                placeholder={isSimulatingLead ? "Diga algo ao Agente..." : (agentConfig.isActive ? "O Agente responderá automaticamente..." : "Digite uma mensagem...")}
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-gold-deep/20 text-sm text-black"
              />
            </div>
            
            {newMessage.trim() ? (
              <button
                id="chat-send-btn"
                onClick={handleSendMessage}
                className="w-12 h-12 bg-[#1B4D8F] text-white rounded-2xl shadow-sm shadow-[#1B4D8F]/20 flex items-center justify-center hover:bg-[#153E73] transition-all"
              >
                <Send className="w-6 h-6" />
              </button>
            ) : (
              <button
                onClick={startRecording}
                className="w-12 h-12 bg-slate-100 text-slate-500 rounded-2xl flex items-center justify-center hover:bg-gold-deep/10 hover:text-gold-deep transition-all border border-slate-200"
                title="Gravar Mensagem de Áudio"
              >
                <Mic className="w-6 h-6" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
});

ChatControls.displayName = 'ChatControls';
