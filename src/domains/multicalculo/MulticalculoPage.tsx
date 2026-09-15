import React, { useState } from 'react';
import { Car, User as UserIcon, ShieldCheck, Calendar, Search, Loader2, FileText, AlertCircle, CheckCircle2 } from 'lucide-react';
import { formatCpfCnpjProgressive, detectTipoPessoa, formatPhone } from '../../lib/utils';
import { getSeguradora } from '../../lib/seguradoras';
import { InsurerService, CotacaoInput, CotacaoResultado, VeiculoTokioMarine } from '../../services/InsurerService';
import { PDFViewer } from '../../components/PDFViewer';

const Card: React.FC<{ title: string; icon: React.ElementType; children: React.ReactNode }> = ({ title, icon: Icon, children }) => (
  <div className="bg-[#111214] rounded-2xl border border-white/5 p-5 space-y-4">
    <div className="flex items-center gap-2 text-gold-deep">
      <Icon className="w-4 h-4" />
      <h3 className="text-[11px] font-black uppercase tracking-widest">{title}</h3>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>
  </div>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-1">
    <label className="text-[9px] font-black text-white/40 uppercase tracking-widest ml-1">{label}</label>
    {children}
  </div>
);

const inputCls = "w-full px-3 py-2 bg-black border border-white/10 rounded-lg text-white text-[12px] font-medium focus:border-gold-deep/40 focus:ring-2 focus:ring-gold-deep/10 transition-all";

export const MulticalculoPage: React.FC = () => {
  const [nome, setNome] = useState('');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');

  const [anoModelo, setAnoModelo] = useState('');
  const [buscaVeiculo, setBuscaVeiculo] = useState<VeiculoTokioMarine[]>([]);
  const [veiculoSelecionado, setVeiculoSelecionado] = useState<VeiculoTokioMarine | null>(null);
  const [buscandoVeiculo, setBuscandoVeiculo] = useState(false);
  const [zeroKm, setZeroKm] = useState(false);
  const [valorVeiculo, setValorVeiculo] = useState('');
  const [cep, setCep] = useState('');
  const [placa, setPlaca] = useState('');
  const [chassi, setChassi] = useState('');

  const [classeBonus, setClasseBonus] = useState('0');
  const [tipoSeguro, setTipoSeguro] = useState<'1' | '6' | '7'>('1');
  const [tipoAssistencia, setTipoAssistencia] = useState<'N' | 'C' | 'V'>('C');
  const [isencaoFiscal, setIsencaoFiscal] = useState('24747');
  const [codigoCobertura, setCodigoCobertura] = useState('1');
  const [tipoModalidade, setTipoModalidade] = useState('A');
  const [codigoFranquia, setCodigoFranquia] = useState('1');

  const [inicioVigencia, setInicioVigencia] = useState('');
  const [fimVigencia, setFimVigencia] = useState('');

  const [cotando, setCotando] = useState(false);
  const [resultados, setResultados] = useState<CotacaoResultado[] | null>(null);
  const [erroGeral, setErroGeral] = useState('');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const tipoPessoa = detectTipoPessoa(cpfCnpj.replace(/\D/g, ''));

  const buscarVeiculos = async () => {
    if (!anoModelo) return;
    setBuscandoVeiculo(true);
    try {
      const { veiculos } = await InsurerService.buscarVeiculos(anoModelo);
      setBuscaVeiculo(veiculos);
    } catch (err: any) {
      setErroGeral(err.message);
    } finally {
      setBuscandoVeiculo(false);
    }
  };

  const dataParaTM = (iso: string) => {
    if (!iso) return '';
    const [ano, mes, dia] = iso.split('-');
    return `${dia}/${mes}/${ano}`;
  };

  const cotar = async () => {
    if (!veiculoSelecionado) { setErroGeral('Selecione um veículo antes de cotar'); return; }
    setCotando(true);
    setErroGeral('');
    setResultados(null);
    try {
      const input: CotacaoInput = {
        segurado: { nome, cpfCnpj: cpfCnpj.replace(/\D/g, ''), tipoPessoa, telefone: telefone.replace(/\D/g, ''), email },
        veiculo: {
          idVeiculoTokio: veiculoSelecionado.idVeiculo, anoModelo: Number(anoModelo), zeroKm,
          valorVeiculo: Number(valorVeiculo), cep: cep.replace(/\D/g, ''), placa, chassi,
        },
        cobertura: {
          classeBonus: Number(classeBonus), tipoSeguro, tipoAssistencia, isencaoFiscal,
          codigoCobertura, tipoModalidade, codigoFranquia,
        },
        vigencia: { inicio: dataParaTM(inicioVigencia), fim: dataParaTM(fimVigencia) },
      };
      const result = await InsurerService.cotar(input);
      setResultados(result);
    } catch (err: any) {
      setErroGeral(err.message);
    } finally {
      setCotando(false);
    }
  };

  const verPdf = async (numeroCalculo: string) => {
    const { pdf } = await InsurerService.buscarPdf(numeroCalculo);
    setPdfUrl(`data:application/pdf;base64,${pdf}`);
  };

  return (
    <div className="p-6 space-y-5 max-w-4xl mx-auto">
      <h1 className="text-lg font-bold text-white uppercase tracking-tight">Multicálculo</h1>

      <Card title="Segurado" icon={UserIcon}>
        <Field label="Nome Completo"><input className={inputCls} value={nome} onChange={(e) => setNome(e.target.value)} /></Field>
        <Field label="CPF/CNPJ"><input className={inputCls} value={cpfCnpj} onChange={(e) => setCpfCnpj(formatCpfCnpjProgressive(e.target.value))} /></Field>
        <Field label="Telefone"><input className={inputCls} value={telefone} onChange={(e) => setTelefone(formatPhone(e.target.value))} /></Field>
        <Field label="E-mail"><input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      </Card>

      <Card title="Veículo" icon={Car}>
        <Field label="Ano Modelo">
          <div className="flex gap-2">
            <input className={inputCls} value={anoModelo} onChange={(e) => setAnoModelo(e.target.value)} placeholder="2023" />
            <button type="button" onClick={buscarVeiculos} disabled={buscandoVeiculo} className="px-3 bg-gold-deep text-brand-dark rounded-lg shrink-0">
              {buscandoVeiculo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </button>
          </div>
        </Field>
        <Field label="Veículo">
          <select className={inputCls} value={veiculoSelecionado?.idVeiculo ?? ''} onChange={(e) => setVeiculoSelecionado(buscaVeiculo.find((v) => v.idVeiculo === Number(e.target.value)) ?? null)}>
            <option value="">Busque pelo ano modelo…</option>
            {buscaVeiculo.map((v) => (
              <option key={v.idVeiculo} value={v.idVeiculo}>{v.descricaoFabricante} {v.descricaoModelo} ({v.tipoCombustivel})</option>
            ))}
          </select>
        </Field>
        <Field label="Zero KM">
          <select className={inputCls} value={zeroKm ? 'S' : 'N'} onChange={(e) => setZeroKm(e.target.value === 'S')}>
            <option value="N">Não</option><option value="S">Sim</option>
          </select>
        </Field>
        <Field label="Valor do Veículo (R$)"><input className={inputCls} value={valorVeiculo} onChange={(e) => setValorVeiculo(e.target.value)} /></Field>
        <Field label="CEP"><input className={inputCls} value={cep} onChange={(e) => setCep(e.target.value)} /></Field>
        <Field label="Placa"><input className={inputCls} value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())} /></Field>
        <Field label="Chassi"><input className={inputCls} value={chassi} onChange={(e) => setChassi(e.target.value.toUpperCase())} /></Field>
      </Card>

      <Card title="Cobertura" icon={ShieldCheck}>
        <Field label="Classe Bônus"><input className={inputCls} value={classeBonus} onChange={(e) => setClasseBonus(e.target.value)} /></Field>
        <Field label="Tipo de Seguro">
          <select className={inputCls} value={tipoSeguro} onChange={(e) => setTipoSeguro(e.target.value as any)}>
            <option value="1">Novo</option><option value="6">Renovação Congênere</option><option value="7">Renovação Tokio</option>
          </select>
        </Field>
        <Field label="Assistência">
          <select className={inputCls} value={tipoAssistencia} onChange={(e) => setTipoAssistencia(e.target.value as any)}>
            <option value="N">Não possui</option><option value="C">Completa</option><option value="V">VIP</option>
          </select>
        </Field>
        <Field label="Isenção Fiscal">
          <select className={inputCls} value={isencaoFiscal} onChange={(e) => setIsencaoFiscal(e.target.value)}>
            <option value="24747">Não</option><option value="24748">Sim — PCD</option><option value="24749">Sim — exceto PCD</option>
          </select>
        </Field>
        <Field label="Tipo de Cobertura">
          <select className={inputCls} value={codigoCobertura} onChange={(e) => setCodigoCobertura(e.target.value)}>
            <option value="1">Compreensiva</option><option value="2">Incêndio e Roubo</option><option value="3">RCF-V</option>
            <option value="4">Colisão e Incêndio</option><option value="5">Indenização Integral</option><option value="6">Assistência Exclusiva</option>
          </select>
        </Field>
        {codigoCobertura !== '3' && codigoCobertura !== '6' && (
          <Field label="Tipo de Modalidade">
            <select className={inputCls} value={tipoModalidade} onChange={(e) => setTipoModalidade(e.target.value)}>
              <option value="A">Valor Ajustável</option><option value="D">Valor Determinado</option>
            </select>
          </Field>
        )}
        {codigoCobertura !== '3' && codigoCobertura !== '5' && (
          <Field label="Franquia">
            <select className={inputCls} value={codigoFranquia} onChange={(e) => setCodigoFranquia(e.target.value)}>
              <option value="1">Básica</option><option value="4">50% da Básica</option><option value="6">25% da Básica</option>
              <option value="7">75% da Básica</option><option value="2">150% da Básica</option><option value="3">200% da Básica</option>
            </select>
          </Field>
        )}
      </Card>

      <Card title="Vigência" icon={Calendar}>
        <Field label="Início"><input type="date" className={inputCls} value={inicioVigencia} onChange={(e) => setInicioVigencia(e.target.value)} /></Field>
        <Field label="Fim"><input type="date" className={inputCls} value={fimVigencia} onChange={(e) => setFimVigencia(e.target.value)} /></Field>
      </Card>

      {erroGeral && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-2 text-red-300 text-[12px]">
          <AlertCircle className="w-4 h-4 shrink-0" /> {erroGeral}
        </div>
      )}

      <button
        type="button"
        onClick={cotar}
        disabled={cotando || !veiculoSelecionado}
        className="w-full py-3 bg-gold-deep text-brand-dark rounded-xl font-black uppercase tracking-widest text-[12px] disabled:opacity-40"
      >
        {cotando ? 'Cotando...' : 'Cotar'}
      </button>

      {resultados && (
        <div className="space-y-3">
          {resultados.map((r) => {
            const seguradora = getSeguradora(r.providerId);
            return (
              <div key={r.providerId} className="bg-[#111214] rounded-2xl border border-white/5 p-5">
                <div className="flex items-center gap-2 mb-3" style={{ color: seguradora?.cor }}>
                  <ShieldCheck className="w-4 h-4" />
                  <h3 className="text-[12px] font-black uppercase tracking-widest">{seguradora?.nome ?? r.providerId}</h3>
                </div>
                {!r.ok ? (
                  <div className="flex items-center gap-2 text-red-300 text-[12px]"><AlertCircle className="w-4 h-4" /> {r.erro}</div>
                ) : (
                  r.itens?.[0]?.modalidades.map((m) => (
                    <div key={m.codigoModalidade} className="border-t border-white/5 pt-3 mt-3 first:border-0 first:mt-0 first:pt-0">
                      <div className="flex items-center justify-between">
                        <p className="text-white font-bold text-[13px]">{m.descricaoModalidade}</p>
                        <p className="text-gold-deep font-black text-[15px]">R$ {m.premioLiquido.toFixed(2)}</p>
                      </div>
                      <button type="button" onClick={() => verPdf(r.itens![0].numeroCalculo)} className="mt-2 flex items-center gap-1.5 text-[10px] font-black uppercase text-white/50 hover:text-gold-deep transition-colors">
                        <FileText className="w-3.5 h-3.5" /> Ver PDF
                      </button>
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </div>
      )}

      {pdfUrl && <PDFViewer url={pdfUrl} title="Cotação Tokio Marine" onClose={() => setPdfUrl(null)} />}
    </div>
  );
};
