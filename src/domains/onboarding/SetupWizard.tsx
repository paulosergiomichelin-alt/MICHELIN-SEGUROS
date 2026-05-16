import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Building2, Car, Home, Smile, ChevronRight, ChevronLeft,
  Check, Sparkles, User, MessageSquare, Briefcase, Zap,
  ToggleLeft, ToggleRight, Loader2, RefreshCw,
} from 'lucide-react';
import { templateService } from '../../services/TemplateService';
import { AgentTemplate, WizardState, BusinessContext, AgentPersona, BusinessSegment } from '../../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SetupWizardProps {
  organizationId: string;
  organizationName: string;
  openrouterApiKey?: string;
  updatedBy: string;
  onComplete: () => void;
}

interface WizardData {
  segment: BusinessSegment | null;
  templateId: string | null;
  persona: Partial<AgentPersona>;
  businessContext: Partial<BusinessContext>;
  tone: string;
}

// ─── Segment cards data ───────────────────────────────────────────────────────

const SEGMENT_OPTIONS = [
  {
    id: 'corretora_seguros' as BusinessSegment,
    label: 'Corretora de Seguros',
    icon: Car,
    color: 'from-blue-500/20 to-blue-600/10 border-blue-500/30',
    iconColor: 'text-blue-400',
    description: 'Venda consultiva de seguros auto, vida e residencial via WhatsApp.',
  },
  {
    id: 'imobiliaria' as BusinessSegment,
    label: 'Imobiliária',
    icon: Home,
    color: 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/30',
    iconColor: 'text-emerald-400',
    description: 'Captação e qualificação de leads para compra, venda e aluguel de imóveis.',
  },
  {
    id: 'clinica_odontologica' as BusinessSegment,
    label: 'Clínica Odontológica',
    icon: Smile,
    color: 'from-violet-500/20 to-violet-600/10 border-violet-500/30',
    iconColor: 'text-violet-400',
    description: 'Agendamento de consultas e qualificação de pacientes para tratamentos.',
  },
  {
    id: 'concessionaria' as BusinessSegment,
    label: 'Concessionária',
    icon: Building2,
    color: 'from-amber-500/20 to-amber-600/10 border-amber-500/30',
    iconColor: 'text-amber-400',
    description: 'Qualificação de leads para compra de veículos e agendamento de test drive.',
  },
];

const TONE_OPTIONS = [
  { value: 'muito amigável e descontraído', label: 'Descontraído' },
  { value: 'amigável, consultivo e direto', label: 'Amigável' },
  { value: 'profissional e objetivo', label: 'Profissional' },
  { value: 'formal e respeitoso', label: 'Formal' },
];

// ─── Confetti component ───────────────────────────────────────────────────────

function Confetti() {
  const colors = ['#CFA764', '#60A5FA', '#34D399', '#A78BFA', '#F87171', '#FBBF24'];
  const pieces = Array.from({ length: 40 });

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden z-50">
      {pieces.map((_, i) => {
        const color = colors[i % colors.length];
        const left = `${Math.random() * 100}%`;
        const delay = `${Math.random() * 1.5}s`;
        const duration = `${1.5 + Math.random() * 2}s`;
        const size = `${6 + Math.random() * 8}px`;
        return (
          <div
            key={i}
            className="absolute top-0 animate-confetti-fall"
            style={{
              left,
              width: size,
              height: size,
              backgroundColor: color,
              borderRadius: Math.random() > 0.5 ? '50%' : '0',
              animationDelay: delay,
              animationDuration: duration,
              opacity: 0,
            }}
          />
        );
      })}
    </div>
  );
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`rounded-full transition-all duration-300 ${
            i < current
              ? 'w-6 h-2 bg-gold-deep'
              : i === current
              ? 'w-6 h-2 bg-gold-deep/70'
              : 'w-2 h-2 bg-white/20'
          }`}
        />
      ))}
    </div>
  );
}

// ─── Main wizard ─────────────────────────────────────────────────────────────

export function SetupWizard({ organizationId, organizationName, openrouterApiKey, updatedBy, onComplete }: SetupWizardProps) {
  const [step, setStep] = useState(0);
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [data, setData] = useState<WizardData>({
    segment: null,
    templateId: null,
    persona: { name: 'Ana', role: 'Consultora', usesFormalTreatment: false },
    businessContext: {},
    tone: 'amigável, consultivo e direto',
  });
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [previewText, setPreviewText] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentTemplate = templates.find(t => t.id === data.templateId) ?? null;

  useEffect(() => {
    templateService.listTemplates().then(setTemplates);
  }, []);

  // ── Save wizard state after each step ──
  const saveProgress = useCallback(async (partial: Partial<WizardData>, nextStep: number) => {
    const merged = { ...data, ...partial };
    const state: Partial<WizardState> = {
      currentStep: nextStep,
      segment: merged.segment ?? undefined,
      templateId: merged.templateId ?? undefined,
      persona: merged.persona,
      businessContext: merged.businessContext,
      tone: merged.tone,
      completed: false,
      lastSavedStep: nextStep,
    };
    try {
      await templateService.saveWizardState(organizationId, state);
    } catch (_) {}
  }, [data, organizationId]);

  // ── Step 1: segment selection ──
  const handleSelectSegment = async (seg: BusinessSegment) => {
    const tpl = templates.find(t => t.segment === seg);
    if (!tpl) return;
    const partial = {
      segment: seg,
      templateId: tpl.id,
      persona: { ...tpl.defaultPersona },
    };
    setData(prev => ({ ...prev, ...partial }));
    await saveProgress(partial, 1);
    setStep(1);
  };

  // ── Step 4: LLM preview debounce ──
  useEffect(() => {
    if (step !== 3 || !openrouterApiKey) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoadingPreview(true);
      try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openrouterApiKey}` },
          body: JSON.stringify({
            model: 'openai/gpt-4o-mini',
            max_tokens: 80,
            temperature: 0.8,
            messages: [
              {
                role: 'system',
                content: `Você é ${data.persona.name ?? 'Ana'}, ${data.persona.role ?? 'Consultora'} da ${organizationName}. Tom: ${data.tone}. Responda em até 2 linhas, de forma natural.`,
              },
              { role: 'user', content: 'Olá, quero saber mais sobre os serviços de vocês.' },
            ],
          }),
        });
        const json = await res.json();
        setPreviewText(json.choices?.[0]?.message?.content ?? '');
      } catch (_) {
        setPreviewText('');
      } finally {
        setLoadingPreview(false);
      }
    }, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [step, data.persona.name, data.persona.role, data.tone, openrouterApiKey, organizationName]);

  // ── Final activation ──
  const handleActivate = async () => {
    if (!data.templateId || !data.segment) return;
    setSaving(true);
    try {
      await templateService.applyTemplate(
        organizationId,
        data.templateId,
        data.businessContext as BusinessContext,
        updatedBy
      );
      await templateService.completeOnboarding(organizationId, updatedBy);
      setDone(true);
      setTimeout(onComplete, 2800);
    } catch (err) {
      console.error('SetupWizard activation failed', err);
    } finally {
      setSaving(false);
    }
  };

  const next = async (partial?: Partial<WizardData>) => {
    if (partial) setData(prev => ({ ...prev, ...partial }));
    await saveProgress(partial ?? {}, step + 1);
    setStep(s => s + 1);
  };

  const back = () => setStep(s => Math.max(0, s - 1));

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-brand-dark flex items-center justify-center p-4">
      {done && <Confetti />}

      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Zap className="w-5 h-5 text-gold-deep" />
            <span className="text-gold-deep font-semibold tracking-wider text-sm uppercase">Configuração do Agente IA</span>
          </div>
          <StepDots current={step} total={5} />
        </div>

        {/* Step 0 — Segment */}
        {step === 0 && (
          <div className="space-y-4">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-white mb-2">Qual é o seu segmento?</h1>
              <p className="text-white/50 text-sm">Escolha o modelo de agente mais adequado para o seu negócio.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {SEGMENT_OPTIONS.map(opt => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.id}
                    onClick={() => handleSelectSegment(opt.id)}
                    className={`bg-gradient-to-br ${opt.color} border rounded-xl p-5 text-left hover:scale-[1.02] transition-all duration-200 group`}
                  >
                    <Icon className={`w-8 h-8 ${opt.iconColor} mb-3`} />
                    <h3 className="text-white font-semibold mb-1">{opt.label}</h3>
                    <p className="text-white/50 text-xs leading-relaxed">{opt.description}</p>
                    <ChevronRight className="w-4 h-4 text-white/30 mt-3 group-hover:text-white/60 transition-colors" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 1 — Agent identity */}
        {step === 1 && (
          <div className="space-y-5">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-white mb-2">Identidade do Agente</h1>
              <p className="text-white/50 text-sm">Como seu agente vai se apresentar para os clientes?</p>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
              <div>
                <label className="block text-white/70 text-xs uppercase tracking-wider mb-2">Nome do agente</label>
                <input
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-deep/50"
                  value={data.persona.name ?? ''}
                  onChange={e => setData(prev => ({ ...prev, persona: { ...prev.persona, name: e.target.value } }))}
                  placeholder="Ex: Ana, Sofia, Rafael..."
                />
              </div>

              <div>
                <label className="block text-white/70 text-xs uppercase tracking-wider mb-2">Cargo / Função</label>
                <input
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-deep/50"
                  value={data.persona.role ?? ''}
                  onChange={e => setData(prev => ({ ...prev, persona: { ...prev.persona, role: e.target.value } }))}
                  placeholder="Ex: Consultora de Seguros, Agente Imobiliário..."
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/80 text-sm font-medium">Tratamento formal</p>
                  <p className="text-white/40 text-xs">Usar "Senhor/Senhora" em vez do nome</p>
                </div>
                <button
                  onClick={() => setData(prev => ({ ...prev, persona: { ...prev.persona, usesFormalTreatment: !prev.persona.usesFormalTreatment } }))}
                  className="text-gold-deep"
                >
                  {data.persona.usesFormalTreatment ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8 text-white/30" />}
                </button>
              </div>
            </div>

            {/* Live preview bubble */}
            <div className="bg-white/3 border border-white/5 rounded-xl p-4">
              <p className="text-white/40 text-xs uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <MessageSquare className="w-3 h-3" /> Prévia
              </p>
              <div className="flex gap-2">
                <div className="w-7 h-7 rounded-full bg-gold-deep/20 flex items-center justify-center text-gold-deep text-xs font-bold flex-shrink-0">
                  {(data.persona.name ?? 'A')[0]}
                </div>
                <div className="bg-white/10 rounded-xl rounded-tl-none px-3 py-2 text-white/80 text-sm max-w-xs">
                  Olá{data.persona.usesFormalTreatment ? ', Senhor(a)' : ''}! Sou {data.persona.name ?? 'Ana'}, {data.persona.role ?? 'Consultora'} da {organizationName}. Como posso te ajudar?
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={back} className="flex items-center gap-2 px-4 py-2 text-white/50 hover:text-white text-sm transition-colors">
                <ChevronLeft className="w-4 h-4" /> Voltar
              </button>
              <button
                onClick={() => next()}
                disabled={!data.persona.name || !data.persona.role}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gold-deep text-black font-semibold rounded-xl hover:bg-gold-deep/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                Continuar <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — Business context */}
        {step === 2 && currentTemplate && (
          <div className="space-y-5">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-white mb-2">Contexto do Negócio</h1>
              <p className="text-white/50 text-sm">Essas informações serão usadas pelo agente para atender melhor seus clientes.</p>
            </div>

            <div className="space-y-5">
              {currentTemplate.wizardQuestions.map(q => (
                <div key={q.id} className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <label className="block text-white/80 text-sm font-medium mb-1">{q.label}</label>
                  {q.helpText && <p className="text-white/40 text-xs mb-3">{q.helpText}</p>}

                  {q.type === 'multiselect' && (
                    <div className="flex flex-wrap gap-2">
                      {(q.options ?? []).map(opt => {
                        const arr = ((data.businessContext as any)[q.contextKey] ?? []) as string[];
                        const selected = arr.includes(opt);
                        return (
                          <button
                            key={opt}
                            onClick={() => {
                              const cur = arr;
                              const next = selected ? cur.filter(v => v !== opt) : [...cur, opt];
                              setData(prev => ({
                                ...prev,
                                businessContext: { ...prev.businessContext, [q.contextKey]: next },
                              }));
                            }}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                              selected
                                ? 'bg-gold-deep/20 border-gold-deep/50 text-gold-deep'
                                : 'bg-white/5 border-white/10 text-white/50 hover:text-white hover:border-white/30'
                            }`}
                          >
                            {selected && <span className="mr-1">✓</span>}{opt}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {(q.type === 'text' || q.type === 'select') && (
                    <input
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-deep/50"
                      value={((data.businessContext as any)[q.contextKey] ?? '') as string}
                      onChange={e => setData(prev => ({
                        ...prev,
                        businessContext: { ...prev.businessContext, [q.contextKey]: e.target.value },
                      }))}
                      placeholder={q.placeholder ?? ''}
                    />
                  )}

                  {q.type === 'textarea' && (
                    <textarea
                      rows={3}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-deep/50 resize-none"
                      value={((data.businessContext as any)[q.contextKey] ?? '') as string}
                      onChange={e => setData(prev => ({
                        ...prev,
                        businessContext: { ...prev.businessContext, [q.contextKey]: e.target.value },
                      }))}
                      placeholder={q.placeholder ?? ''}
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button onClick={back} className="flex items-center gap-2 px-4 py-2 text-white/50 hover:text-white text-sm transition-colors">
                <ChevronLeft className="w-4 h-4" /> Voltar
              </button>
              <button
                onClick={() => next()}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gold-deep text-black font-semibold rounded-xl hover:bg-gold-deep/90 transition-all"
              >
                Continuar <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — Tone */}
        {step === 3 && (
          <div className="space-y-5">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-white mb-2">Tom de Comunicação</h1>
              <p className="text-white/50 text-sm">Como o agente deve se comunicar com seus clientes?</p>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <div className="grid grid-cols-2 gap-2">
                {TONE_OPTIONS.map(t => (
                  <button
                    key={t.value}
                    onClick={() => setData(prev => ({ ...prev, tone: t.value, persona: { ...prev.persona, tone: t.value } }))}
                    className={`px-4 py-3 rounded-xl text-sm font-medium border transition-all ${
                      data.tone === t.value
                        ? 'bg-gold-deep/20 border-gold-deep/50 text-gold-deep'
                        : 'bg-white/5 border-white/10 text-white/60 hover:text-white hover:border-white/30'
                    }`}
                  >
                    {data.tone === t.value && <Check className="w-3 h-3 inline mr-1" />}
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Live preview */}
            <div className="bg-white/3 border border-white/5 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-white/40 text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3" /> Prévia ao vivo
                </p>
                {openrouterApiKey && (
                  <button
                    onClick={() => setData(prev => ({ ...prev, tone: prev.tone }))}
                    className="text-white/30 hover:text-white/60 transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex justify-end">
                  <div className="bg-gold-deep/10 border border-gold-deep/20 rounded-xl rounded-tr-none px-3 py-2 text-white/70 text-sm max-w-xs">
                    Olá, quero saber mais sobre os serviços de vocês.
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="w-7 h-7 rounded-full bg-gold-deep/20 flex items-center justify-center text-gold-deep text-xs font-bold flex-shrink-0">
                    {(data.persona.name ?? 'A')[0]}
                  </div>
                  <div className="bg-white/10 rounded-xl rounded-tl-none px-3 py-2 text-white/80 text-sm max-w-xs min-h-[40px] flex items-center">
                    {loadingPreview ? (
                      <Loader2 className="w-4 h-4 animate-spin text-gold-deep/50" />
                    ) : previewText ? (
                      previewText
                    ) : (
                      <span className="text-white/30 text-xs italic">
                        {openrouterApiKey ? 'Gerando prévia…' : 'Configure uma API key para ver prévia ao vivo.'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={back} className="flex items-center gap-2 px-4 py-2 text-white/50 hover:text-white text-sm transition-colors">
                <ChevronLeft className="w-4 h-4" /> Voltar
              </button>
              <button
                onClick={() => next({ persona: { ...data.persona, tone: data.tone } })}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gold-deep text-black font-semibold rounded-xl hover:bg-gold-deep/90 transition-all"
              >
                Continuar <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 4 — Review + Activate */}
        {step === 4 && (
          <div className="space-y-5">
            {done ? (
              <div className="text-center py-12">
                <div className="w-20 h-20 rounded-full bg-gold-deep/20 flex items-center justify-center mx-auto mb-4">
                  <Check className="w-10 h-10 text-gold-deep" />
                </div>
                <h1 className="text-2xl font-bold text-white mb-2">Agente ativado!</h1>
                <p className="text-white/50 text-sm">Redirecionando para o painel…</p>
              </div>
            ) : (
              <>
                <div className="text-center mb-6">
                  <h1 className="text-2xl font-bold text-white mb-2">Revisão Final</h1>
                  <p className="text-white/50 text-sm">Confirme as configurações antes de ativar o agente.</p>
                </div>

                <div className="space-y-3">
                  <ReviewRow icon={Briefcase} label="Segmento" value={SEGMENT_OPTIONS.find(s => s.id === data.segment)?.label ?? '-'} />
                  <ReviewRow icon={User} label="Agente" value={`${data.persona.name} — ${data.persona.role}`} />
                  <ReviewRow icon={MessageSquare} label="Tom" value={TONE_OPTIONS.find(t => t.value === data.tone)?.label ?? data.tone} />
                  {data.businessContext.insurers?.length && (
                    <ReviewRow icon={Building2} label="Seguradoras" value={data.businessContext.insurers.join(', ')} />
                  )}
                  {data.businessContext.propertyTypes?.length && (
                    <ReviewRow icon={Home} label="Imóveis" value={data.businessContext.propertyTypes.join(', ')} />
                  )}
                  {data.businessContext.specialties?.length && (
                    <ReviewRow icon={Smile} label="Especialidades" value={data.businessContext.specialties.join(', ')} />
                  )}
                  {data.businessContext.brands?.length && (
                    <ReviewRow icon={Car} label="Marcas" value={data.businessContext.brands.join(', ')} />
                  )}
                  {data.businessContext.workingHours && (
                    <ReviewRow icon={Zap} label="Horário" value={data.businessContext.workingHours} />
                  )}
                </div>

                <div className="flex gap-3 pt-2">
                  <button onClick={back} className="flex items-center gap-2 px-4 py-2 text-white/50 hover:text-white text-sm transition-colors">
                    <ChevronLeft className="w-4 h-4" /> Voltar
                  </button>
                  <button
                    onClick={handleActivate}
                    disabled={saving}
                    className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gold-deep text-black font-bold rounded-xl hover:bg-gold-deep/90 disabled:opacity-60 disabled:cursor-not-allowed transition-all text-base"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    {saving ? 'Ativando…' : 'Ativar Agente'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes confetti-fall {
          0%   { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        .animate-confetti-fall { animation: confetti-fall linear forwards; }
      `}</style>
    </div>
  );
}

function ReviewRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
      <Icon className="w-4 h-4 text-gold-deep mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-white/40 text-xs uppercase tracking-wider">{label}</p>
        <p className="text-white text-sm font-medium truncate">{value}</p>
      </div>
    </div>
  );
}
