import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { EmpresaService } from '../../services/EmpresaService';
import type { PlanSaas } from '../../types';
import {
  Building2,
  User,
  Settings,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Eye,
  EyeOff,

  X,
  AlertCircle,
  Info,
  Lock,
  Mail,
  Phone,
  Globe,
  FileText,
  Briefcase,
  Clock,
  Shield,
  Star,
  Zap,
  Users,
  Database,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FormData {
  // Step 1 - Company
  razao_social: string;
  nome_fantasia: string;
  cnpj: string;
  email_corporativo: string;
  telefone: string;

  // Step 2 - Owner
  owner_nome: string;
  owner_email: string;
  owner_telefone: string;
  owner_senha: string;
  confirmar_senha: string;

  // Step 3 - Config
  plano_saas: PlanSaas;
  timezone: string;
  idioma: string;


}

interface FieldError {
  [key: string]: string;
}

interface Toast {
  type: 'success' | 'error' | 'info';
  message: string;
  id: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIMEZONES = [
  { value: 'America/Sao_Paulo', label: 'São Paulo (GMT-3)' },
  { value: 'America/Manaus', label: 'Manaus (GMT-4)' },
  { value: 'America/Belem', label: 'Belém (GMT-3)' },
  { value: 'America/Fortaleza', label: 'Fortaleza (GMT-3)' },
  { value: 'America/Recife', label: 'Recife (GMT-3)' },
  { value: 'America/Bahia', label: 'Bahia (GMT-3)' },
  { value: 'America/Cuiaba', label: 'Cuiabá (GMT-4)' },
  { value: 'America/Porto_Velho', label: 'Porto Velho (GMT-4)' },
  { value: 'America/Boa_Vista', label: 'Boa Vista (GMT-4)' },
  { value: 'America/Rio_Branco', label: 'Rio Branco (GMT-5)' },
  { value: 'America/Noronha', label: 'Fernando de Noronha (GMT-2)' },
];

const IDIOMAS = [
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'en-US', label: 'English (US)' },
  { value: 'es-ES', label: 'Español' },
];

const PLANOS: Array<{
  value: PlanSaas;
  label: string;
  desc: string;
  price: string;
  icon: React.ElementType;
  color: string;
  features: string[];
}> = [
  {
    value: 'basico',
    label: 'Básico',
    desc: 'Para pequenas corretoras',
    price: 'Grátis por 14 dias',
    icon: Shield,
    color: '#8E8E93',
    features: ['5 usuários', '100 leads/mês', '500 MB storage'],
  },
  {
    value: 'profissional',
    label: 'Profissional',
    desc: 'Crescimento acelerado',
    price: 'R$ 297/mês',
    icon: Star,
    color: '#D4A854',
    features: ['25 usuários', '1.000 leads/mês', '5 GB storage'],
  },
  {
    value: 'enterprise',
    label: 'Enterprise',
    desc: 'Sem limites',
    price: 'R$ 997/mês',
    icon: Zap,
    color: '#5E85FF',
    features: ['Ilimitado', '999.999 leads/mês', '100 GB storage'],
  },
];

const STEPS = [
  { label: 'Empresa', icon: Building2 },
  { label: 'Responsável', icon: User },
  { label: 'Plano', icon: Settings },
  { label: 'Confirmação', icon: CheckCircle2 },
];

const INITIAL_FORM: FormData = {
  razao_social: '',
  nome_fantasia: '',
  cnpj: '',
  email_corporativo: '',
  telefone: '',
  owner_nome: '',
  owner_email: '',
  owner_telefone: '',
  owner_senha: '',
  confirmar_senha: '',
  plano_saas: 'basico',
  timezone: 'America/Sao_Paulo',
  idioma: 'pt-BR',

};

// ---------------------------------------------------------------------------
// Masks
// ---------------------------------------------------------------------------

function maskCnpj(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 14);
  let r = '';
  for (let i = 0; i < d.length; i++) {
    if (i === 2 || i === 5) r += '.';
    else if (i === 8) r += '/';
    else if (i === 12) r += '-';
    r += d[i];
  }
  return r;
}

function maskPhone(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10)
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateCnpjDigits(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 14) return false;
  if (/^(\d)\1+$/.test(digits)) return false;

  const calcDigit = (slice: string, weights: number[]): number => {
    const sum = slice
      .split('')
      .reduce((acc, d, i) => acc + parseInt(d, 10) * weights[i], 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  const d1 = calcDigit(digits.slice(0, 12), w1);
  if (d1 !== parseInt(digits[12], 10)) return false;

  const d2 = calcDigit(digits.slice(0, 13), w2);
  if (d2 !== parseInt(digits[13], 10)) return false;

  return true;
}

function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  if (!password) return { score: 0, label: '', color: '#transparent' };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) score++;

  if (score <= 2) return { score, label: 'Fraca', color: '#EF4444' };
  if (score <= 4) return { score, label: 'Moderada', color: '#F59E0B' };
  return { score, label: 'Forte', color: '#22C55E' };
}

function validateStep(step: number, data: FormData): FieldError {
  const errors: FieldError = {};

  if (step === 0) {
    if (!data.razao_social.trim() || data.razao_social.length < 3)
      errors.razao_social = 'Razão social deve ter no mínimo 3 caracteres';
    if (!data.cnpj || !validateCnpjDigits(data.cnpj))
      errors.cnpj = 'CNPJ inválido';
    if (!data.email_corporativo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email_corporativo))
      errors.email_corporativo = 'E-mail corporativo inválido';
  }

  if (step === 1) {
    if (!data.owner_nome.trim() || data.owner_nome.length < 3)
      errors.owner_nome = 'Nome deve ter no mínimo 3 caracteres';
    if (!data.owner_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.owner_email))
      errors.owner_email = 'E-mail inválido';
    if (!data.owner_senha || data.owner_senha.length < 8)
      errors.owner_senha = 'Senha deve ter no mínimo 8 caracteres';
    else if (!/[A-Z]/.test(data.owner_senha))
      errors.owner_senha = 'Senha precisa de pelo menos uma maiúscula';
    else if (!/[a-z]/.test(data.owner_senha))
      errors.owner_senha = 'Senha precisa de pelo menos uma minúscula';
    else if (!/\d/.test(data.owner_senha))
      errors.owner_senha = 'Senha precisa de pelo menos um número';
    else if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(data.owner_senha))
      errors.owner_senha = 'Senha precisa de pelo menos um caractere especial';
    if (data.owner_senha !== data.confirmar_senha)
      errors.confirmar_senha = 'As senhas não coincidem';
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Reusable UI components
// ---------------------------------------------------------------------------

function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

const PremiumInput = React.memo(
  ({
    label,
    icon: Icon,
    required,
    readOnly,
    error,
    hint,
    ...props
  }: {
    label: string;
    icon?: React.ElementType;
    required?: boolean;
    readOnly?: boolean;
    error?: string;
    hint?: string;
  } & React.InputHTMLAttributes<HTMLInputElement>) => (
    <div className="space-y-1 w-full group">
      <label className="text-[8.5px] font-bold text-[#8E8E93]/80 uppercase tracking-[0.18em] ml-0.5 group-focus-within:text-[#D4A854] transition-colors">
        {label} {required && <span className="text-red-500/80">*</span>}
      </label>
      <div className="relative">
        <input
          {...props}
          className={cn(
            'w-full h-10 bg-[#16181B] border rounded-lg px-3.5 text-[12px] font-medium text-white transition-all duration-200 focus:ring-2 focus:shadow-[0_0_0_4px_rgba(212,168,84,0.04)] hover:border-white/15 placeholder:text-white/15 outline-none',
            error
              ? 'border-red-500/50 focus:ring-red-500/20 focus:border-red-500/60'
              : 'border-white/[0.07] focus:ring-[#D4A854]/20 focus:border-[#D4A854]/40',
            Icon && 'pl-10',
            readOnly && 'opacity-60 cursor-not-allowed bg-white/[0.015]',
            props.className,
          )}
          readOnly={readOnly}
        />
        {Icon && (
          <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8E8E93]/40 group-focus-within:text-[#D4A854]/70 transition-colors pointer-events-none" />
        )}
      </div>
      {error && (
        <p className="text-[10px] text-red-400/90 flex items-center gap-1 ml-0.5">
          <AlertCircle className="w-3 h-3 flex-shrink-0" />
          {error}
        </p>
      )}
      {hint && !error && (
        <p className="text-[10px] text-[#8E8E93]/60 flex items-center gap-1 ml-0.5">
          <Info className="w-3 h-3 flex-shrink-0" />
          {hint}
        </p>
      )}
    </div>
  ),
);

PremiumInput.displayName = 'PremiumInput';

const PremiumSelect = React.memo(
  ({
    label,
    icon: Icon,
    required,
    error,
    children,
    ...props
  }: {
    label: string;
    icon?: React.ElementType;
    required?: boolean;
    error?: string;
    children: React.ReactNode;
  } & React.SelectHTMLAttributes<HTMLSelectElement>) => (
    <div className="space-y-1 w-full group">
      <label className="text-[8.5px] font-bold text-[#8E8E93]/80 uppercase tracking-[0.18em] ml-0.5 group-focus-within:text-[#D4A854] transition-colors">
        {label} {required && <span className="text-red-500/80">*</span>}
      </label>
      <div className="relative">
        <select
          {...props}
          className={cn(
            'w-full h-10 bg-[#16181B] border border-white/[0.07] rounded-lg px-3.5 text-[12px] font-medium text-white transition-all duration-200 focus:ring-2 focus:ring-[#D4A854]/20 focus:border-[#D4A854]/40 focus:outline-none hover:border-white/15 appearance-none cursor-pointer',
            Icon && 'pl-10',
            error && 'border-red-500/50',
          )}
        >
          {children}
        </select>
        {Icon && (
          <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8E8E93]/40 pointer-events-none" />
        )}
        <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8E8E93]/40 rotate-90 pointer-events-none" />
      </div>
      {error && (
        <p className="text-[10px] text-red-400/90 flex items-center gap-1 ml-0.5">
          <AlertCircle className="w-3 h-3" />
          {error}
        </p>
      )}
    </div>
  ),
);

PremiumSelect.displayName = 'PremiumSelect';

// ---------------------------------------------------------------------------
// Step components
// ---------------------------------------------------------------------------

function StepEmpresa({
  data,
  errors,
  onChange,
}: {
  data: FormData;
  errors: FieldError;
  onChange: (field: keyof FormData, value: string) => void;
}) {
  return (
    <div className="space-y-4">
      <PremiumInput
        label="Razão Social"
        icon={Building2}
        required
        placeholder="Ex: Michelin Seguros Corretora LTDA"
        value={data.razao_social}
        onChange={(e) => onChange('razao_social', e.target.value)}
        error={errors.razao_social}
      />
      <PremiumInput
        label="Nome Fantasia"
        icon={Briefcase}
        placeholder="Ex: Michelin Seguros"
        value={data.nome_fantasia}
        onChange={(e) => onChange('nome_fantasia', e.target.value)}
        error={errors.nome_fantasia}
        hint="Nome público da sua empresa"
      />
      <PremiumInput
        label="CNPJ"
        icon={FileText}
        required
        placeholder="00.000.000/0000-00"
        value={data.cnpj}
        onChange={(e) => onChange('cnpj', maskCnpj(e.target.value))}
        error={errors.cnpj}
        maxLength={18}
        inputMode="numeric"
      />
      <PremiumInput
        label="E-mail Corporativo"
        icon={Mail}
        required
        type="email"
        placeholder="contato@suaempresa.com.br"
        value={data.email_corporativo}
        onChange={(e) => onChange('email_corporativo', e.target.value)}
        error={errors.email_corporativo}
      />
      <PremiumInput
        label="Telefone"
        icon={Phone}
        placeholder="(00) 00000-0000"
        value={data.telefone}
        onChange={(e) => onChange('telefone', maskPhone(e.target.value))}
        error={errors.telefone}
        maxLength={15}
        inputMode="tel"
      />
    </div>
  );
}

function StepResponsavel({
  data,
  errors,
  onChange,
}: {
  data: FormData;
  errors: FieldError;
  onChange: (field: keyof FormData, value: string) => void;
}) {
  const [showSenha, setShowSenha] = useState(false);
  const [showConfirmar, setShowConfirmar] = useState(false);
  const strength = useMemo(() => getPasswordStrength(data.owner_senha), [data.owner_senha]);

  return (
    <div className="space-y-4">
      <PremiumInput
        label="Nome Completo"
        icon={User}
        required
        placeholder="Seu nome completo"
        value={data.owner_nome}
        onChange={(e) => onChange('owner_nome', e.target.value)}
        error={errors.owner_nome}
      />
      <PremiumInput
        label="E-mail"
        icon={Mail}
        required
        type="email"
        placeholder="seu@email.com.br"
        value={data.owner_email}
        onChange={(e) => onChange('owner_email', e.target.value)}
        error={errors.owner_email}
      />
      <PremiumInput
        label="Telefone"
        icon={Phone}
        placeholder="(00) 00000-0000"
        value={data.owner_telefone}
        onChange={(e) => onChange('owner_telefone', maskPhone(e.target.value))}
        error={errors.owner_telefone}
        maxLength={15}
        inputMode="tel"
      />

      {/* Password field */}
      <div className="space-y-1 w-full group">
        <label className="text-[8.5px] font-bold text-[#8E8E93]/80 uppercase tracking-[0.18em] ml-0.5 group-focus-within:text-[#D4A854] transition-colors">
          Senha <span className="text-red-500/80">*</span>
        </label>
        <div className="relative">
          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8E8E93]/40 group-focus-within:text-[#D4A854]/70 transition-colors pointer-events-none" />
          <input
            type={showSenha ? 'text' : 'password'}
            value={data.owner_senha}
            onChange={(e) => onChange('owner_senha', e.target.value)}
            placeholder="Mínimo 8 caracteres"
            className={cn(
              'w-full h-10 bg-[#16181B] border rounded-lg pl-10 pr-10 text-[12px] font-medium text-white transition-all duration-200 focus:ring-2 focus:shadow-[0_0_0_4px_rgba(212,168,84,0.04)] hover:border-white/15 placeholder:text-white/15 outline-none',
              errors.owner_senha
                ? 'border-red-500/50 focus:ring-red-500/20 focus:border-red-500/60'
                : 'border-white/[0.07] focus:ring-[#D4A854]/20 focus:border-[#D4A854]/40',
            )}
          />
          <button
            type="button"
            onClick={() => setShowSenha((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8E8E93]/40 hover:text-[#8E8E93]/80 transition-colors"
          >
            {showSenha ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Password strength bar */}
        {data.owner_senha && (
          <div className="mt-2 space-y-1">
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="h-1 flex-1 rounded-full transition-all duration-300"
                  style={{
                    backgroundColor:
                      i <= strength.score ? strength.color : '#1E2025',
                  }}
                />
              ))}
            </div>
            <p
              className="text-[10px] font-semibold ml-0.5"
              style={{ color: strength.color }}
            >
              {strength.label}
            </p>
          </div>
        )}

        {errors.owner_senha && (
          <p className="text-[10px] text-red-400/90 flex items-center gap-1 ml-0.5">
            <AlertCircle className="w-3 h-3 flex-shrink-0" />
            {errors.owner_senha}
          </p>
        )}
      </div>

      {/* Confirm password */}
      <div className="space-y-1 w-full group">
        <label className="text-[8.5px] font-bold text-[#8E8E93]/80 uppercase tracking-[0.18em] ml-0.5 group-focus-within:text-[#D4A854] transition-colors">
          Confirmar Senha <span className="text-red-500/80">*</span>
        </label>
        <div className="relative">
          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8E8E93]/40 pointer-events-none" />
          <input
            type={showConfirmar ? 'text' : 'password'}
            value={data.confirmar_senha}
            onChange={(e) => onChange('confirmar_senha', e.target.value)}
            placeholder="Repita a senha"
            className={cn(
              'w-full h-10 bg-[#16181B] border rounded-lg pl-10 pr-10 text-[12px] font-medium text-white transition-all duration-200 focus:ring-2 focus:shadow-[0_0_0_4px_rgba(212,168,84,0.04)] hover:border-white/15 placeholder:text-white/15 outline-none',
              errors.confirmar_senha
                ? 'border-red-500/50 focus:ring-red-500/20 focus:border-red-500/60'
                : 'border-white/[0.07] focus:ring-[#D4A854]/20 focus:border-[#D4A854]/40',
            )}
          />
          <button
            type="button"
            onClick={() => setShowConfirmar((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8E8E93]/40 hover:text-[#8E8E93]/80 transition-colors"
          >
            {showConfirmar ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>
        {errors.confirmar_senha && (
          <p className="text-[10px] text-red-400/90 flex items-center gap-1 ml-0.5">
            <AlertCircle className="w-3 h-3 flex-shrink-0" />
            {errors.confirmar_senha}
          </p>
        )}
        {data.confirmar_senha && data.owner_senha === data.confirmar_senha && !errors.confirmar_senha && (
          <p className="text-[10px] text-green-400/90 flex items-center gap-1 ml-0.5">
            <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
            Senhas coincidem
          </p>
        )}
      </div>
    </div>
  );
}

function StepConfiguracao({
  data,
  onChange,
}: {
  data: FormData;
  onChange: (field: keyof FormData, value: string) => void;
}) {
  return (
    <div className="space-y-6">
      {/* Plan selector */}
      <div className="space-y-2">
        <p className="text-[8.5px] font-bold text-[#8E8E93]/80 uppercase tracking-[0.18em] ml-0.5">
          Plano <span className="text-red-500/80">*</span>
        </p>
        <div className="grid grid-cols-1 gap-3">
          {PLANOS.map((plan) => {
            const IconComp = plan.icon;
            const isSelected = data.plano_saas === plan.value;
            return (
              <button
                key={plan.value}
                type="button"
                onClick={() => onChange('plano_saas', plan.value)}
                className={cn(
                  'relative w-full text-left rounded-xl border p-4 transition-all duration-200 group',
                  isSelected
                    ? 'border-[#D4A854]/40 bg-[#D4A854]/[0.05] ring-1 ring-[#D4A854]/20'
                    : 'border-white/[0.06] bg-[#16181B]/60 hover:border-white/[0.12]',
                )}
              >
                {isSelected && (
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#D4A854]/40 to-transparent" />
                )}
                <div className="flex items-start gap-3">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{
                      backgroundColor: `${plan.color}15`,
                      border: `1px solid ${plan.color}25`,
                    }}
                  >
                    <IconComp className="w-4 h-4" style={{ color: plan.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-bold text-white">{plan.label}</span>
                      <span
                        className="text-[11px] font-semibold"
                        style={{ color: plan.color }}
                      >
                        {plan.price}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#8E8E93]/70 mt-0.5">{plan.desc}</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {plan.features.map((f) => (
                        <span
                          key={f}
                          className="text-[9.5px] font-semibold px-2 py-0.5 rounded-full"
                          style={{
                            backgroundColor: `${plan.color}12`,
                            color: plan.color,
                            border: `1px solid ${plan.color}20`,
                          }}
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                  {isSelected && (
                    <CheckCircle2
                      className="w-4 h-4 flex-shrink-0 mt-0.5"
                      style={{ color: '#D4A854' }}
                    />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Timezone */}
      <PremiumSelect
        label="Fuso Horário"
        icon={Clock}
        required
        value={data.timezone}
        onChange={(e) => onChange('timezone', e.target.value)}
      >
        {TIMEZONES.map((tz) => (
          <option key={tz.value} value={tz.value} className="bg-[#16181B]">
            {tz.label}
          </option>
        ))}
      </PremiumSelect>

      {/* Idioma */}
      <PremiumSelect
        label="Idioma"
        icon={Globe}
        required
        value={data.idioma}
        onChange={(e) => onChange('idioma', e.target.value)}
      >
        {IDIOMAS.map((lang) => (
          <option key={lang.value} value={lang.value} className="bg-[#16181B]">
            {lang.label}
          </option>
        ))}
      </PremiumSelect>
    </div>
  );
}

function StepConfirmacao({ data }: { data: FormData }) {
  const selectedPlan = PLANOS.find((p) => p.value === data.plano_saas);

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="rounded-xl border border-white/[0.06] bg-[#0E0F11]/60 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.04] bg-gradient-to-r from-[#D4A854]/[0.04] to-transparent">
          <h4 className="text-[10px] font-black uppercase tracking-[0.20em] text-[#D4A854]/90">
            Resumo do Cadastro
          </h4>
        </div>
        <div className="p-4 space-y-3">
          <SummaryRow label="Empresa" value={data.razao_social || '—'} icon={Building2} />
          <SummaryRow label="Nome Fantasia" value={data.nome_fantasia || '—'} icon={Briefcase} />
          <SummaryRow label="CNPJ" value={data.cnpj || '—'} icon={FileText} />
          <SummaryRow label="E-mail Corporativo" value={data.email_corporativo || '—'} icon={Mail} />
          <SummaryRow label="Responsável" value={data.owner_nome || '—'} icon={User} />
          <SummaryRow label="E-mail Responsável" value={data.owner_email || '—'} icon={Mail} />
          <SummaryRow
            label="Plano"
            value={selectedPlan?.label ?? '—'}
            icon={selectedPlan?.icon ?? Shield}
            highlight
          />
          <SummaryRow label="Fuso Horário" value={TIMEZONES.find((t) => t.value === data.timezone)?.label ?? '—'} icon={Clock} />
          <SummaryRow label="Idioma" value={IDIOMAS.find((l) => l.value === data.idioma)?.label ?? '—'} icon={Globe} />
        </div>
      </div>

      {/* Trial info */}
      <div className="flex items-start gap-3 p-3 rounded-xl bg-[#D4A854]/[0.06] border border-[#D4A854]/20">
        <Info className="w-4 h-4 text-[#D4A854] mt-0.5 flex-shrink-0" />
        <p className="text-[11px] text-[#D4A854]/80 leading-relaxed">
          Você terá <strong>14 dias de trial gratuito</strong> após o cadastro.
          Nenhum cartão necessário para começar.
        </p>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  icon: Icon,
  highlight,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className={cn(
        'w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0',
        highlight ? 'bg-[#D4A854]/[0.12]' : 'bg-white/[0.04]',
      )}>
        <Icon className={cn('w-3 h-3', highlight ? 'text-[#D4A854]' : 'text-[#8E8E93]/60')} />
      </div>
      <div className="flex-1 min-w-0 flex items-baseline justify-between gap-2">
        <span className="text-[10px] text-[#8E8E93]/60 flex-shrink-0">{label}</span>
        <span
          className={cn(
            'text-[11px] font-semibold truncate text-right',
            highlight ? 'text-[#D4A854]' : 'text-white/80',
          )}
        >
          {value}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toast component
// ---------------------------------------------------------------------------

function ToastList({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className={cn(
              'pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl backdrop-blur-xl max-w-sm',
              toast.type === 'success' && 'bg-green-500/10 border-green-500/20 text-green-400',
              toast.type === 'error' && 'bg-red-500/10 border-red-500/20 text-red-400',
              toast.type === 'info' && 'bg-[#D4A854]/10 border-[#D4A854]/20 text-[#D4A854]',
            )}
          >
            {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 flex-shrink-0" />}
            {toast.type === 'error' && <AlertCircle className="w-4 h-4 flex-shrink-0" />}
            {toast.type === 'info' && <Info className="w-4 h-4 flex-shrink-0" />}
            <p className="text-[12px] font-medium">{toast.message}</p>
            <button
              onClick={() => onDismiss(toast.id)}
              className="ml-auto opacity-60 hover:opacity-100 transition-opacity"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface CompanyRegistrationProps {
  onBack?: () => void;
  onSuccess?: () => void;
}

export function CompanyRegistration({ onBack, onSuccess }: CompanyRegistrationProps = {}) {
  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM);
  const [errors, setErrors] = useState<FieldError>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastCounter = useRef(0);

  const addToast = useCallback((type: Toast['type'], message: string) => {
    const id = ++toastCounter.current;
    setToasts((prev) => [...prev, { type, message, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleChange = useCallback((field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (!prev[field as string]) return prev;
      const next = { ...prev };
      delete next[field as string];
      return next;
    });
  }, []);

  const goNext = useCallback(() => {
    const stepErrors = validateStep(step, formData);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      addToast('error', 'Preencha os campos obrigatórios corretamente');
      return;
    }
    setErrors({});
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }, [step, formData, addToast]);

  const goBack = useCallback(() => {
    setErrors({});
    setStep((s) => Math.max(s - 1, 0));
  }, []);

  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true);

    try {
      const { empresa } = await EmpresaService.onboarding({
        nomeRazaoSocial: formData.razao_social,
        nomeFantasia: formData.nome_fantasia || undefined,
        cnpj: formData.cnpj,
        emailCorporativo: formData.email_corporativo,
        telefone: formData.telefone || undefined,
        ownerNome: formData.owner_nome,
        ownerEmail: formData.owner_email,
        ownerTelefone: formData.owner_telefone || undefined,
        ownerSenha: formData.owner_senha,
        planoSaas: formData.plano_saas,
        timezone: formData.timezone,
        idioma: formData.idioma,
      });

      setIsSuccess(true);
      addToast('success', 'Empresa cadastrada com sucesso!');
      onSuccess?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao realizar cadastro';
      // Friendly messages for common Firebase Auth errors
      if (message.includes('EMAIL_ALREADY_REGISTERED') || message.includes('email-already-in-use')) {
        addToast('error', 'Este e-mail já está cadastrado no sistema. Use outro e-mail para o responsável.');
      } else if (message.includes('weak-password')) {
        addToast('error', 'Senha fraca. Use ao menos 8 caracteres com letras e números.');
      } else if (message.includes('network-request-failed')) {
        addToast('error', 'Erro de conexão. Verifique sua internet e tente novamente.');
      } else {
        addToast('error', message);
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, addToast]);

  const progress = ((step + 1) / STEPS.length) * 100;

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="w-full max-w-md text-center space-y-6"
        >
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.4, type: 'spring', stiffness: 200 }}
            className="w-20 h-20 mx-auto rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center"
          >
            <CheckCircle2 className="w-10 h-10 text-green-400" />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <h2 className="text-2xl font-black text-white mb-2">
              Bem-vindo(a), {formData.owner_nome.split(' ')[0]}!
            </h2>
            <p className="text-[#8E8E93]/70 text-[13px]">
              <span className="text-white font-semibold">{formData.razao_social}</span> foi cadastrada com sucesso.
              <br />
              Você tem <strong className="text-[#D4A854]">14 dias de trial gratuito</strong>.
            </p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="flex items-center justify-center gap-2 text-[11px] text-[#8E8E93]/50"
          >
            <Loader2 className="w-3 h-3 animate-spin" />
            Preparando seu painel...
          </motion.div>
        </motion.div>
        <ToastList toasts={toasts} onDismiss={dismissToast} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-start pt-8 pb-16 px-4">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-[#D4A854]/[0.08] border border-[#D4A854]/15 flex items-center justify-center">
          <Building2 className="w-6 h-6 text-[#D4A854]" />
        </div>
        <h1 className="text-2xl font-black text-white tracking-tight">
          Cadastro de Empresa
        </h1>
        <p className="text-[#8E8E93]/60 text-[12px] mt-1">
          Preencha os dados e comece a usar em minutos
        </p>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mt-4 flex items-center gap-2 mx-auto h-9 px-4 rounded-lg border border-white/[0.10] bg-white/[0.04] text-[11px] font-bold text-[#8E8E93]/80 hover:border-white/20 hover:text-white transition-all duration-200"
          >
            <X className="w-3.5 h-3.5" /> Cancelar
          </button>
        )}
      </motion.div>

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="w-full max-w-lg relative rounded-[20px] border border-white/[0.06] bg-[#0E0F11]/85 backdrop-blur-xl shadow-[0_24px_60px_rgba(0,0,0,0.5)] overflow-hidden ring-1 ring-[#D4A854]/[0.04]"
      >
        {/* Top gold line */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#D4A854]/40 to-transparent" />

        {/* Progress bar */}
        <div className="h-1 bg-white/[0.04] relative">
          <motion.div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#D4A854]/80 to-[#D4A854]"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.4, ease: 'easeInOut' }}
          />
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.04]">
          {STEPS.map((s, i) => {
            const StepIcon = s.icon;
            const isPast = i < step;
            const isCurrent = i === step;
            return (
              <div key={i} className="flex items-center gap-2">
                <div
                  className={cn(
                    'w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-300',
                    isPast && 'bg-green-500/20 border border-green-500/30',
                    isCurrent && 'bg-[#D4A854]/10 border border-[#D4A854]/30',
                    !isPast && !isCurrent && 'bg-white/[0.04] border border-white/[0.08]',
                  )}
                >
                  {isPast ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                  ) : (
                    <StepIcon
                      className={cn(
                        'w-3.5 h-3.5',
                        isCurrent ? 'text-[#D4A854]' : 'text-[#8E8E93]/40',
                      )}
                    />
                  )}
                </div>
                <span
                  className={cn(
                    'text-[9px] font-bold uppercase tracking-[0.15em] hidden sm:block',
                    isCurrent ? 'text-[#D4A854]/90' : isPast ? 'text-green-400/70' : 'text-[#8E8E93]/40',
                  )}
                >
                  {s.label}
                </span>
                {i < STEPS.length - 1 && (
                  <ChevronRight className="w-3 h-3 text-white/[0.12] mx-1" />
                )}
              </div>
            );
          })}
        </div>

        {/* Step content */}
        <div className="p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
            >
              {/* Step title */}
              <div className="mb-5">
                <h2 className="text-[16px] font-black text-white">
                  {step === 0 && 'Dados da Empresa'}
                  {step === 1 && 'Dados do Responsável'}
                  {step === 2 && 'Configuração Inicial'}
                  {step === 3 && 'Confirmação'}
                </h2>
                <p className="text-[11px] text-[#8E8E93]/60 mt-0.5">
                  {step === 0 && 'Informe os dados cadastrais da sua empresa'}
                  {step === 1 && 'Dados do proprietário da conta'}
                  {step === 2 && 'Escolha seu plano e preferências'}
                  {step === 3 && 'Revise os dados e finalize o cadastro'}
                </p>
              </div>

              {step === 0 && (
                <StepEmpresa data={formData} errors={errors} onChange={handleChange} />
              )}
              {step === 1 && (
                <StepResponsavel data={formData} errors={errors} onChange={handleChange} />
              )}
              {step === 2 && (
                <StepConfiguracao data={formData} onChange={handleChange} />
              )}
              {step === 3 && (
                <StepConfirmacao data={formData} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <div className="px-6 pb-6 flex items-center gap-3">
          {step > 0 && (
            <button
              type="button"
              onClick={goBack}
              disabled={isSubmitting}
              className="flex items-center gap-2 h-10 px-4 rounded-lg border border-white/[0.08] bg-white/[0.03] text-[12px] font-semibold text-[#8E8E93]/80 hover:border-white/[0.15] hover:text-white transition-all duration-200 disabled:opacity-50"
            >
              <ChevronLeft className="w-4 h-4" />
              Voltar
            </button>
          )}

          <button
            type="button"
            onClick={step < STEPS.length - 1 ? goNext : handleSubmit}
            disabled={isSubmitting}
            className="flex-1 flex items-center justify-center gap-2 h-10 rounded-lg bg-gradient-to-r from-[#D4A854] to-[#B8922E] text-[12px] font-bold text-[#050505] hover:from-[#DDB868] hover:to-[#C8A040] transition-all duration-200 shadow-[0_4px_20px_rgba(212,168,84,0.25)] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : step < STEPS.length - 1 ? (
              <>
                Continuar
                <ChevronRight className="w-4 h-4" />
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Finalizar Cadastro
              </>
            )}
          </button>
        </div>

        {/* Step counter */}
        <div className="pb-4 text-center">
          <p className="text-[9.5px] text-[#8E8E93]/40">
            Etapa {step + 1} de {STEPS.length}
          </p>
        </div>
      </motion.div>

      {/* Security note */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="mt-4 flex items-center gap-2 text-[10px] text-[#8E8E93]/40"
      >
        <Shield className="w-3 h-3" />
        <span>Dados protegidos com criptografia. Nenhum cartão necessário para o trial.</span>
      </motion.div>

      <ToastList toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default CompanyRegistration;
