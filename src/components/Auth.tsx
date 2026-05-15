import React, { useState } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendPasswordResetEmail,
  updateProfile,
  signInWithPopup,
  GoogleAuthProvider
} from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { Mail, Lock, User, Phone, Eye, EyeOff, Loader2, ChevronRight, Chrome } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { auditLogger } from '../services/AuditLogger';
import { DataService } from '../services/DataService';

import { VisualIdentityConfig } from '../types';

interface AuthProps {
  onSuccess: () => void;
  onSignup?: () => void;
  visualConfig?: VisualIdentityConfig;
}

export const Auth: React.FC<AuthProps> = ({ onSuccess, onSignup, visualConfig }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (isLogin) {
        try {
          const userCredential = await signInWithEmailAndPassword(auth, email, password);
          
          // Auditing
          auditLogger.log(
            userCredential.user.uid,
            userCredential.user.displayName || email,
            'LOGIN',
            'auth',
            { 
              status: 'success',
              entity: 'user',
              details: `Login realizado com sucesso via E-mail: ${email}`
            }
          );

        } catch (loginErr: any) {
          // Audit local/attempted failure if possible (no userId yet)
          auditLogger.log(
            'system',
            email,
            'LOGIN_FAILED',
            'security',
            { 
              status: 'failed',
              entity: 'auth',
              details: `Tentativa de login falhou para ${email}: ${loginErr.message}`
            }
          );
          throw loginErr;
        }
      } else {
        // ... registration (if implemented)
      }
      onSuccess();
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/operation-not-allowed') {
        setError('ERRO CRÍTICO: O provedor de "E-mail/Senha" não está ativado no Firebase Console.');
      } else {
        setError(err.message || 'Erro ao autenticar');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      // Check if profile exists using DataService
      const profile = await DataService.get('users', user.uid);

      if (!profile) {
        await DataService.create('users', {
          uid: user.uid,
          name: user.displayName || 'Usuário Google',
          email: user.email,
          phone: user.phoneNumber || '',
          role: 'atendente', // Default role for new users
          userType: 'HUMAN',
          status: 'active',
          permissions: {
            canReadAllLeads: false,
            canWriteAllLeads: true,
            canDelete: false,
            canAccessSettings: false,
            canManageUsers: false
          }
        });
      }

      auditLogger.log(
        user.uid,
        user.displayName || user.email || 'Usuário Google',
        'LOGIN_GOOGLE',
        'auth',
        { 
          status: 'success',
          entity: 'user',
          details: `Login via Google: ${user.email}`
        }
      );

      onSuccess();
    } catch (err: any) {
      console.error(err);
      auditLogger.log(
        'system',
        'unknown',
        'LOGIN_GOOGLE_FAILED',
        'security',
        { 
          status: 'error',
          entity: 'auth',
          details: `Falha no login Google: ${err.message}`
        }
      );
      if (err.code === 'auth/operation-not-allowed') {
        setError('O login do Google não está ativado no Firebase Console.');
      } else {
        setError('Erro ao entrar com Google: ' + err.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Por favor, informe seu e-mail para recuperar a senha');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await sendPasswordResetEmail(auth, email);
      setMessage('E-mail de recuperação enviado! Verifique sua caixa de entrada.');
    } catch (err: any) {
      setError('Erro ao enviar e-mail: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-dark flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gold-deep/10 border border-gold-deep rounded-3xl mb-4">
            <Lock className="w-10 h-10 text-gold-deep" />
          </div>
          <p className="text-gold-light/60 text-sm mt-1 uppercase tracking-widest font-bold">Gestão Inteligente</p>
        </div>

        {/* Auth Card */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl p-8 shadow-2xl border border-slate-200"
        >
          <div className="mb-8">
            <h2 className="text-xl font-bold text-slate-900 border-b-2 border-gold-deep inline-block pb-1">
              Bem-vindo de volta
            </h2>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input 
                type="email"
                required
                placeholder="E-mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gold-deep/20 text-slate-900 text-sm"
              />
            </div>

            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input 
                type={showPassword ? "text" : "password"}
                required
                placeholder="Senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gold-deep/20 text-slate-900 text-sm"
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>

            <div className="text-right">
              <button 
                type="button"
                onClick={handleForgotPassword}
                className="text-xs font-bold text-gold-deep hover:text-brand-dark transition-colors"
              >
                Esqueceu a senha?
              </button>
            </div>

            <AnimatePresence>
              {error && (
                <motion.p 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="text-xs text-red-500 font-bold bg-red-50 p-3 rounded-xl border border-red-100"
                >
                  {error}
                </motion.p>
              )}
              {message && (
                <motion.p 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="text-xs text-emerald-600 font-bold bg-emerald-50 p-3 rounded-xl border border-emerald-100"
                >
                  {message}
                </motion.p>
              )}
            </AnimatePresence>

            <button 
              disabled={isLoading}
              className="w-full py-4 bg-brand-dark text-gold-deep rounded-xl font-bold tracking-widest uppercase text-sm shadow-xl shadow-brand-dark/20 flex items-center justify-center gap-2 hover:bg-brand-black transition-all border border-gold-deep/30"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Entrar no Sistema
                  <ChevronRight className="w-5 h-5" />
                </>
              )}
            </button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-100"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-slate-400 font-bold tracking-widest">Ou continue com</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="w-full py-3 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 text-sm flex items-center justify-center gap-3 hover:bg-slate-50 transition-all shadow-sm"
            >
              <Chrome className="w-5 h-5" />
              Entrar com Google
            </button>
          </form>
        </motion.div>

        {onSignup && (
          <p className="text-center mt-6 text-sm text-white/40">
            Não tem conta?{' '}
            <button
              type="button"
              onClick={onSignup}
              className="text-[#D4A854] font-bold hover:text-[#D4A854]/80 transition-colors underline underline-offset-2"
            >
              Cadastre sua empresa →
            </button>
          </p>
        )}
      </div>
    </div>
  );
};
