import React, { useState, useEffect } from 'react';
import {
  Car, User as UserIcon, ShieldCheck, Search, Loader2, FileText, AlertCircle,
  HeartPulse, RefreshCw, UserCheck, Info, Wrench, History, ChevronUp, ChevronDown,
  ClipboardList, Trash2, Save,
} from 'lucide-react';
import { formatCpfCnpjProgressive, detectTipoPessoa, formatPhone } from '../../lib/utils';
import { getSeguradora, SEGURADORAS } from '../../lib/seguradoras';
import { InsurerService, CotacaoInput, CotacaoResultado, VeiculoTokioMarine } from '../../services/InsurerService';
import { PDFViewer } from '../../components/PDFViewer';
import { dataApiClient } from '../../lib/dataApiClient';
import { PacotesCobertura, ENTITY_ID_PACOTES } from '../settings/PacotesCoberturaSettings';

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

function somaUmAno(iso: string) {
  if (!iso) return '';
  const [ano, mes, dia] = iso.split('-').map(Number);
  const d = new Date(ano + 1, mes - 1, dia);
  return d.toISOString().slice(0, 10);
}

// Campos marcados com (*) no comentário existem no formulário só pra bater com o
// layout do Agger — a API da Tokio Marine não tem esse dado no `cotar` (confirmado
// contra a doc oficial), então ficam guardados só localmente e não são enviados.

const Card: React.FC<{ title: string; icon: React.ElementType; children: React.ReactNode; action?: React.ReactNode; collapsible?: boolean }> = ({ title, icon: Icon, children, action, collapsible }) => {
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-800">
          <Icon className="w-4 h-4 text-gold-deep" />
          <h3 className="text-[11px] font-black uppercase tracking-widest">{title}</h3>
        </div>
        <div className="flex items-center gap-3">
          {action}
          {collapsible && (
            <button type="button" onClick={() => setOpen((o) => !o)} className="text-slate-400 hover:text-slate-700 transition-colors">
              {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>
      {open && <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>}
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode; required?: boolean }> = ({ label, children, required }) => (
  <div className="space-y-1">
    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">
      {label}{required && <span className="text-[#C0392B] ml-0.5">*</span>}
    </label>
    {children}
  </div>
);

const inputCls = "w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-[12px] font-medium focus:border-gold-deep/60 focus:ring-2 focus:ring-gold-deep/15 transition-all placeholder:text-slate-300";
const boolOptions = (
  <>
    <option value="N">Não</option>
    <option value="S">Sim</option>
  </>
);

export const MulticalculoPage: React.FC = () => {
  // Segurado
  const [nome, setNome] = useState('');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [dataNascimento, setDataNascimento] = useState(''); // (*) sem campo na Tokio
  const [sexo, setSexo] = useState(''); // (*)
  const [estadoCivilSegurado, setEstadoCivilSegurado] = useState(''); // (*)
  const [cepResidencial, setCepResidencial] = useState(''); // (*)
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');

  // Veículo
  const [anoFabricacao, setAnoFabricacao] = useState(''); // (*) Tokio só tem Ano Modelo
  const [anoModelo, setAnoModelo] = useState('');
  const [buscaVeiculo, setBuscaVeiculo] = useState<VeiculoTokioMarine[]>([]);
  const [veiculoSelecionado, setVeiculoSelecionado] = useState<VeiculoTokioMarine | null>(null);
  const [buscandoVeiculo, setBuscandoVeiculo] = useState(false);
  const [zeroKm, setZeroKm] = useState(false);
  const [valorVeiculo, setValorVeiculo] = useState('');
  const [percentualAjuste, setPercentualAjuste] = useState('');
  const [placa, setPlaca] = useState('');
  const [chassi, setChassi] = useState('');

  // Informações complementares
  const [cepPernoite, setCepPernoite] = useState('');
  const [rastreador, setRastreador] = useState('N'); // (*)
  const [dispositivoAntiFurto, setDispositivoAntiFurto] = useState('N'); // (*)
  const [blindado, setBlindado] = useState(false);
  const [lmiBlindagem, setLmiBlindagem] = useState('');
  const [kitGas, setKitGas] = useState(false);
  const [lmiKitGas, setLmiKitGas] = useState('');
  const [alienado, setAlienado] = useState('N'); // (*)

  // Condutor
  const [nomeCondutor, setNomeCondutor] = useState('');
  const [cpfCondutor, setCpfCondutor] = useState('');
  const [dataNascimentoCondutor, setDataNascimentoCondutor] = useState(''); // (*)
  const [sexoCondutor, setSexoCondutor] = useState(''); // (*)
  const [estadoCivilCondutor, setEstadoCivilCondutor] = useState('');
  const [tempoHabilitacao, setTempoHabilitacao] = useState(''); // (*)
  const [principalCondutor, setPrincipalCondutor] = useState('Próprio');

  // Condutor "Próprio" é o próprio segurado — copia os dados automaticamente e mantém
  // os campos travados enquanto essa opção estiver selecionada, pra não divergir do segurado.
  const condutorIsProprio = principalCondutor === 'Próprio';
  useEffect(() => {
    if (!condutorIsProprio) return;
    setNomeCondutor(nome);
    setCpfCondutor(cpfCnpj);
    setDataNascimentoCondutor(dataNascimento);
    setSexoCondutor(sexo);
    setEstadoCivilCondutor(estadoCivilSegurado);
  }, [condutorIsProprio, nome, cpfCnpj, dataNascimento, sexo, estadoCivilSegurado]);

  // Questionário
  const [garagemResidencia, setGaragemResidencia] = useState('');
  const [garagemTrabalho, setGaragemTrabalho] = useState(''); // (*)
  const [garagemEstudo, setGaragemEstudo] = useState(''); // (*)
  const [tipoDeUso, setTipoDeUso] = useState(''); // (*)
  const [jovemCondutor, setJovemCondutor] = useState('');
  const [idadeMaisNovo, setIdadeMaisNovo] = useState(''); // (*)
  const [sexoJovens, setSexoJovens] = useState(''); // (*)
  const [tipoResidencia, setTipoResidencia] = useState(''); // (*)
  const [quilometragem, setQuilometragem] = useState(''); // (*)
  const [pcd, setPcd] = useState('N'); // já coberto por isencaoFiscal na Tokio, mantido separado só visualmente
  const [isencaoFiscal, setIsencaoFiscal] = useState('24747');

  // Cobertura
  const [pacoteCoberturas, setPacoteCoberturas] = useState('Prata'); // (*)
  const [codigoCobertura, setCodigoCobertura] = useState('1');
  const [codigoFranquia, setCodigoFranquia] = useState('1');
  const [percentualFranquia, setPercentualFranquia] = useState('100'); // (*)
  const [tipoModalidade, setTipoModalidade] = useState('A');
  const [codigoFranquiaIntegral, setCodigoFranquiaIntegral] = useState('');
  const [classeBonus, setClasseBonus] = useState('0');

  // RCF / APP
  const [danosMateriais, setDanosMateriais] = useState('');
  const [danosCorporais, setDanosCorporais] = useState('');
  const [danosMorais, setDanosMorais] = useState('');
  const [appMorteInvalidez, setAppMorteInvalidez] = useState('');

  // Serviços
  const [tipoAssistencia, setTipoAssistencia] = useState<'N' | 'C' | 'V'>('C');
  const [vidros, setVidros] = useState('Básico'); // (*)
  const [carroReserva, setCarroReserva] = useState('Básico 7 dias'); // (*)
  const [carroReservaAr, setCarroReservaAr] = useState('N'); // (*)

  // Vigência / Renovação — início pré-preenchido com hoje, fim com a mesma data no ano
  // seguinte; toda vez que o início muda, o fim é recalculado automaticamente.
  const [inicioVigencia, setInicioVigenciaState] = useState(hojeISO());
  const [fimVigencia, setFimVigencia] = useState(somaUmAno(hojeISO()));
  const setInicioVigencia = (v: string) => {
    setInicioVigenciaState(v);
    setFimVigencia(somaUmAno(v));
  };
  const [tipoSeguro, setTipoSeguro] = useState<'1' | '6' | '7'>('1');
  const [codigoInterno, setCodigoInterno] = useState(''); // (*)
  const [quantidadeSinistros, setQuantidadeSinistros] = useState(''); // (*)
  const [codigoSeguradoraAnterior, setCodigoSeguradoraAnterior] = useState('');
  const [numeroApoliceAnterior, setNumeroApoliceAnterior] = useState('');
  const [dataVencimentoApoliceAnterior, setDataVencimentoApoliceAnterior] = useState('');

  const [cotando, setCotando] = useState(false);
  const [resultados, setResultados] = useState<CotacaoResultado[] | null>(null);
  const [erroGeral, setErroGeral] = useState('');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  // Pacotes de cobertura pré-cadastrados em Configurações > Multicálculo — ao trocar o
  // pacote abaixo, aplica de uma vez Tipo de Cobertura, Franquia, Modalidade, RCF/APP e Serviços.
  const [pacotesConfig, setPacotesConfig] = useState<PacotesCobertura | null>(null);
  useEffect(() => {
    dataApiClient.get('settings', ENTITY_ID_PACOTES).then((row: any) => setPacotesConfig(row ?? null)).catch(() => {});
  }, []);

  const handlePacoteChange = (nome: string) => {
    setPacoteCoberturas(nome);
    const preset = pacotesConfig?.[nome];
    if (!preset) return;
    setCodigoCobertura(preset.codigoCobertura);
    setCodigoFranquia(preset.codigoFranquia);
    setPercentualFranquia(preset.percentualFranquia);
    setTipoModalidade(preset.tipoModalidade);
    setDanosMateriais(preset.danosMateriais);
    setDanosCorporais(preset.danosCorporais);
    setDanosMorais(preset.danosMorais);
    setAppMorteInvalidez(preset.appMorteInvalidez);
    setTipoAssistencia(preset.tipoAssistencia);
    setVidros(preset.vidros);
    setCarroReserva(preset.carroReserva);
    setCarroReservaAr(preset.carroReservaAr);
  };

  const tipoPessoa = detectTipoPessoa(cpfCnpj.replace(/\D/g, ''));
  const isRenovacao = tipoSeguro === '6' || tipoSeguro === '7';

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

  const limparCampos = () => window.location.reload();

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
          valorVeiculo: Number(valorVeiculo), cep: (cepPernoite || cepResidencial).replace(/\D/g, ''), placa, chassi,
          percentualAjuste: percentualAjuste ? Number(percentualAjuste) : undefined,
          blindado, lmiBlindagem: blindado && lmiBlindagem ? Number(lmiBlindagem) : undefined,
          kitGas, lmiKitGas: kitGas && lmiKitGas ? Number(lmiKitGas) : undefined,
        },
        condutor: (nomeCondutor || cpfCondutor || estadoCivilCondutor)
          ? { nome: nomeCondutor || undefined, cpf: cpfCondutor.replace(/\D/g, '') || undefined, estadoCivil: estadoCivilCondutor || undefined }
          : undefined,
        cobertura: {
          classeBonus: Number(classeBonus), tipoSeguro, tipoAssistencia, isencaoFiscal,
          codigoCobertura, tipoModalidade, codigoFranquia,
          codigoFranquiaIndenizacaoIntegral: codigoFranquiaIntegral || undefined,
          principalCondutor: principalCondutor || undefined,
          garagemPrincipalCondutor: garagemResidencia || undefined,
          coberturaPessoasResidentes1825Anos: jovemCondutor || undefined,
          danosMateriais: danosMateriais ? Number(danosMateriais) : undefined,
          danosCorporais: danosCorporais ? Number(danosCorporais) : undefined,
          danosMorais: danosMorais ? Number(danosMorais) : undefined,
          appMorte: appMorteInvalidez ? Number(appMorteInvalidez) : undefined,
          appInvalidez: appMorteInvalidez ? Number(appMorteInvalidez) : undefined,
        },
        vigencia: { inicio: dataParaTM(inicioVigencia), fim: dataParaTM(fimVigencia) },
        renovacao: isRenovacao
          ? {
              codigoSeguradoraAnterior: codigoSeguradoraAnterior || undefined,
              numeroApoliceAnterior: numeroApoliceAnterior || undefined,
              dataVencimentoApoliceAnterior: dataVencimentoApoliceAnterior ? dataParaTM(dataVencimentoApoliceAnterior) : undefined,
            }
          : undefined,
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
    <div className="h-full overflow-y-auto bg-slate-50">
      <div className="p-4 md:p-6 max-w-[1600px] mx-auto space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-900 uppercase tracking-tight">Multicálculo</h1>
            <p className="text-[11px] text-slate-500 font-medium">Compare e encontre o melhor seguro para seu cliente</p>
          </div>
          <button type="button" className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-gold-deep/40 hover:text-gold-deep transition-all shadow-sm">
            <History className="w-3.5 h-3.5" /> Histórico de Cotações
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
          {/* Coluna principal */}
          <div className="lg:col-span-2 space-y-5">
            <Card title="Segurado" icon={UserIcon}>
              <Field label="CPF/CNPJ" required><input className={inputCls} value={cpfCnpj} onChange={(e) => setCpfCnpj(formatCpfCnpjProgressive(e.target.value))} placeholder="000.000.000-00" /></Field>
              <Field label="Nome Completo" required><input className={inputCls} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do segurado" /></Field>
              <Field label="Data de Nascimento"><input type="date" className={inputCls} value={dataNascimento} onChange={(e) => setDataNascimento(e.target.value)} /></Field>
              <Field label="Sexo">
                <select className={inputCls} value={sexo} onChange={(e) => setSexo(e.target.value)}>
                  <option value="">Selecione</option><option value="M">Masculino</option><option value="F">Feminino</option>
                </select>
              </Field>
              <Field label="Estado Civil">
                <select className={inputCls} value={estadoCivilSegurado} onChange={(e) => setEstadoCivilSegurado(e.target.value)}>
                  <option value="">Selecione</option><option value="Solteiro">Solteiro(a)</option><option value="Casado">Casado(a)</option>
                  <option value="Divorciado">Divorciado(a)</option><option value="Viuvo">Viúvo(a)</option>
                </select>
              </Field>
              <Field label="CEP Residencial" required><input className={inputCls} value={cepResidencial} onChange={(e) => setCepResidencial(e.target.value)} placeholder="00000-000" /></Field>
              <Field label="Telefone"><input className={inputCls} value={telefone} onChange={(e) => setTelefone(formatPhone(e.target.value))} placeholder="(00) 00000-0000" /></Field>
              <Field label="E-mail"><input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" /></Field>
            </Card>

            <Card title="Veículo" icon={Car}>
              <Field label="Placa"><input className={inputCls} value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())} placeholder="ABC1D23" /></Field>
              <Field label="Chassi"><input className={inputCls} value={chassi} onChange={(e) => setChassi(e.target.value.toUpperCase())} /></Field>
              <Field label="Ano Fabricação">
                <input className={inputCls} value={anoFabricacao} onChange={(e) => setAnoFabricacao(e.target.value)} placeholder="2023" />
              </Field>
              <Field label="Ano Modelo" required>
                <div className="flex rounded-lg border border-slate-200 overflow-hidden focus-within:border-gold-deep/60 focus-within:ring-2 focus-within:ring-gold-deep/15 transition-all">
                  <input
                    className="w-full px-3 py-2 bg-white text-slate-800 text-[12px] font-medium outline-none placeholder:text-slate-300"
                    value={anoModelo}
                    onChange={(e) => setAnoModelo(e.target.value)}
                    placeholder="2023"
                  />
                  <button type="button" onClick={buscarVeiculos} disabled={buscandoVeiculo} className="px-3 bg-slate-50 border-l border-slate-200 text-slate-500 hover:text-gold-deep transition-colors shrink-0">
                    {buscandoVeiculo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </button>
                </div>
              </Field>
              <Field label="Zero KM">
                <select className={inputCls} value={zeroKm ? 'S' : 'N'} onChange={(e) => setZeroKm(e.target.value === 'S')}>{boolOptions}</select>
              </Field>
              <Field label="Modelo" required>
                <select className={inputCls} value={veiculoSelecionado?.idVeiculo ?? ''} onChange={(e) => setVeiculoSelecionado(buscaVeiculo.find((v) => v.idVeiculo === Number(e.target.value)) ?? null)}>
                  <option value="">Busque pelo ano modelo…</option>
                  {buscaVeiculo.map((v) => (
                    <option key={v.idVeiculo} value={v.idVeiculo}>{v.descricaoFabricante} {v.descricaoModelo} ({v.tipoCombustivel})</option>
                  ))}
                </select>
              </Field>
              <Field label="Valor Referenciado (R$)" required><input className={inputCls} value={valorVeiculo} onChange={(e) => setValorVeiculo(e.target.value)} placeholder="0,00" /></Field>
              <Field label="Combustível"><input className={inputCls} value={veiculoSelecionado?.tipoCombustivel ?? ''} readOnly placeholder="Selecione o modelo" /></Field>
              <Field label="Fipe (%)"><input className={inputCls} value={percentualAjuste} onChange={(e) => setPercentualAjuste(e.target.value)} placeholder="100" /></Field>
            </Card>

            <Card title="Informações complementares" icon={Info} collapsible>
              <Field label="CEP Pernoite"><input className={inputCls} value={cepPernoite} onChange={(e) => setCepPernoite(e.target.value)} placeholder="00000-000" /></Field>
              <Field label="Rastreador">
                <select className={inputCls} value={rastreador} onChange={(e) => setRastreador(e.target.value)}>
                  <option value="N">Não Possui</option><option value="S">Possui</option>
                </select>
              </Field>
              <Field label="Dispositivo Anti-furto">
                <select className={inputCls} value={dispositivoAntiFurto} onChange={(e) => setDispositivoAntiFurto(e.target.value)}>
                  <option value="N">Não Possui</option><option value="S">Possui</option>
                </select>
              </Field>
              <Field label="Blindado">
                <select className={inputCls} value={blindado ? 'S' : 'N'} onChange={(e) => setBlindado(e.target.value === 'S')}>{boolOptions}</select>
              </Field>
              <Field label="Kit Gás">
                <select className={inputCls} value={kitGas ? 'S' : 'N'} onChange={(e) => setKitGas(e.target.value === 'S')}>{boolOptions}</select>
              </Field>
              <Field label="Valor Kit Gás (R$)"><input className={inputCls} value={lmiKitGas} onChange={(e) => setLmiKitGas(e.target.value)} disabled={!kitGas} placeholder="0,00" /></Field>
              <Field label="Alienado">
                <select className={inputCls} value={alienado} onChange={(e) => setAlienado(e.target.value)}>{boolOptions}</select>
              </Field>
            </Card>

            <Card title="Condutor" icon={UserCheck}>
              <div className="md:col-span-2 space-y-1">
                <Field label="Condutor Principal">
                  <select className={inputCls} value={principalCondutor} onChange={(e) => setPrincipalCondutor(e.target.value)}>
                    <option value="">Selecione</option><option value="Próprio">Próprio</option><option value="Cônjuge">Cônjuge</option>
                    <option value="Filho(a)">Filho(a)</option><option value="Terceiro">Terceiro</option>
                  </select>
                </Field>
                {condutorIsProprio && (
                  <p className="text-[9px] text-slate-400 ml-1">Dados copiados automaticamente do segurado.</p>
                )}
              </div>
              <Field label="CPF">
                <input className={inputCls} value={cpfCondutor} onChange={(e) => setCpfCondutor(formatCpfCnpjProgressive(e.target.value))} placeholder="000.000.000-00" disabled={condutorIsProprio} />
              </Field>
              <Field label="Nome Completo">
                <input className={inputCls} value={nomeCondutor} onChange={(e) => setNomeCondutor(e.target.value)} placeholder="Nome do condutor" disabled={condutorIsProprio} />
              </Field>
              <Field label="Data de Nascimento">
                <input type="date" className={inputCls} value={dataNascimentoCondutor} onChange={(e) => setDataNascimentoCondutor(e.target.value)} disabled={condutorIsProprio} />
              </Field>
              <Field label="Sexo">
                <select className={inputCls} value={sexoCondutor} onChange={(e) => setSexoCondutor(e.target.value)} disabled={condutorIsProprio}>
                  <option value="">Selecione</option><option value="M">Masculino</option><option value="F">Feminino</option>
                </select>
              </Field>
              <Field label="Estado Civil">
                <select className={inputCls} value={estadoCivilCondutor} onChange={(e) => setEstadoCivilCondutor(e.target.value)} disabled={condutorIsProprio}>
                  <option value="">Selecione</option><option value="Solteiro">Solteiro(a)</option><option value="Casado">Casado(a)</option>
                  <option value="Divorciado">Divorciado(a)</option><option value="Viuvo">Viúvo(a)</option>
                </select>
              </Field>
              <Field label="Tempo de Habilitação">
                <select className={inputCls} value={tempoHabilitacao} onChange={(e) => setTempoHabilitacao(e.target.value)}>
                  <option value="">Selecione</option><option value="menos_1">Menos de 1 ano</option><option value="1_5">1 a 5 anos</option>
                  <option value="5_10">5 a 10 anos</option><option value="mais_10">Mais de 10 anos</option>
                </select>
              </Field>
            </Card>

            <Card title="Questionário" icon={ClipboardList}>
              <Field label="Garagem na Residência">
                <select className={inputCls} value={garagemResidencia} onChange={(e) => setGaragemResidencia(e.target.value)}>
                  <option value="">Selecione</option><option value="Com portão manual">Com portão manual</option>
                  <option value="Com portão automático">Com portão automático</option><option value="Sem garagem">Sem garagem</option>
                </select>
              </Field>
              <Field label="Garagem no Trabalho">
                <select className={inputCls} value={garagemTrabalho} onChange={(e) => setGaragemTrabalho(e.target.value)}>
                  <option value="">Não utiliza para este fim</option><option value="Com garagem">Com garagem</option><option value="Sem garagem">Sem garagem</option>
                </select>
              </Field>
              <Field label="Garagem no Local de Estudo">
                <select className={inputCls} value={garagemEstudo} onChange={(e) => setGaragemEstudo(e.target.value)}>
                  <option value="">Não utiliza para este fim</option><option value="Com garagem">Com garagem</option><option value="Sem garagem">Sem garagem</option>
                </select>
              </Field>
              <Field label="Tipo de Uso">
                <select className={inputCls} value={tipoDeUso} onChange={(e) => setTipoDeUso(e.target.value)}>
                  <option value="Particular">Particular</option><option value="Comercial">Comercial</option>
                </select>
              </Field>
              <Field label="Jovem Condutor (17 a 25 Anos)">
                <select className={inputCls} value={jovemCondutor} onChange={(e) => setJovemCondutor(e.target.value)}>
                  <option value="">Selecione</option>{boolOptions}
                </select>
              </Field>
              <Field label="Idade do Mais Novo"><input className={inputCls} value={idadeMaisNovo} onChange={(e) => setIdadeMaisNovo(e.target.value)} /></Field>
              <Field label="Sexo dos Jovens">
                <select className={inputCls} value={sexoJovens} onChange={(e) => setSexoJovens(e.target.value)}>
                  <option value="">Selecione</option><option value="M">Masculino</option><option value="F">Feminino</option><option value="Ambos">Ambos</option>
                </select>
              </Field>
              <Field label="Tipo de Residência">
                <select className={inputCls} value={tipoResidencia} onChange={(e) => setTipoResidencia(e.target.value)}>
                  <option value="Casa">Casa</option><option value="Apartamento">Apartamento</option><option value="Condomínio">Condomínio</option>
                </select>
              </Field>
              <Field label="Quilometragem (Mensal)">
                <select className={inputCls} value={quilometragem} onChange={(e) => setQuilometragem(e.target.value)}>
                  <option value="">Selecione</option><option value="ate_500">Até 500 km</option><option value="500_1500">500 a 1.500 km</option>
                  <option value="mais_1500">Mais de 1.500 km</option>
                </select>
              </Field>
              <Field label="PCD">
                <select className={inputCls} value={pcd} onChange={(e) => setPcd(e.target.value)}>{boolOptions}</select>
              </Field>
              <Field label="Isenção Fiscal">
                <select className={inputCls} value={isencaoFiscal} onChange={(e) => setIsencaoFiscal(e.target.value)}>
                  <option value="24747">Não Possui</option><option value="24748">Sim — PCD</option><option value="24749">Sim — exceto PCD</option>
                </select>
              </Field>
            </Card>

            <Card title="Vigência" icon={History}>
              <Field label="Início" required><input type="date" className={inputCls} value={inicioVigencia} onChange={(e) => setInicioVigencia(e.target.value)} /></Field>
              <Field label="Fim" required><input type="date" className={inputCls} value={fimVigencia} onChange={(e) => setFimVigencia(e.target.value)} /></Field>
            </Card>
          </div>

          {/* Coluna lateral */}
          <div className="space-y-5">
            <div className="bg-gold-deep/10 border border-gold-deep/30 rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gold-deep/20 flex items-center justify-center shrink-0">
                <Car className="w-5 h-5 text-gold-deep" />
              </div>
              <div>
                <p className="text-[12px] font-black text-slate-800 uppercase tracking-wide">Automóvel</p>
                <p className="text-[10px] text-slate-500 font-medium">Preencha os dados e compare as melhores seguradoras</p>
              </div>
            </div>

            <Card
              title="Cobertura"
              icon={ShieldCheck}
              action={<button type="button" className="flex items-center gap-1 text-[9px] font-black uppercase text-blue-600 hover:text-blue-700"><Wrench className="w-3 h-3" /> Configurar pacotes</button>}
            >
              <div className="md:col-span-2">
                <Field label="Pacote de Coberturas">
                  <select className={inputCls} value={pacoteCoberturas} onChange={(e) => handlePacoteChange(e.target.value)}>
                    <option value="Bronze">Bronze</option><option value="Prata">Prata</option><option value="Ouro">Ouro</option><option value="Diamante">Diamante</option>
                  </select>
                </Field>
              </div>
              <Field label="Tipo de Cobertura">
                <select className={inputCls} value={codigoCobertura} onChange={(e) => setCodigoCobertura(e.target.value)}>
                  <option value="1">Compreensiva</option><option value="2">Incêndio e Roubo</option><option value="3">RCF-V</option>
                  <option value="4">Colisão e Incêndio</option><option value="5">Indenização Integral</option><option value="6">Assistência Exclusiva</option>
                </select>
              </Field>
              {codigoCobertura !== '3' && codigoCobertura !== '5' && (
                <Field label="Tipo de Franquia">
                  <select className={inputCls} value={codigoFranquia} onChange={(e) => setCodigoFranquia(e.target.value)}>
                    <option value="1">Básica</option><option value="4">50% da Básica</option><option value="6">25% da Básica</option>
                    <option value="7">75% da Básica</option><option value="2">150% da Básica</option><option value="3">200% da Básica</option>
                  </select>
                </Field>
              )}
              <Field label="% Franquia"><input className={inputCls} value={percentualFranquia} onChange={(e) => setPercentualFranquia(e.target.value)} placeholder="100" /></Field>
              {codigoCobertura !== '3' && codigoCobertura !== '6' && (
                <Field label="Tipo de Modalidade">
                  <select className={inputCls} value={tipoModalidade} onChange={(e) => setTipoModalidade(e.target.value)}>
                    <option value="A">Valor Ajustável</option><option value="D">Valor Determinado</option>
                  </select>
                </Field>
              )}
              {codigoCobertura === '5' && (
                <Field label="Franquia Indenização Integral"><input className={inputCls} value={codigoFranquiaIntegral} onChange={(e) => setCodigoFranquiaIntegral(e.target.value)} /></Field>
              )}
              <Field label="Classe Bônus"><input className={inputCls} value={classeBonus} onChange={(e) => setClasseBonus(e.target.value)} /></Field>
            </Card>

            <Card title="RCF / APP" icon={HeartPulse}>
              <Field label="Danos Materiais (R$)"><input className={inputCls} value={danosMateriais} onChange={(e) => setDanosMateriais(e.target.value)} placeholder="0,00" /></Field>
              <Field label="Danos Corporais (R$)"><input className={inputCls} value={danosCorporais} onChange={(e) => setDanosCorporais(e.target.value)} placeholder="0,00" /></Field>
              <Field label="Danos Morais (R$)"><input className={inputCls} value={danosMorais} onChange={(e) => setDanosMorais(e.target.value)} placeholder="0,00" /></Field>
              <Field label="Morte/Invalidez (APP)"><input className={inputCls} value={appMorteInvalidez} onChange={(e) => setAppMorteInvalidez(e.target.value)} placeholder="0,00" /></Field>
            </Card>

            <Card title="Acessórios" icon={ShieldCheck}>
              <div className="md:col-span-2">
                <Field label="Blindagem (R$)"><input className={inputCls} value={lmiBlindagem} onChange={(e) => setLmiBlindagem(e.target.value)} disabled={!blindado} placeholder="0,00" /></Field>
              </div>
            </Card>

            <Card title="Serviços" icon={Wrench}>
              <Field label="Assistência">
                <select className={inputCls} value={tipoAssistencia} onChange={(e) => setTipoAssistencia(e.target.value as any)}>
                  <option value="N">Não possui</option><option value="C">Básica</option><option value="V">VIP</option>
                </select>
              </Field>
              <Field label="Vidros">
                <select className={inputCls} value={vidros} onChange={(e) => setVidros(e.target.value)}>
                  <option value="Não">Não</option><option value="Básico">Básico</option><option value="Completo">Completo</option>
                </select>
              </Field>
              <Field label="Carro Reserva">
                <select className={inputCls} value={carroReserva} onChange={(e) => setCarroReserva(e.target.value)}>
                  <option value="Não">Não</option><option value="Básico 7 dias">Básico 7 dias</option><option value="Básico 15 dias">Básico 15 dias</option>
                </select>
              </Field>
              <Field label="Carro Reserva c/ Ar">
                <select className={inputCls} value={carroReservaAr} onChange={(e) => setCarroReservaAr(e.target.value)}>{boolOptions}</select>
              </Field>
            </Card>

            <Card title="Renovação" icon={RefreshCw}>
              <label className="md:col-span-2 flex items-center gap-2 text-[11px] font-bold text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isRenovacao}
                  onChange={(e) => setTipoSeguro(e.target.checked ? '6' : '1')}
                  className="w-3.5 h-3.5 accent-gold-deep"
                />
                Esta é uma renovação
              </label>
              {isRenovacao && (
                <>
                  <div className="md:col-span-2">
                    <Field label="Tipo de Renovação">
                      <select className={inputCls} value={tipoSeguro} onChange={(e) => setTipoSeguro(e.target.value as any)}>
                        <option value="6">Congênere (outra seguradora)</option>
                        <option value="7">Tokio Marine</option>
                      </select>
                    </Field>
                  </div>
                  <Field label="Final Vigência Anterior"><input type="date" className={inputCls} value={dataVencimentoApoliceAnterior} onChange={(e) => setDataVencimentoApoliceAnterior(e.target.value)} /></Field>
                  {tipoSeguro === '6' && (
                    <Field label="Seguradora Anterior">
                      <select className={inputCls} value={codigoSeguradoraAnterior} onChange={(e) => setCodigoSeguradoraAnterior(e.target.value)}>
                        <option value="">Selecione</option>
                        {SEGURADORAS.filter((s) => s.id !== 'tokio').map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                      </select>
                    </Field>
                  )}
                  {tipoSeguro === '7' && (
                    <Field label="Número Apólice Anterior"><input className={inputCls} value={numeroApoliceAnterior} onChange={(e) => setNumeroApoliceAnterior(e.target.value)} /></Field>
                  )}
                  <Field label="Código Interno (CI)"><input className={inputCls} value={codigoInterno} onChange={(e) => setCodigoInterno(e.target.value)} /></Field>
                  <Field label="Quantidade de Sinistros">
                    <select className={inputCls} value={quantidadeSinistros} onChange={(e) => setQuantidadeSinistros(e.target.value)}>
                      <option value="">Selecione</option><option value="0">0</option><option value="1">1</option><option value="2">2</option><option value="3+">3 ou mais</option>
                    </select>
                  </Field>
                </>
              )}
            </Card>
          </div>
        </div>

        {erroGeral && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-600 text-[12px]">
            <AlertCircle className="w-4 h-4 shrink-0" /> {erroGeral}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-end sticky bottom-0 bg-slate-50/95 backdrop-blur py-3">
          <button type="button" onClick={limparCampos} className="flex items-center justify-center gap-2 px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:border-red-300 hover:text-red-500 transition-all">
            <Trash2 className="w-3.5 h-3.5" /> Limpar campos
          </button>
          <button type="button" className="flex items-center justify-center gap-2 px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-gold-deep/40 hover:text-gold-deep transition-all">
            <Save className="w-3.5 h-3.5" /> Salvar rascunho
          </button>
          <button
            type="button"
            onClick={cotar}
            disabled={cotando || !veiculoSelecionado}
            className="flex items-center justify-center gap-2 px-6 py-2.5 bg-[#1B4D8F] text-white rounded-xl font-black uppercase tracking-widest text-[10px] disabled:opacity-40 shadow-lg shadow-[#1B4D8F]/20"
          >
            <Search className="w-3.5 h-3.5" /> {cotando ? 'Calculando...' : 'Calcular cotações'}
          </button>
        </div>

        {resultados && (
          <div className="space-y-3">
            {resultados.map((r) => {
              const seguradora = getSeguradora(r.providerId);
              return (
                <div key={r.providerId} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-3" style={{ color: seguradora?.cor }}>
                    <ShieldCheck className="w-4 h-4" />
                    <h3 className="text-[12px] font-black uppercase tracking-widest">{seguradora?.nome ?? r.providerId}</h3>
                  </div>
                  {!r.ok ? (
                    <div className="flex items-center gap-2 text-red-500 text-[12px]"><AlertCircle className="w-4 h-4" /> {r.erro}</div>
                  ) : (
                    r.itens?.[0]?.modalidades.map((m) => (
                      <div key={m.codigoModalidade} className="border-t border-slate-100 pt-3 mt-3 first:border-0 first:mt-0 first:pt-0">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <p className="text-slate-800 font-bold text-[13px]">{m.descricaoModalidade}</p>
                          <p className="text-gold-deep font-black text-[15px] whitespace-nowrap">R$ {m.premioLiquido.toFixed(2)}</p>
                        </div>
                        <button type="button" onClick={() => verPdf(r.itens![0].numeroCalculo)} className="mt-2 flex items-center gap-1.5 text-[10px] font-black uppercase text-slate-400 hover:text-gold-deep transition-colors">
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
    </div>
  );
};
