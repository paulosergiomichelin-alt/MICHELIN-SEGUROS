import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCcw, Home } from 'lucide-react';
import { logger } from '../services/LoggerService';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    logger.critical('UI_RENDER', `Crash na interface: ${error.message}`, { 
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack 
    });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 shadow-2xl text-center">
            <div className="w-16 h-16 bg-[#FDE4E4] rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-8 h-8 text-[#C0392B]" />
            </div>

            <h2 className="text-xl font-display font-bold text-gold-deep mb-2 uppercase tracking-widest">
              Ops! Algo deu errado
            </h2>
            <p className="text-slate-500 text-sm mb-8 leading-relaxed">
              Ocorreu um erro inesperado na interface. Nossa equipe foi notificada e estamos trabalhando nisso.
            </p>

            <div className="bg-slate-900 rounded-lg p-4 mb-8 text-left overflow-auto max-h-32 border border-slate-700">
              <p className="text-red-300/80 font-mono text-xs break-all">
                {this.state.error?.message}
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={this.handleReset}
                className="w-full flex items-center justify-center gap-2 bg-[#1B4D8F] text-white font-bold py-3 rounded-xl hover:bg-[#153E73] transition-transform active:scale-95 shadow-sm shadow-[#1B4D8F]/20"
              >
                <RefreshCcw className="w-4 h-4" />
                TENTAR NOVAMENTE
              </button>

              <button
                onClick={() => window.location.href = '/'}
                className="w-full flex items-center justify-center gap-2 border border-gold-deep/30 text-gold-deep font-bold py-3 rounded-xl hover:bg-gold-deep/5 transition-all"
              >
                <Home className="w-4 h-4" />
                VOLTAR PARA O INÍCIO
              </button>
            </div>

            <p className="mt-8 text-[10px] text-slate-500 uppercase tracking-widest font-bold">
              ID do Erro: {Math.random().toString(36).substr(2, 9).toUpperCase()}
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
